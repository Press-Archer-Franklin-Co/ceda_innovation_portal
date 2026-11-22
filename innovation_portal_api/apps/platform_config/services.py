from __future__ import annotations

import logging
import secrets as token_tools
from types import SimpleNamespace

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.audit.services import AuditService
from apps.core.phone import InvalidPhoneNumber, mask_phone, normalize_phone
from apps.platform_config.crypto import decrypt_secrets, encrypt_secrets
from apps.platform_config.flags import all_flags, clear_flag_cache
from apps.platform_config.models import FeatureFlag, IntegrationConnection, SSOTrialSession
from apps.platform_config.providers import get_provider_class
from apps.platform_config.providers.base import iter_secret_strings, scrub
from apps.platform_config.selectors import IntegrationRuntimeSelector

logger = logging.getLogger(__name__)

TEST_VALID_HOURS = 24
TRIAL_STATE_PREFIX = "sso-trial."
TRIAL_MINUTES = 10


# --------------------------------------------------------------------------------------
# Staff must always have a working way in.
# --------------------------------------------------------------------------------------


class StaffAccessGuard:
    LOCKOUT_MESSAGE = (
        "Staff would have no working way to sign in. Keep email and password sign-in on until "
        "staff single sign-on is switched on with an active, tested connection."
    )

    @staticmethod
    def staff_can_sign_in(*, password_on: bool, sso_on: bool, sso_working: bool) -> bool:
        return password_on or (sso_on and sso_working)

    @staticmethod
    def assert_kept(*, password_on: bool | None = None, sso_on: bool | None = None, sso_working: bool | None = None) -> None:
        flags = all_flags()
        password_on = flags.get("password_sign_in", True) if password_on is None else password_on
        sso_on = flags.get("staff_sso", False) if sso_on is None else sso_on
        sso_working = IntegrationRuntimeSelector.has_working_sso_connection() if sso_working is None else sso_working
        if not StaffAccessGuard.staff_can_sign_in(password_on=password_on, sso_on=sso_on, sso_working=sso_working):
            raise ValidationError({"code": "staff_lockout", "detail": StaffAccessGuard.LOCKOUT_MESSAGE})


# --------------------------------------------------------------------------------------
# Feature switches
# --------------------------------------------------------------------------------------


class FeatureFlagService:
    @staticmethod
    @transaction.atomic
    def set_enabled(*, key: str, enabled: bool, actor) -> FeatureFlag:
        flag = FeatureFlag.objects.select_for_update().filter(key=key).first()
        if flag is None:
            raise NotFound({"code": "unknown_feature", "detail": f"No feature called `{key}`."})
        if flag.enabled == enabled:
            return flag
        if enabled and flag.coming_soon:
            raise ValidationError({"code": "coming_soon", "detail": f"{flag.label} is not available yet."})
        if key == "password_sign_in" and not enabled:
            StaffAccessGuard.assert_kept(password_on=False)
        if key == "staff_sso" and not enabled:
            StaffAccessGuard.assert_kept(sso_on=False)
        before = flag.enabled
        flag.enabled = enabled
        flag.updated_by = actor
        flag.save(update_fields=["enabled", "updated_by", "updated_at"])
        clear_flag_cache()
        AuditService.log_raw_action(
            actor=actor,
            action_type="feature_flag_changed",
            target_model="FeatureFlag",
            target_id=flag.key,
            before_state={"enabled": before},
            after_state={"enabled": enabled},
            label=flag.label,
        )
        return flag


# --------------------------------------------------------------------------------------
# Integration connections
# --------------------------------------------------------------------------------------


def _provider_class_or_error(provider_key: str, kind: str | None = None):
    provider_class = get_provider_class(provider_key or "")
    if provider_class is None:
        raise ValidationError({"provider": [f"Unknown provider `{provider_key}`."]})
    if kind and provider_class.kind != kind:
        raise ValidationError({"provider": [f"`{provider_key}` is not a {kind} provider."]})
    return provider_class


class IntegrationService:
    @staticmethod
    def secret_summary(provider_class, secret_values: dict) -> dict:
        """``{"client_secret": {"is_set": true, "last4": ""}}``. Never the value, nor any part of it."""
        summary = {}
        for name in sorted(provider_class.secret_field_names()):
            value = secret_values.get(name)
            is_set = value not in (None, "", {}, [])
            # U9: keys are write-only. Only whether one is set; last4 stays for older screens but is always empty.
            summary[name] = {"is_set": is_set, "last4": ""}
        return summary

    @staticmethod
    def _merge(provider_class, *, config_in: dict | None, secrets_in: dict | None, config: dict, secret_values: dict):
        """Apply a write. Empty secret keeps the old value, null clears it."""
        errors: dict[str, list[str]] = {}
        field_map = provider_class.field_map()
        new_config = dict(config)
        new_secrets = dict(secret_values)
        changed_settings: list[str] = []
        changed_secrets: list[str] = []

        for name, value in (config_in or {}).items():
            spec = field_map.get(name)
            if spec is None or spec.secret:
                errors.setdefault(f"config.{name}", []).append("Unknown setting." if spec is None else "Send this in `secrets`.")
                continue
            try:
                cleaned = provider_class.validate_value(spec, value)
            except ValueError as exc:
                errors.setdefault(f"config.{name}", []).append(str(exc))
                continue
            if new_config.get(name) != cleaned:
                new_config[name] = cleaned
                changed_settings.append(name)

        for name, value in (secrets_in or {}).items():
            spec = field_map.get(name)
            if spec is None or not spec.secret:
                errors.setdefault(f"secrets.{name}", []).append("Unknown secret.")
                continue
            if value == "":
                continue  # keep the saved secret
            if value is None:
                if name in new_secrets:
                    new_secrets.pop(name)
                    changed_secrets.append(name)
                continue
            try:
                cleaned = provider_class.validate_value(spec, value)
            except ValueError as exc:
                errors.setdefault(f"secrets.{name}", []).append(str(exc))
                continue
            if new_secrets.get(name) != cleaned:
                new_secrets[name] = cleaned
                changed_secrets.append(name)

        if errors:
            raise ValidationError(errors)
        field_errors, warnings = provider_class.validate(new_config, new_secrets)
        if field_errors:
            raise ValidationError({f"config.{name}": [message] for name, message in field_errors.items()})
        return new_config, new_secrets, changed_settings, changed_secrets, warnings

    @staticmethod
    def warnings_for(connection: IntegrationConnection) -> list[str]:
        provider_class = get_provider_class(connection.provider)
        if provider_class is None:
            return [f"Provider `{connection.provider}` is no longer available."]
        _, warnings = provider_class.validate(connection.config or {}, decrypt_secrets(connection.secrets_encrypted))
        return warnings

    @staticmethod
    def snapshot(connection: IntegrationConnection, secret_values: dict | None = None) -> dict:
        """What the audit log keeps as before and after: settings, status, and for keys only "set" or "not set"."""
        secrets = decrypt_secrets(connection.secrets_encrypted) if secret_values is None else secret_values
        provider_class = get_provider_class(connection.provider)
        names = sorted(provider_class.secret_field_names()) if provider_class else sorted(secrets)
        return {
            "name": connection.name,
            "status": connection.status,
            "active": connection.is_active,
            "settings": dict(connection.config or {}),
            "keys": {name: ("set" if secrets.get(name) not in (None, "", {}, []) else "not set") for name in names},
        }

    @staticmethod
    def _audit(actor, action: str, connection: IntegrationConnection, *, before=None, after=None, **metadata) -> None:
        AuditService.log_raw_action(
            actor=actor,
            action_type=action,
            target_model="IntegrationConnection",
            target_id=str(connection.id),
            before_state=before,
            after_state=after,
            metadata={"kind": connection.kind, "provider": connection.provider, "name": connection.name, **metadata},
            label=f"{connection.get_kind_display()} · {connection.name}",
        )

    @staticmethod
    @transaction.atomic
    def create(*, actor, kind: str, provider: str, name: str, config: dict | None, secrets: dict | None):
        provider_class = _provider_class_or_error(provider, kind)
        new_config, new_secrets, changed_settings, changed_secrets, warnings = IntegrationService._merge(
            provider_class, config_in=config, secrets_in=secrets, config=provider_class.defaults(), secret_values={}
        )
        connection = IntegrationConnection.objects.create(
            kind=provider_class.kind,
            provider=provider_class.key,
            name=name or provider_class.label,
            config=new_config,
            secrets_encrypted=encrypt_secrets(new_secrets),
            status=IntegrationConnection.Status.DRAFT,
            created_by=actor,
            updated_by=actor,
        )
        IntegrationService._audit(
            actor, "integration_created", connection, after=IntegrationService.snapshot(connection, new_secrets), settings_set=sorted(new_config), secrets_set=sorted(new_secrets)
        )
        return connection, warnings

    @staticmethod
    @transaction.atomic
    def update(*, connection: IntegrationConnection, actor, data: dict):
        connection = IntegrationConnection.objects.select_for_update().get(pk=connection.pk)
        before = IntegrationService.snapshot(connection)
        provider_class = _provider_class_or_error(connection.provider)
        if data.get("provider") and data["provider"] != connection.provider:
            raise ValidationError({"provider": ["To use another provider, add a new connection."]})
        new_config, new_secrets, changed_settings, changed_secrets, warnings = IntegrationService._merge(
            provider_class,
            config_in=data.get("config"),
            secrets_in=data.get("secrets"),
            config=connection.config or {},
            secret_values=decrypt_secrets(connection.secrets_encrypted),
        )
        fields = ["updated_by", "updated_at"]
        if "name" in data and data["name"] and data["name"] != connection.name:
            connection.name = data["name"]
            fields.append("name")
        settings_changed = bool(changed_settings or changed_secrets)
        was_active = connection.is_active
        if settings_changed:
            if was_active and connection.kind == IntegrationConnection.Kind.SSO:
                StaffAccessGuard.assert_kept(sso_working=False)
            connection.config = new_config
            connection.secrets_encrypted = encrypt_secrets(new_secrets)
            # Any change must be tested again before it is used.
            connection.status = IntegrationConnection.Status.DRAFT
            connection.is_active = False
            fields += ["config", "secrets_encrypted", "status", "is_active"]
        connection.updated_by = actor
        connection.save(update_fields=fields)
        IntegrationRuntimeSelector.clear_cache(connection.kind)
        IntegrationService._audit(
            actor,
            "integration_updated",
            connection,
            before=before,
            after=IntegrationService.snapshot(connection, new_secrets),
            settings_changed=sorted(changed_settings),
            secrets_changed=sorted(changed_secrets),
            deactivated=bool(settings_changed and was_active),
        )
        return connection, warnings

    @staticmethod
    @transaction.atomic
    def delete(*, connection: IntegrationConnection, actor) -> None:
        if connection.is_active and connection.kind == IntegrationConnection.Kind.SSO:
            StaffAccessGuard.assert_kept(sso_working=False)
        IntegrationService._audit(actor, "integration_deleted", connection, before=IntegrationService.snapshot(connection), was_active=connection.is_active)
        kind = connection.kind
        connection.delete()
        IntegrationRuntimeSelector.clear_cache(kind)

    @staticmethod
    def run_test(*, connection: IntegrationConnection, actor, inputs: dict | None = None) -> dict:
        inputs = dict(inputs or {})
        if "phone" in inputs:
            if inputs["phone"] in (None, ""):
                inputs.pop("phone")
            else:
                try:
                    inputs["phone"] = normalize_phone(inputs["phone"])
                except InvalidPhoneNumber as exc:
                    raise ValidationError({"phone": [str(exc)]}) from exc
        secret_values = decrypt_secrets(connection.secrets_encrypted)
        provider = IntegrationRuntimeSelector.provider_for(connection, secrets=secret_values)
        if provider is None:
            raise ValidationError({"provider": [f"Provider `{connection.provider}` is no longer available."]})
        report = provider.test(**inputs)
        secret_strings = list(iter_secret_strings(secret_values))
        for step in report.steps:
            step.detail = scrub(step.detail, secret_strings)[:500]
        result = {**report.as_dict(), "tested_at": timezone.now().isoformat(), "kind": "test"}
        IntegrationService._save_test_result(connection, result, report.ok)
        IntegrationService._audit(
            actor,
            "integration_tested",
            connection,
            ok=report.ok,
            steps=[{"step": step.step, "ok": step.ok} for step in report.steps],
            test_message_to=mask_phone(inputs["phone"]) if inputs.get("phone") else "",
        )
        return result

    @staticmethod
    def _save_test_result(connection: IntegrationConnection, result: dict, ok: bool) -> None:
        connection.last_test_result = result
        connection.last_tested_at = timezone.now()
        fields = ["last_test_result", "last_tested_at", "updated_at"]
        if not connection.is_active:
            connection.status = IntegrationConnection.Status.TESTED if ok else IntegrationConnection.Status.FAILED
            fields.append("status")
        connection.save(update_fields=fields)
        IntegrationRuntimeSelector.clear_cache(connection.kind)

    @staticmethod
    def activation_blocker(connection: IntegrationConnection) -> str:
        """Why the connection cannot be activated yet, or an empty string."""
        if connection.is_active:
            return "This connection is already active."
        reusable = {IntegrationConnection.Status.TESTED, IntegrationConnection.Status.DISABLED}
        if connection.status not in reusable or not (connection.last_test_result or {}).get("ok"):
            return "Run a test that passes first."
        if not connection.last_tested_at or connection.last_tested_at < timezone.now() - timezone.timedelta(hours=TEST_VALID_HOURS):
            return f"The last passing test is more than {TEST_VALID_HOURS} hours old. Test again."
        return ""

    @staticmethod
    @transaction.atomic
    def activate(*, connection: IntegrationConnection, actor) -> IntegrationConnection:
        connection = IntegrationConnection.objects.select_for_update().get(pk=connection.pk)
        before_status = connection.status
        blocker = IntegrationService.activation_blocker(connection)
        if blocker:
            raise ValidationError({"code": "activation_blocked", "detail": blocker})
        previous = []
        if connection.kind not in IntegrationConnection.MULTI_ACTIVE_KINDS:
            previous = list(
                IntegrationConnection.objects.select_for_update().filter(kind=connection.kind, is_active=True).exclude(pk=connection.pk)
            )
        for item in previous:
            item.is_active = False
            item.status = IntegrationConnection.Status.DISABLED
            item.updated_by = actor
            item.save(update_fields=["is_active", "status", "updated_by", "updated_at"])
            IntegrationService._audit(
                actor, "integration_deactivated", item, before={"status": "active", "active": True}, after={"status": item.status, "active": False}, replaced_by=str(connection.id)
            )
        connection.is_active = True
        connection.status = IntegrationConnection.Status.ACTIVE
        connection.activated_by = actor
        connection.activated_at = timezone.now()
        connection.updated_by = actor
        connection.save(update_fields=["is_active", "status", "activated_by", "activated_at", "updated_by", "updated_at"])
        IntegrationRuntimeSelector.clear_cache(connection.kind)
        IntegrationService._audit(
            actor,
            "integration_activated",
            connection,
            before={"status": before_status, "active": False},
            after={"status": connection.status, "active": True},
            replaced=[str(item.id) for item in previous],
        )
        return connection

    @staticmethod
    @transaction.atomic
    def deactivate(*, connection: IntegrationConnection, actor) -> IntegrationConnection:
        connection = IntegrationConnection.objects.select_for_update().get(pk=connection.pk)
        if not connection.is_active:
            return connection
        if connection.kind == IntegrationConnection.Kind.SSO:
            StaffAccessGuard.assert_kept(sso_working=False)
        from apps.platform_config.service_status import would_hide

        hidden = would_hide(connection)
        connection.is_active = False
        connection.status = IntegrationConnection.Status.DISABLED
        connection.updated_by = actor
        connection.save(update_fields=["is_active", "status", "updated_by", "updated_at"])
        IntegrationRuntimeSelector.clear_cache(connection.kind)
        IntegrationService._audit(
            actor,
            "integration_deactivated",
            connection,
            before={"status": "active", "active": True},
            after={"status": connection.status, "active": False},
            features_hidden=[item["key"] for item in hidden],
        )
        connection.hidden_features = hidden
        return connection


# --------------------------------------------------------------------------------------
# SSO "Try sign-in"
# --------------------------------------------------------------------------------------


class SSOTrialService:
    @staticmethod
    def _identity_provider(connection: IntegrationConnection):
        from apps.accounts.identity_providers import ConfiguredStaffIdentityProvider

        provider = IntegrationRuntimeSelector.provider_for(connection)
        if provider is None or not hasattr(provider, "runtime_settings"):
            raise ValidationError({"provider": ["This connection is not a single sign-on connection."]})
        missing = provider.missing_required(provider.config, provider.secrets)
        if missing:
            raise ValidationError({"code": "settings_incomplete", "detail": f"Missing: {', '.join(missing)}."})
        return provider, ConfiguredStaffIdentityProvider(provider.runtime_settings(), connection_id=connection.id)

    @staticmethod
    def start(*, connection: IntegrationConnection, actor) -> dict:
        if connection.kind != IntegrationConnection.Kind.SSO:
            raise ValidationError({"kind": ["Try sign-in is only for single sign-on connections."]})
        provider, identity_provider = SSOTrialService._identity_provider(connection)
        state = TRIAL_STATE_PREFIX + token_tools.token_urlsafe(32)
        nonce = token_tools.token_urlsafe(24)
        authorization_url, redirect_uri = identity_provider.authorization_url(state=state, nonce=nonce)
        trial = SSOTrialSession.objects.create(
            connection=connection,
            state=state,
            nonce=nonce,
            redirect_uri=redirect_uri,
            started_by=actor,
            expires_at=timezone.now() + timezone.timedelta(minutes=TRIAL_MINUTES),
        )
        IntegrationService._audit(actor, "integration_sso_trial_started", connection, trial_id=str(trial.id))
        return {"authorization_url": authorization_url, "trial_id": str(trial.id), "expires_at": trial.expires_at, "redirect_uri": redirect_uri}

    @staticmethod
    def complete(*, code: str, state: str) -> dict:
        """Finish a trial. Never creates a user, a session or tokens."""
        if not state.startswith(TRIAL_STATE_PREFIX):
            raise ValidationError({"state": ["This is not a trial sign-in."]})
        with transaction.atomic():
            trial = (
                SSOTrialSession.objects.select_for_update()
                .select_related("connection")
                .filter(state=state, used_at__isnull=True, expires_at__gt=timezone.now())
                .first()
            )
            if trial is None:
                raise ValidationError({"state": ["This trial sign-in has expired or was already used. Start it again."]})
            trial.used_at = timezone.now()
            trial.save(update_fields=["used_at", "updated_at"])
        connection = trial.connection
        provider, identity_provider = SSOTrialService._identity_provider(connection)
        state_record = SimpleNamespace(redirect_uri=trial.redirect_uri, nonce=trial.nonce, state=trial.state)
        secret_strings = list(iter_secret_strings(provider.secrets))
        try:
            claims = identity_provider.exchange_code_for_claims(code=code, state_record=state_record)
        except Exception as exc:  # report the failure instead of a 500
            detail = getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__
            result = {
                "ok": False,
                "kind": "sso_trial",
                "steps": [{"step": "Trial sign-in", "ok": False, "detail": scrub(str(detail), secret_strings)[:500], "ms": 0, "skipped": False}],
                "tested_at": timezone.now().isoformat(),
            }
        else:
            from apps.accounts.services import StaffSSOService

            evaluation = identity_provider.evaluate_claims(claims)
            values = identity_provider.sso_settings()
            role = ""
            if evaluation["allowed"]:
                mapped = StaffSSOService.roles_for_groups(evaluation["groups"], values.get("group_role_map") or {})
                role = ", ".join(mapped) if mapped else StaffSSOService.default_role(values.get("default_role", ""))
            trial_summary = {**evaluation, "role": role}
            detail = (
                f"Signed in as {evaluation['email'] or 'unknown'}. "
                + (f"Allowed by {evaluation['allowed_by']}; role for a new user: {role}." if evaluation["allowed"] else f"Would be refused: {evaluation['reason']}")
            )
            result = {
                "ok": True,
                "kind": "sso_trial",
                "steps": [{"step": "Trial sign-in", "ok": True, "detail": detail, "ms": 0, "skipped": False}],
                "trial": trial_summary,
                "tested_at": timezone.now().isoformat(),
            }
        trial.result = result
        trial.save(update_fields=["result", "updated_at"])
        IntegrationService._save_test_result(connection, result, result["ok"])
        IntegrationService._audit(
            trial.started_by,
            "integration_sso_trial_completed",
            connection,
            ok=result["ok"],
            allowed=(result.get("trial") or {}).get("allowed", False),
        )
        return {"connection_id": str(connection.id), **result}


# --------------------------------------------------------------------------------------
# SMS at runtime
# --------------------------------------------------------------------------------------


class SMSGateway:
    @staticmethod
    def sent_today(provider_key: str) -> int:
        from apps.communications.models import CommunicationLog
        from apps.core.constants import CommunicationChannel, CommunicationStatus

        start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        return CommunicationLog.objects.filter(
            channel=CommunicationChannel.SMS,
            provider=provider_key,
            status=CommunicationStatus.SENT,
            created_at__gte=start,
        ).count()

    @staticmethod
    def send_via_active_connection(*, to: str, body: str, purpose: str = ""):
        """Send through the active SMS connection. Returns None when there is none, so the
        caller falls back to the environment sender."""
        from apps.communications.senders import DeliveryResult

        provider = IntegrationRuntimeSelector.active_provider(IntegrationConnection.Kind.SMS)
        if provider is None:
            return None
        limit = provider.config.get("daily_limit")
        if isinstance(limit, (int, float)) and limit > 0 and SMSGateway.sent_today(provider.key) >= limit:
            logger.warning("Skipped SMS to %s: daily limit of %s reached.", mask_phone(to), limit)
            return DeliveryResult("skipped", provider=provider.key, reason=f"Skipped: daily limit of {int(limit)} SMS reached.")
        try:
            result = provider.send(to, body)
        except Exception as exc:
            logger.exception("SMS provider %s failed", provider.key)
            return DeliveryResult("failed", provider=provider.key, reason=f"Provider error: {exc.__class__.__name__}")
        secret_strings = list(iter_secret_strings(provider.secrets))
        if result.ok:
            return DeliveryResult("sent", provider=provider.key, message_id=result.message_id, provider_status=result.provider_status)
        return DeliveryResult(
            "failed",
            provider=provider.key,
            message_id=result.message_id,
            provider_status=result.provider_status,
            reason=scrub(result.error, secret_strings)[:500],
        )


class SMSStatusService:
    @staticmethod
    def handle(*, connection: IntegrationConnection, request) -> int:
        from apps.communications.models import CommunicationLog
        from apps.core.constants import CommunicationStatus
        from apps.platform_config.providers.sms import WebhookRejected

        if connection.kind != IntegrationConnection.Kind.SMS:
            raise NotFound()
        provider = IntegrationRuntimeSelector.provider_for(connection)
        if provider is None:
            raise NotFound()
        try:
            updates = provider.parse_status_webhook(request)
        except WebhookRejected as exc:
            logger.warning("Rejected SMS delivery receipt for connection %s: %s", connection.id, exc)
            raise PermissionDenied({"code": "invalid_signature", "detail": str(exc)}) from exc
        changed = 0
        for update in updates:
            logs = CommunicationLog.objects.filter(provider=connection.provider, provider_message_id=update.message_id)
            values = {"provider_status": (update.provider_status or "")[:60], "updated_at": timezone.now()}
            if update.delivered is False:
                values["status"] = CommunicationStatus.FAILED
                values["failure_reason"] = update.error or f"Not delivered ({update.provider_status})."
            elif update.delivered is True:
                values["status"] = CommunicationStatus.SENT
            changed += logs.update(**values)
        return changed

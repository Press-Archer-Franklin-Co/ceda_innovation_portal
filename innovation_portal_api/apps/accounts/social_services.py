from __future__ import annotations

import secrets

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.auth_identity_service import AuthIdentityService
from apps.accounts.identity_providers import GitHubIdentityProvider, IdentityProviderRegistry, IdentityTrustLevel, NormalizedIdentity
from apps.accounts.models import SocialAuthState, User
from apps.audit.services import AuditService


class SocialIdentity(NormalizedIdentity):
    def __init__(
        self,
        *,
        provider: str,
        provider_user_id: str,
        email: str,
        email_verified: bool,
        first_name: str,
        last_name: str,
        full_name: str,
        extra_data: dict,
    ):
        super().__init__(
            provider=provider,
            provider_user_id=provider_user_id,
            email=email,
            email_verified=email_verified,
            first_name=first_name,
            last_name=last_name,
            display_name=full_name,
            username=extra_data.get("login") or email,
            avatar_url=extra_data.get("avatar_url", ""),
            raw_claims=extra_data,
            trust_level=IdentityTrustLevel.STRONG if provider in {"google", "microsoft"} else IdentityTrustLevel.MEDIUM,
        )
SocialProviderRegistry = IdentityProviderRegistry


class SocialAuthStateService:
    LIFETIME_MINUTES = 10

    @staticmethod
    @transaction.atomic
    def create_state(provider: str, redirect_uri: str, *, purpose: str = SocialAuthState.PURPOSE_LOGIN, user: User | None = None) -> SocialAuthState:
        return SocialAuthState.objects.create(
            provider=provider,
            purpose=purpose,
            user=user,
            state=secrets.token_urlsafe(32),
            nonce=secrets.token_urlsafe(24),
            redirect_uri=redirect_uri,
            expires_at=timezone.now() + timezone.timedelta(minutes=SocialAuthStateService.LIFETIME_MINUTES),
        )

    @staticmethod
    @transaction.atomic
    def consume_state(provider: str, state_value: str, *, purpose: str | None = None, user: User | None = None) -> SocialAuthState:
        state = SocialAuthState.objects.select_for_update().filter(
            provider=provider,
            state=state_value,
            used_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).first()
        if not state:
            AuditService.log_raw_action(
                actor=user,
                action_type="social_state_invalid",
                target_model="SocialAuthState",
                target_id=state_value,
                metadata={"provider": provider, "purpose": purpose or ""},
            )
            raise ValidationError({"state": "Social login state is invalid or expired."})
        if purpose and state.purpose != purpose:
            AuditService.log_raw_action(
                actor=user or state.user,
                action_type="social_state_purpose_mismatch",
                target_model="SocialAuthState",
                target_id=str(state.id),
                metadata={"provider": provider, "expected_purpose": purpose, "actual_purpose": state.purpose},
            )
            raise ValidationError({"state": "Social login state purpose is invalid."})
        if user and state.user_id and state.user_id != user.id:
            AuditService.log_raw_action(
                actor=user,
                action_type="social_state_user_mismatch",
                target_model="SocialAuthState",
                target_id=str(state.id),
                metadata={"provider": provider},
            )
            raise ValidationError({"state": "Social login state does not belong to the current user."})
        state.used_at = timezone.now()
        state.save(update_fields=["used_at", "updated_at"])
        return state


class SocialAuthService:
    @staticmethod
    def begin(provider: str) -> dict:
        service = SocialProviderRegistry.ensure_enabled(provider)
        config = service.config()
        state_record = SocialAuthStateService.create_state(provider, config["redirect_uri"], purpose=SocialAuthState.PURPOSE_LOGIN)
        authorization_url, redirect_uri = service.authorization_url(state=state_record.state, nonce=state_record.nonce)
        return {
            "provider": provider,
            "authorization_url": authorization_url,
            "state": state_record.state,
            "redirect_uri": redirect_uri,
        }

    @staticmethod
    def complete(*, provider: str, code: str, state: str) -> dict:
        provider_service = SocialProviderRegistry.ensure_enabled(provider)
        try:
            state_record = SocialAuthStateService.consume_state(provider, state, purpose=SocialAuthState.PURPOSE_LOGIN)
        except ValidationError as exc:
            AuditService.log_raw_action(
                actor=None,
                action_type="social_state_invalid",
                target_model="SocialAuthState",
                target_id=state,
                metadata={"provider": provider, "purpose": SocialAuthState.PURPOSE_LOGIN, "errors": exc.detail},
            )
            raise
        try:
            identity = provider_service.fetch_identity(code=code, state_record=state_record)
        except ValidationError as exc:
            AuditService.log_raw_action(
                actor=None,
                action_type="social_login_failed",
                target_model="SocialAuthState",
                target_id=str(state_record.id),
                metadata={"provider": provider, "errors": exc.detail},
            )
            raise
        return AuthIdentityService.resolve_social_login(identity=identity)

    @staticmethod
    def begin_link(*, provider: str, user: User) -> dict:
        service = SocialProviderRegistry.ensure_enabled(provider)
        if user.social_accounts.filter(provider=provider).exists():
            raise ValidationError({"provider": f"{provider} is already linked to this account."})
        config = service.config()
        state_record = SocialAuthStateService.create_state(
            provider,
            config["redirect_uri"],
            purpose=SocialAuthState.PURPOSE_LINK,
            user=user,
        )
        authorization_url, _ = service.authorization_url(state=state_record.state, nonce=state_record.nonce)
        return {"authorization_url": authorization_url}

    @staticmethod
    def complete_link(*, provider: str, user: User, code: str, state: str):
        provider_service = SocialProviderRegistry.ensure_enabled(provider)
        try:
            state_record = SocialAuthStateService.consume_state(provider, state, purpose=SocialAuthState.PURPOSE_LINK, user=user)
        except ValidationError as exc:
            AuditService.log_action(
                actor=user,
                action_type="social_link_failed",
                target=user,
                metadata={"provider": provider, "errors": exc.detail},
            )
            raise
        try:
            identity = provider_service.fetch_identity(code=code, state_record=state_record)
        except ValidationError as exc:
            AuditService.log_action(
                actor=user,
                action_type="social_link_failed",
                target=user,
                metadata={"provider": provider, "errors": exc.detail},
            )
            raise
        return AuthIdentityService.link_social_identity(user=user, identity=identity)

    @staticmethod
    def unlink(*, provider: str, user: User):
        AuthIdentityService.unlink_provider(provider=provider, user=user)


class GitHubProviderService(GitHubIdentityProvider):
    _select_verified_email = staticmethod(GitHubIdentityProvider.select_verified_email)

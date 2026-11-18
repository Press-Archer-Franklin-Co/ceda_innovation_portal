from __future__ import annotations

from dataclasses import dataclass

from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts.models import SocialAuthProvider, User
from apps.audit.services import AuditService
from apps.communications.email_notifications import EmailNotificationService


@dataclass
class AccountSecurityState:
    primary_auth_method: str
    has_password: bool
    linked_provider_count: int
    recovery_methods: list[str]
    account_risk_flags: list[str]
    linked_accounts: list[dict]
    can_set_password: bool
    can_change_password: bool


class AccountSecurityService:
    PRIMARY_PROVIDER_PRIORITY = [
        User.PrimaryAuthMethod.CEDA_STAFF,
        User.PrimaryAuthMethod.MICROSOFT,
        User.PrimaryAuthMethod.GOOGLE,
        User.PrimaryAuthMethod.GITHUB,
    ]

    @staticmethod
    def _linked_provider_codes(user: User) -> list[str]:
        return list(user.social_accounts.order_by("created_at").values_list("provider", flat=True))

    @staticmethod
    def _recovery_methods(user: User, provider_codes: list[str]) -> list[str]:
        methods: list[str] = []
        if user.has_usable_password():
            methods.append("password")
        if user.email_verified:
            methods.append("verified_email")
        if getattr(user, "phone_verified", False):
            methods.append("verified_phone")
        trusted = [
            provider
            for provider in provider_codes
            if provider in {SocialAuthProvider.GOOGLE, SocialAuthProvider.MICROSOFT, SocialAuthProvider.CEDA_STAFF}
        ]
        if trusted:
            methods.append("trusted_social")
        elif provider_codes:
            methods.append("social_login")
        return methods

    @staticmethod
    def _risk_flags(user: User, provider_codes: list[str], recovery_methods: list[str]) -> list[str]:
        flags: list[str] = []
        if not user.has_usable_password() and len(provider_codes) == 1:
            flags.append("single_login_method")
        if not user.has_usable_password():
            flags.append("no_password_fallback")
        if "verified_email" not in recovery_methods:
            flags.append("email_unverified")
        if user.is_staff and not user.has_usable_password():
            flags.append("staff_missing_password")
        return flags

    @staticmethod
    def _resolve_primary_auth_method_value(user: User, provider_codes: list[str]) -> str:
        available_methods = set(provider_codes)
        if user.has_usable_password():
            available_methods.add(User.PrimaryAuthMethod.PASSWORD)
        # One-time code sign-in stays available while the contact it uses is verified.
        if getattr(user, "phone_verified", False) and user.phone_number:
            available_methods.add(User.PrimaryAuthMethod.PHONE_CODE)
        if user.email_verified and user.email:
            available_methods.add(User.PrimaryAuthMethod.EMAIL_CODE)
        current = user.primary_auth_method or ""
        if current in available_methods:
            return current
        if current and current not in available_methods:
            pass
        if User.PrimaryAuthMethod.PASSWORD in available_methods:
            return User.PrimaryAuthMethod.PASSWORD
        for provider in AccountSecurityService.PRIMARY_PROVIDER_PRIORITY:
            if provider in available_methods:
                return provider
        return provider_codes[0] if provider_codes else ""

    @staticmethod
    @transaction.atomic
    def sync_identity_ownership(*, user: User, preferred_method: str | None = None, actor=None, reason: str = "security_sync") -> str:
        provider_codes = AccountSecurityService._linked_provider_codes(user)
        new_primary = preferred_method or AccountSecurityService._resolve_primary_auth_method_value(user, provider_codes)
        old_primary = user.primary_auth_method or ""
        if new_primary != old_primary:
            user.primary_auth_method = new_primary
            user.save(update_fields=["primary_auth_method", "updated_at"])
            AuditService.log_action(
                actor=actor or user,
                action_type="primary_auth_method_changed",
                target=user,
                before_state={"primary_auth_method": old_primary},
                after_state={"primary_auth_method": new_primary},
                metadata={"reason": reason},
            )
        return new_primary

    @staticmethod
    def build_security_state(*, user: User) -> AccountSecurityState:
        provider_codes = AccountSecurityService._linked_provider_codes(user)
        primary_auth_method = AccountSecurityService._resolve_primary_auth_method_value(user, provider_codes)
        linked_accounts = [
            {
                "provider": account.provider,
                "provider_name": account.get_provider_display(),
                "provider_email": account.provider_email,
                "provider_email_verified": account.provider_email_verified,
                "last_login_at": account.last_login_at,
                "is_primary": account.provider == primary_auth_method,
            }
            for account in user.social_accounts.order_by("provider", "created_at")
        ]
        recovery_methods = AccountSecurityService._recovery_methods(user, provider_codes)
        risk_flags = AccountSecurityService._risk_flags(user, provider_codes, recovery_methods)
        return AccountSecurityState(
            primary_auth_method=primary_auth_method,
            has_password=user.has_usable_password(),
            linked_provider_count=len(provider_codes),
            recovery_methods=recovery_methods,
            account_risk_flags=risk_flags,
            linked_accounts=linked_accounts,
            can_set_password=not user.has_usable_password(),
            can_change_password=user.has_usable_password(),
        )

    @staticmethod
    def assert_can_unlink_provider(*, user: User, provider: str) -> None:
        provider_codes = AccountSecurityService._linked_provider_codes(user)
        if provider not in provider_codes:
            raise ValidationError({"provider": f"{provider} is not linked to this account."})
        remaining_providers = [code for code in provider_codes if code != provider]
        has_password = user.has_usable_password()
        if not has_password and not remaining_providers:
            raise ValidationError({"provider": "You cannot unlink this provider because it is your only sign-in method. Add a password first."})
        if user.is_staff and not has_password and not remaining_providers:
            raise ValidationError({"provider": "Staff accounts must keep a password or another login method before unlinking this provider."})

    @staticmethod
    @transaction.atomic
    def set_password_for_user(*, user: User, new_password: str) -> None:
        from apps.accounts.security_policy import SecurityPolicyService

        before_state = AccountSecurityService.build_security_state(user=user)
        if user.has_usable_password():
            raise ValidationError({"password": "This account already has a password. Use change password instead."})
        before_policy = SecurityPolicyService.evaluate(user=user)
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)}) from exc
        user.set_password(new_password)
        user.save(update_fields=["password"])
        AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="password_set")
        after_state = AccountSecurityService.build_security_state(user=user)
        after_policy = SecurityPolicyService.evaluate(user=user)
        SecurityPolicyService.audit_policy_transition(user=user, before=before_policy, after=after_policy, actor=user, reason="password_set")
        if (not before_state.has_password and after_state.has_password) or len(after_state.recovery_methods) > len(before_state.recovery_methods):
            AuditService.log_action(
                actor=user,
                action_type="recovery_posture_improved",
                target=user,
                metadata={"reason": "password_set", "recovery_methods": after_state.recovery_methods},
            )
        AuditService.log_action(
            actor=user,
            action_type="password_set",
            target=user,
            metadata={"from_social_only": True},
        )
        EmailNotificationService.send_password_changed_email(user=user)

    @staticmethod
    @transaction.atomic
    def change_password_for_user(*, user: User, current_password: str, new_password: str) -> None:
        from apps.accounts.security_policy import SecurityPolicyService

        if not user.has_usable_password():
            raise ValidationError({"password": "This account does not currently have a password. Use set password instead."})
        if not user.check_password(current_password):
            raise ValidationError({"current_password": "Current password is incorrect."})
        before_policy = SecurityPolicyService.evaluate(user=user)
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": list(exc.messages)}) from exc
        user.set_password(new_password)
        user.save(update_fields=["password"])
        AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="password_changed")
        after_policy = SecurityPolicyService.evaluate(user=user)
        SecurityPolicyService.audit_policy_transition(user=user, before=before_policy, after=after_policy, actor=user, reason="password_changed")
        AuditService.log_action(
            actor=user,
            action_type="password_changed",
            target=user,
            metadata={"self_service": True},
        )
        EmailNotificationService.send_password_changed_email(user=user)

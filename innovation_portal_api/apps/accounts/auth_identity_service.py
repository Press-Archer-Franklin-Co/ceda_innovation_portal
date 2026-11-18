from __future__ import annotations

import secrets

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.identity_providers import IdentityTrustLevel, IdentityProviderRegistry, NormalizedIdentity
from apps.accounts.models import SocialAccount, User
from apps.accounts.security_policy import SecurityPolicyService
from apps.accounts.security_services import AccountSecurityService
from apps.accounts.services import AuthTokenService, UserOnboardingService
from apps.audit.services import AuditService
from apps.core.constants import RoleType


class AuthIdentityService:
    @staticmethod
    def _create_user_from_identity(*, identity: NormalizedIdentity, source: str) -> User:
        user = User.objects.create_user(
            email=identity.email,
            password=secrets.token_urlsafe(24),
            first_name=identity.first_name or "CEDA",
            last_name=identity.last_name or "User",
            phone_number="",
            email_verified=True,
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        UserOnboardingService.ensure_user_onboarding(
            user,
            source=source,
            default_role_codes=[RoleType.INNOVATOR],
            mark_email_verified=True,
            metadata={"provider": identity.provider, "trust_level": identity.trust_level},
        )
        AccountSecurityService.sync_identity_ownership(
            user=user,
            preferred_method=identity.provider,
            actor=user,
            reason=f"{source}_primary_assignment",
        )
        return user

    @staticmethod
    def _upsert_social_account(*, user: User, identity: NormalizedIdentity) -> SocialAccount:
        account, _ = SocialAccount.objects.update_or_create(
            provider=identity.provider,
            provider_user_id=identity.provider_user_id,
            defaults={
                "user": user,
                "provider_email": identity.email,
                "provider_email_verified": identity.email_verified,
                "extra_data": identity.raw_claims,
                "last_login_at": timezone.now(),
            },
        )
        return account

    @staticmethod
    def _can_link_by_email(identity: NormalizedIdentity) -> bool:
        if not identity.allows_email_linking:
            return False
        return identity.trust_level in {IdentityTrustLevel.STRONG, IdentityTrustLevel.MEDIUM}

    @staticmethod
    def finalize_local_login(*, user: User) -> dict:
        UserOnboardingService.ensure_user_onboarding(
            user,
            source="password_login",
            default_role_codes=[],
            metadata={"method": "password", "trust_level": IdentityTrustLevel.LOCAL},
        )
        AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="password_login")
        policy = SecurityPolicyService.evaluate(user=user)
        if not policy.policy_compliant and SecurityPolicyService._is_sensitive_user(user):
            AuditService.log_action(
                actor=user,
                action_type="staff_security_requirement_failed",
                target=user,
                metadata={"policy_flags": policy.policy_flags, "blocking_flags": policy.blocking_flags},
            )
        AuditService.log_action(
            actor=user,
            action_type="local_login_success",
            target=user,
            metadata={"provider": "password"},
        )
        return AuthTokenService.issue_tokens(user)

    @staticmethod
    @transaction.atomic
    def resolve_social_login(*, identity: NormalizedIdentity) -> dict:
        social_account = SocialAccount.objects.select_related("user").filter(
            provider=identity.provider,
            provider_user_id=identity.provider_user_id,
        ).first()

        created = False
        linked_existing = False
        if social_account:
            user = social_account.user
        else:
            user = User.objects.filter(email__iexact=identity.email).first()
            if user:
                if not AuthIdentityService._can_link_by_email(identity):
                    AuditService.log_action(
                        actor=user,
                        action_type="social_link_blocked",
                        target=user,
                        metadata={
                            "provider": identity.provider,
                            "reason": "unsafe_email_linking",
                            "trust_level": identity.trust_level,
                        },
                    )
                    raise ValidationError({"email": "Cannot link a social account with an unverified or untrusted provider email."})
                linked_existing = True
            else:
                if not AuthIdentityService._can_link_by_email(identity):
                    AuditService.log_raw_action(
                        actor=None,
                        action_type="social_signup_blocked",
                        target_model="Identity",
                        target_id=identity.provider_user_id,
                        metadata={
                            "provider": identity.provider,
                            "reason": "unsafe_email_for_signup",
                            "trust_level": identity.trust_level,
                        },
                    )
                    raise ValidationError({"email": "A verified provider email is required for first-time social signup."})
                user = AuthIdentityService._create_user_from_identity(identity=identity, source="social_signup")
                created = True
            social_account = AuthIdentityService._upsert_social_account(user=user, identity=identity)

        UserOnboardingService.ensure_user_onboarding(
            user,
            source="social_login",
            default_role_codes=[],
            mark_email_verified=user.email_verified or identity.email_verified,
            metadata={
                "provider": identity.provider,
                "linked_existing": linked_existing,
                "trust_level": identity.trust_level,
            },
        )
        AccountSecurityService.sync_identity_ownership(
            user=user,
            preferred_method=identity.provider if created else None,
            actor=user,
            reason="social_login",
        )
        policy = SecurityPolicyService.evaluate(user=user)
        if not policy.policy_compliant and SecurityPolicyService._is_sensitive_user(user):
            AuditService.log_action(
                actor=user,
                action_type="staff_security_requirement_failed",
                target=user,
                metadata={"policy_flags": policy.policy_flags, "blocking_flags": policy.blocking_flags},
            )

        social_account.provider_email = identity.email
        social_account.provider_email_verified = identity.email_verified
        social_account.extra_data = identity.raw_claims
        social_account.last_login_at = timezone.now()
        social_account.save(update_fields=["provider_email", "provider_email_verified", "extra_data", "last_login_at", "updated_at"])

        if created:
            AuditService.log_action(
                actor=user,
                action_type="social_signup_success",
                target=user,
                metadata={"provider": identity.provider, "social_account_id": str(social_account.id)},
            )

        AuditService.log_action(
            actor=user,
            action_type="social_login_success",
            target=user,
            metadata={
                "provider": identity.provider,
                "created": created,
                "linked_existing": linked_existing,
                "resolution_path": "social_account" if not linked_existing and not created else "email_match_or_signup",
                "trust_level": identity.trust_level,
            },
        )
        return {
            "user": user,
            "tokens": AuthTokenService.issue_tokens(user),
            "provider": identity.provider,
            "created": created,
            "linked_existing_account": linked_existing,
        }

    @staticmethod
    @transaction.atomic
    def link_social_identity(*, user: User, identity: NormalizedIdentity) -> SocialAccount:
        before_policy = SecurityPolicyService.evaluate(user=user)
        existing = SocialAccount.objects.filter(provider=identity.provider, provider_user_id=identity.provider_user_id).first()
        if existing and existing.user_id != user.id:
            AuditService.log_action(
                actor=user,
                action_type="social_link_blocked",
                target=user,
                metadata={"provider": identity.provider, "reason": "provider_already_linked_elsewhere"},
            )
            raise ValidationError({"provider": f"{identity.provider} is already linked to another account."})
        if user.social_accounts.filter(provider=identity.provider).exists():
            raise ValidationError({"provider": f"{identity.provider} is already linked to this account."})
        if not AuthIdentityService._can_link_by_email(identity):
            AuditService.log_action(
                actor=user,
                action_type="social_link_blocked",
                target=user,
                metadata={"provider": identity.provider, "reason": "missing_or_unverified_provider_email", "trust_level": identity.trust_level},
            )
            raise ValidationError({"email": "A verified provider email is required to link this account."})
        if (user.email or "").lower() != (identity.email or "").lower():
            AuditService.log_action(
                actor=user,
                action_type="social_link_blocked",
                target=user,
                metadata={"provider": identity.provider, "reason": "email_mismatch", "provider_email": identity.email},
            )
            raise ValidationError({"email": "Provider email does not match the current account."})
        account = AuthIdentityService._upsert_social_account(user=user, identity=identity)
        UserOnboardingService.ensure_user_onboarding(
            user,
            source="social_link",
            default_role_codes=[],
            mark_email_verified=user.email_verified or identity.email_verified,
            metadata={"provider": identity.provider, "trust_level": identity.trust_level},
        )
        AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="social_link")
        after_policy = SecurityPolicyService.evaluate(user=user)
        SecurityPolicyService.audit_policy_transition(user=user, before=before_policy, after=after_policy, actor=user, reason="social_link")
        AuditService.log_action(
            actor=user,
            action_type="social_account_linked",
            target=user,
            metadata={"provider": identity.provider, "social_account_id": str(account.id)},
        )
        return account

    @staticmethod
    def unlink_provider(*, provider: str, user: User) -> None:
        IdentityProviderRegistry.ensure_enabled(provider)
        account = user.social_accounts.filter(provider=provider).first()
        if not account:
            raise ValidationError({"provider": f"{provider} is not linked to this account."})
        before_state = AccountSecurityService.build_security_state(user=user)
        before_policy = SecurityPolicyService.evaluate(user=user)
        try:
            AccountSecurityService.assert_can_unlink_provider(user=user, provider=provider)
        except ValidationError as exc:
            AuditService.log_action(
                actor=user,
                action_type="unlink_blocked_no_recovery",
                target=user,
                metadata={"provider": provider, "errors": exc.detail},
            )
            raise
        SecurityPolicyService.assert_unlink_allowed_by_policy(user=user, provider=provider)
        with transaction.atomic():
            account_id = str(account.id)
            account.delete()
            AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="social_unlink")
            after_state = AccountSecurityService.build_security_state(user=user)
            after_policy = SecurityPolicyService.evaluate(user=user)
            SecurityPolicyService.audit_policy_transition(user=user, before=before_policy, after=after_policy, actor=user, reason="social_unlink")
            if after_state.linked_provider_count < before_state.linked_provider_count or len(after_state.recovery_methods) < len(before_state.recovery_methods):
                AuditService.log_action(
                    actor=user,
                    action_type="recovery_posture_weakened",
                    target=user,
                    metadata={"reason": "social_unlink", "provider": provider},
                )
            AuditService.log_action(
                actor=user,
                action_type="social_account_unlinked",
                target=user,
                metadata={"provider": provider, "social_account_id": account_id},
            )

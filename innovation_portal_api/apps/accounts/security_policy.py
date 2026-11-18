from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from rest_framework.exceptions import ValidationError

from apps.accounts.models import SocialAuthProvider, User
from apps.accounts.security_services import AccountSecurityService, AccountSecurityState
from apps.audit.services import AuditService
from apps.core.constants import RoleType


@dataclass
class SecurityPolicyEvaluation:
    security_level: str
    policy_compliant: bool
    policy_flags: list[str]
    blocking_flags: list[str]
    recommended_actions: list[str]
    recommended_action_codes: list[str]
    enforcement_actions: list[str]
    can_continue_without_action: bool
    requires_password_fallback: bool
    requires_verified_email: bool
    requires_additional_recovery_method: bool


class SecurityPolicyService:
    @staticmethod
    def config() -> dict:
        return settings.ACCOUNT_SECURITY_POLICY

    @staticmethod
    def _role_codes(user: User) -> set[str]:
        return set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))

    @staticmethod
    def _is_sensitive_user(user: User) -> bool:
        role_codes = SecurityPolicyService._role_codes(user)
        sensitive_roles = {
            RoleType.INNOVATION_OFFICER,
            RoleType.ADMINISTRATOR,
            RoleType.MANAGEMENT_VIEWER,
        }
        return bool(user.is_staff or user.is_superuser or role_codes & sensitive_roles)

    @staticmethod
    def _trusted_provider_count(state: AccountSecurityState) -> int:
        trusted = set(SecurityPolicyService.config()["TRUSTED_PROVIDERS"])
        return sum(1 for account in state.linked_accounts if account["provider"] in trusted)

    @staticmethod
    def classify_security_level(*, user: User, state: AccountSecurityState) -> str:
        config = SecurityPolicyService.config()
        score = 0
        if state.has_password:
            score += 2
        if user.email_verified:
            score += 1
        trusted_provider_count = SecurityPolicyService._trusted_provider_count(state)
        if trusted_provider_count:
            score += 1
        elif state.linked_provider_count and config["WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK"]:
            score += 1
        if len(state.recovery_methods) >= 2:
            score += 1
        if "single_login_method" in state.account_risk_flags and not (
            state.linked_provider_count and config["WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK"]
        ):
            score -= 1
        trusted_fallback_present = bool(
            trusted_provider_count or (state.linked_provider_count and config["WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK"])
        )
        if "no_password_fallback" in state.account_risk_flags and not trusted_fallback_present:
            score -= 1
        if SecurityPolicyService._is_sensitive_user(user) and not state.has_password:
            score -= 1

        thresholds = config["LEVEL_THRESHOLDS"]
        if score >= thresholds["high"]:
            return "high"
        if score >= thresholds["medium"]:
            return "medium"
        return "low"

    @staticmethod
    def evaluate(*, user: User, state: AccountSecurityState | None = None) -> SecurityPolicyEvaluation:
        state = state or AccountSecurityService.build_security_state(user=user)
        sensitive = SecurityPolicyService._is_sensitive_user(user)
        config = SecurityPolicyService.config()
        policy_flags: list[str] = list(state.account_risk_flags)
        blocking_flags: list[str] = []
        action_codes: list[str] = []
        action_messages: list[str] = []
        enforcement_actions: list[str] = []

        requires_password_fallback = bool(sensitive and config["STAFF_REQUIRE_PASSWORD_FALLBACK"] and not state.has_password)
        if requires_password_fallback:
            policy_flags.append("staff_requires_password_fallback")
            action_codes.append("add_password")
            action_messages.append("Add a password because staff and internal accounts require a local fallback.")

        requires_verified_email = bool((sensitive and config["STAFF_REQUIRE_VERIFIED_EMAIL"]) and not user.email_verified)
        if requires_verified_email:
            policy_flags.append("verified_email_required")
            action_codes.append("verify_email")
            action_messages.append("Verify your email address to comply with portal security policy.")

        requires_additional_recovery_method = bool(
            sensitive and config["STAFF_REQUIRE_TWO_RECOVERY_METHODS"] and len(state.recovery_methods) < 2
        )
        if requires_additional_recovery_method:
            policy_flags.append("additional_recovery_method_required")
            action_codes.append("strengthen_recovery")
            action_messages.append("Add another recovery method because sensitive accounts need at least two recovery paths.")

        if "no_password_fallback" in state.account_risk_flags and not sensitive:
            action_codes.append("add_password")
            action_messages.append("Add a password for account recovery.")
        if "email_unverified" in state.account_risk_flags and not requires_verified_email:
            action_codes.append("verify_email")
            action_messages.append("Verify your email address to improve account recovery.")
        if state.linked_provider_count == 0 and state.has_password:
            action_codes.append("link_trusted_provider")
            action_messages.append("Link a trusted provider like Google or Microsoft for backup sign-in.")

        security_level = SecurityPolicyService.classify_security_level(user=user, state=state)
        if security_level == "low":
            policy_flags.append("low_security_posture")
        if sensitive and security_level == "low":
            blocking_flags.append("sensitive_account_low_security")
            enforcement_actions.append("strengthen_before_sensitive_use")

        can_continue_without_action = not blocking_flags
        policy_compliant = not blocking_flags and not requires_password_fallback and not requires_verified_email and not requires_additional_recovery_method

        dedup_policy_flags = list(dict.fromkeys(policy_flags))
        dedup_action_codes = list(dict.fromkeys(action_codes))
        dedup_action_messages = list(dict.fromkeys(action_messages))
        dedup_enforcement = list(dict.fromkeys(enforcement_actions))

        return SecurityPolicyEvaluation(
            security_level=security_level,
            policy_compliant=policy_compliant,
            policy_flags=dedup_policy_flags,
            blocking_flags=blocking_flags,
            recommended_actions=dedup_action_messages,
            recommended_action_codes=dedup_action_codes,
            enforcement_actions=dedup_enforcement,
            can_continue_without_action=can_continue_without_action,
            requires_password_fallback=requires_password_fallback,
            requires_verified_email=requires_verified_email,
            requires_additional_recovery_method=requires_additional_recovery_method,
        )

    @staticmethod
    def audit_policy_transition(*, user: User, before: SecurityPolicyEvaluation, after: SecurityPolicyEvaluation, actor=None, reason: str):
        level_order = {"low": 1, "medium": 2, "high": 3}
        if before.security_level != after.security_level:
            AuditService.log_action(
                actor=actor or user,
                action_type="security_level_changed",
                target=user,
                before_state={"security_level": before.security_level},
                after_state={"security_level": after.security_level},
                metadata={"reason": reason},
            )
        if level_order.get(after.security_level, 0) > level_order.get(before.security_level, 0):
            AuditService.log_action(
                actor=actor or user,
                action_type="recovery_posture_improved",
                target=user,
                metadata={"reason": reason, "from": before.security_level, "to": after.security_level},
            )
        elif level_order.get(after.security_level, 0) < level_order.get(before.security_level, 0):
            AuditService.log_action(
                actor=actor or user,
                action_type="recovery_posture_weakened",
                target=user,
                metadata={"reason": reason, "from": before.security_level, "to": after.security_level},
            )
        if before.policy_compliant and not after.policy_compliant:
            AuditService.log_action(
                actor=actor or user,
                action_type="policy_non_compliant_detected",
                target=user,
                metadata={"reason": reason, "policy_flags": after.policy_flags, "blocking_flags": after.blocking_flags},
            )
        if not before.policy_compliant and after.policy_compliant:
            AuditService.log_action(
                actor=actor or user,
                action_type="recovery_posture_improved",
                target=user,
                metadata={"reason": reason, "security_level": after.security_level},
            )

    @staticmethod
    def assert_unlink_allowed_by_policy(*, user: User, provider: str) -> None:
        state = AccountSecurityService.build_security_state(user=user)
        config = SecurityPolicyService.config()
        remaining_linked_accounts = [account for account in state.linked_accounts if account["provider"] != provider]
        simulated_state = AccountSecurityState(
            primary_auth_method=state.primary_auth_method if state.primary_auth_method != provider else "",
            has_password=state.has_password,
            linked_provider_count=len(remaining_linked_accounts),
            recovery_methods=AccountSecurityService._recovery_methods(user, [a["provider"] for a in remaining_linked_accounts]),
            account_risk_flags=AccountSecurityService._risk_flags(
                user,
                [a["provider"] for a in remaining_linked_accounts],
                AccountSecurityService._recovery_methods(user, [a["provider"] for a in remaining_linked_accounts]),
            ),
            linked_accounts=remaining_linked_accounts,
            can_set_password=state.can_set_password,
            can_change_password=state.can_change_password,
        )
        evaluation = SecurityPolicyService.evaluate(user=user, state=simulated_state)
        sensitive = SecurityPolicyService._is_sensitive_user(user)
        if sensitive and config["STAFF_REQUIRE_PASSWORD_FALLBACK"] and not state.has_password:
            AuditService.log_action(
                actor=user,
                action_type="unlink_blocked_by_policy",
                target=user,
                metadata={"provider": provider, "reason": "staff_requires_password_fallback"},
            )
            AuditService.log_action(
                actor=user,
                action_type="staff_security_requirement_failed",
                target=user,
                metadata={"provider": provider, "reason": "staff_requires_password_fallback"},
            )
            raise ValidationError({"provider": "Staff and internal accounts must set a password before unlinking social sign-in providers."})
        if evaluation.blocking_flags:
            AuditService.log_action(
                actor=user,
                action_type="unlink_blocked_by_policy",
                target=user,
                metadata={"provider": provider, "blocking_flags": evaluation.blocking_flags},
            )
            raise ValidationError({"provider": "This provider cannot be unlinked under the current portal security policy."})

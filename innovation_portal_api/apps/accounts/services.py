import logging
import secrets

from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Role, User, UserRole, UserSecurityToken
from apps.audit.services import AuditService
from apps.communications.models import NotificationPreference
from apps.communications.email_notifications import EmailNotificationService
from apps.core.constants import RoleType
from apps.profiles.models import InnovatorProfile


logger = logging.getLogger(__name__)


class RoleService:
    CANONICAL_ROLE_CODES = {
        RoleType.INNOVATOR,
        RoleType.JUDGE,
        RoleType.SPECIALIST,
        RoleType.INNOVATION_OFFICER,
        RoleType.INNOVATION_MANAGER,
        RoleType.ADMINISTRATOR,
        RoleType.MENTOR,
    }
    LEGACY_ROLE_MAP = {
        RoleType.INNOVATION_ANALYST: RoleType.INNOVATION_OFFICER,
        RoleType.STAFF_MEMBER: RoleType.INNOVATION_OFFICER,
        RoleType.EXO: RoleType.INNOVATION_OFFICER,
        RoleType.MANAGEMENT_VIEWER: RoleType.INNOVATION_OFFICER,
    }

    @staticmethod
    def ensure_default_roles() -> None:
        for code, label in RoleType.choices:
            Role.objects.get_or_create(code=code, defaults={"name": label})

    @staticmethod
    @transaction.atomic
    def assign_roles(user: User, role_codes: list[str]) -> None:
        RoleService.ensure_default_roles()
        roles = Role.objects.filter(code__in=role_codes)
        existing = set(UserRole.objects.filter(user=user, role__in=roles).values_list("role_id", flat=True))
        for role in roles:
            if role.id in existing:
                continue
            UserRole.objects.create(user=user, role=role, is_active=True)

    @staticmethod
    def get_primary_role(user: User) -> tuple[str | None, str | None]:
        active_roles = list(
            user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)
        )
        if not active_roles:
            return None, None
        for code in (
            RoleType.ADMINISTRATOR,
            RoleType.INNOVATION_MANAGER,
            RoleType.INNOVATION_OFFICER,
            RoleType.JUDGE,
            RoleType.SPECIALIST,
            RoleType.MENTOR,
            RoleType.INNOVATOR,
        ):
            if code in active_roles:
                return code, code
        for code in active_roles:
            mapped = RoleService.LEGACY_ROLE_MAP.get(code)
            if mapped:
                return mapped, code
        return active_roles[0], active_roles[0]

    @staticmethod
    @transaction.atomic
    def set_roles(
        *,
        user: User,
        role_codes: list[str],
        actor: User | None = None,
        reason: str = "admin_role_update",
    ) -> User:
        if not role_codes:
            raise ValueError("At least one role is required.")
        role_codes = list(dict.fromkeys(role_codes))
        invalid = [code for code in role_codes if code not in RoleService.CANONICAL_ROLE_CODES]
        if invalid:
            raise ValueError("Invalid role code.")
        RoleService.ensure_default_roles()
        roles = list(Role.objects.filter(code__in=role_codes))
        if len(roles) != len(set(role_codes)):
            raise ValueError("Role does not exist.")
        previous_role_codes = set(
            user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)
        )
        next_role_codes = set(role_codes)
        is_staff_role = any(code in {
            RoleType.ADMINISTRATOR,
            RoleType.INNOVATION_MANAGER,
            RoleType.INNOVATION_OFFICER,
            RoleType.JUDGE,
            RoleType.SPECIALIST,
            RoleType.MENTOR,
        } for code in role_codes)
        if user.is_staff != is_staff_role:
            user.is_staff = is_staff_role
            user.save(update_fields=["is_staff", "updated_at"])
        if previous_role_codes == next_role_codes:
            return user
        UserRole.objects.filter(user=user, is_active=True).update(is_active=False, updated_at=timezone.now())
        for role in roles:
            user_role, created = UserRole.objects.get_or_create(user=user, role=role, defaults={"is_active": True})
            if not created and not user_role.is_active:
                user_role.is_active = True
                user_role.save(update_fields=["is_active", "updated_at"])
        AuditService.log_action(
            actor=actor or user,
            action_type="user_role_updated",
            target=user,
            metadata={
                "roles": role_codes,
                "added_roles": sorted(next_role_codes - previous_role_codes),
                "removed_roles": sorted(previous_role_codes - next_role_codes),
                "actor_id": str(actor.id) if actor else None,
                "reason": reason,
            },
        )
        if user.email:
            try:
                EmailNotificationService.send_role_change_email(
                    user=user,
                    roles=role_codes,
                    actor=actor,
                    added_roles=sorted(next_role_codes - previous_role_codes),
                    removed_roles=sorted(previous_role_codes - next_role_codes),
                )
            except Exception:
                logger.exception("Role update saved, but role change notification failed for user %s.", user.id)
        return user


class UserSecurityTokenService:
    TOKEN_LIFETIME_HOURS = {
        "email_verification": 72,
        "password_reset": 24,
    }
    _DEFAULT_LIFETIME_HOURS = 24

    @staticmethod
    def issue_token(user: User, purpose: str):
        hours = UserSecurityTokenService.TOKEN_LIFETIME_HOURS.get(
            purpose, UserSecurityTokenService._DEFAULT_LIFETIME_HOURS
        )
        expires_at = timezone.now() + timezone.timedelta(hours=hours)
        token = UserSecurityToken.objects.create(
            user=user,
            purpose=purpose,
            token=secrets.token_urlsafe(32),
            expires_at=expires_at,
        )
        return token

    @staticmethod
    def consume_token(token_value: str, purpose: str):
        token = UserSecurityToken.objects.filter(
            token=token_value,
            purpose=purpose,
            used_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).select_related("user").first()
        if not token:
            raise ValueError("Token is invalid or expired.")
        token.used_at = timezone.now()
        token.save(update_fields=["used_at", "updated_at"])
        return token


class AuthTokenService:
    @staticmethod
    def issue_tokens(user: User) -> dict:
        refresh = RefreshToken.for_user(user)
        refresh["email"] = user.email
        refresh["roles"] = list(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class UserOnboardingService:
    @staticmethod
    @transaction.atomic
    def initialize_user(
        user: User,
        *,
        role_codes: list[str] | None = None,
        ensure_profile: bool = True,
        mark_email_verified: bool | None = None,
        audit_action: str = "user_initialized",
        audit_metadata: dict | None = None,
    ) -> User:
        created_profile = False
        created_preferences = False
        if role_codes:
            RoleService.assign_roles(user, role_codes)
        if ensure_profile:
            _, created_profile = InnovatorProfile.objects.get_or_create(user=user)
        _, created_preferences = NotificationPreference.objects.get_or_create(user=user)
        if mark_email_verified is not None and user.email_verified != mark_email_verified:
            user.email_verified = mark_email_verified
            user.save(update_fields=["email_verified", "updated_at"])
        AuditService.log_action(
            actor=user,
            action_type=audit_action,
            target=user,
            after_state={"email_verified": user.email_verified},
            metadata={
                "created_profile": created_profile,
                "created_notification_preferences": created_preferences,
                **(audit_metadata or {}),
            },
        )
        return user

    @staticmethod
    @transaction.atomic
    def ensure_user_onboarding(
        user: User,
        *,
        source: str,
        default_role_codes: list[str] | None = None,
        ensure_profile: bool = True,
        mark_email_verified: bool | None = None,
        actor=None,
        metadata: dict | None = None,
    ) -> User:
        return UserOnboardingService.initialize_user(
            user,
            role_codes=default_role_codes or [],
            ensure_profile=ensure_profile,
            mark_email_verified=mark_email_verified,
            audit_action="user_onboarding_ensured",
            audit_metadata={"source": source, **(metadata or {})},
        )


class UserVerificationService:
    @staticmethod
    def assert_verified(*, user: User, reason: str = "submission_action") -> None:
        if user.is_staff or user.is_superuser:
            return
        if not user.email_verified:
            raise PermissionDenied(
                {
                    "code": "email_verification_required",
                    "detail": "Please verify your email address before submitting.",
                    "reason": reason,
                }
            )


class StaffSSOService:
    """Gives staff access to people who signed in through CEDA staff SSO.

    The allow list check happens earlier, in CedaStaffIdentityProvider, before any
    account is created. Existing staff roles are never changed here; a person with no
    staff role gets CEDA_SSO_DEFAULT_ROLE (``staff_member`` by default, which can work
    on assigned tasks but cannot manage challenges or users). Administrators raise
    access from the staff console as usual.
    """

    STAFF_ROLE_CODES = frozenset(
        {
            RoleType.ADMINISTRATOR,
            RoleType.INNOVATION_MANAGER,
            RoleType.INNOVATION_OFFICER,
            RoleType.INNOVATION_ANALYST,
            RoleType.STAFF_MEMBER,
            RoleType.JUDGE,
            RoleType.SPECIALIST,
            RoleType.EXO,
            RoleType.MENTOR,
            RoleType.MANAGEMENT_VIEWER,
        }
    )

    @staticmethod
    def default_role(configured: str = "") -> str:
        from django.conf import settings

        role = configured or getattr(settings, "CEDA_SSO_DEFAULT_ROLE", "") or RoleType.STAFF_MEMBER
        if role not in StaffSSOService.STAFF_ROLE_CODES or role == RoleType.ADMINISTRATOR:
            logger.warning("SSO default role %r is not allowed; using staff_member.", role)
            return RoleType.STAFF_MEMBER
        return role

    @staticmethod
    def roles_for_groups(groups: list[str], group_role_map: dict[str, str]) -> list[str]:
        """Roles mapped from the person's groups. Administrator is never handed out."""
        lowered = {str(group).strip().lower() for group in groups or []}
        roles = []
        for group, role in (group_role_map or {}).items():
            if str(group).strip().lower() in lowered and role in StaffSSOService.STAFF_ROLE_CODES and role != RoleType.ADMINISTRATOR:
                roles.append(role)
        return sorted(set(roles))

    @staticmethod
    @transaction.atomic
    def grant_staff_access(
        *,
        user: User,
        created: bool,
        allowed_by: str = "",
        default_role: str = "",
        group_role_map: dict[str, str] | None = None,
        groups: list[str] | None = None,
    ) -> User:
        active_roles = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        granted_roles: list[str] = []
        if not active_roles & StaffSSOService.STAFF_ROLE_CODES:
            granted_roles = StaffSSOService.roles_for_groups(groups or [], group_role_map or {}) or [
                StaffSSOService.default_role(default_role)
            ]
            RoleService.assign_roles(user, granted_roles)
            UserRole.objects.filter(user=user, role__code__in=granted_roles).update(is_active=True, updated_at=timezone.now())
            if created:
                # A brand-new SSO account is a staff account, not an innovator account.
                UserRole.objects.filter(user=user, role__code=RoleType.INNOVATOR).update(is_active=False, updated_at=timezone.now())
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=["is_staff", "updated_at"])
        AuditService.log_action(
            actor=user,
            action_type="staff_sso_access_granted",
            target=user,
            metadata={"created": created, "allowed_by": allowed_by, "granted_roles": granted_roles},
        )
        return user

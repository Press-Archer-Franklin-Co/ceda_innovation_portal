from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.throttling import SimpleRateThrottle

from apps.core.constants import RoleType


class IPRateThrottle(SimpleRateThrottle):
    """IP-based throttle for public endpoints that have no authenticated user.

    Uses the client IP as the cache key so unauthenticated callers can't
    bypass the global AnonRateThrottle by omitting credentials.
    """
    scope = "ip_public"

    def get_cache_key(self, request, view):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "unknown")
        return self.cache_format % {"scope": self.scope, "ident": ip}


class AuthRateThrottle(IPRateThrottle):
    """Stricter IP-based throttle for authentication endpoints (login, register, etc.)."""
    scope = "auth"


class HasRolePermission(BasePermission):
    allowed_roles: set[str] = set()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.roles.filter(code__in=self.allowed_roles, user_roles__is_active=True).exists()


class IsInnovator(HasRolePermission):
    allowed_roles = {RoleType.INNOVATOR}


class IsOfficerOrAdmin(HasRolePermission):
    allowed_roles = {RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR}


class IsJudge(HasRolePermission):
    allowed_roles = {RoleType.JUDGE}


class IsManagementReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method not in SAFE_METHODS:
            return False
        return request.user.roles.filter(code=RoleType.MANAGEMENT_VIEWER, user_roles__is_active=True).exists()


class IsOfficerAdminOrManagementReadOnly(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.user.roles.filter(
            code__in=[RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR],
            user_roles__is_active=True,
        ).exists():
            return True
        return request.method in SAFE_METHODS and request.user.roles.filter(
            code=RoleType.MANAGEMENT_VIEWER,
            user_roles__is_active=True,
        ).exists()


class IsAdministrator(HasRolePermission):
    """Allows administrators only (not officers)."""
    allowed_roles = {RoleType.ADMINISTRATOR}


class IsManagerOrAdmin(HasRolePermission):
    """Allows Innovation Managers and Administrators — used for specialist invitations."""
    allowed_roles = {RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR}


class IsJudgeOrOfficer(HasRolePermission):
    """Allows judges, innovation officers, and administrators to access review/scoring endpoints."""
    allowed_roles = {RoleType.JUDGE, RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR}


STAFF_WORKER_ROLES = {
    RoleType.JUDGE,
    RoleType.INNOVATION_OFFICER,
    RoleType.INNOVATION_MANAGER,
    RoleType.INNOVATION_ANALYST,
    RoleType.STAFF_MEMBER,
    RoleType.SPECIALIST,
    RoleType.EXO,
    RoleType.MENTOR,
    RoleType.ADMINISTRATOR,
}


class IsStaffWorker(HasRolePermission):
    """Any staff role that can claim and work on assigned tasks."""
    allowed_roles = STAFF_WORKER_ROLES


class IsOwnerOrOfficerOrAdmin(BasePermission):
    owner_field = "user"

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        if request.user.roles.filter(
            code__in=[RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR],
            user_roles__is_active=True,
        ).exists():
            return True
        return getattr(obj, self.owner_field, None) == request.user


class HasCapability(BasePermission):
    """S1: allow users who hold a capability from apps/core/capabilities.py.

    Use ``HasCapability.of("content.edit")`` in permission_classes. With ``write=``,
    safe methods (GET, HEAD, OPTIONS) need ``capability`` and the others need ``write``.
    Unknown capability names fail when the view module loads, not at request time.
    """

    capability: str = ""
    write_capability: str = ""

    @classmethod
    def of(cls, capability: str, *, write: str = ""):
        from apps.core.capabilities import roles_for

        roles_for(capability)
        if write:
            roles_for(write)
        name = f"HasCapability_{capability}{'__' + write if write else ''}".replace(".", "_")
        return type(name, (cls,), {"capability": capability, "write_capability": write})

    def required(self, request) -> str:
        if self.write_capability and request.method not in SAFE_METHODS:
            return self.write_capability
        return self.capability

    def has_permission(self, request, view):
        from apps.core.capabilities import user_has

        return user_has(request.user, self.required(request))

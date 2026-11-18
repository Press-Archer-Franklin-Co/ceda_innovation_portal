from rest_framework.permissions import BasePermission

from apps.core.constants import RoleType

MEDIA_STAFF_ROLES = {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR}


def is_media_staff(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.roles.filter(code__in=MEDIA_STAFF_ROLES, user_roles__is_active=True).exists()


class IsMediaOwnerOrStaff(BasePermission):
    """The person who uploaded a file, or an officer, manager or administrator."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return obj.uploaded_by_id == request.user.id or is_media_staff(request.user)

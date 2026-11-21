"""U7: test accounts for demos.

Two gates, both needed:
1. the server setting INNOVATION_PORTAL_DEMO_LOGINS=True (settings.DEMO_LOGINS, default False), and
2. the feature switch ``demo_logins`` in Platform settings (default off).

While both are on, the sign-in page lists the accounts marked ``is_demo_account`` and
signs in as one with a single click (POST /api/auth/demo-login/). With either off the
list is not sent and the endpoint answers 404.

Demo accounts can sign in at all only while the server setting is on, and cannot be
given the administrator role on a server running without DEBUG unless it is on. Every
demo sign-in is written to the audit log.
"""
from __future__ import annotations

from django.conf import settings
from django.http import Http404
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import RoleType

# Order of the groups in the Test accounts list (Figma 2.0, pin 3).
ROLE_ORDER = (
    RoleType.INNOVATOR,
    RoleType.INNOVATION_OFFICER,
    RoleType.JUDGE,
    RoleType.INNOVATION_MANAGER,
    RoleType.ADMINISTRATOR,
)


def server_allows() -> bool:
    return bool(getattr(settings, "DEMO_LOGINS", False))


def enabled() -> bool:
    if not server_allows():
        return False
    from apps.platform_config.flags import is_enabled

    return is_enabled("demo_logins")


def require_enabled() -> None:
    if not enabled():
        raise Http404


def assert_can_sign_in(user) -> None:
    """Refuse any sign-in by a demo account while the server does not allow demo logins."""
    if user is not None and getattr(user, "is_demo_account", False) and not server_allows():
        raise PermissionDenied({"code": "demo_account_disabled", "detail": "Test accounts are switched off on this server."})


def assert_roles_allowed(user, role_codes) -> None:
    """A demo account may be an administrator only on a server that allows demo logins (or runs with DEBUG)."""
    if (
        getattr(user, "is_demo_account", False)
        and RoleType.ADMINISTRATOR in set(role_codes or ())
        and not settings.DEBUG
        and not server_allows()
    ):
        raise ValidationError({"code": "demo_account_admin_refused", "detail": "Test accounts cannot be administrators on this server."})


def _primary_role(user, codes: list[str]) -> str:
    for code in ROLE_ORDER:
        if code in codes:
            return code
    return codes[0] if codes else ""


def accounts() -> list[dict]:
    """The demo accounts for the sign-in page: id, name and role only. Never emails or passwords."""
    from apps.accounts.models import Role, User

    role_names = dict(Role.objects.values_list("code", "name"))
    rows = []
    users = User.objects.filter(is_demo_account=True, is_active=True).prefetch_related("user_roles__role")
    for user in users:
        codes = [link.role.code for link in user.user_roles.all() if link.is_active]
        role = _primary_role(user, codes)
        rows.append(
            {
                "id": str(user.id),
                "name": user.full_name or user.display_contact,
                "initials": "".join(part[:1] for part in (user.first_name, user.last_name) if part).upper()[:2],
                "role": role,
                "role_label": role_names.get(role, role.replace("_", " ").title()),
            }
        )
    order = {code: index for index, code in enumerate(ROLE_ORDER)}
    rows.sort(key=lambda row: (order.get(row["role"], len(order)), row["name"]))
    return rows

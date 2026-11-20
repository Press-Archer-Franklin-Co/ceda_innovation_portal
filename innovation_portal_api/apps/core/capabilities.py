"""One capability map (S1): what each role may do. The API and both frontends read this.

Each capability lists the roles that hold it. Superusers hold every capability.
The role lists copy what the permission classes allowed before S1, so moving a view
to HasCapability does not change who gets in. The frontends get a user's capabilities
from GET /api/auth/me/ and scripts/check-capabilities.mjs keeps them in step with this file.

Do not test role names anywhere else; ask for a capability.
"""

from __future__ import annotations

from apps.core.constants import RoleType as R

OFFICER_ADMIN = (R.INNOVATION_OFFICER, R.ADMINISTRATOR)
READERS = (R.INNOVATION_OFFICER, R.ADMINISTRATOR, R.MANAGEMENT_VIEWER)
STAFF_WORKERS = (
    R.JUDGE,
    R.INNOVATION_OFFICER,
    R.INNOVATION_MANAGER,
    R.INNOVATION_ANALYST,
    R.STAFF_MEMBER,
    R.SPECIALIST,
    R.EXO,
    R.MENTOR,
    R.ADMINISTRATOR,
)

CAPABILITIES: dict[str, tuple[str, ...]] = {
    # Read-only overviews (was IsOfficerAdminOrManagementReadOnly on GET).
    "dashboard.view": READERS,
    "analytics.view": READERS,
    "reports.export": READERS,
    "audit.view": READERS,
    # Review work (was IsStaffWorker): claim and work on assigned tasks.
    "entries.review": STAFF_WORKERS,
    # Search every idea and person (was IsFullAccessStaff on /api/staff-search/).
    "entries.search": (R.INNOVATION_OFFICER, R.INNOVATION_MANAGER, R.ADMINISTRATOR),
    # Mark entries on a scorecard as a judge (was IsJudge on the scoring endpoints).
    "entries.score": (R.JUDGE,),
    # Assign reviewers and run the workflow (was IsOfficerOrAdmin).
    "entries.assign": OFFICER_ADMIN,
    # Build challenges, forms and criteria (was IsOfficerOrAdmin).
    "challenges.manage": OFFICER_ADMIN,
    "forms.manage": OFFICER_ADMIN,
    "criteria.manage": OFFICER_ADMIN,
    # Website content. Innovation managers edit it too (decided by Nshathisi, 2026-11-20).
    "content.edit": (R.INNOVATION_OFFICER, R.INNOVATION_MANAGER, R.ADMINISTRATOR),
    "content.approve": (R.INNOVATION_MANAGER, R.ADMINISTRATOR),
    # Administration (was IsAdministrator).
    "users.manage": (R.ADMINISTRATOR,),
    "settings.manage": (R.ADMINISTRATOR,),
}


def roles_for(capability: str) -> tuple[str, ...]:
    if capability not in CAPABILITIES:
        raise KeyError(f"Unknown capability `{capability}`. Add it to apps/core/capabilities.py first.")
    return CAPABILITIES[capability]


def capabilities_for(user) -> list[str]:
    """Every capability the user holds, sorted. Empty for anonymous users."""
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser:
        return sorted(CAPABILITIES)
    codes = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
    return sorted(name for name, roles in CAPABILITIES.items() if codes & set(roles))


def user_has(user, capability: str) -> bool:
    roles = roles_for(capability)
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.roles.filter(code__in=roles, user_roles__is_active=True).exists()

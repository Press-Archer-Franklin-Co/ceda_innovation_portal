"""One capability map (S1, S2): what each role may do. The API and both frontends read it.

S2: the map lives in the database (accounts.RoleCapability) so administrators can change it
from Roles & permissions. The dict below is the day-one map that the seed migration copied;
tests prove the database starts equal to it. The catalogue (label, description, group) stays
in code. Superusers hold every capability.

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
    # C2: WhatsApp and USSD journeys, channel connections and their activity.
    "channels.manage": OFFICER_ADMIN,
    # C1: answer chats and hand-overs in the Inbox.
    "conversations.reply": (R.INNOVATION_OFFICER, R.INNOVATION_MANAGER, R.ADMINISTRATOR),
}


# Code-side catalogue: every capability that exists, how admins see it, and the locks.
CATALOGUE: dict[str, dict] = {
    "dashboard.view": {"group": "overview", "label": "See the dashboard", "label_tn": "Bona dashboard"},
    "analytics.view": {"group": "overview", "label": "See analytics", "label_tn": "Bona dipalopalo"},
    "reports.export": {"group": "overview", "label": "Export reports", "label_tn": "Ntsha dipego"},
    "audit.view": {"group": "overview", "label": "See the audit log", "label_tn": "Bona rekoto ya ditiro"},
    "entries.review": {"group": "ideas", "label": "Work on review tasks", "label_tn": "Dira ditiro tsa tshekatsheko"},
    "entries.search": {"group": "ideas", "label": "Search every idea and person", "label_tn": "Batla dikakanyo le batho botlhe"},
    "entries.score": {"group": "ideas", "label": "Mark entries as a judge", "label_tn": "Tshwaya dikopo jaaka moatlhodi"},
    "entries.assign": {"group": "ideas", "label": "Assign reviewers and move ideas on", "label_tn": "Abela batshekatsheki"},
    "challenges.manage": {"group": "challenges", "label": "Build and run challenges", "label_tn": "Aga le go tsamaisa dikgaisano"},
    "forms.manage": {"group": "challenges", "label": "Build forms", "label_tn": "Aga diforomo"},
    "criteria.manage": {"group": "challenges", "label": "Set judging criteria", "label_tn": "Baya ditekanyetso tsa katlholo"},
    "content.edit": {"group": "website", "label": "Edit website content", "label_tn": "Fetola diteng tsa webosaete"},
    "content.approve": {"group": "website", "label": "Approve website content", "label_tn": "Dumelela diteng tsa webosaete"},
    "users.manage": {"group": "administration", "label": "Manage people and roles", "label_tn": "Laola batho le maemo", "locked_to": (R.ADMINISTRATOR,)},
    "settings.manage": {"group": "administration", "label": "Change platform settings", "label_tn": "Fetola ditlhophiso", "locked_to": (R.ADMINISTRATOR,)},
    "channels.manage": {
        "group": "administration",
        "label": "Run WhatsApp and USSD journeys",
        "label_tn": "Tsamaisa maeto a WhatsApp le USSD",  # TODO tn-review
        "description": "Design journeys, test them on the phone simulator, connect providers and see activity.",
    },
}
CATALOGUE["conversations.reply"] = {
    "group": "ideas",
    "label": "Answer chats in the Inbox",
    "label_tn": "Araba dipuisano mo Inbox",  # TODO tn-review
    "description": "Take, answer and close live chats and hand-overs from WhatsApp, USSD and the AI helper.",
}
GROUPS = ("overview", "ideas", "challenges", "website", "administration")
# Roles that never get staff capabilities, whatever is ticked.
NO_STAFF_CAPABILITIES = (R.INNOVATOR,)
MAP_CACHE_KEY = "capabilities:role-map"


def exists(capability: str) -> bool:
    return capability in CATALOGUE


def role_map() -> dict[str, set[str]]:
    """{capability: {role codes}} from the database, cached; falls back to the day-one map."""
    from django.core.cache import cache

    cached = cache.get(MAP_CACHE_KEY)
    if cached is not None:
        return cached
    try:
        from apps.accounts.models import RoleCapability

        rows = RoleCapability.objects.filter(role__is_active=True).values_list("capability", "role__code")
        result: dict[str, set[str]] = {name: set() for name in CATALOGUE}
        for capability, code in rows:
            result.setdefault(capability, set()).add(code)
    except Exception:  # tables not migrated yet (during migrate itself)
        return {name: set(roles) for name, roles in CAPABILITIES.items()}
    cache.set(MAP_CACHE_KEY, result, 300)
    return result


def clear_cache() -> None:
    from django.core.cache import cache

    cache.delete(MAP_CACHE_KEY)


def roles_for(capability: str) -> tuple[str, ...]:
    if capability not in CATALOGUE:
        raise KeyError(f"Unknown capability `{capability}`. Add it to apps/core/capabilities.py first.")
    return tuple(sorted(role_map().get(capability, set())))


def capabilities_for(user) -> list[str]:
    """Every capability the user holds, sorted. Empty for anonymous users."""
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser:
        return sorted(CATALOGUE)
    codes = set(user.roles.filter(user_roles__is_active=True, is_active=True).values_list("code", flat=True))
    return sorted(name for name, roles in role_map().items() if name in CATALOGUE and codes & roles)


def user_has(user, capability: str) -> bool:
    roles = roles_for(capability)
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.roles.filter(code__in=roles, user_roles__is_active=True, is_active=True).exists()

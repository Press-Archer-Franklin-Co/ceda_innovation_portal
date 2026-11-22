"""U9 (3.29): how audit entries read on the Audit log screen and in the CSV.

Areas group entries for the "All areas" filter. Labels are plain words; anything without a label
falls back to the action name with underscores turned into spaces.
"""

from __future__ import annotations

from django.db.models import Q

AREAS: dict[str, dict] = {
    "settings": {
        "label": "Platform settings",
        "models": ("FeatureFlag", "AuthPolicy", "LiveChatSettings", "PlatformSetting", "SiteSettings", "ApprovalFlow"),
        "prefixes": ("feature_flag", "platform_", "sign_in_settings", "live_chat_settings", "approval_flow"),
    },
    "integrations": {"label": "Integrations", "models": ("IntegrationConnection", "SSOTrialSession"), "prefixes": ("integration_",)},
    "roles": {"label": "Roles and permissions", "models": ("Role", "RoleCapability"), "prefixes": ("role_", "capability_")},
    "users": {"label": "Users", "models": ("User", "Profile", "UserRole", "AccountSession"), "prefixes": ("user_",)},
    "website": {
        "label": "Website content",
        "models": (
            "ApprovalRequest", "Page", "PageVersion", "ContentItem", "Story", "LeadershipCard", "Partner", "FAQ",
            "PolicyPage", "HackathonDetail", "HackathonUpdate", "ResultEntry", "NewsArticle", "HackathonPage", "WinnerSpotlight",
        ),
        "prefixes": ("content_", "page_", "post_", "policy_", "hackathon_"),
    },
    "ideas": {"label": "Ideas", "models": ("Submission", "Assignment", "Conversation"), "prefixes": ("submission_", "assignment_", "conversation_")},
    "challenges": {"label": "Challenges", "models": ("Program", "ProgramStage", "WorkflowDefinition"), "prefixes": ("program_", "challenge_", "workflow_")},
    "judging": {
        "label": "Judging",
        "models": ("Evaluation", "ChallengeJudge"),
        "prefixes": ("score_", "final_decision", "judge_", "evaluation_"),
    },
}

ACTION_LABELS = {
    "feature_flag_changed": "Changed a setting",
    "sign_in_settings_updated": "Changed a setting",
    "live_chat_settings_updated": "Changed live chat settings",
    "integration_created": "Added a service",
    "integration_updated": "Changed a service",
    "integration_deleted": "Removed a service",
    "integration_tested": "Tested a service",
    "integration_activated": "Turned on a service",
    "integration_deactivated": "Turned off a service",
    "user_invited": "Invited a user",
    "user_deactivated": "Deactivated a user",
    "user_reactivated": "Reactivated a user",
    "user_role_updated": "Changed roles",
    "role_created": "Added a role",
    "role_updated": "Changed a role",
    "role_capabilities_updated": "Changed permissions",
    "content_approval_requested": "Sent for approval",
    "content_step_approved": "Approved a step",
    "content_approved": "Approved and published",
    "content_rejected": "Sent back",
    "submission_status_changed": "Changed status",
    "score_submitted": "Scored",
    "program_published": "Published",
    "approval_flow_updated": "Changed approval steps",
}

TARGET_LABELS = {
    "FeatureFlag": "Feature",
    "AuthPolicy": "Sign-in",
    "LiveChatSettings": "Live chat",
    "IntegrationConnection": "Service",
    "Role": "Role",
    "User": "User",
    "ApprovalRequest": "Approval",
    "Page": "Page",
    "ContentItem": "Post",
    "PolicyPage": "Policy page",
    "Program": "Challenge",
    "Submission": "Idea",
}


def area_of(row) -> str:
    for key, spec in AREAS.items():
        if row.target_model in spec["models"] or row.action_type.startswith(spec["prefixes"]):
            return key
    return "other"


def area_q(area: str) -> Q | None:
    if area == "other":
        query = Q()
        for spec in AREAS.values():
            query |= _q(spec)
        return ~query
    spec = AREAS.get(area)
    return _q(spec) if spec else None


def _q(spec) -> Q:
    query = Q(target_model__in=spec["models"])
    for prefix in spec["prefixes"]:
        query |= Q(action_type__startswith=prefix)
    return query


def action_label(action_type: str) -> str:
    return ACTION_LABELS.get(action_type) or action_type.replace("_", " ").strip().capitalize()


def item_text(row) -> str:
    kind = TARGET_LABELS.get(row.target_model, row.target_model)
    name = row.item_label or (row.metadata or {}).get("name") or (row.metadata or {}).get("summary") or ""
    if not name and row.target_model == "FeatureFlag":
        name = row.target_id
    return f"{kind} · {name}" if name else kind


def _flat(value) -> str:
    if isinstance(value, bool):
        return "On" if value else "Off"
    if value in (None, ""):
        return "(empty)"
    if isinstance(value, (list, tuple)):
        return ", ".join(_flat(item) for item in value) or "(none)"
    if isinstance(value, dict):
        if set(value) <= {"en", "tn"}:
            return value.get("en") or value.get("tn") or "(empty)"
        return "; ".join(f"{key}: {_flat(item)}" for key, item in value.items())
    return str(value)


def changes(row) -> list[dict]:
    """[{field, before, after}] for the fields that differ, as text."""
    before, after = row.before_state or {}, row.after_state or {}
    if not isinstance(before, dict) or not isinstance(after, dict):
        return []
    out = []
    for name in list(dict.fromkeys([*before, *after])):
        if before.get(name) != after.get(name):
            out.append({"field": name.replace("_", " ").capitalize(), "before": _flat(before.get(name)), "after": _flat(after.get(name))})
    return out


def summary(row) -> str:
    """One line for the Item column: the item, then the first change (Code → Password)."""
    first = (changes(row) or [None])[0]
    text = item_text(row)
    return f"{text}: {first['before']} → {first['after']}" if first else text

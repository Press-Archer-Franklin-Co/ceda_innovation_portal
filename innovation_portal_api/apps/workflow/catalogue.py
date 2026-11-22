"""Copilot: what a workflow can use, as plain lists the AI lane can put in its prompt. No AI here.

A draft from create_draft_workflow_from_spec may only use what is listed here; anything else is an error.
"""

from __future__ import annotations

CONDITION_OPERATORS = ("var", "==", "!=", ">", "<", "and", "or", "in")
EXECUTION_MODES = ("sequential", "parallel_all", "parallel_any", "parallel_minimum")
STAGE_KINDS = {"task": "user_task", "review": "review_task", "approval": "approval_task"}


def roles() -> list[dict]:
    from apps.accounts.models import Role

    return [{"code": role.code, "name": role.name} for role in Role.objects.filter(is_active=True).order_by("name")]


def staff_teams() -> list[dict]:
    from apps.assignments.models import ReviewPanel

    return [
        {"id": str(team.id), "name": team.name, "program_id": str(team.program_id) if team.program_id else None, "members": team.members.count()}
        for team in ReviewPanel.objects.filter(is_active=True).order_by("name")
    ]


def assignment_policies() -> list[dict]:
    from apps.workflow.models import AssignmentPolicy

    return [{"code": policy.code, "name": policy.name, "type": policy.policy_type} for policy in AssignmentPolicy.objects.filter(is_active=True).order_by("name")]


def templates() -> list[dict]:
    from apps.workflow.builder import templates as builder_templates

    return builder_templates()


def conditions() -> dict:
    return {
        "language": "json_logic",
        "operators": list(CONDITION_OPERATORS),
        "context": "Answers are under payload, for example {\"==\": [{\"var\": \"payload.sector\"}, \"agriculture\"]} "
        "or {\">\": [{\"var\": \"payload.score\"}, 60]}.",
    }


def spec_shape() -> dict:
    """The spec create_draft_workflow_from_spec accepts, in short."""
    return {
        "name": "Workflow name",
        "stages": [
            {
                "code": "screening",
                "name": "Quick check",
                "kind": "task | review | approval",
                "who": {"role": "innovation_officer"},
                "due_days": 3,
                "execution_mode": "sequential",
                "must_complete": 1,
                "decisions": ["approve", "reject"],
            }
        ],
        "approval_steps": [{"name": "Manager sign-off", "who": {"role": "innovation_manager"}}],
        "transitions": [{"from": "screening", "decision": "approve", "when": {"==": [{"var": "payload.sector"}, "agriculture"]}, "to": "panel"}],
        "who options": ["{\"role\": code}", "{\"team\": name or id}", "{\"policy\": code}"],
        "special targets": ["end (finished, accepted)", "rejected (finished, not accepted)"],
    }


def catalogue() -> dict:
    from apps.programs.catalogue import criteria_library, reference_lists

    return {
        "roles": roles(),
        "staff_teams": staff_teams(),
        "assignment_policies": assignment_policies(),
        "templates": templates(),
        "stage_kinds": list(STAGE_KINDS),
        "execution_modes": list(EXECUTION_MODES),
        "conditions": conditions(),
        "reference_lists": reference_lists(),
        "criteria_library": criteria_library(),
        "spec_shape": spec_shape(),
    }

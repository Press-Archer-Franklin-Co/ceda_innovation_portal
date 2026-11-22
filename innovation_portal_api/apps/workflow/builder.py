"""R-48: data for the workflow builder (3.21, 3.21a) and the board of ideas in a workflow (3.22).

Where each step panel setting (3.21) lives:
- who_has_it.role: WorkflowStep.role_required. team and people: settings_json.
- judges_per_idea: WorkflowStep.minimum_assignments and StageEvaluationConfig.required_reviewer_count.
- marking_criteria, pass_mark: StageEvaluationConfig.marking_criteria and threshold_pass_above.
- duties.see_other_scores: not StageEvaluationConfig.blind_scoring. conflict_first, comment_every_criterion: settings_json.
- buttons: WorkflowStep.actions_allowed (node action codes).
- time_limit_days: WorkflowStep.due_in_hours / 24.
- share_out, reminder_after_days, next_steps: settings_json.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import AssignmentRoleType, AssignmentStatus, RoleType, SubmissionStatus

WHO_MODES = ("role", "team", "people")
SHARE_OUT = ("take_turns", "least_busy", "everyone")
DUTIES = ("conflict_first", "comment_every_criterion", "see_other_scores")
BOARD_ITEMS = 50


def _step(name, code, order, *, role, status, actions, days=3, assignment_role="", judges=0, evaluation=False, settings=None):
    return {
        "name": name,
        "code": code,
        "order": order,
        "role_required": role,
        "submission_status": status,
        "actions_allowed": actions,
        "due_in_hours": days * 24,
        "requires_assignment": bool(assignment_role),
        "assignment_role": assignment_role,
        "minimum_assignments": judges,
        "requires_evaluation": evaluation,
        "settings_json": settings or {},
    }


TEMPLATES = {
    "challenge_with_panel": {
        "name": "Challenge with panel",
        "description": "An officer checks each entry, a panel of judges scores it, then a manager decides.",
        "steps": [
            _step("Quick check", "screening", 1, role=RoleType.INNOVATION_OFFICER, status=SubmissionStatus.SCREENING, actions=["approve", "reject", "request_info"], days=3),
            _step(
                "Panel scoring",
                "judging",
                2,
                role=RoleType.JUDGE,
                status=SubmissionStatus.UNDER_JUDGING,
                actions=["approve", "reject"],
                days=7,
                assignment_role=AssignmentRoleType.JUDGE,
                judges=3,
                evaluation=True,
                settings={"share_out": "least_busy", "duties": {"conflict_first": True, "comment_every_criterion": False}},
            ),
            _step("Final decision", "final_decision", 3, role=RoleType.INNOVATION_MANAGER, status=SubmissionStatus.SHORTLISTED, actions=["approve", "reject"], days=5),
        ],
    },
    "general_idea_review": {
        "name": "General idea review",
        "description": "An officer checks the idea, reviews it with the applicant, then a manager decides.",
        "steps": [
            _step("Quick check", "screening", 1, role=RoleType.INNOVATION_OFFICER, status=SubmissionStatus.SCREENING, actions=["approve", "reject", "request_info"], days=3),
            _step("Officer review", "under_review", 2, role=RoleType.INNOVATION_OFFICER, status=SubmissionStatus.UNDER_REVIEW, actions=["approve", "reject", "request_info"], days=10),
            _step("Manager decision", "final_decision", 3, role=RoleType.INNOVATION_MANAGER, status=SubmissionStatus.APPROVED, actions=["approve", "reject"], days=5),
        ],
    },
    "quick_yes_no": {
        "name": "Quick yes or no",
        "description": "One officer says yes or no.",
        "steps": [
            _step("Decision", "decision", 1, role=RoleType.INNOVATION_OFFICER, status=SubmissionStatus.UNDER_REVIEW, actions=["approve", "reject"], days=5),
        ],
    },
}


def templates() -> list[dict]:
    return [
        {
            "code": code,
            "name": template["name"],
            "description": template["description"],
            "step_count": len(template["steps"]),
            "steps": [{"name": step["name"], "code": step["code"], "order": step["order"]} for step in template["steps"]],
        }
        for code, template in TEMPLATES.items()
    ]


def general_ideas_program():
    from apps.programs.models import Program

    return Program.objects.filter(is_general_intake=True).order_by("created_at").first()


def used_by(definition) -> list[dict]:
    program = definition.program
    if program is None:
        return []
    if program.is_general_intake:
        return [{"id": str(program.id), "title": "General ideas", "general_ideas": True}]
    return [{"id": str(program.id), "title": program.title, "general_ideas": False}]


def _copy_steps(definition) -> list[dict]:
    fields = (
        "name", "code", "order", "role_required", "actions_allowed", "submission_status", "execution_mode", "minimum_completions_required",
        "advance_automatically", "due_in_hours", "requires_assignment", "assignment_role", "minimum_assignments", "requires_evaluation",
        "minimum_evaluations", "is_active", "settings_json",
    )  # fmt: skip
    return [{name: getattr(step, name) for name in fields} for step in definition.steps.order_by("order")]


@transaction.atomic
def create_from(*, name: str, program=None, general_ideas: bool = False, from_template: str = "", copy_of=None, actor):
    """POST /api/workflow-definitions/ with from_template or copy_of: a new draft for a challenge or for general ideas."""
    from apps.workflow.services import WorkflowDefinitionService

    if general_ideas:
        program = general_ideas_program()
        if program is None:
            raise ValidationError({"general_ideas": "There is no general ideas programme yet."})
    if program is None:
        raise ValidationError({"program": "Pick a challenge, or general ideas."})
    if from_template:
        if from_template not in TEMPLATES:
            raise ValidationError({"from_template": f"Use one of: {', '.join(TEMPLATES)}."})
        steps = [dict(step) for step in TEMPLATES[from_template]["steps"]]
        source = {"from_template": from_template}
    else:
        steps = _copy_steps(copy_of)
        source = {"copy_of": str(copy_of.id)}
    definition = WorkflowDefinitionService.create_definition(program=program, name=name, actor=actor, steps_data=steps)
    definition.metadata_json = {**(definition.metadata_json or {}), **source}
    definition.save(update_fields=["metadata_json", "updated_at"])
    if copy_of is not None:
        _copy_evaluation(copy_of, definition)
    AuditService.log_action(actor=actor, action_type="workflow_created_from", target=definition, metadata=source)
    return definition


def _copy_evaluation(source, target) -> None:
    from apps.evaluation.models import StageEvaluationConfig

    new_steps = {step.code: step for step in target.steps.all()}
    for config in StageEvaluationConfig.objects.filter(workflow_step__workflow_definition=source).select_related("workflow_step"):
        step = new_steps.get(config.workflow_step.code)
        if step is None or StageEvaluationConfig.objects.filter(workflow_step=step).exists():
            continue
        config.pk = None
        config.id = None
        config._state.adding = True
        config.workflow_step = step
        config.save()


# Step panel (3.21) -------------------------------------------------------------------------------------------------


def _config(step):
    from apps.evaluation.models import StageEvaluationConfig

    return StageEvaluationConfig.objects.filter(workflow_step=step).select_related("marking_criteria").first()


def step_settings(step) -> dict:
    extra = step.settings_json or {}
    who = extra.get("who_has_it") or {}
    config = _config(step)
    duties = {"conflict_first": False, "comment_every_criterion": False, **(extra.get("duties") or {})}
    duties["see_other_scores"] = not config.blind_scoring if config else bool(duties.get("see_other_scores", False))
    days = step.due_in_hours / 24 if step.due_in_hours else None
    return {
        "step_id": str(step.id),
        "name": step.name,
        "who_has_it": {
            "mode": who.get("mode") or "role",
            "role": step.role_required or None,
            "team_id": who.get("team_id"),
            "people": who.get("people") or [],
        },
        "judges_per_idea": (config.required_reviewer_count if config else None) or step.minimum_assignments or None,
        "share_out": extra.get("share_out") or "take_turns",
        "duties": duties,
        "buttons": step.actions_allowed or [],
        "marking_criteria": str(config.marking_criteria_id) if config and config.marking_criteria_id else None,
        "pass_mark": float(config.threshold_pass_above) if config and config.threshold_pass_above is not None else None,
        "time_limit_days": int(days) if days and days == int(days) else days,
        "reminder_after_days": extra.get("reminder_after_days"),
        "next_steps": extra.get("next_steps") or [],
    }


@transaction.atomic
def save_step_settings(step, data: dict, *, actor) -> dict:
    from apps.accounts.models import Role, User
    from apps.assignments.models import ReviewPanel
    from apps.evaluation.models import MarkingCriteria, StageEvaluationConfig

    before = step_settings(step)
    extra = dict(step.settings_json or {})
    fields = set()
    if "who_has_it" in data:
        who = data["who_has_it"]
        mode = who.get("mode", "role")
        if mode == "role":
            role = who.get("role") or ""
            if not Role.objects.filter(code=role).exists():
                raise ValidationError({"who_has_it": "Pick a role."})
            step.role_required = role
            fields.add("role_required")
        elif mode == "team":
            if not ReviewPanel.objects.filter(id=who.get("team_id"), is_active=True).exists():
                raise ValidationError({"who_has_it": "Pick a team."})
        else:
            people = [str(item) for item in who.get("people") or []]
            if not people or User.objects.filter(id__in=people, is_active=True).count() != len(set(people)):
                raise ValidationError({"who_has_it": "Pick the people by their ids."})
        extra["who_has_it"] = {"mode": mode, "team_id": str(who["team_id"]) if mode == "team" else None, "people": [str(item) for item in who.get("people") or []] if mode == "people" else []}
    for name in ("share_out", "reminder_after_days"):
        if name in data:
            extra[name] = data[name]
    if "next_steps" in data:
        codes = {str(item.id) for item in step.workflow_definition.steps.all()}
        for rule in data["next_steps"]:
            if str(rule["to_step"]) not in codes:
                raise ValidationError({"next_steps": "Each next step must be a step of this workflow."})
        extra["next_steps"] = [{"when": rule["when"], "to_step": str(rule["to_step"])} for rule in data["next_steps"]]
    duties = data.get("duties") or {}
    if duties:
        extra["duties"] = {**(extra.get("duties") or {}), **{key: value for key, value in duties.items() if key != "see_other_scores"}}
    if "buttons" in data:
        if not data["buttons"]:
            raise ValidationError({"buttons": "A step needs at least one button."})
        step.actions_allowed = data["buttons"]
        fields.add("actions_allowed")
    if "time_limit_days" in data:
        step.due_in_hours = int(data["time_limit_days"] * 24)
        fields.add("due_in_hours")
    if "judges_per_idea" in data:
        step.minimum_assignments = data["judges_per_idea"]
        step.requires_assignment = True
        step.assignment_role = step.assignment_role or AssignmentRoleType.JUDGE
        fields |= {"minimum_assignments", "requires_assignment", "assignment_role"}
    scoring = any(name in data for name in ("judges_per_idea", "marking_criteria", "pass_mark")) or "see_other_scores" in duties
    if scoring:
        config = _config(step) or StageEvaluationConfig(workflow_step=step, created_by=actor)
        if "marking_criteria" in data:
            criteria = data["marking_criteria"]
            if criteria and not MarkingCriteria.objects.filter(id=criteria).exists():
                raise ValidationError({"marking_criteria": "Unknown marking criteria."})
            config.marking_criteria_id = criteria
        if "pass_mark" in data:
            config.threshold_pass_above = data["pass_mark"]
        if "judges_per_idea" in data:
            config.required_reviewer_count = data["judges_per_idea"]
        if "see_other_scores" in duties:
            config.blind_scoring = not duties["see_other_scores"]
        config.save()
        if not step.requires_evaluation:
            step.requires_evaluation = True
            fields.add("requires_evaluation")
    step.settings_json = extra
    step.save(update_fields=[*fields, "settings_json", "updated_at"])
    after = step_settings(step)
    AuditService.log_action(actor=actor, action_type="workflow_step_settings_updated", target=step.workflow_definition, before_state=before, after_state=after, metadata={"step_id": str(step.id)})
    return after


# Board (3.22) ------------------------------------------------------------------------------------------------------


def _short_name(user) -> str:
    if user is None:
        return ""
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    if first:
        return f"{first} {last[:1]}." if last else first
    return (user.email or "").split("@")[0]


def board(definition) -> dict:
    from apps.assignments.models import Assignment
    from apps.workflow.models import TaskExecution, WorkflowInstance

    now = timezone.now()
    steps = list(definition.steps.filter(is_active=True).order_by("order", "created_at"))
    instances = list(
        WorkflowInstance.objects.filter(workflow_definition__program=definition.program, workflow_definition__code=definition.code)
        .filter(current_step__code__in=[step.code for step in steps], status__in=[WorkflowInstance.STATUS_IN_PROGRESS, WorkflowInstance.STATUS_PAUSED])
        .select_related("submission", "current_step")
    )
    # When each idea reached its current step: the first task of that step, else when the workflow started.
    entered = {}
    for task in TaskExecution.objects.filter(workflow_instance__in=instances).exclude(status=TaskExecution.STATUS_CANCELLED).order_by("created_at"):
        key = (task.workflow_instance_id, task.workflow_step_id)
        entered.setdefault(key, task.created_at)
    owners = {}
    for assignment in Assignment.objects.filter(
        submission_id__in=[item.submission_id for item in instances if item.submission_id], status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED]
    ).select_related("assignee").order_by("created_at"):
        owners.setdefault((assignment.submission_id, assignment.workflow_step_id), assignment.assignee)
        owners.setdefault((assignment.submission_id, None), assignment.assignee)

    columns = {step.code: [] for step in steps}
    for instance in instances:
        submission = instance.submission
        if submission is None:
            continue
        since = entered.get((instance.id, instance.current_step_id)) or instance.started_at or instance.created_at
        days = max(0, (now - since).days)
        limit = instance.current_step.due_in_hours / 24 if instance.current_step.due_in_hours else None
        owner = owners.get((submission.id, instance.current_step_id)) or owners.get((submission.id, None))
        columns[instance.current_step.code].append(
            {
                "submission_id": str(submission.id),
                "title": submission.title,
                "reference": submission.reference_number,
                "owner": _short_name(owner),
                "days_waiting": days,
                "overdue": bool(limit is not None and (now - since) > timedelta(days=limit)),
            }
        )

    month = now - timedelta(days=30)
    waits = defaultdict(list)
    for task in TaskExecution.objects.filter(
        workflow_step__workflow_definition__program=definition.program,
        workflow_step__workflow_definition__code=definition.code,
        workflow_step__code__in=[step.code for step in steps],
        status=TaskExecution.STATUS_COMPLETED,
        completed_at__gte=month,
    ).select_related("workflow_step"):
        waits[task.workflow_step.code].append((task.completed_at - task.created_at).total_seconds() / 86400)
    done = (
        WorkflowInstance.objects.filter(workflow_definition__program=definition.program, workflow_definition__code=definition.code, status__in=[WorkflowInstance.STATUS_COMPLETED, WorkflowInstance.STATUS_REJECTED])
        .select_related("submission")
        .order_by("-completed_at", "-updated_at")
    )
    return {
        "average_days_waiting": [{"step": str(step.id), "name": step.name, "days": round(sum(waits[step.code]) / len(waits[step.code]), 1) if waits[step.code] else None} for step in steps],
        "time_limit_days": [{"step": str(step.id), "days": round(step.due_in_hours / 24, 1) if step.due_in_hours else None} for step in steps],
        "columns": [
            {
                "step": str(step.id),
                "name": step.name,
                "order": step.order,
                "time_limit_days": round(step.due_in_hours / 24, 1) if step.due_in_hours else None,
                "count": len(columns[step.code]),
                "items": sorted(columns[step.code], key=lambda item: (not item["overdue"], -item["days_waiting"]))[:BOARD_ITEMS],
            }
            for step in steps
        ],
        "done": {
            "count": done.count(),
            "items": [
                {"submission_id": str(item.submission_id), "title": item.submission.title, "status": item.status, "done_at": (item.completed_at or item.updated_at).isoformat()}
                for item in done[:BOARD_ITEMS]
                if item.submission_id
            ],
        },
    }

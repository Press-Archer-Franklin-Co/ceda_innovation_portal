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
    from apps.programs.general_idea import GeneralIdeaProgram

    return GeneralIdeaProgram.find()


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
        # 23 Nov: tell the innovator when an idea reaches this step (on by default). A challenge stage's own
        # "Tell applicants" setting wins for challenges; this is for General ideas and steps without a stage setting.
        "notify_innovator": bool(extra.get("notify_innovator", True)),
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
    if "notify_innovator" in data:
        extra["notify_innovator"] = bool(data["notify_innovator"])
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


# Copilot: a draft workflow from a plain spec (no AI here) -------------------------------------------------------------

END_TARGETS = {"end": "Finished", "rejected": "Not accepted"}


def _check_condition(expression, path: str, errors: list) -> None:
    from apps.workflow.catalogue import CONDITION_OPERATORS

    if expression in (None, "", {}):
        return
    if isinstance(expression, (bool, int, float, str)):
        return
    if isinstance(expression, list):
        for index, item in enumerate(expression):
            _check_condition(item, f"{path}[{index}]", errors)
        return
    if not isinstance(expression, dict) or len(expression) != 1:
        errors.append({"path": path, "message": "A condition is one operator, for example {\"==\": [{\"var\": \"payload.sector\"}, \"agriculture\"]}."})
        return
    operator, value = next(iter(expression.items()))
    if operator not in CONDITION_OPERATORS:
        errors.append({"path": path, "message": f"Unknown operator \"{operator}\". Use one of: {', '.join(CONDITION_OPERATORS)}."})
        return
    if operator != "var":
        _check_condition(value, f"{path}.{operator}", errors)


def _resolve_who(who, path: str, errors: list) -> dict:
    """{"mode": role|team|policy, ...} for a role code, a staff team (name or id) or an assignment policy code."""
    from apps.accounts.models import Role
    from apps.assignments.models import ReviewPanel
    from apps.workflow.models import AssignmentPolicy

    if isinstance(who, str):
        who = {"role": who}
    if not isinstance(who, dict) or len([key for key in ("role", "team", "policy") if who.get(key)]) != 1:
        errors.append({"path": path, "message": "Say who has it: {\"role\": code}, {\"team\": name} or {\"policy\": code}."})
        return {}
    if who.get("role"):
        role = Role.objects.filter(code=who["role"], is_active=True).first()
        if role is None:
            errors.append({"path": path, "message": f"there is no role \"{who['role']}\""})
            return {}
        return {"mode": "role", "role": role.code, "label": role.name}
    if who.get("team"):
        value = str(who["team"])
        teams = ReviewPanel.objects.filter(is_active=True)
        team = None
        try:
            team = teams.filter(id=value).first()
        except Exception:  # noqa: BLE001 - not an id, look it up by name
            team = None
        team = team or teams.filter(name__iexact=value).first()
        if team is None:
            errors.append({"path": path, "message": f"there is no team \"{value}\""})
            return {}
        return {"mode": "team", "team_id": str(team.id), "label": team.name}
    policy = AssignmentPolicy.objects.filter(code=who["policy"], is_active=True).first()
    if policy is None:
        errors.append({"path": path, "message": f"there is no assignment policy \"{who['policy']}\""})
        return {}
    return {"mode": "policy", "policy": policy, "label": policy.name}


def _from_steps(steps: list) -> list:
    """The AI lane's ordered-steps shape (WorkflowStep fields) as stages: one after another."""
    stages = []
    for step in steps:
        if not isinstance(step, dict):
            stages.append(step)
            continue
        hours = step.get("due_in_hours")
        stages.append(
            {
                "code": step.get("code"),
                "name": step.get("name"),
                "kind": "review" if step.get("requires_evaluation") else "task",
                "who": {"role": step["role_required"]} if step.get("role_required") else step.get("who"),
                "due_days": (float(hours) / 24) if hours else None,
                "execution_mode": step.get("execution_mode"),
                "must_complete": step.get("minimum_completions_required"),
                "decisions": step.get("actions_allowed") or None,
                "_step": {name: step[name] for name in ("submission_status", "requires_assignment", "assignment_role", "requires_evaluation", "minimum_assignments") if name in step},
            }
        )
    return stages


def _plan(spec: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """Checks the spec. Returns (stages, transitions, errors) without saving anything."""
    from django.utils.text import slugify

    from apps.workflow.catalogue import EXECUTION_MODES, STAGE_KINDS

    errors: list[dict] = []
    if not isinstance(spec, dict):
        return [], [], [{"path": "", "message": "Send the workflow as one JSON object."}]
    if not str(spec.get("name") or "").strip():
        errors.append({"path": "name", "message": "Give the workflow a name."})
    if spec.get("steps") and not spec.get("stages"):
        raw = [(f"steps[{index}]", item, None) for index, item in enumerate(_from_steps(spec["steps"]))]
    else:
        raw = [(f"stages[{index}]", item, None) for index, item in enumerate(spec.get("stages") or [])]
    raw += [(f"approval_steps[{index}]", item, "approval") for index, item in enumerate(spec.get("approval_steps") or [])]
    if not raw:
        errors.append({"path": "stages", "message": "Add at least one stage."})
    stages, codes = [], set()
    for path, item, forced_kind in raw:
        if not isinstance(item, dict):
            errors.append({"path": path, "message": "Each stage is an object."})
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            errors.append({"path": f"{path}.name", "message": "Give the stage a name."})
        code = slugify(str(item.get("code") or name))[:60].replace("-", "_") or f"stage_{len(stages) + 1}"
        if code in codes or code in END_TARGETS or code == "start":
            errors.append({"path": f"{path}.code", "message": f"The stage code \"{code}\" is used twice or is reserved."})
        codes.add(code)
        kind = forced_kind or item.get("kind") or "task"
        if kind not in STAGE_KINDS:
            errors.append({"path": f"{path}.kind", "message": f"Use one of: {', '.join(STAGE_KINDS)}."})
        mode = item.get("execution_mode") or "sequential"
        if mode not in EXECUTION_MODES:
            errors.append({"path": f"{path}.execution_mode", "message": f"Use one of: {', '.join(EXECUTION_MODES)}."})
        try:
            due_days = float(item.get("due_days") or 3)
            must = int(item.get("must_complete") or 1)
        except (TypeError, ValueError):
            errors.append({"path": path, "message": "due_days and must_complete are numbers."})
            due_days, must = 3, 1
        if due_days <= 0 or due_days > 365 or must < 1:
            errors.append({"path": path, "message": "due_days is between 1 and 365 and must_complete is at least 1."})
        decisions = [str(key) for key in (item.get("decisions") or ["approve", "reject"])]
        if not decisions:
            errors.append({"path": f"{path}.decisions", "message": "A stage needs at least one decision."})
        who = _resolve_who(item.get("who"), f"{path}.who", errors)
        extra = item.get("_step") or {}
        if extra.get("requires_assignment") and not extra.get("assignment_role"):
            errors.append({"path": f"{path}.assignment_role", "message": "Say which kind of assignment (for example judge) when the step needs assignments."})
        stages.append({"code": code, "name": name or code, "kind": STAGE_KINDS.get(kind, "user_task"), "who": who, "due_days": due_days, "mode": mode, "must": must, "decisions": decisions, "path": path, "extra": extra})
    transitions = []
    given = spec.get("transitions")
    if given:
        by_code = {stage["code"]: stage for stage in stages}
        for index, item in enumerate(given):
            path = f"transitions[{index}]"
            if not isinstance(item, dict):
                errors.append({"path": path, "message": "Each transition is an object."})
                continue
            source, target = str(item.get("from") or ""), str(item.get("to") or "")
            if source != "start" and source not in by_code:
                errors.append({"path": f"{path}.from", "message": f"there is no stage \"{source}\""})
            if target not in by_code and target not in END_TARGETS:
                errors.append({"path": f"{path}.to", "message": f"there is no stage \"{target}\" (or use end or rejected)"})
            decision = str(item.get("decision") or "")
            if decision and source in by_code and decision not in by_code[source]["decisions"]:
                errors.append({"path": f"{path}.decision", "message": f"stage \"{source}\" has no decision \"{decision}\""})
            _check_condition(item.get("when"), f"{path}.when", errors)
            transitions.append({"from": source, "to": target, "decision": decision, "when": item.get("when") or {}, "default": bool(item.get("default")), "priority": index + 1})
        if stages and not any(item["from"] == "start" for item in transitions):
            transitions.insert(0, {"from": "start", "to": stages[0]["code"], "decision": "", "when": {}, "default": True, "priority": 0})
    elif stages:
        # No transitions given: one stage after another; any "reject" ends as not accepted.
        transitions.append({"from": "start", "to": stages[0]["code"], "decision": "", "when": {}, "default": True, "priority": 0})
        for index, stage in enumerate(stages):
            after = stages[index + 1]["code"] if index + 1 < len(stages) else "end"
            for decision in stage["decisions"]:
                target = "rejected" if decision == "reject" else after
                transitions.append({"from": stage["code"], "to": target, "decision": decision, "when": {}, "default": False, "priority": 1})
    return stages, transitions, errors


@transaction.atomic
def _save_draft(spec, stages, transitions, *, program, actor, existing=None):
    from apps.workflow.models import NodeAction, NodeAssignmentBinding, WorkflowNode, WorkflowTransition
    from apps.workflow.services import WorkflowDefinitionService

    steps = []
    for order, stage in enumerate(stages, start=1):
        who = stage["who"]
        settings = {"who_has_it": {"mode": who.get("mode") if who.get("mode") in WHO_MODES else "role", "team_id": who.get("team_id"), "people": []}, "source": "copilot"}
        if who.get("mode") == "policy":
            settings["assignment_policy"] = who["policy"].code
        steps.append(
            {
                "name": stage["name"],
                "code": stage["code"],
                "order": order,
                "role_required": who.get("role", ""),
                "actions_allowed": stage["decisions"],
                "due_in_hours": int(stage["due_days"] * 24),
                "execution_mode": stage["mode"],
                "minimum_completions_required": stage["must"],
                "settings_json": settings,
                **stage.get("extra", {}),
            }
        )
    if existing is not None:
        # Revise keeps the same draft: its steps and graph are replaced, the definition row and id stay.
        from apps.workflow.models import WorkflowStep

        definition = existing
        definition.rules.all().delete()
        definition.transitions.all().delete()
        definition.nodes.all().delete()
        definition.steps.all().delete()
        definition.name = str(spec["name"]).strip()[:255]
        definition.updated_by = actor
        definition.save(update_fields=["name", "updated_by", "updated_at"])
        for item in steps:
            WorkflowStep.objects.create(workflow_definition=definition, **item)
        WorkflowDefinitionService.validate_definition(definition)
    else:
        definition = WorkflowDefinitionService.create_definition(program=program, name=str(spec["name"]).strip()[:255], actor=actor, steps_data=steps)
    nodes = {"start": WorkflowNode.objects.create(workflow_definition=definition, name="Start", code="start", node_type=WorkflowNode.TYPE_START, is_initial=True)}
    for index, stage in enumerate(stages, start=1):
        node = WorkflowNode.objects.create(
            workflow_definition=definition,
            name=stage["name"],
            code=stage["code"],
            node_type=stage["kind"],
            position_x=index * 240,
            metadata_json={"who": {key: value for key, value in stage["who"].items() if key != "policy"}, "due_days": stage["due_days"]},
        )
        for key in stage["decisions"]:
            NodeAction.objects.create(node=node, key=key, label=key.replace("_", " ").capitalize())
        if stage["who"].get("mode") == "policy":
            NodeAssignmentBinding.objects.create(
                node=node, assignment_policy=stage["who"]["policy"], minimum_assignees=stage["must"], maximum_assignees=max(stage["must"], 1),
                execution_mode=stage["mode"], minimum_completions_required=stage["must"],
            )
        nodes[stage["code"]] = node
    for code, label in END_TARGETS.items():
        if any(item["to"] == code for item in transitions):
            nodes[code] = WorkflowNode.objects.create(workflow_definition=definition, name=label, code=code, node_type=WorkflowNode.TYPE_END, is_terminal=True)
    for item in transitions:
        WorkflowTransition.objects.create(
            workflow_definition=definition, from_node=nodes[item["from"]], to_node=nodes[item["to"]], action_key=item["decision"],
            condition_expression=item["when"], priority=item["priority"], is_default=item["default"],
            label=f"{item['decision'] or 'next'} to {nodes[item['to']].name}",
        )
    return definition


def create_draft_workflow_from_spec(spec: dict, *, program=None, general_ideas: bool = False, actor):
    # Spec: {name, stages | steps, approval_steps?, transitions?, id?}. "steps" is the AI lane's ordered-steps shape.
    """Makes a draft workflow (never active, never published) from a plain spec. Returns (definition, errors).

    Uses only roles, staff teams and assignment policies that exist; anything unknown is an error with a path
    (stages[2].who: there is no team "Finance"), never a new record. The saved draft is checked with
    WorkflowValidationService.validate_definition; if it has problems, nothing is kept and they come back as errors.
    """
    from apps.workflow.models import WorkflowDefinition
    from apps.workflow.services import WorkflowValidationService

    existing = None
    if isinstance(spec, dict) and spec.get("id"):
        try:
            existing = WorkflowDefinition.objects.filter(pk=spec["id"]).first()
        except Exception:  # noqa: BLE001 - not an id
            existing = None
        if existing is None:
            return None, [{"path": "id", "message": "There is no workflow with this id."}]
        if existing.status != WorkflowDefinition.STATUS_DRAFT or existing.is_active or existing.instances.exists():
            return None, [{"path": "id", "message": "Only a draft workflow that no idea uses yet can be changed here."}]
        program = existing.program
    if general_ideas:
        program = general_ideas_program()
    if program is None:
        return None, [{"path": "program", "message": "Pick a challenge, or general ideas."}]
    stages, transitions, errors = _plan(spec)
    if errors:
        return None, errors
    try:
        with transaction.atomic():
            definition = _save_draft(spec, stages, transitions, program=program, actor=actor, existing=existing)
            result = WorkflowValidationService.validate_definition(definition)
            if not result["valid"]:
                raise _Invalid(result["errors"])
            AuditService.log_action(
                actor=actor,
                action_type="workflow_draft_updated" if existing else "workflow_draft_created",
                target=definition,
                after_state={"name": definition.name, "status": definition.status, "stages": [stage["code"] for stage in stages]},
                metadata={"source": "spec", "program_id": str(program.id)},
            )
    except _Invalid as exc:
        return None, [{"path": str(key), "message": " ".join(map(str, value)) if isinstance(value, list) else str(value)} for key, value in exc.problems.items()]
    except ValidationError as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
        return None, [{"path": str(key), "message": " ".join(map(str, value)) if isinstance(value, list) else str(value)} for key, value in detail.items()]
    return definition, []


class _Invalid(Exception):
    def __init__(self, problems):
        super().__init__("invalid workflow")
        self.problems = problems

"""R-48 (3.6c): a challenge's stages, read from its workflow's steps, with a form, dates and a pass rule each.

The workflow drives the list and its order. The settings live on ProgramStage (matched to a step by code),
so they survive a new version of the workflow. The entry form stays Program.form (U10); a stage form is
for a later stage.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import AssignmentRoleType

MOVES_ON = ("automatic", "officer", "manager", "panel_score")
TAKES_PART = ("all", "shortlisted")


def workflow_for(program):
    from apps.workflow.models import WorkflowDefinition

    definitions = WorkflowDefinition.objects.filter(program=program)
    return definitions.filter(is_active=True).first() or definitions.filter(is_current=True).first()


def _steps(workflow):
    return list(workflow.steps.filter(is_active=True).order_by("order", "created_at")) if workflow else []


def _iso(value):
    return value.isoformat() if value else None


def reviewers_label(step) -> str:
    """Who works on this step, in a few words."""
    from apps.accounts.models import Role

    if step.assignment_role == AssignmentRoleType.JUDGE or step.requires_evaluation:
        return "Judging panel"
    if step.role_required:
        role = Role.objects.filter(code=step.role_required).first()
        return role.name if role else step.role_required.replace("_", " ").capitalize()
    return "Innovation officers"


def _default_moves_on(step, program) -> dict:
    if step.advance_automatically:
        return {"kind": "automatic"}
    if step.requires_evaluation:
        return {"kind": "panel_score", "pass_mark": float(program.pass_mark) if program.pass_mark is not None else None}
    return {"kind": "officer"}


def _form(form) -> dict | None:
    if form is None:
        return None
    latest = form.latest_version
    return {"id": str(form.id), "title": form.title, "version": latest.number if latest else None}


def stage_payload(step, setting, program, order: int) -> dict:
    if setting is None:
        moves_on = _default_moves_on(step, program)
        return {
            "step_id": str(step.id),
            "order": order,
            "name": step.name,
            "form": None,
            "opens_at": None,
            "closes_at": None,
            "takes_part": "all",
            "moves_on": moves_on,
            "notify_applicants": True,
            "reviewers_label": reviewers_label(step),
        }
    moves_on = {"kind": setting.moves_on}
    if setting.moves_on == "panel_score":
        moves_on["pass_mark"] = float(setting.pass_mark) if setting.pass_mark is not None else None
    return {
        "step_id": str(step.id),
        "order": order,
        "name": step.name,
        "form": _form(setting.form),
        "opens_at": _iso(setting.opens_at),
        "closes_at": _iso(setting.closes_at),
        "takes_part": setting.takes_part,
        "moves_on": moves_on,
        "notify_applicants": setting.notify_applicants,
        "reviewers_label": reviewers_label(step),
    }


def stages(program) -> dict:
    workflow = workflow_for(program)
    steps = _steps(workflow)
    settings = {stage.code: stage for stage in program.stages.select_related("form")}
    return {
        "workflow": {"id": str(workflow.id), "name": workflow.name, "step_count": len(steps)} if workflow else None,
        "stages": [stage_payload(step, settings.get(step.code), program, order) for order, step in enumerate(steps, start=1)],
    }


@transaction.atomic
def update_stage(program, step_id, data: dict, *, actor) -> dict:
    """PATCH one stage: form, opens_at, closes_at, takes_part, moves_on, notify_applicants."""
    from apps.programs.models import ProgramStage, SubmissionForm

    workflow = workflow_for(program)
    step = next((item for item in _steps(workflow) if str(item.id) == str(step_id)), None)
    if step is None:
        raise ValidationError({"step_id": "This step is not in the challenge's workflow."})
    setting, _ = ProgramStage.objects.get_or_create(program=program, code=step.code, defaults={"name": step.name[:120], "ordering": step.order})
    before = stage_payload(step, setting, program, 0)

    if "form" in data:
        form_id = data["form"]
        if form_id:
            form = SubmissionForm.objects.filter(id=form_id, is_template=False).first()
            if form is None or form.latest_version is None:
                raise ValidationError({"form": "Pick a form that has been published."})
            setting.form = form
        else:
            setting.form = None
    for name in ("opens_at", "closes_at"):
        if name in data:
            setattr(setting, name, data[name])
    if setting.opens_at and setting.closes_at and setting.closes_at <= setting.opens_at:
        raise ValidationError({"closes_at": "The stage must close after it opens."})
    if "takes_part" in data:
        setting.takes_part = data["takes_part"]
    if "notify_applicants" in data:
        setting.notify_applicants = data["notify_applicants"]
    if "moves_on" in data:
        rule = data["moves_on"] or {}
        setting.moves_on = rule["kind"]
        if rule["kind"] == "panel_score":
            if rule.get("pass_mark") is None:
                raise ValidationError({"moves_on": "A panel score needs a pass mark from 0 to 100."})
            setting.pass_mark = Decimal(str(rule["pass_mark"]))
            if step.requires_evaluation:
                # The judging stage reads the challenge's pass mark.
                program.pass_mark = setting.pass_mark
                program.save(update_fields=["pass_mark", "updated_at"])
        else:
            setting.pass_mark = None
    setting.save()
    after = stage_payload(step, setting, program, 0)
    AuditService.log_action(actor=actor, action_type="challenge_stage_updated", target=program, before_state=before, after_state=after, metadata={"step_id": str(step.id)})
    order = next(index for index, item in enumerate(_steps(workflow), start=1) if item.id == step.id)
    return {**after, "order": order}

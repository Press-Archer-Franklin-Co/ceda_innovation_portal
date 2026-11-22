"""Create with AI (Copilot B2, frame 3.41): describe a process, get a draft form and workflow.

The AI gets the catalogue of what exists (field types, rules, condition operators, reference lists,
roles, assignment and execution choices, the criteria library, form instructions from the knowledge
base) and answers in the exact shape of the form builder's draft document and the workflow builder's
create payload. The backend lane's services save **drafts only**. Nothing here creates a role, a team
or a reference list, publishes, or sends anything: what is missing becomes a check with a fix link.
"Send for approval" and "Publish" use the existing publish endpoints and approval steps.

TODO(R-68): create_draft_form_from_document, create_draft_workflow_from_spec and the workflow dry run
are the backend lane's; until they are on main the draft keeps the proposal and says so in a check.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assistant import gateway, knowledge, prompts
from apps.assistant import language as lang_mod
from apps.assistant.models import AIDraft, Audience, Feature
from apps.assistant.providers import AssistantUnavailable
from apps.audit.services import AuditService

logger = logging.getLogger("apps.assistant")

CONDITION_OPS = ("equals", "not_equals", "in", "is_empty", "is_not_empty")
WORKFLOW_ACTIONS = ("approve", "reject", "return")
T2 = prompts._obj({"en": prompts.TEXT, "tn": prompts.TEXT})

BUILDER_INSTRUCTIONS = """Task: a CEDA administrator describes a process. Draft the application form and/or the review workflow for it, using ONLY what exists in the catalogue below.

Rules:
- Use only field types, rule types, condition operators, roles, assignment roles, execution modes, statuses and actions from the catalogue. Never invent a role, a team or a reference list.
- When the process needs something that does not exist (for example a Finance team or a role), leave it out and add it to `missing` with a short fix (for example "Create a Finance role in Roles & permissions").
- Every text has English (en) and Setswana (tn). Leave tn empty when you are not sure; a person will add it.
- Field keys and step codes are short, lowercase, with underscores (fields) or hyphens (step codes).
- Keep the form short: ask only what the process needs. Personal details only when the process needs them.
- Workflow steps go in order. due_in_hours is 0 when there is no deadline.
This is a draft. A person previews, edits, tests and approves it before anything is published."""

BUILDER_SCHEMA = prompts._obj(
    {
        "language": prompts.LANGUAGE,
        "summary": prompts.TEXT,
        "form": prompts._obj(
            {
                "name": T2,
                "description": T2,
                "steps": prompts._list(
                    prompts._obj(
                        {
                            "code": prompts.TEXT,
                            "title": T2,
                            "description": T2,
                            "fields": prompts._list(
                                prompts._obj(
                                    {
                                        "key": prompts.TEXT,
                                        "type": prompts.TEXT,
                                        "label": T2,
                                        "help_text": T2,
                                        "required": {"type": "boolean"},
                                        "options": prompts._list(prompts._obj({"value": prompts.TEXT, "label": T2})),
                                        "rules": prompts._list(prompts._obj({"rule_type": prompts.TEXT, "rule_value": prompts.TEXT})),
                                        "show_if_field": prompts.TEXT,
                                        "show_if_value": prompts.TEXT,
                                    }
                                )
                            ),
                        }
                    )
                ),
            }
        ),
        "workflow": prompts._obj(
            {
                "name": prompts.TEXT,
                "description": prompts.TEXT,
                "steps": prompts._list(
                    prompts._obj(
                        {
                            "name": prompts.TEXT,
                            "code": prompts.TEXT,
                            "role_required": prompts.TEXT,
                            "actions_allowed": prompts._list(prompts.TEXT),
                            "submission_status": prompts.TEXT,
                            "due_in_hours": {"type": "integer"},
                            "execution_mode": prompts.TEXT,
                            "requires_assignment": {"type": "boolean"},
                            "assignment_role": prompts.TEXT,
                            "requires_evaluation": {"type": "boolean"},
                        }
                    )
                ),
            }
        ),
        "missing": prompts._list(prompts._obj({"what": prompts.TEXT, "fix": prompts.TEXT})),
    }
)

SAMPLE_INSTRUCTIONS = """Task: write believable sample answers for this form, as an innovator in Botswana would, so the workflow can be tried. Use made-up names and no real ID or phone numbers.
Return answers as a list of {key, value} with every value as text."""
SAMPLE_SCHEMA = prompts._obj({"language": prompts.LANGUAGE, "answers": prompts._list(prompts._obj({"key": prompts.TEXT, "value": prompts.TEXT}))})


# -- the catalogue --------------------------------------------------------------------------------------


def catalogue() -> dict:
    from apps.accounts.models import Role
    from apps.core.constants import AssignmentRoleType, SubmissionFormFieldType, SubmissionStatus
    from apps.evaluation.models import MarkingCriteria
    from apps.programs.models import FieldValidationRule
    from apps.reference.models import District, Sector
    from apps.workflow.models import WorkflowStep

    return {
        "field_types": [value for value, _ in SubmissionFormFieldType.choices],
        "rule_types": [value for value, _ in FieldValidationRule.RuleType.choices],
        "condition_operators": list(CONDITION_OPS),
        "roles": [{"code": code, "name": name} for code, name in Role.objects.filter(is_active=True).order_by("name").values_list("code", "name")],
        "assignment_roles": [value for value, _ in AssignmentRoleType.choices],
        "execution_modes": [value for value, _ in WorkflowStep.EXECUTION_MODE_CHOICES],
        "submission_statuses": [value for value, _ in SubmissionStatus.choices],
        "workflow_actions": list(WORKFLOW_ACTIONS),
        "sectors": list(Sector.objects.order_by("slug").values_list("slug", flat=True)[:80]),
        "districts": list(District.objects.order_by("slug").values_list("slug", flat=True)[:80]),
        "criteria_library": [
            item
            for criteria in MarkingCriteria.objects.filter(is_library=True, is_active=True).prefetch_related("items")[:10]
            for item in criteria.items.values_list("name", flat=True)
        ][:60],
        "staff_teams": [],  # there is no staff team list in the portal yet
    }


def _catalogue_text(cat: dict) -> str:
    lines = [f"- {key}: {', '.join(str(v) for v in value) if value and not isinstance(value[0], dict) else ''}" for key, value in cat.items() if key != "roles"]
    lines.append("- roles: " + ", ".join(f"{role['code']} ({role['name']})" for role in cat["roles"]))
    return "## Catalogue (only these exist)\n" + "\n".join(lines)


# -- turning the answer into builder payloads, and checks ------------------------------------------------


def _t(value) -> dict:
    value = value if isinstance(value, dict) else {}
    return {"en": str(value.get("en") or "").strip(), "tn": str(value.get("tn") or "").strip()}


def form_document(proposal: dict) -> dict:
    """The form builder's draft document (FormDocumentSerializer shape), one field per row."""
    form = proposal.get("form") or {}
    steps = []
    for step in form.get("steps") or []:
        rows = []
        for field in step.get("fields") or []:
            visible_if = {}
            if field.get("show_if_field"):
                visible_if = {"all": [{"field": field["show_if_field"], "op": "equals", "value": field.get("show_if_value", "")}]}
            rows.append(
                {
                    "fields": [
                        {
                            "key": str(field.get("key") or "")[:100],
                            "type": str(field.get("type") or "text"),
                            "label": _t(field.get("label")),
                            "help_text": _t(field.get("help_text")),
                            "placeholder": {"en": "", "tn": ""},
                            "required": bool(field.get("required")),
                            "is_challenge_question": False,
                            "width": "full",
                            "is_active": True,
                            "link_url": "",
                            "visible_if": visible_if,
                            "required_if": {},
                            "enabled_if": {},
                            "validation_rules": {},
                            "media_config": {},
                            "default_value": {},
                            "example_value": {},
                            "options": [{"value": str(o.get("value") or ""), "label": _t(o.get("label")), "description": {"en": "", "tn": ""}} for o in field.get("options") or []],
                            "rules": [{"rule_type": str(r.get("rule_type") or ""), "rule_value": str(r.get("rule_value") or ""), "error_message": ""} for r in field.get("rules") or []],
                        }
                    ]
                }
            )
        steps.append({"code": str(step.get("code") or "")[:100], "title": _t(step.get("title")), "description": _t(step.get("description")), "tips": [], "is_active": True, "rows": rows})
    return {"name": _t(form.get("name")), "description": _t(form.get("description")), "languages": ["en", "tn"], "steps": steps, "loose_fields": []}


def workflow_spec(proposal: dict) -> dict:
    flow = proposal.get("workflow") or {}
    steps = []
    for order, step in enumerate(flow.get("steps") or [], start=1):
        steps.append(
            {
                "name": str(step.get("name") or "")[:255],
                "code": str(step.get("code") or f"step-{order}")[:100],
                "order": order,
                "role_required": str(step.get("role_required") or ""),
                "actions_allowed": [action for action in step.get("actions_allowed") or [] if action in WORKFLOW_ACTIONS],
                "submission_status": str(step.get("submission_status") or ""),
                "due_in_hours": int(step.get("due_in_hours") or 0) or None,
                "execution_mode": str(step.get("execution_mode") or "sequential"),
                "requires_assignment": bool(step.get("requires_assignment")),
                "assignment_role": str(step.get("assignment_role") or ""),
                "requires_evaluation": bool(step.get("requires_evaluation")),
                "is_active": True,
            }
        )
    return {"name": str(flow.get("name") or "")[:255], "description": str(flow.get("description") or ""), "steps": steps}


def local_checks(proposal: dict, make: str, cat: dict) -> list[dict]:
    """What a person must fix or confirm. Each check has a plain message and, when useful, a fix link."""
    checks = []
    roles = {role["code"] for role in cat["roles"]}
    if make in ("form", "both"):
        document = form_document(proposal)
        missing_tn = 0
        for step in document["steps"]:
            missing_tn += 0 if step["title"]["tn"] else 1
            for row in step["rows"]:
                field = row["fields"][0]
                if field["type"] not in cat["field_types"]:
                    checks.append({"code": "unknown_field_type", "ok": False, "message": f"The question \"{field['label']['en'] or field['key']}\" uses a type the form builder does not have ({field['type']}).", "fix": "edit_form"})
                for rule in field["rules"]:
                    if rule["rule_type"] not in cat["rule_types"]:
                        checks.append({"code": "unknown_rule", "ok": False, "message": f"\"{field['label']['en']}\" has a rule the form builder does not have ({rule['rule_type']}).", "fix": "edit_form"})
                missing_tn += sum(1 for text in (field["label"], field["help_text"]) if text["en"] and not text["tn"])
        checks.append(
            {"code": "setswana", "ok": missing_tn == 0, "message": "Every text has Setswana." if not missing_tn else f"{missing_tn} texts have no Setswana yet.", "fix": None if not missing_tn else "suggest_setswana"}
        )
    if make in ("workflow", "both"):
        for step in workflow_spec(proposal)["steps"]:
            if step["role_required"] and step["role_required"] not in roles:
                checks.append({"code": "unknown_role", "ok": False, "message": f"There is no role \"{step['role_required']}\" yet (step \"{step['name']}\").", "fix": "/staff/admin/roles"})
            if step["assignment_role"] and step["assignment_role"] not in cat["assignment_roles"]:
                checks.append({"code": "unknown_assignment_role", "ok": False, "message": f"Step \"{step['name']}\" assigns to \"{step['assignment_role']}\", which does not exist.", "fix": "edit_workflow"})
            if step["execution_mode"] not in cat["execution_modes"]:
                checks.append({"code": "unknown_execution_mode", "ok": False, "message": f"Step \"{step['name']}\" uses an unknown way to run ({step['execution_mode']}).", "fix": "edit_workflow"})
    for item in proposal.get("missing") or []:
        if isinstance(item, dict) and str(item.get("what") or "").strip():
            checks.append({"code": "missing", "ok": False, "message": str(item["what"]).strip(), "fix": str(item.get("fix") or "").strip() or None})
    return checks


# -- calling the backend lane's services -----------------------------------------------------------------


def _save_drafts(draft: AIDraft, proposal: dict, actor) -> list[dict]:
    """Save or update the draft form and workflow. Returns errors as [{path, message}]."""
    errors: list[dict] = []
    program = draft.program
    if draft.make in ("form", "both"):
        try:
            from apps.programs.form_builder import create_draft_form_from_document
        except ImportError:
            return [{"path": "form", "message": "Saving a draft form from the AI needs the form builder service that is not on this server yet."}]
        document = form_document(proposal)
        if draft.draft_form_id:
            document["id"] = str(draft.draft_form_id)
        form, form_errors = create_draft_form_from_document(document=document, actor=actor, program=program)
        errors += [{"path": f"form.{e.get('path', '')}", "message": e.get("message", "")} for e in form_errors or []]
        if form is not None:
            draft.draft_form_id = form.pk
    if draft.make in ("workflow", "both"):
        try:
            from apps.workflow.services import create_draft_workflow_from_spec
        except ImportError:
            return errors + [{"path": "workflow", "message": "Saving a draft workflow from the AI needs the workflow builder service that is not on this server yet."}]
        spec = workflow_spec(proposal)
        if draft.draft_workflow_id:
            spec["id"] = str(draft.draft_workflow_id)
        workflow, flow_errors = create_draft_workflow_from_spec(spec=spec, actor=actor, program=program)
        errors += [{"path": f"workflow.{e.get('path', '')}", "message": e.get("message", "")} for e in flow_errors or []]
        if workflow is not None:
            draft.draft_workflow_id = workflow.pk
    return errors


def _builder_checks(draft: AIDraft) -> list[dict]:
    """The existing publish-check and workflow validation, on the saved drafts."""
    checks = []
    if draft.draft_form_id:
        from apps.programs.form_builder import FormPublishService, load_form

        problems = FormPublishService.problems(load_form(draft.draft_form_id))
        checks.append({"code": "form_publish_check", "ok": not problems, "message": "The form passes the publish check." if not problems else f"The form publish check found {len(problems)} problems.", "fix": "edit_form", "problems": problems[:10]})
    if draft.draft_workflow_id:
        from apps.workflow.models import WorkflowDefinition
        from apps.workflow.services import WorkflowValidationService

        definition = WorkflowDefinition.objects.filter(pk=draft.draft_workflow_id).first()
        if definition is not None:
            result = WorkflowValidationService.validate_definition(definition) or {}
            ok = bool(result.get("valid", True))
            checks.append({"code": "workflow_validation", "ok": ok, "message": "The workflow passes validation." if ok else "The workflow has problems to fix.", "fix": "edit_workflow", "problems": result.get("errors") or {}})
    return checks


# -- the steps a person takes -----------------------------------------------------------------------------


def _ask(*, user, draft: AIDraft, content: str, language: str) -> dict:
    cat = catalogue()
    found = knowledge.build(audience=Audience.OFFICERS, language=language, question=draft.description, include_manual=False, kinds=["form_instructions", "guideline", "evaluation_criteria"])
    result = gateway.ask(
        Feature.BUILDER_DRAFT,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(BUILDER_INSTRUCTIONS, language), knowledge.SystemPart(_catalogue_text(cat))],
        messages=[{"role": "user", "content": content}],
        json_schema=BUILDER_SCHEMA,
        language=language,
        effort="high",
        max_tokens=16000,
        target=f"builder:{draft.pk}",
    )
    return result.data or {}


def _apply(draft: AIDraft, proposal: dict, *, actor, language: str) -> AIDraft:
    """Save drafts; if the builders refuse, send the errors back to the AI once to fix."""
    errors = _save_drafts(draft, proposal, actor)
    if errors and not any(e["path"] in ("form", "workflow") for e in errors):
        try:
            fixed = _ask(
                user=actor,
                draft=draft,
                content=f"Your draft:\n{proposal}\n\nThe builders refused it with these problems. Fix them and send the whole draft again:\n"
                + "\n".join(f"- {e['path']}: {e['message']}" for e in errors),
                language=language,
            )
            proposal = fixed or proposal
            errors = _save_drafts(draft, proposal, actor)
        except AssistantUnavailable:
            pass
    cat = catalogue()
    checks = local_checks(proposal, draft.make, cat)
    checks += [{"code": "builder_error", "ok": False, "message": e["message"], "path": e["path"], "fix": "edit_form" if e["path"].startswith("form") else "edit_workflow"} for e in errors]
    checks += _builder_checks(draft)
    checks.append({"code": "test_run", "ok": False, "message": "Run a test to walk sample answers through every step.", "fix": "test"})
    draft.proposal = proposal
    draft.checks = checks
    draft.status = AIDraft.Status.READY if (draft.draft_form_id or draft.draft_workflow_id) else AIDraft.Status.DRAFTING
    draft.save()
    return draft


@transaction.atomic
def create(*, actor, description: str, make: str, program=None, general_ideas: bool = False, requested_language: str | None = None) -> AIDraft:
    language = lang_mod.resolve(user=actor, requested=requested_language, text=description)
    draft = AIDraft.objects.create(description=description, make=make, program=program, general_ideas=general_ideas, language=language, created_by=actor)
    proposal = _ask(user=actor, draft=draft, content=f"Make: {make}\nFor: {program.title if program else 'General ideas'}\n\nDescription:\n{description}", language=language)
    draft.conversation = [{"from": "person", "text": description, "at": timezone.now().isoformat()}, {"from": "ai", "text": str(proposal.get("summary") or ""), "at": timezone.now().isoformat()}]
    draft = _apply(draft, proposal, actor=actor, language=language)
    AuditService.log_action(actor=actor, action_type="assistant_builder_draft_created", target=draft, metadata={"make": make, "form": str(draft.draft_form_id or ""), "workflow": str(draft.draft_workflow_id or "")})
    return draft


@transaction.atomic
def revise(*, actor, draft: AIDraft, change: str) -> AIDraft:
    if draft.status in (AIDraft.Status.DISCARDED, AIDraft.Status.PUBLISHED):
        raise ValidationError({"code": "closed", "detail": "This draft is closed."})
    language = draft.language
    proposal = _ask(user=actor, draft=draft, content=f"The current draft:\n{draft.proposal}\n\nChange asked for:\n{change}\n\nSend the whole draft again with the change.", language=language)
    draft.conversation = [*draft.conversation, {"from": "person", "text": change, "at": timezone.now().isoformat()}, {"from": "ai", "text": str(proposal.get("summary") or ""), "at": timezone.now().isoformat()}]
    draft = _apply(draft, proposal, actor=actor, language=language)  # same draft form and workflow ids, updated in place
    AuditService.log_action(actor=actor, action_type="assistant_builder_draft_revised", target=draft, metadata={"change": change[:300]})
    return draft


def test_run(*, actor, draft: AIDraft, answers: dict | None) -> AIDraft:
    """Walk sample answers through every stage and condition without saving anything."""
    if not answers:
        try:
            result = gateway.ask(
                Feature.BUILDER_DRAFT,
                user=actor,
                system_parts=[knowledge.SystemPart(prompts.BASE_PROMPT, cache=True), prompts.part(SAMPLE_INSTRUCTIONS, draft.language)],
                messages=[{"role": "user", "content": f"The form:\n{form_document(draft.proposal)}"}],
                json_schema=SAMPLE_SCHEMA,
                language=draft.language,
                effort="low",
                target=f"builder:{draft.pk}",
            )
            answers = {str(item.get("key")): item.get("value") for item in (result.data or {}).get("answers") or [] if isinstance(item, dict)}
        except AssistantUnavailable:
            answers = {}
    outcome = {"answers": answers, "path": [], "problems": [], "ran": False}
    workflow = None
    if draft.draft_workflow_id:
        from apps.workflow.models import WorkflowDefinition

        workflow = WorkflowDefinition.objects.filter(pk=draft.draft_workflow_id).first()
    try:
        from apps.workflow.services import run_workflow_dry_run
    except ImportError:
        run_workflow_dry_run = None
    if workflow is None or run_workflow_dry_run is None:
        outcome["problems"] = [{"path": "workflow", "message": "A test run needs a saved draft workflow and the workflow dry run service."}]
    else:
        result = run_workflow_dry_run(workflow=workflow, answers=answers) or {}
        outcome.update(path=result.get("path") or [], problems=result.get("problems") or [], ran=True)
    passed = outcome["ran"] and not outcome["problems"]
    draft.test_result = outcome
    draft.checks = [check for check in draft.checks if check.get("code") != "test_run"] + [
        {"code": "test_run", "ok": passed, "message": "The test run passed." if passed else "The test run found problems." if outcome["ran"] else "The test run could not run yet.", "fix": "test"}
    ]
    draft.save(update_fields=["test_result", "checks", "updated_at"])
    AuditService.log_action(actor=actor, action_type="assistant_builder_draft_tested", target=draft, metadata={"passed": passed, "ran": outcome["ran"]})
    return draft


def discard(*, actor, draft: AIDraft) -> AIDraft:
    draft.status = AIDraft.Status.DISCARDED
    draft.save(update_fields=["status", "updated_at"])
    AuditService.log_action(actor=actor, action_type="assistant_builder_draft_discarded", target=draft)
    return draft


def draft_dict(draft: AIDraft) -> dict:
    return {
        "id": str(draft.pk),
        "description": draft.description,
        "make": draft.make,
        "program": str(draft.program_id) if draft.program_id else None,
        "general_ideas": draft.general_ideas,
        "language": draft.language,
        "status": draft.status,
        "conversation": draft.conversation,
        "summary": str((draft.proposal or {}).get("summary") or ""),
        "form": form_document(draft.proposal or {}) if draft.make in ("form", "both") else None,
        "workflow": workflow_spec(draft.proposal or {}) if draft.make in ("workflow", "both") else None,
        "draft_form_id": str(draft.draft_form_id) if draft.draft_form_id else None,
        "draft_workflow_id": str(draft.draft_workflow_id) if draft.draft_workflow_id else None,
        "checks": draft.checks,
        "test_result": draft.test_result or None,
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }

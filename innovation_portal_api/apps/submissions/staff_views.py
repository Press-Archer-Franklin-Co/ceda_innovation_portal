"""R-42: the staff submissions list (3.15) and the staff summary of one idea (3.16)."""

from __future__ import annotations

from datetime import date

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Case, F, FloatField, OuterRef, Q, Subquery, Sum, Value, When
from django.db.models.functions import Cast, Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.constants import AssignmentRoleType, AssignmentStatus, ScoreSheetStatus
from apps.core.i18n import get_text
from apps.core.permissions import HasCapability
from apps.submissions.models import Submission
from apps.submissions.selectors import SubmissionSelector

TAGS = ["Staff ideas (R-42)"]

# Status groups shown as "stage" on the list, in the order of the stage filter.
STAGES = {
    "submitted": ("Submitted", {"submitted"}),
    "in_review": ("In review", {"screening", "under_review", "judging_review", "assigned_to_judges", "under_judging"}),
    "needs_input": ("Needs input", {"requires_more_information", "returned"}),
    "shortlisted": ("Shortlisted", {"shortlisted", "finalist"}),
    "approved": ("Approved", {"approved", "winner", "selected_for_hackathon"}),
    "not_taken_forward": ("Not taken forward", {"rejected", "screened_out", "closed"}),
}
STAGE_OF_STATUS = {status: code for code, (_, statuses) in STAGES.items() for status in statuses}
VIEWS = ("all", "mine", "needs_input", "shortlisted", "channels")
ORDERING = {"title": "title", "submitted_at": "submitted_at", "updated_at": "updated_at", "score": "score"}
OPEN_ASSIGNMENT = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED)
SENT = (ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED)
MAX_PAGE_SIZE = 50


def initials(name: str) -> str:
    parts = [part for part in (name or "").split() if part]
    if len(parts) > 1:
        return (parts[0][0] + parts[-1][0]).upper()
    return (parts[0][:2] if parts else "").upper()


def person_name(submission) -> str:
    if submission.innovator_id:
        return submission.innovator.full_name or submission.innovator.email or ""
    return submission.guest_name or ""


def stage_label(status: str) -> str:
    code = STAGE_OF_STATUS.get(status)
    return STAGES[code][0] if code else (status or "").replace("_", " ").capitalize()


def _lang(request) -> str:
    return "tn" if request.query_params.get("lang") == "tn" else "en"


def _ref_q(field: str, value: str) -> Q:
    try:
        import uuid

        return Q(**{f"{field}_id": uuid.UUID(str(value))})
    except ValueError:
        return Q(**{f"{field}__slug": value})


def with_score(queryset):
    """score: the weighted share (0 to 100) over every sent scorecard, as sheet_weighted_score works it out per sheet."""
    from apps.evaluation.models import CriterionScore

    sent = CriterionScore.objects.filter(score_sheet__submission=OuterRef("pk"), score_sheet__is_final=True, score_sheet__status__in=SENT)
    weight = Coalesce(F("marking_criteria_item__weight"), F("stage_criterion__weight"), F("criterion__weight"))
    earned = sent.values("score_sheet__submission").annotate(total=Sum("weighted_score")).values("total")[:1]
    weights = sent.values("score_sheet__submission").annotate(total=Sum(weight)).values("total")[:1]
    queryset = queryset.annotate(_earned=Cast(Subquery(earned), FloatField()), _weights=Cast(Subquery(weights), FloatField()))
    return queryset.annotate(
        score=Case(When(_weights__gt=0, then=F("_earned") * 100.0 / F("_weights")), default=Value(None), output_field=FloatField())
    )


def mine_q(user) -> Q:
    from apps.assignments.models import Assignment

    return Q(id__in=Assignment.objects.filter(assignee=user, status__in=OPEN_ASSIGNMENT).values("submission_id"))


VIEW_Q = {
    "all": lambda user: Q(),
    "mine": mine_q,
    "needs_input": lambda user: Q(current_status__in=STAGES["needs_input"][1]),
    "shortlisted": lambda user: Q(current_status__in=STAGES["shortlisted"][1]),
    "channels": lambda user: Q(channel__in=("whatsapp", "ussd")),
}


def _date(params, name) -> date | None:
    value = params.get(name)
    if not value:
        return None
    parsed = parse_date(value)
    if parsed is None:
        raise ValidationError({name: "Use the date format YYYY-MM-DD."})
    return parsed


def filtered_list(user, params):
    """Every filter except view, so the tab counts can use the same rows."""
    from apps.core.constants import IntakeChannel
    from apps.submissions.staff_search import _matching_people

    queryset = SubmissionSelector.for_user(user).exclude(submitted_at__isnull=True).exclude(current_status="draft")
    if params.get("program"):
        queryset = queryset.filter(program_id=params["program"])
    stage = params.get("stage")
    if stage:
        if stage not in STAGES:
            raise ValidationError({"stage": f"Use one of: {', '.join(STAGES)}."})
        queryset = queryset.filter(current_status__in=STAGES[stage][1])
    if params.get("status"):
        queryset = queryset.filter(current_status=params["status"])
    channel = params.get("channel")
    if channel:
        if channel not in IntakeChannel.values:
            raise ValidationError({"channel": f"Use one of: {', '.join(IntakeChannel.values)}."})
        queryset = queryset.filter(channel=channel)
    if params.get("district"):
        queryset = queryset.filter(_ref_q("district", params["district"]))
    if params.get("sector"):
        queryset = queryset.filter(_ref_q("sector", params["sector"]))
    start, end = _date(params, "submitted_from"), _date(params, "submitted_to")
    if start:
        queryset = queryset.filter(submitted_at__date__gte=start)
    if end:
        queryset = queryset.filter(submitted_at__date__lte=end)
    search = (params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(title__icontains=search) | Q(reference_number__icontains=search) | Q(guest_name__icontains=search) | Q(innovator__in=_matching_people(search))
        )
    return queryset


def list_row(submission, lang: str) -> dict:
    name = person_name(submission)
    return {
        "id": str(submission.id),
        "title": submission.title,
        "reference": submission.reference_number,
        # A guest (no account): the officer sees how to reach them, email or phone (23 Nov).
        "innovator": {"name": name, "initials": initials(name), "is_guest": bool(submission.is_guest),
                      "contact": (submission.guest_email or submission.guest_phone or None) if submission.is_guest else None},
        "program": {"id": str(submission.program_id), "title": submission.program.title},
        "channel": submission.channel,
        "district": {"id": str(submission.district_id), "name": get_text(submission.district.name, lang)} if submission.district_id else None,
        "status": submission.current_status,
        "stage_label": stage_label(submission.current_status),
        "score": round(submission.score, 1) if submission.score is not None else None,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": submission.updated_at.isoformat(),
    }


class StaffSubmissionListView(APIView):
    permission_classes = [HasCapability.of("entries.search")]

    @extend_schema(
        tags=TAGS,
        summary="Staff list of ideas (3.15)",
        description="{count, page, page_size, results: [{id, title, reference, innovator: {name, initials}, program: {id, title}, channel, "
        "district: {id, name} | null, status, stage_label, score (0 to 100) | null, submitted_at, updated_at}], "
        "views: {all, mine, needs_input, shortlisted, channels}}. The view counts use the same filters without view.",
        parameters=[
            OpenApiParameter("view", OpenApiTypes.STR, enum=list(VIEWS)),
            OpenApiParameter("program", OpenApiTypes.UUID),
            OpenApiParameter("stage", OpenApiTypes.STR, enum=list(STAGES)),
            OpenApiParameter("status", OpenApiTypes.STR),
            OpenApiParameter("channel", OpenApiTypes.STR),
            OpenApiParameter("district", OpenApiTypes.STR, description="id or slug"),
            OpenApiParameter("sector", OpenApiTypes.STR, description="id or slug"),
            OpenApiParameter("submitted_from", OpenApiTypes.DATE),
            OpenApiParameter("submitted_to", OpenApiTypes.DATE),
            OpenApiParameter("search", OpenApiTypes.STR, description="Title, reference or the person's name"),
            OpenApiParameter("ordering", OpenApiTypes.STR, description="title, submitted_at, updated_at, score, or with a - in front"),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT, description="Up to 50, default 20"),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        params = request.query_params
        view = params.get("view") or "all"
        if view not in VIEWS:
            raise ValidationError({"view": f"Use one of: {', '.join(VIEWS)}."})
        ordering = params.get("ordering") or "-updated_at"
        key = ordering.lstrip("-")
        if key not in ORDERING:
            raise ValidationError({"ordering": f"Use one of: {', '.join(ORDERING)} (add - for the other way)."})
        try:
            page = max(1, int(params.get("page") or 1))
            page_size = min(MAX_PAGE_SIZE, max(1, int(params.get("page_size") or 20)))
        except ValueError:
            raise ValidationError({"page": "Use whole numbers for page and page_size."})
        base = filtered_list(request.user, params)
        views = {name: base.filter(VIEW_Q[name](request.user)).count() for name in VIEWS}
        rows = with_score(base.filter(VIEW_Q[view](request.user))).select_related("program", "innovator", "district")
        field = F(ORDERING[key])
        rows = rows.order_by(field.desc(nulls_last=True) if ordering.startswith("-") else field.asc(nulls_last=True), "-submitted_at", "id")
        count = views[view]
        start = (page - 1) * page_size
        lang = _lang(request)
        return api_success(
            data={
                "count": count,
                "page": page,
                "page_size": page_size,
                "results": [list_row(item, lang) for item in rows[start : start + page_size]],
                "views": views,
            }
        )


# One idea -----------------------------------------------------------------------------


def answer_language(submission) -> str:
    language = (submission.metadata or {}).get("language") or (submission.metadata or {}).get("lang")
    return "tn" if language == "tn" else "en"


def _age(born: date | None) -> int | None:
    if not born:
        return None
    today = timezone.localdate()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _text(value, lang: str) -> str:
    if isinstance(value, dict):
        text = value.get(lang) or ""
        return text if text.strip() else (value.get("en") or "")
    return value or ""


def _value(value):
    """A stored answer as the person gave it (the response JSON keeps some answers as {"value": ...})."""
    if isinstance(value, dict) and set(value) <= {"value", "other"} and "value" in value:
        return value["value"]
    return value


def _option_labels(field: dict, value, lang: str):
    options = {str(option.get("value")): option.get("label") or {} for option in field.get("options") or []}
    if not options:
        return None

    def label(item):
        text = options.get(str(item))
        return _text(text, lang) if text is not None else item

    return [label(item) for item in value] if isinstance(value, list) else label(value)


def grouped_answers(submission, lang: str) -> list[dict]:
    """Answers by form step, labels in ``lang``; choice answers also in the other language when the form has it."""
    from apps.programs.form_schema import build_form_schema

    schema = submission.form_version.schema if submission.form_version_id else None
    if not schema and getattr(submission.program, "form", None):
        schema = build_form_schema(submission.program.form, include_inactive=False)
    schema = schema or {"steps": [], "loose_fields": [], "languages": ["en"]}
    other = "en" if lang == "tn" else "tn"
    bilingual_form = other in (schema.get("languages") or ["en"])
    responses = {}
    for response in submission.responses.select_related("form_field"):
        key = response.form_field.key if response.form_field_id else response.field_key_snapshot
        responses[key] = response
    groups, used = [], set()

    def items_for(fields):
        items = []
        for field in fields:
            response = responses.get(field.get("key"))
            if response is None:
                continue
            used.add(field["key"])
            value = _value(response.value)
            shown = _option_labels(field, value, lang)
            other_value = _option_labels(field, value, other) if bilingual_form and shown is not None else None
            items.append(
                {
                    "key": field["key"],
                    "label": _text(field.get("label"), lang) or response.field_label_snapshot,
                    "value": shown if shown is not None else value,
                    "value_other_language": other_value if other_value != shown else None,
                }
            )
        return items

    for step in schema.get("steps") or []:
        fields = [field for row in step.get("rows") or [] for field in row.get("fields") or []]
        items = items_for(fields)
        if items:
            groups.append({"step_code": step.get("code"), "step_title": _text(step.get("title"), lang), "items": items})
    loose = items_for(schema.get("loose_fields") or [])
    rest = [
        {"key": key, "label": response.field_label_snapshot or key, "value": _value(response.value), "value_other_language": None}
        for key, response in responses.items()
        if key not in used
    ]
    if loose or rest:
        groups.append({"step_code": None, "step_title": None, "items": loose + rest})
    return groups


def stage_bar(submission) -> list[dict]:
    instance = getattr(submission, "workflow_instance", None)
    if instance is None:
        return []
    current = instance.current_step
    finished = instance.status in {"completed", "rejected", "cancelled"}
    steps = []
    for step in instance.workflow_definition.steps.filter(is_active=True).order_by("order", "created_at"):
        if finished or (current and step.order < current.order):
            state = "done"
        elif current and step.id == current.id:
            state = "current"
        else:
            state = "pending"
        steps.append({"code": step.code, "title": step.name, "state": state})
    return steps


def related_ideas(submission, limit: int = 5) -> list[dict]:
    """Earlier ideas with a similar title (staff only; never shown to applicants)."""
    if not submission.submitted_at:
        return []
    rows = (
        Submission.objects.exclude(id=submission.id)
        .exclude(submitted_at__isnull=True)
        .filter(submitted_at__lt=submission.submitted_at)
        .annotate(similarity=TrigramSimilarity("title", submission.title))
        .filter(similarity__gte=0.3)
        .order_by("-similarity", "-submitted_at")[:limit]
    )
    return [{"id": str(item.id), "title": item.title, "reference": item.reference_number, "status": item.current_status} for item in rows]


def other_ideas(submission) -> dict:
    if submission.innovator_id:
        others = Submission.objects.filter(innovator_id=submission.innovator_id)
    elif submission.guest_phone:
        others = Submission.objects.filter(guest_phone=submission.guest_phone)
    else:
        return {"count": 0, "shortlisted": 0}
    others = others.exclude(id=submission.id).exclude(submitted_at__isnull=True)
    return {"count": others.count(), "shortlisted": others.filter(current_status__in=STAGES["shortlisted"][1]).count()}


def score_summary(submission) -> dict:
    from apps.assignments.models import Assignment
    from apps.evaluation.models import ScoreSheet
    from apps.evaluation.services import sheet_weighted_score

    sheets = list(ScoreSheet.objects.filter(submission=submission, is_final=True, status__in=SENT).order_by("judge_id", "-submitted_at"))
    latest = {}
    for sheet in sheets:
        latest.setdefault(sheet.judge_id, sheet)
    values = [value for value in (sheet_weighted_score(sheet) for sheet in latest.values()) if value is not None]
    assigned = (
        Assignment.objects.filter(submission=submission, role_type=AssignmentRoleType.JUDGE)
        .exclude(status__in=[AssignmentStatus.REASSIGNED, AssignmentStatus.DECLINED])
        .values("assignee_id")
        .distinct()
        .count()
    )
    return {"average": round(sum(values) / len(values), 1) if values else None, "judges_scored": len(latest), "judges_assigned": max(assigned, len(latest))}


class StaffSubmissionSummaryView(APIView):
    permission_classes = [HasCapability.of("entries.review")]

    @extend_schema(
        tags=TAGS,
        summary="Staff summary of one idea (3.16)",
        description="Stage bar, answers by form step, the person, who has it, scores, counts and related ideas. "
        "Answers are in the innovator's language unless lang is given.",
        parameters=[OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, submission_id):
        from apps.assignments.models import Assignment
        from apps.workflow.services import WorkflowRuntimeService

        submission = get_object_or_404(
            SubmissionSelector.for_user(request.user).select_related("program__form", "innovator", "district", "form_version"), id=submission_id
        )
        language = answer_language(submission)
        lang = request.query_params.get("lang") if request.query_params.get("lang") in ("en", "tn") else language
        profile = getattr(submission.innovator, "innovator_profile", None) if submission.innovator_id else None
        district = submission.district or (profile.district if profile else None)
        name = person_name(submission)
        officer = (
            Assignment.objects.filter(submission=submission, status__in=OPEN_ASSIGNMENT)
            .exclude(role_type=AssignmentRoleType.JUDGE)
            .select_related("assignee")
            .order_by("-assigned_at")
            .first()
        )
        instance = getattr(submission, "workflow_instance", None)
        due = officer.deadline if officer and officer.deadline else (instance.due_at if instance else None)
        thread = getattr(submission, "message_thread", None)
        related = related_ideas(submission)
        return api_success(
            data={
                "id": str(submission.id),
                "title": submission.title,
                "reference": submission.reference_number,
                "status": submission.current_status,
                "stage_label": stage_label(submission.current_status),
                "channel": submission.channel,
                "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
                "program": {"id": str(submission.program_id), "title": submission.program.title},
                "language": lang,
                "steps": stage_bar(submission),
                "answers": grouped_answers(submission, lang),
                "innovator": {
                    "id": str(submission.innovator_id) if submission.innovator_id else None,
                    "name": name,
                    "initials": initials(name),
                    "phone": submission.guest_phone or (submission.innovator.phone_number if submission.innovator_id else "") or None,
                    "email": submission.guest_email or (submission.innovator.email if submission.innovator_id else "") or None,
                    "is_guest": bool(submission.is_guest),
                    "district": get_text(district.name, lang) if district else None,
                    "age": _age(profile.date_of_birth if profile else None),
                    "language": language,
                    "other_ideas": other_ideas(submission),
                },
                "assigned_to": {"id": str(officer.assignee_id), "name": officer.assignee.full_name, "initials": initials(officer.assignee.full_name)} if officer else None,
                "reply_due": timezone.localtime(due).date().isoformat() if due else None,
                "reply_due_step": instance.due_at.isoformat() if instance and instance.due_at else None,
                "allowed_actions": WorkflowRuntimeService.allowed_actions_for_user(instance, request.user) if instance else [],
                "scores": score_summary(submission),
                "counts": {
                    "documents": submission.documents.count(),
                    "messages": thread.messages.exclude(author_role="system").count() if thread else 0,
                    "notes": submission.internal_notes.count(),
                    "related": len(related),
                },
                "related": related,
            }
        )

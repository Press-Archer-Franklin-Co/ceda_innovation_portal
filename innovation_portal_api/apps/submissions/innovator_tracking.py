"""Innovator tracking (2.2 My ideas, 2.4 Track my idea, 2.4b Returned for changes, and 3.16's send back).

My ideas pages in the database: only (sort key, id) pairs are read for the page, then the ten cards are built.
Counts are one conditional count per source, so a person with 1,000 ideas costs the same few queries.
"""
from __future__ import annotations

import uuid
from datetime import date

from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import Lower
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.audit.services import AuditService
from apps.submissions.innovator_dashboard import ENDED_WORKFLOW_STATUSES, FILTERS, InnovatorDashboardSelector, draft_item, submission_item
from apps.submissions.models import ApplicationDraft, ReturnRequest, Submission, SubmissionResponse, SubmissionVersion
from apps.submissions.status_labels import FINISHED_STATUSES, NEEDS_ACTION_STATUSES

SORTS = ("newest", "oldest", "name")
PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
ITEM_KINDS = ("answer", "document")
MAX_ITEMS = 10


def _iso(value):
    return value.isoformat() if value else None


def short_name(user) -> str:
    """'Kago T.': first name and the first letter of the last name (never a full staff name)."""
    if not user:
        return ""
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    return f"{first} {last[:1]}.".strip() if first and last else first or (user.email or "").split("@")[0]


# 2.2 My ideas ----------------------------------------------------------------------------------------------------


NEEDS_Q = Q(current_status__in=NEEDS_ACTION_STATUSES) | Q(workflow_instance__status="returned")
FINISHED_Q = (Q(current_status__in=FINISHED_STATUSES) | Q(workflow_instance__status__in=ENDED_WORKFLOW_STATUSES)) & ~NEEDS_Q


def _int(value, default, *, low=1, high=None, name="page"):
    if value in (None, ""):
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError({name: "Must be a whole number."})
    if number < low or (high is not None and number > high):
        raise ValidationError({name: f"Must be between {low} and {high}." if high else f"Must be {low} or more."})
    return number


def ideas_page(user, *, filter_name="all", q="", program="", sort="newest", page=1, page_size=PAGE_SIZE, lang="en") -> dict:
    if filter_name not in FILTERS:
        raise ValidationError({"filter": f"Use one of: {', '.join(FILTERS)}."})
    if sort not in SORTS:
        raise ValidationError({"sort": f"Use one of: {', '.join(SORTS)}."})
    page = _int(page, 1)
    page_size = _int(page_size, PAGE_SIZE, high=MAX_PAGE_SIZE, name="page_size")

    drafts = ApplicationDraft.objects.filter(innovator=user, status=ApplicationDraft.STATUS_DRAFT)
    subs = Submission.objects.filter(innovator=user, submitted_at__isnull=False)
    all_programs = set(drafts.values_list("program_id", flat=True).distinct()) | set(subs.values_list("program_id", flat=True).distinct())
    q = (q or "").strip()[:100]
    if q:
        drafts = drafts.filter(Q(title__icontains=q) | Q(reference_number__icontains=q))
        subs = subs.filter(Q(title__icontains=q) | Q(reference_number__icontains=q))
    if program:
        try:
            program_id = uuid.UUID(str(program))
        except ValueError:
            raise ValidationError({"program": "Unknown challenge."})
        drafts = drafts.filter(program_id=program_id)
        subs = subs.filter(program_id=program_id)

    tally = subs.aggregate(total=Count("id"), needs=Count("id", filter=NEEDS_Q), finished=Count("id", filter=FINISHED_Q))
    draft_total = drafts.count()
    counts = {
        "all": draft_total + tally["total"],
        "needs_action": tally["needs"],
        "drafts": draft_total,
        "in_review": tally["total"] - tally["needs"] - tally["finished"],
        "finished": tally["finished"],
    }

    use_drafts = filter_name in ("all", "drafts")
    if filter_name == "needs_action":
        subs = subs.filter(NEEDS_Q)
    elif filter_name == "finished":
        subs = subs.filter(FINISHED_Q)
    elif filter_name == "in_review":
        subs = subs.exclude(NEEDS_Q).exclude(FINISHED_Q)
    use_subs = filter_name != "drafts"
    sub_total = {"all": tally["total"], "drafts": 0}.get(filter_name, counts.get(filter_name, 0))
    total = (counts["drafts"] if use_drafts else 0) + sub_total

    # Only the keys for the rows up to this page; then the page's own rows.
    end = page * page_size
    order, reverse = {"newest": ("-updated_at", True), "oldest": ("updated_at", False), "name": ("title_key", False)}[sort]
    keyed = []
    for kind, qs in (("draft", drafts if use_drafts else None), ("submission", subs if use_subs else None)):
        if qs is None:
            continue
        qs = qs.annotate(title_key=Lower("title"))
        field = order.lstrip("-")
        rows = qs.order_by(order, "id").values_list(field, "id")[:end]
        keyed += [(key, str(pk), kind) for key, pk in rows]
    keyed.sort(key=lambda row: (row[0], row[1]), reverse=reverse)
    window = keyed[(page - 1) * page_size:end]

    draft_ids = [pk for _, pk, kind in window if kind == "draft"]
    sub_ids = [pk for _, pk, kind in window if kind == "submission"]
    drafts_by_id = {str(d.id): d for d in ApplicationDraft.objects.filter(id__in=draft_ids).select_related("program", "sector")}
    subs_by_id = {
        str(s.id): s
        for s in Submission.objects.filter(id__in=sub_ids).select_related("program", "sector", "workflow_instance__current_step")
    }
    results = [draft_item(drafts_by_id[pk], lang) if kind == "draft" else submission_item(subs_by_id[pk], lang) for _, pk, kind in window]

    from apps.programs.models import Program

    programs = [
        {"id": str(p.id), "title": p.title, "is_general_intake": p.is_general_intake}
        for p in Program.objects.filter(id__in=all_programs).order_by("is_general_intake", "title")
    ]
    pages = max(1, -(-total // page_size))
    return {
        "filter": filter_name,
        "counts": counts,
        "results": results,
        "count": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "sort": sort,
        "q": q,
        "program": str(program or ""),
        "programs": programs,
    }


# 2.4 Track my idea -----------------------------------------------------------------------------------------------


def owned_submission(user, idea_id) -> Submission:
    submission = (
        Submission.objects.filter(id=idea_id, innovator=user, submitted_at__isnull=False)
        .select_related("program", "workflow_instance__current_step")
        .first()
    )
    if submission is None:
        raise NotFound("This idea was not found.")
    return submission


DECISION_OF_ACTION = {"approve": "passed", "reject": "not_taken_forward", "screen_out": "not_taken_forward", "return": "returned"}


def feedback_by_stage(submission) -> list[dict]:
    """What was decided at each stage, by whom and when: only what staff shared (released feedback, the reasons
    and items of a return), never internal notes or scores. Oldest first, the stage now in progress last."""
    from apps.submissions.timeline import SubmissionTimelineService

    timeline = SubmissionTimelineService.build(submission, public=True)["stages"]
    names = {stage["code"]: stage["name"] for stage in timeline}
    events = [{"code": "submitted", "name": names.get("submitted", "Received"), "decision": "received", "comment": "", "by": "", "automatic": True, "at": _iso(submission.submitted_at)}]
    for snap in submission.feedback_snapshots.select_related("source_action_log__performed_by").order_by("released_at"):
        if snap.release_action == "return":
            continue  # shown from the return itself, with its items
        release = (snap.payload_json or {}).get("release") or {}
        code = release.get("source_stage_code") or snap.stage_code
        actor = snap.source_action_log.performed_by if snap.source_action_log_id else None
        events.append({
            "code": code,
            "name": names.get(code) or release.get("source_stage_name") or snap.stage_name,
            "decision": DECISION_OF_ACTION.get(snap.release_action, snap.release_action),
            "comment": (release.get("comment") or "").strip(),
            "by": short_name(actor) if actor else "CEDA",
            "automatic": False,
            "at": _iso(snap.released_at),
        })
    for ret in submission.return_requests.select_related("requested_by", "resent_by").order_by("created_at"):
        events.append({
            "code": ret.step_code, "name": names.get(ret.step_code) or ret.step_name, "decision": "returned", "comment": ret.reason,
            "by": short_name(ret.requested_by), "automatic": False, "at": _iso(ret.created_at),
        })
        if ret.status == ReturnRequest.Status.RESENT:
            events.append({
                "code": ret.step_code, "name": names.get(ret.step_code) or ret.step_name, "decision": "resent", "comment": "",
                "by": "", "automatic": False, "at": _iso(ret.resent_at), "by_you": True,
            })
    events.sort(key=lambda e: e["at"] or "")
    current = next((stage for stage in timeline if stage["status"] == "current"), None)
    if current and current["code"] != "submitted":
        instance = getattr(submission, "workflow_instance", None)
        if not (instance and instance.status == "returned"):
            events.append({"code": current["code"], "name": current["name"], "decision": "in_progress", "comment": current.get("explanation") or "", "by": "", "automatic": False, "at": None})
    for event in events:
        event.setdefault("by_you", False)
    return events


def documents(submission) -> list[dict]:
    """Every file with the date sent, size and versions (newest version first). Downloads go through
    /api/documents/{id}/download/, which checks the person can see the idea."""
    from apps.documents.models import SubmissionDocument

    rows = list(
        SubmissionDocument.objects.filter(submission=submission, is_active=True).select_related("uploaded_by").order_by("upload_group_id", "-version_number")
    )
    groups: dict = {}
    for doc in rows:
        groups.setdefault(doc.upload_group_id, []).append(doc)

    def one(doc):
        return {
            "id": str(doc.id),
            "name": doc.original_filename or (doc.external_url or "").rsplit("/", 1)[-1] or "File",
            "size_bytes": doc.size_bytes,
            "mime_type": doc.mime_type,
            "version": doc.version_number,
            "sent_at": _iso(doc.created_at),
            "download_url": f"/api/documents/{doc.id}/download/" if doc.file else doc.external_url,
            "field_key": doc.field_key,
            "by_you": doc.uploaded_by_id == submission.innovator_id,
        }

    out = []
    for versions in groups.values():
        latest = versions[0]
        if not latest.is_current and not latest.is_latest:
            continue
        item = one(latest)
        item["older_versions"] = [one(v) for v in versions[1:]]
        out.append(item)
    out.sort(key=lambda d: d["sent_at"] or "", reverse=True)
    return out


def _current_answers(submission, keys) -> dict:
    values = {}
    for response in submission.responses.filter(field_key_snapshot__in=keys):
        values[response.field_key_snapshot] = response.value
    return values


def _current_document_ids(submission) -> list[str]:
    from apps.documents.models import SubmissionDocument

    return [str(pk) for pk in SubmissionDocument.objects.filter(submission=submission, is_active=True, is_current=True).values_list("id", flat=True)]


def item_done(ret: ReturnRequest, item: dict, *, answers: dict | None = None, document_ids: list[str] | None = None, documents_by_id: dict | None = None) -> bool:
    before = ret.before or {}
    if item["kind"] == "answer":
        old = (before.get("answers") or {}).get(item["field_key"])
        new = (answers or {}).get(item["field_key"])
        return new not in (None, "", [], {}) and new != old
    new_ids = set(document_ids or []) - set(before.get("documents") or [])
    if not item.get("field_key"):
        return bool(new_ids)
    return any((documents_by_id or {}).get(pk) == item["field_key"] for pk in new_ids)


def returned_payload(submission) -> dict | None:
    ret = submission.return_requests.filter(status=ReturnRequest.Status.OPEN).select_related("requested_by").first()
    if ret is None:
        return None
    from apps.documents.models import SubmissionDocument

    answer_keys = [i["field_key"] for i in ret.items if i["kind"] == "answer"]
    answers = _current_answers(submission, answer_keys)
    docs = dict(SubmissionDocument.objects.filter(submission=submission, is_active=True, is_current=True).values_list("id", "field_key"))
    docs = {str(k): v for k, v in docs.items()}
    labels = {r.field_key_snapshot: r.field_label_snapshot for r in submission.responses.filter(field_key_snapshot__in=answer_keys)}
    items = [
        {
            **item,
            "field_label": labels.get(item.get("field_key"), ""),
            "done": item_done(ret, item, answers=answers, document_ids=list(docs), documents_by_id=docs),
        }
        for item in ret.items
    ]
    return {
        "id": str(ret.id),
        "reason": ret.reason,
        "fix_by": ret.fix_by.isoformat() if ret.fix_by else None,
        "requested_by": short_name(ret.requested_by),
        "requested_at": _iso(ret.created_at),
        "stage": ret.step_name,
        "items": items,
        "answers": {key: answers.get(key) for key in answer_keys},
    }


def tracking(user, idea_id) -> dict:
    submission = owned_submission(user, idea_id)
    instance = getattr(submission, "workflow_instance", None)
    finished = submission.current_status in FINISHED_STATUSES or bool(instance and instance.status in ENDED_WORKFLOW_STATUSES)
    return {
        "id": str(submission.id),
        "feedback_by_stage": feedback_by_stage(submission),
        "documents": documents(submission),
        "can_add_documents": not finished,
        "returned": returned_payload(submission),
    }


# 3.16 Send back for changes and 2.4b Fix and resend ---------------------------------------------------------------


def send_back(submission: Submission, *, actor, reason: str, fix_by, items) -> ReturnRequest:
    """The officer's "Ask for changes" (3.16): returns the idea with a reason, a fix-by date and the exact items."""
    from apps.workflow.models import WorkflowActionLog
    from apps.workflow.services import WorkflowRuntimeService

    errors = {}
    reason = (reason or "").strip()
    if not reason:
        errors["reason"] = "Say why the idea needs changes."
    elif len(reason) > 1000:
        errors["reason"] = "At most 1000 characters."
    if fix_by:
        try:
            fix_by = fix_by if isinstance(fix_by, date) else date.fromisoformat(str(fix_by))
        except ValueError:
            errors["fix_by"] = "Use a date like 2026-11-28."
            fix_by = None
        if fix_by and fix_by < timezone.localdate():
            errors["fix_by"] = "Pick today or a later date."
    else:
        fix_by = None
    keys = set(submission.responses.values_list("field_key_snapshot", flat=True))
    clean = []
    if not isinstance(items, list) or not items:
        errors["items"] = "Add at least one thing to change."
    elif len(items) > MAX_ITEMS:
        errors["items"] = f"At most {MAX_ITEMS} things to change."
    else:
        for index, item in enumerate(items):
            item = item if isinstance(item, dict) else {}
            kind, label, key = item.get("kind"), str(item.get("label") or "").strip(), str(item.get("field_key") or "").strip()
            if kind not in ITEM_KINDS:
                errors[f"items[{index}].kind"] = "Choose an answer or a document."
            if not label:
                errors[f"items[{index}].label"] = "Say what to change."
            elif len(label) > 200:
                errors[f"items[{index}].label"] = "At most 200 characters."
            if kind == "answer" and key not in keys:
                errors[f"items[{index}].field_key"] = "Pick the question to change."
            clean.append({"id": uuid.uuid4().hex[:8], "kind": kind, "field_key": key, "label": label})
    if submission.return_requests.filter(status=ReturnRequest.Status.OPEN).exists():
        errors["detail"] = "This idea is already waiting for changes."
    if errors:
        raise ValidationError(errors)

    with transaction.atomic():
        instance = WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action=WorkflowActionLog.ACTION_RETURN, comment=reason)
        step = instance.current_step
        answer_keys = [i["field_key"] for i in clean if i["kind"] == "answer"]
        ret = ReturnRequest.objects.create(
            submission=submission,
            step_code=step.code if step else "",
            step_name=step.name if step else "",
            reason=reason,
            fix_by=fix_by,
            items=clean,
            before={"answers": _current_answers(submission, answer_keys), "documents": _current_document_ids(submission)},
            requested_by=actor,
        )
        AuditService.log_action(actor=actor, action_type="submission_sent_back_for_changes", target=submission, metadata={"items": len(clean), "fix_by": fix_by.isoformat() if fix_by else None})
    return ret


def resend(user, idea_id, *, answers=None, comment: str = "") -> dict:
    """2.4b "Fix and resend": only the requested answers may change, every requested item must be done, then the
    idea goes back to the same stage (WorkflowRuntimeService.resubmit) and the officer hears about it."""
    from apps.documents.models import SubmissionDocument
    from apps.notifications.services import NotificationService
    from apps.workflow.services import WorkflowRuntimeService

    submission = owned_submission(user, idea_id)
    ret = submission.return_requests.filter(status=ReturnRequest.Status.OPEN).first()
    instance = getattr(submission, "workflow_instance", None)
    if ret is None or not instance or instance.status != "returned":
        raise ValidationError({"detail": {"code": "not_returned", "detail": "This idea is not waiting for changes."}})
    answers = answers or {}
    if not isinstance(answers, dict):
        raise ValidationError({"answers": "Send the changed answers as {question: answer}."})
    allowed = {i["field_key"] for i in ret.items if i["kind"] == "answer"}
    errors = {f"answers.{key}": "Only the parts the officer asked about can change." for key in answers if key not in allowed}
    if errors:
        raise ValidationError(errors)

    with transaction.atomic():
        responses = {r.field_key_snapshot: r for r in submission.responses.select_for_update().filter(field_key_snapshot__in=list(answers))}
        for key, value in answers.items():
            response = responses.get(key)
            if response is None:
                raise ValidationError({f"answers.{key}": "This question is not on the idea."})
            response.value = value
            response.save(update_fields=["value", "updated_at"])
        current = _current_answers(submission, list(allowed))
        docs = {str(k): v for k, v in SubmissionDocument.objects.filter(submission=submission, is_active=True, is_current=True).values_list("id", "field_key")}
        missing = [i["label"] for i in ret.items if not item_done(ret, i, answers=current, document_ids=list(docs), documents_by_id=docs)]
        if missing:
            raise ValidationError({"items": missing, "detail": {"code": "items_not_done", "detail": "Finish every item the officer asked for first."}})
        submission.latest_version_number = (submission.latest_version_number or 1) + 1
        submission.save(update_fields=["latest_version_number", "updated_at"])
        SubmissionVersion.objects.create(
            submission=submission,
            version_number=submission.latest_version_number,
            snapshot={"resent_for": str(ret.id), "answers": {k: current.get(k) for k in allowed}, "documents": list(docs)},
            submitted_by=user,
        )
        WorkflowRuntimeService.resubmit(instance, user, comment=(comment or "").strip()[:1000] or "Resent with the changes asked for.")
        ret.status = ReturnRequest.Status.RESENT
        ret.resent_at = timezone.now()
        ret.resent_by = user
        ret.save(update_fields=["status", "resent_at", "resent_by", "updated_at"])
        AuditService.log_action(actor=user, action_type="submission_resent_after_changes", target=submission, metadata={"return_request": str(ret.id)})
        if ret.requested_by_id:
            NotificationService.notify(
                user=ret.requested_by,
                notification_type="submission_resent",
                title="Idea resent with changes",
                message=f"{submission.reference_number} {submission.title} came back with the changes you asked for.",
                send_email=False,
            )
    submission.refresh_from_db()
    return tracking(user, submission.id)

"""Data for the signed-in innovator's home, My ideas and challenge screens (2.1 to 2.4).

An "idea" is either an open draft or a submission of the person. Lists merge both.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, ValidationError

from apps.core.constants import ProgramStatus, SubmissionFormFieldType
from apps.programs.access import ProgramAccessService
from apps.submissions.draft_services import ApplicationDraftService
from apps.submissions.intake import sector_payload, submission_type_for
from apps.submissions.models import ApplicationDraft, Submission, SubmissionStatusHistory
from apps.submissions.status_labels import FINISHED_STATUSES, NEEDS_ACTION_STATUSES, public_status_label

FILTERS = ("all", "needs_action", "drafts", "in_review", "finished")
ENDED_WORKFLOW_STATUSES = {"completed", "rejected", "cancelled"}
UPDATES_DEFAULT_WINDOW = timedelta(days=30)
UPDATES_LIMIT = 50

# Profile fields the innovator is asked to fill in, with labels for the "missing" list.
PROFILE_FIELDS = (
    ("first_name", "First name"),
    ("last_name", "Last name"),
    ("contact", "Phone number or email address"),
    ("district", "District"),
    ("sector", "Sector"),
    ("business_stage", "Business stage"),
    ("gender", "Gender"),
    ("date_of_birth", "Date of birth"),
    ("bio", "About you"),
)


from apps.communications.messaging import open_question, unread_messages, unread_updates

def _iso(value):
    return value.isoformat() if value else None


def profile_completeness(profile) -> dict:
    user = profile.user
    present = {
        "first_name": bool((user.first_name or "").strip()),
        "last_name": bool((user.last_name or "").strip()),
        "contact": bool(user.email or user.phone_number),
        "district": bool(profile.district_id),
        "sector": bool(profile.sector_id),
        "business_stage": bool(profile.business_stage),
        "gender": bool(profile.gender),
        "date_of_birth": bool(profile.date_of_birth),
        "bio": bool((profile.bio or "").strip()),
    }
    missing = [{"field": key, "label": label} for key, label in PROFILE_FIELDS if not present[key]]
    filled = len(PROFILE_FIELDS) - len(missing)
    return {"percent_complete": int(filled * 100 / len(PROFILE_FIELDS)), "missing_fields": missing}


def submission_state(submission) -> str:
    instance = getattr(submission, "workflow_instance", None)
    if submission.current_status in NEEDS_ACTION_STATUSES or (instance and instance.status == "returned"):
        return "needs_action"
    if submission.current_status in FINISHED_STATUSES or (instance and instance.status in ENDED_WORKFLOW_STATUSES):
        return "finished"
    return "in_review"


def submission_stage(submission) -> str:
    instance = getattr(submission, "workflow_instance", None)
    if instance and instance.current_step_id and instance.status not in ENDED_WORKFLOW_STATUSES:
        return instance.current_step.name
    return public_status_label(submission.current_status)


def _program_payload(program) -> dict:
    # slug: a challenge entry opens at /challenges/{slug}/entry/{id} straight away, without a redirect.
    return {"id": str(program.id), "title": program.title, "slug": program.slug, "is_general_intake": program.is_general_intake}


def draft_item(draft, lang: str) -> dict:
    progress = draft.progress_metadata or {}
    return {
        "id": str(draft.id),
        "kind": "draft",
        "channel": draft.channel,
        "shortlisted": False,
        "pitch_session": None,
        "state": "drafts",
        "reference": draft.reference_number,
        "title": draft.title,
        "sector": sector_payload(draft.sector, lang),
        "program": _program_payload(draft.program),
        "stage": "Draft",
        "status": "draft",
        "percent_complete": int(progress.get("percent_complete") or 0),
        "last_change": _iso(draft.updated_at),
        "needs_action_reason": "",
        "reply_by": None,
        "stages": [],
        "submitted_at": None,
        "decided_at": None,
        "has_feedback": False,
        "open_question": None,
    }


def submission_item(submission, lang: str) -> dict:
    state = submission_state(submission)
    instance = getattr(submission, "workflow_instance", None)
    return {
        "id": str(submission.id),
        "kind": "submission",
        "channel": submission.channel,
        "state": state,
        "reference": submission.reference_number,
        "title": submission.title,
        "sector": sector_payload(submission.sector, lang),
        "program": _program_payload(submission.program),
        "stage": submission_stage(submission),
        "status": submission.current_status,
        "percent_complete": 100,
        "last_change": _iso(submission.updated_at),
        "needs_action_reason": "CEDA asked you for more information." if state == "needs_action" else "",
        "reply_by": _iso(instance.due_at) if state == "needs_action" and instance else None,
        "stages": submission_stages(submission),
        "submitted_at": _iso(submission.submitted_at),
        "decided_at": _iso(decided_at(submission)) if state == "finished" else None,
        "has_feedback": submission.feedback_snapshots.exists() if state == "finished" else False,
        "open_question": open_question(submission),
        # 23 Nov: shortlisted, and the pitch session staff set (or null). Never a made-up date.
        **pitch_fields(submission, lang),
    }


def pitch_fields(submission, lang: str) -> dict:
    from apps.programs.pitch import innovator_fields

    return innovator_fields(submission, lang)


def submission_stages(submission) -> list[dict]:
    """The stage bar on idea cards (R-5a): [{code, name, status: done|current|upcoming|skipped}]."""
    from apps.submissions.timeline import SubmissionTimelineService

    return [
        {"code": stage["code"], "name": stage["name"], "status": stage["status"]}
        for stage in SubmissionTimelineService.build(submission, public=True)["stages"]
    ]


def decided_at(submission):
    """When a finished idea was decided: the current outcome, else the last status change."""
    outcome = submission.outcomes.filter(is_current=True).order_by("-decided_at").first()
    if outcome:
        return outcome.decided_at
    last = submission.status_history.order_by("-created_at").values_list("created_at", flat=True).first()
    return last or submission.updated_at



# 2.1 (23 Nov): the messages on the signed-in home, most urgent first. Real data only.
MESSAGE_ORDER = ("changes_requested", "question", "draft", "shortlisted", "stage_moved", "event")
STAGE_MOVE_WINDOW = timedelta(days=14)
MESSAGES_LIMIT = 6


def home_messages(user, submissions, drafts, lang: str = "en") -> list[dict]:
    """[{type, idea_id, kind, reference, title, at, ...}] in MESSAGE_ORDER, newest first within a type."""
    from apps.programs.challenge_entry import SHORTLIST_STATUSES
    from apps.submissions.innovator_tracking import returned_payload

    out: list[dict] = []
    now = timezone.now()
    base = lambda obj, kind: {"idea_id": str(obj.id), "kind": kind, "reference": obj.reference_number, "title": obj.title}  # noqa: E731
    for sub in submissions:
        state = submission_state(sub)
        if state == "finished":
            continue
        returned = returned_payload(sub, lang) if state == "needs_action" else None
        if returned:
            out.append({
                "type": "changes_requested", **base(sub, "submission"), "at": returned["requested_at"],
                "note": returned["reason"], "officer": returned["requested_by"], "fix_by": returned["fix_by"],
            })
            continue
        question = open_question(sub)
        if question:
            out.append({
                "type": "question", **base(sub, "submission"), "at": _iso(sub.updated_at),
                "officer_first_name": question["officer_first_name"], "excerpt": question["excerpt"], "reply_by": question["reply_by"],
            })
    if drafts:
        draft = drafts[0]
        out.append({
            "type": "draft", **base(draft, "draft"), "at": _iso(draft.updated_at),
            "percent_complete": int((draft.progress_metadata or {}).get("percent_complete") or 0),
        })
    for sub in submissions:
        if sub.current_status in SHORTLIST_STATUSES:
            changed = sub.status_history.filter(to_status=sub.current_status).order_by("-created_at").values_list("created_at", flat=True).first()
            out.append({
                "type": "shortlisted", **base(sub, "submission"), "at": _iso(changed or sub.updated_at),
                "challenge": None if sub.program.is_general_intake else sub.program.title,
            })
    moved = (
        SubmissionStatusHistory.objects.filter(submission__in=[s for s in submissions if s.current_status not in SHORTLIST_STATUSES], created_at__gte=now - STAGE_MOVE_WINDOW)
        .exclude(to_status__in=("returned", "requires_more_information", "draft", "submitted"))
        .select_related("submission")
        .order_by("-created_at")
    )
    seen = set()
    for row in moved:
        if row.submission_id in seen or row.from_status == row.to_status:
            continue
        seen.add(row.submission_id)
        out.append({
            "type": "stage_moved", **base(row.submission, "submission"), "at": _iso(row.created_at),
            "status": row.to_status, "stage": public_status_label(row.to_status),
        })
    programs = {}
    for sub in submissions:
        program = sub.program
        if program.event_date and program.event_date >= now and not program.is_general_intake and submission_state(sub) != "finished":
            programs.setdefault(program.id, (program, sub))
    for program, sub in programs.values():
        out.append({
            "type": "event", **base(sub, "submission"), "at": _iso(program.event_date),
            "challenge": program.title, "event_date": _iso(program.event_date),
        })
    ordered = []
    for name in MESSAGE_ORDER:
        group = [m for m in out if m["type"] == name]
        # Events: soonest first. Everything else: newest first.
        group.sort(key=lambda m: m["at"] or "", reverse=name != "event")
        ordered += group
    return ordered[:MESSAGES_LIMIT]

class InnovatorDashboardSelector:
    @staticmethod
    def open_drafts(user):
        return (
            ApplicationDraft.objects.filter(innovator=user, status=ApplicationDraft.STATUS_DRAFT)
            .select_related("program", "sector")
            .order_by("-updated_at")
        )

    @staticmethod
    def submissions(user):
        return (
            Submission.objects.filter(innovator=user, submitted_at__isnull=False)
            .select_related("program", "sector", "workflow_instance__current_step")
            .order_by("-updated_at")
        )

    @classmethod
    def ideas(cls, user, *, filter_name: str = "all", lang: str = "en") -> dict:
        if filter_name not in FILTERS:
            raise ValidationError({"filter": f"Use one of: {', '.join(FILTERS)}."})
        items = [draft_item(draft, lang) for draft in cls.open_drafts(user)]
        items += [submission_item(submission, lang) for submission in cls.submissions(user)]
        items.sort(key=lambda item: item["last_change"] or "", reverse=True)
        counts = {name: 0 for name in FILTERS}
        counts["all"] = len(items)
        for item in items:
            counts[item["state"]] += 1
        selected = items if filter_name == "all" else [item for item in items if item["state"] == filter_name]
        return {"filter": filter_name, "counts": counts, "results": selected}

    @classmethod
    def summary(cls, user, *, lang: str = "en") -> dict:
        from apps.communications.models import Notification

        submissions = list(cls.submissions(user))
        drafts = list(cls.open_drafts(user))
        active_submission = next((s for s in submissions if submission_state(s) != "finished"), None)
        if active_submission:
            active = submission_item(active_submission, lang)
            active_target = active_submission
        elif drafts:
            active = draft_item(drafts[0], lang)
            active_target = drafts[0]
        else:
            active = None
            active_target = None
        if active is not None:
            # R-5 (d)
            active["unread_messages"] = unread_messages(active_target)
            active["unread_updates"] = unread_updates(user, active_target.id)

        next_action = None
        waiting = [s for s in submissions if submission_state(s) == "needs_action" or open_question(s)]
        if waiting:
            far_future = timezone.now() + timedelta(days=36500)
            waiting.sort(key=lambda s: getattr(getattr(s, "workflow_instance", None), "due_at", None) or far_future)
            item = submission_item(waiting[0], lang)
            next_action = {
                "type": "answer_question",
                "idea_id": item["id"],
                "reference": item["reference"],
                "title": item["title"],
                "detail": item["needs_action_reason"],
                "reply_by": item["reply_by"],
                "open_question": item["open_question"],
            }
        elif drafts:
            draft = draft_item(drafts[0], lang)
            next_action = {
                "type": "finish_draft",
                "idea_id": draft["id"],
                "reference": draft["reference"],
                "title": draft["title"],
                "detail": "Finish and send your idea.",
                "percent_complete": draft["percent_complete"],
                "program": draft["program"],
            }
        else:
            profile = getattr(user, "innovator_profile", None)
            completeness = profile_completeness(profile) if profile else None
            if completeness and completeness["missing_fields"]:
                next_action = {
                    "type": "complete_profile",
                    "detail": "Complete your profile so we can match you with challenges.",
                    "percent_complete": completeness["percent_complete"],
                }

        return {
            "active_idea": active,
            "next_action": next_action,
            "unread_notifications": Notification.objects.filter(recipient=user, is_read=False).count(),
            "messages": home_messages(user, submissions, drafts, lang),
        }

    @classmethod
    def updates(cls, user, *, since: str | None = None) -> dict:
        from apps.communications.models import Notification

        since_at = parse_datetime(since) if since else None
        if since and since_at is None:
            raise ValidationError({"since": "Use an ISO 8601 date and time, for example 2026-11-01T00:00:00Z."})
        if since_at is None:
            since_at = timezone.now() - UPDATES_DEFAULT_WINDOW
        elif timezone.is_naive(since_at):
            since_at = timezone.make_aware(since_at)

        items = [
            {
                "type": "notification",
                "notification_type": item.notification_type,
                "link": None,  # TODO(R-8): notifications get a link in B3.
                "id": str(item.id),
                "title": item.title,
                "body": item.body,
                "is_read": item.is_read,
                "at": _iso(item.created_at),
            }
            for item in Notification.objects.filter(recipient=user, created_at__gt=since_at).order_by("-created_at")[:UPDATES_LIMIT]
        ]
        history = (
            SubmissionStatusHistory.objects.filter(submission__innovator=user, created_at__gt=since_at)
            .select_related("submission")
            .order_by("-created_at")[:UPDATES_LIMIT]
        )
        items += [
            {
                "type": "status_change",
                "notification_type": "status_change",
                "link": {"type": "idea", "id": str(entry.submission_id)},
                "id": str(entry.id),
                "idea_id": str(entry.submission_id),
                "reference": entry.submission.reference_number,
                "title": entry.submission.title,
                "status": public_status_label(entry.to_status),
                "at": _iso(entry.created_at),
            }
            for entry in history
        ]
        items.sort(key=lambda item: item["at"] or "", reverse=True)
        return {"since": _iso(since_at), "results": items[:UPDATES_LIMIT]}

    # Challenges ------------------------------------------------------------

    @staticmethod
    def open_challenges(user):
        from apps.programs.selectors import ProgramSelector

        programs = (
            ProgramSelector.public_programs(user)
            .filter(status=ProgramStatus.PUBLISHED, is_general_intake=False)
            .prefetch_related("sectors")
            .order_by("closing_date")
        )
        return [program for program in programs if program.is_submission_open()]

    @staticmethod
    def open_or_upcoming_challenges(user):
        """Published calls that are open now or open later (R-5 e: "Opens 5 Jan 2027")."""
        from apps.programs.challenge_public import challenge_status
        from apps.programs.selectors import ProgramSelector

        programs = (
            ProgramSelector.public_programs(user)
            .filter(status=ProgramStatus.PUBLISHED, is_general_intake=False)
            .select_related("program_type", "cover")
            .prefetch_related("sectors")
            .order_by("closing_date")
        )
        return [program for program in programs if challenge_status(program) in ("open", "upcoming")]

    @staticmethod
    def _challenge_payload(program, user, lang: str, matched: set) -> dict:
        entry = ProgramAccessService.entry_status(program, user)
        sectors = list(program.sectors.all())
        return {
            "id": str(program.id),
            "title": program.title,
            "slug": program.slug,
            "program_type": program.program_type.code,
            "closes_at": _iso(program.submission_closes_at),
            "sectors": [sector_payload(sector, lang) for sector in sectors],
            "matched_sectors": [sector_payload(sector, lang) for sector in sectors if sector.id in matched],
            "can_enter": entry["can_enter"],
        }

    @classmethod
    def recommended_challenges(cls, user, *, lang: str = "en") -> list[dict]:
        sector_ids = set()
        profile = getattr(user, "innovator_profile", None)
        if profile and profile.sector_id:
            sector_ids.add(profile.sector_id)
        sector_ids |= set(ApplicationDraft.objects.filter(innovator=user, sector__isnull=False).values_list("sector_id", flat=True))
        sector_ids |= set(Submission.objects.filter(innovator=user, sector__isnull=False).values_list("sector_id", flat=True))
        if not sector_ids:
            return []
        from apps.programs.challenge_public import card

        results = []
        for program in cls.open_or_upcoming_challenges(user):
            program_sector_ids = {sector.id for sector in program.sectors.all()}
            matched = program_sector_ids & sector_ids
            if matched:
                # The B5 public card (status, summary, support_headline, opens_at, days_left,
                # window_progress, ...) plus the fields this list always had.
                results.append({**card(program, lang), **cls._challenge_payload(program, user, lang, matched)})
        return results

    # One idea ----------------------------------------------------------------

    @staticmethod
    def idea_for(user, idea_id):
        draft = ApplicationDraft.objects.filter(id=idea_id, innovator=user).select_related("program", "sector").first()
        if draft:
            return draft
        submission = Submission.objects.filter(id=idea_id, innovator=user).select_related("program", "sector").first()
        if submission:
            return submission
        raise NotFound({"code": "idea_not_found", "detail": "Idea not found."})

    @staticmethod
    def idea_answers(idea) -> dict:
        if isinstance(idea, ApplicationDraft):
            return {key: value for key, value in (idea.draft_data or {}).items() if value not in (None, "", [])}
        answers = {}
        for response in idea.responses.select_related("form_field"):
            key = response.form_field.key if response.form_field_id else response.field_key_snapshot
            if key and response.value not in (None, "", [], {}):
                answers[key] = response.value
        return answers

    @staticmethod
    def _copyable_fields(program) -> dict:
        form = getattr(program, "submission_form", None)
        if not form:
            return {}
        return {
            field.key: field
            for field in form.fields.filter(is_active=True).select_related("section").order_by("ordering")
            if field.field_type != SubmissionFormFieldType.FILE
        }

    @classmethod
    def challenge_matches(cls, user, idea_id, *, lang: str = "en") -> dict:
        idea = cls.idea_for(user, idea_id)
        answers = cls.idea_answers(idea)
        if not idea.sector_id:
            return {"idea_id": str(idea.id), "results": [], "detail": "Choose a sector for this idea to see matching challenges."}
        results = []
        for program in cls.open_challenges(user):
            if program.id == idea.program_id:
                continue
            program_sector_ids = {sector.id for sector in program.sectors.all()}
            if idea.sector_id not in program_sector_ids:
                continue
            fields = cls._copyable_fields(program)
            reusable = sorted(key for key in fields if key in answers)
            payload = cls._challenge_payload(program, user, lang, {idea.sector_id})
            payload["answers_reused"] = len(reusable)
            payload["questions_left"] = len(fields) - len(reusable)
            results.append(payload)
        return {"idea_id": str(idea.id), "results": results}

    @classmethod
    @transaction.atomic
    def link_challenge(cls, user, idea_id, program_id) -> dict:
        idea = cls.idea_for(user, idea_id)
        program = next((p for p in cls.open_challenges(user) if str(p.id) == str(program_id)), None)
        if program is None:
            raise NotFound({"code": "challenge_not_found", "detail": "This challenge is not open."})
        if program.id == idea.program_id:
            raise ValidationError({"code": "same_programme", "detail": "This idea is already in that programme."})
        ProgramAccessService.assert_can_enter(program, user)

        fields = cls._copyable_fields(program)
        answers = cls.idea_answers(idea)
        existing = ApplicationDraft.objects.filter(innovator=user, program=program, status=ApplicationDraft.STATUS_DRAFT).first()
        draft_data = dict(existing.draft_data or {}) if existing else {}
        copied = []
        for key in fields:
            if key in answers and draft_data.get(key) in (None, "", []):
                draft_data[key] = answers[key]
                copied.append(key)

        metadata = dict(existing.metadata or {}) if existing else {}
        metadata["linked_from"] = {"kind": "draft" if isinstance(idea, ApplicationDraft) else "submission", "id": str(idea.id)}
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=user,
            submission_type=submission_type_for(program),
            title=existing.title if existing else idea.title,
            draft_data=draft_data,
            draft=existing,
            current_section_code=existing.current_section_code if existing else "",
            metadata=metadata,
            sector=idea.sector,
        )
        values = ApplicationDraftService._effective_values(draft, draft.draft_data)
        unanswered = []
        for key, field in fields.items():
            state = ApplicationDraftService._field_state(field, values)
            if not state["visible"]:
                continue
            if values.get(key) in (None, "", []):
                unanswered.append(
                    {
                        "key": key,
                        "label": field.label,
                        "section_code": field.section.code if field.section_id else "",
                        "required": bool(state["required"]),
                    }
                )
        return {"draft": draft, "copied_fields": copied, "unanswered_questions": unanswered}

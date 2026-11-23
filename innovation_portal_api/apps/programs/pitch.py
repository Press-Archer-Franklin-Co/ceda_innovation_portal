"""Shortlisting news and pitch session details for innovators (23 Nov demo).

Staff set a pitch session on a challenge stage (Challenge builder, stage settings) or on one idea. An innovator sees
the session for their own shortlisted idea: the idea's own session first, then the session of the stage the idea is
in, then the challenge's "shortlisted only" stage. With none set the API answers null; nothing is ever made up.

Notifications go in the portal, by email (through the active Email connection), and on WhatsApp only when the idea
came in on WhatsApp.
"""

from __future__ import annotations

from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import SubmissionStatus

GABORONE = ZoneInfo("Africa/Gaborone")
SHORTLISTED = (SubmissionStatus.SHORTLISTED, SubmissionStatus.FINALIST)
FORMATS = ("in_person", "online")


def _text(value, *, limit: int, required: bool, path: str, errors: dict) -> dict:
    value = value if isinstance(value, dict) else {"en": value} if isinstance(value, str) else {}
    out = {lang: str(value.get(lang) or "").strip()[:limit] for lang in ("en", "tn")}
    if required and not out["en"]:
        errors[path] = "Write it in English (Setswana too if you can)."
    return out


def clean(data: dict) -> dict:
    """Checks a pitch session and returns it in the stored shape. Raises ValidationError."""
    if not isinstance(data, dict):
        raise ValidationError({"pitch": "Send the pitch session as an object."})
    errors: dict = {}
    raw = data.get("starts_at")
    starts = parse_datetime(str(raw)) if raw else None
    if starts is None:
        errors["starts_at"] = "Give the date and time, for example 2026-11-28T09:00:00+02:00."
    elif timezone.is_naive(starts):
        starts = timezone.make_aware(starts, GABORONE)  # a time without a zone is Gaborone time
    fmt = data.get("format") or "in_person"
    if fmt not in FORMATS:
        errors["format"] = "Use in_person or online."
    duration = data.get("duration_minutes")
    if duration not in (None, ""):
        try:
            duration = int(duration)
            if not 5 <= duration <= 600:
                raise ValueError
        except (TypeError, ValueError):
            errors["duration_minutes"] = "Use a number of minutes from 5 to 600."
    else:
        duration = None
    place = _text(data.get("place"), limit=300, required=fmt == "in_person", path="place", errors=errors)
    link = str(data.get("meeting_link") or "").strip()[:500]
    if fmt == "online" and not link.startswith("https://"):
        errors["meeting_link"] = "Give the meeting link, starting with https://."
    instructions = _text(data.get("instructions"), limit=1500, required=False, path="instructions", errors=errors)
    if errors:
        raise ValidationError({"pitch": errors})
    return {
        "starts_at": starts.astimezone(ZoneInfo("UTC")),
        "duration_minutes": duration,
        "format": fmt,
        "place": place if fmt == "in_person" else {"en": "", "tn": ""},
        "meeting_link": link if fmt == "online" else "",
        "instructions": instructions,
    }


def _pick(text: dict, lang: str) -> str:
    text = text or {}
    return (text.get(lang) or "").strip() or text.get("en", "")


def payload(session, lang: str = "en", *, staff: bool = False) -> dict | None:
    """The pitch session as the screens show it. staff: the texts in both languages, for editing."""
    if session is None:
        return None
    local = session.starts_at.astimezone(GABORONE)
    data = {
        "starts_at": session.starts_at.astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z"),
        "starts_at_local": local.isoformat(),
        "timezone": "Africa/Gaborone",
        "date": local.date().isoformat(),
        "time": local.strftime("%H:%M"),
        "duration_minutes": session.duration_minutes,
        "format": session.format,
        "place": _pick(session.place, lang),
        "meeting_link": session.meeting_link,
        "instructions": _pick(session.instructions, lang),
        "set_for": "idea" if session.submission_id else "stage",
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }
    if staff:
        data["place"], data["instructions"] = session.place, session.instructions
    return data


def is_shortlisted(submission) -> bool:
    if submission.current_status in SHORTLISTED:
        return True
    return submission.outcomes.filter(is_current=True, outcome_type__in=("shortlisted", "finalist")).exists()


def session_for(submission):
    """The pitch session this idea's person should see, or None."""
    from apps.programs.models import PitchSession

    own = PitchSession.objects.filter(submission=submission).first()
    if own is not None:
        return own
    if not is_shortlisted(submission):
        return None
    stages = PitchSession.objects.filter(program_id=submission.program_id, stage__isnull=False).select_related("stage").order_by("starts_at", "id")
    return _stage_session(list(stages), _current_step_code(submission))


def _current_step_code(submission) -> str | None:
    instance = getattr(submission, "workflow_instance", None)
    step = getattr(instance, "current_step", None) if instance else None
    return step.code if step is not None else None


def _stage_session(stages: list, step_code: str | None):
    """The stage session a shortlisted idea sees. ``stages`` is sorted by start time, each with its stage loaded."""
    if step_code is not None:
        current = next((session for session in stages if session.stage.code == step_code), None)
        if current is not None:
            return current
    return next((session for session in stages if session.stage.takes_part == "shortlisted"), None)


def innovator_fields(submission, lang: str = "en") -> dict:
    """What the innovator API adds to an idea: shortlisted, and the pitch session or null."""
    shortlisted = is_shortlisted(submission)
    # session_for shows a stage's session only to shortlisted ideas; an idea's own session is meant for that person.
    return {"shortlisted": shortlisted, "pitch_session": payload(session_for(submission), lang)}


# Pitch schedule (staff, R-84) ------------------------------------------------------------------------------------


SCHEDULE_ORDERINGS = ("name", "-name", "starts_at", "-starts_at")
SCHEDULE_MAX_PAGE = 100


def _person(submission) -> dict:
    """A display name only: never an email or a phone number."""
    user = submission.innovator
    first = (user.first_name or "").strip() if user else ""
    if submission.team_id:
        name = submission.team.name
    elif user:
        name = user.full_name
    else:
        name = (submission.guest_name or "").strip()
    return {"name": name, "first_name": first or (name.split()[0] if name and not submission.team_id else "")}


def _whole(value, default: int, name: str) -> int:
    try:
        number = int(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        raise ValidationError({name: "Use a whole number."}) from None
    if number < 1:
        raise ValidationError({name: "Use a whole number from 1."})
    return number


def schedule(program, params) -> dict:
    """GET /api/programs/<id>/pitch-schedule/: every shortlisted entry with the session its person sees."""
    from django.db.models import Exists, OuterRef, Q

    from apps.programs.models import PitchSession
    from apps.submissions.models import Submission, SubmissionOutcome

    ordering = params.get("ordering") or "name"
    if ordering not in SCHEDULE_ORDERINGS:
        raise ValidationError({"ordering": f"Use one of: {', '.join(SCHEDULE_ORDERINGS)}."})
    page = _whole(params.get("page"), 1, "page")
    size = min(_whole(params.get("page_size"), 25, "page_size"), SCHEDULE_MAX_PAGE)
    not_set_only = str(params.get("not_set") or "").lower() in ("true", "1", "yes")
    search = (params.get("search") or "").strip().casefold()

    # The same rule as is_shortlisted, in one query.
    outcome = SubmissionOutcome.objects.filter(submission=OuterRef("pk"), is_current=True, outcome_type__in=("shortlisted", "finalist"))
    entries = (
        Submission.objects.filter(program=program)
        .filter(Q(current_status__in=SHORTLISTED) | Exists(outcome))
        .select_related("innovator", "team", "workflow_instance__current_step")
    )
    sessions = list(PitchSession.objects.filter(program=program).select_related("stage").order_by("starts_at", "id"))
    own = {session.submission_id: session for session in sessions if session.submission_id}
    stages = [session for session in sessions if session.stage_id]
    stage_wide = next((session for session in stages if session.stage.takes_part == "shortlisted"), stages[0] if stages else None)

    rows = []
    for entry in entries:
        mine = own.get(entry.pk)
        shown = mine or _stage_session(stages, _current_step_code(entry))
        rows.append((entry, _person(entry), mine, shown))
    not_set_count = sum(1 for row in rows if row[3] is None)
    if search:
        rows = [row for row in rows if search in row[1]["name"].casefold() or search in (row[0].title or "").casefold() or search in (row[0].reference_number or "").casefold()]
    if not_set_only:
        rows = [row for row in rows if row[3] is None]

    rows.sort(key=lambda row: (row[1]["name"].casefold(), row[0].reference_number or ""), reverse=ordering == "-name")
    if ordering.endswith("starts_at"):
        # Stable on top of the name order. Entries with no time always come last.
        rows.sort(key=lambda row: row[3].starts_at.timestamp() if row[3] else 0, reverse=ordering.startswith("-"))
        rows.sort(key=lambda row: row[3] is None)
    start = (page - 1) * size
    return {
        "count": len(rows),
        "not_set_count": not_set_count,
        "page": page,
        "page_size": size,
        "stage_session": payload(stage_wide, staff=True),
        "results": [
            {
                "submission_id": str(entry.pk),
                "reference": entry.reference_number,
                "title": entry.title,
                "innovator": person,
                "own": payload(mine, staff=True),
                "shown": payload(shown, staff=True),
            }
            for entry, person, mine, shown in rows[start : start + size]
        ],
    }


# Saving (staff) --------------------------------------------------------------------------------------------------


def _audit(actor, action, program, before, after, **metadata):
    AuditService.log_action(actor=actor, action_type=action, target=program, before_state={"pitch": before}, after_state={"pitch": after}, metadata=metadata)


@transaction.atomic
def save_for_stage(program, stage, data, *, actor):
    """Sets (data) or clears (None) the pitch session of one challenge stage."""
    from apps.programs.models import PitchSession

    session = PitchSession.objects.select_for_update().filter(stage=stage).first()
    before = payload(session, staff=True)
    if data is None:
        if session is not None:
            session.delete()
            _audit(actor, "pitch_session_cleared", program, before, None, stage=stage.code)
        return None
    values = clean(data)
    session = session or PitchSession(program=program, stage=stage)
    for name, value in values.items():
        setattr(session, name, value)
    session.updated_by = actor
    session.save()
    after = payload(session, staff=True)
    _audit(actor, "pitch_session_set", program, before, after, stage=stage.code)
    if _changed(before, after):
        transaction.on_commit(lambda: notify_session(session, changed=before is not None, actor=actor))
    return session


@transaction.atomic
def save_for_idea(submission, data, *, actor):
    """Sets (data) or clears (None) one idea's own pitch session."""
    from apps.programs.models import PitchSession

    session = PitchSession.objects.select_for_update().filter(submission=submission).first()
    before = payload(session, staff=True)
    if data is None:
        if session is not None:
            session.delete()
            _audit(actor, "pitch_session_cleared", submission.program, before, None, submission=str(submission.id))
        return None
    values = clean(data)
    session = session or PitchSession(program=submission.program, submission=submission)
    for name, value in values.items():
        setattr(session, name, value)
    session.updated_by = actor
    session.save()
    after = payload(session, staff=True)
    _audit(actor, "pitch_session_set", submission.program, before, after, submission=str(submission.id))
    if _changed(before, after):
        transaction.on_commit(lambda: notify_session(session, changed=before is not None, actor=actor))
    return session


def _changed(before, after) -> bool:
    keep = ("starts_at", "duration_minutes", "format", "place", "meeting_link", "instructions")
    return before is None or any(before.get(name) != after.get(name) for name in keep)


# Notifications ---------------------------------------------------------------------------------------------------


def _deliver(submission, *, notification_type: str, title: dict, body: dict, actor=None) -> dict:
    """In the portal and by email for an account; WhatsApp only when the idea came in on WhatsApp."""
    from apps.communications.messaging import _link
    from apps.communications.services import CommunicationService
    from apps.core.constants import CommunicationChannel, IntakeChannel
    from apps.notifications.services import NotificationService

    user = submission.innovator
    lang = "tn" if user is not None and user.preferred_language == "tn" else "en"
    subject, text = _pick(title, lang), _pick(body, lang)
    sent = {"web": 0, "email": 0, "whatsapp": 0}
    notification = None
    if user is not None and user.is_active:
        notification = NotificationService.notify(user=user, notification_type=notification_type, title=subject, message=text, send_email=True)
        _link(notification, "idea", submission.id)
        sent["web"] = 1
        sent["email"] = int(bool(user.email))
    phone = (user.phone_number if user is not None else "") or submission.guest_phone
    if submission.channel == IntakeChannel.WHATSAPP and phone:
        log = CommunicationService.log_communication(recipient=user, channel=CommunicationChannel.WHATSAPP, body=f"{subject}\n{text}", subject=subject, submission=submission, notification=notification, sent_by=actor)
        log.to_address = phone
        log.save(update_fields=["to_address"])
        CommunicationService._dispatch_or_enqueue(log)
        sent["whatsapp"] = 1
    return sent


def notify_shortlisted(submission, *, actor=None) -> dict:
    title = {"en": "Your idea is shortlisted", "tn": "Kakanyo ya gago e tlhophilwe"}
    body = {
        "en": f"Good news: {submission.title} ({submission.reference_number}) is on the shortlist. We will send your pitch session details here.",
        "tn": f"Dikgang tse di monate: {submission.title} ({submission.reference_number}) e mo lenaneong la ba ba tlhophilweng. Re tla go romelela dintlha tsa go tlhagisa fano.",
    }
    session = session_for(submission)
    if session is not None:
        details = payload(session)
        body = {
            "en": f"Good news: {submission.title} ({submission.reference_number}) is on the shortlist. Your pitch session is on {details['date']} at {details['time']} (Gaborone time).",
            "tn": f"Dikgang tse di monate: {submission.title} ({submission.reference_number}) e mo lenaneong la ba ba tlhophilweng. Go tlhagisa ga gago go ka {details['date']} ka {details['time']} (nako ya Gaborone).",
        }
    sent = _deliver(submission, notification_type="idea_shortlisted", title=title, body=body, actor=actor)
    AuditService.log_action(actor=actor, action_type="shortlist_notification_sent", target=submission, metadata={"sent": sent})
    return sent


def notify_session(session, *, changed: bool, actor=None) -> int:
    """Tells everyone the session applies to (shortlisted ideas, or the one idea) that it was set or changed."""
    from apps.submissions.models import Submission

    if session.submission_id:
        ideas = [session.submission]
    else:
        candidates = Submission.objects.filter(program_id=session.program_id, submitted_at__isnull=False).select_related("innovator", "workflow_instance__current_step")
        ideas = [idea for idea in candidates if session_for(idea) == session]
    details = payload(session)
    title = {"en": "Pitch session changed", "tn": "Go tlhagisa go fetotswe"} if changed else {"en": "Your pitch session", "tn": "Go tlhagisa ga gago"}
    where = details["meeting_link"] if session.format == "online" else _pick(session.place, "en")
    where_tn = details["meeting_link"] if session.format == "online" else _pick(session.place, "tn")
    for idea in ideas:
        body = {
            "en": f"{idea.title}: {details['date']} at {details['time']} (Gaborone time), {'online' if session.format == 'online' else 'in person'}. {where}",
            "tn": f"{idea.title}: {details['date']} ka {details['time']} (nako ya Gaborone), {'mo inthaneteng' if session.format == 'online' else 'ka namana'}. {where_tn}",
        }
        _deliver(idea, notification_type="pitch_session", title=title, body=body, actor=actor)
    return len(ideas)


def on_status_change(submission, previous_status: str, actor=None) -> None:
    """Called when an idea's status changes: the first move into the shortlist sends the news once."""
    if submission.current_status not in SHORTLISTED or previous_status in SHORTLISTED:
        return
    if submission.innovator_id is None and not submission.guest_phone:
        return
    transaction.on_commit(lambda: notify_shortlisted(submission, actor=actor))

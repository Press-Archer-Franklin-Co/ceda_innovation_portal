"""What the action nodes do: save an idea draft, look things up, subscribe.

Every action returns text to show and never raises: a person on a USSD screen must
always get a polite answer, even when something behind it fails.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from apps.core.constants import IntakeChannel, ProgramStatus
from apps.core.phone import mask_phone

logger = logging.getLogger(__name__)

SAVE_FAILED = {"en": "We could not save your idea right now. Please try again later.", "tn": "Ga re a kgona go boloka kakanyo ya gago jaanong. Tsweetswee leka gape moragonyana."}  # TODO tn-review
SUBSCRIBE_FAILED = {"en": "We could not sign you up right now. Please try again later.", "tn": "Ga re a kgona go go kwadisa jaanong. Tsweetswee leka gape moragonyana."}  # TODO tn-review
NOTHING_FOUND = {"en": "Nothing found.", "tn": "Ga go a bonwa sepe."}  # TODO tn-review


def pick(text: dict | str | None, lang: str) -> str:
    if isinstance(text, str):
        return text
    text = text or {}
    return text.get(lang) or text.get("en") or ""


def find_user_by_phone(phone: str):
    if not phone:
        return None
    from apps.accounts.models import User

    return User.objects.filter(phone_number=phone, is_active=True).order_by("-phone_verified", "-last_login", "created_at").first()


# --------------------------------------------------------------------------------------
# Save to an idea draft
# --------------------------------------------------------------------------------------


def _program(program_id):
    from apps.programs.general_intake import GeneralIntakeService
    from apps.programs.models import Program

    if program_id:
        program = Program.objects.filter(id=program_id, status=ProgramStatus.PUBLISHED).select_related("program_type").first()
        if program is not None:
            return program
    return GeneralIntakeService.program()


def save_draft(*, settings: dict, variables: dict, phone: str, user, channel: str, session_id: str, draft_id: str | None, simulation: bool):
    """Create or update the idea draft for this phone. Returns (draft or None, user or None, error)."""
    from apps.accounts.models import LoginCode
    from apps.accounts.otp_services import OTPService
    from apps.audit.services import AuditService
    from apps.submissions.draft_services import ApplicationDraftService
    from apps.submissions.intake import submission_type_for
    from apps.submissions.models import ApplicationDraft

    try:
        with transaction.atomic():
            program = _program(settings.get("program_id"))
            title = str(variables.get(settings.get("title_variable") or "title") or "").strip()[:255] or "Idea started on the phone"
            field_values = {
                field_key: variables.get(variable)
                for field_key, variable in (settings.get("fields") or {}).items()
                if variables.get(variable) not in (None, "")
            }
            if user is None and phone and settings.get("create_account", True):
                name = str(variables.get(settings.get("name_variable") or "name") or "").strip()
                first, _, last = name.partition(" ")
                user, _ = OTPService.user_for_verified_target(
                    target_type=LoginCode.TargetType.PHONE, target=phone, source=f"{channel}_journey", first_name=first[:150], last_name=last[:150]
                )
            draft = ApplicationDraft.objects.filter(id=draft_id, status=ApplicationDraft.STATUS_DRAFT).first() if draft_id else None
            if draft is None and user is not None and not program.is_general_intake:
                draft = ApplicationDraft.objects.filter(innovator=user, program=program, status=ApplicationDraft.STATUS_DRAFT).first()
            created = draft is None
            if created:
                draft = ApplicationDraft(
                    reference_number=ApplicationDraftService.generate_reference_number(program),
                    program=program,
                    innovator=user,
                    submission_type=submission_type_for(program),
                    is_general_idea=bool(program.is_general_intake),
                    channel=IntakeChannel.USSD if channel == "ussd" else IntakeChannel.WHATSAPP,
                    title=title,
                    draft_data={},
                    metadata={"journey_session": session_id, "simulation": simulation},
                )
                if user is None:
                    # The operator vouches for the number the request came from.
                    draft.guest_phone = phone
                    draft.guest_phone_verified_at = timezone.now()
            draft.title = title or draft.title
            draft.draft_data = {**(draft.draft_data or {}), **field_values}
            draft.progress_metadata = ApplicationDraftService.build_progress_metadata(draft, draft.draft_data, current_section_code="")
            draft.save()
            AuditService.log_raw_action(
                actor=user,
                action_type="channel_draft_saved",
                target_model="ApplicationDraft",
                target_id=str(draft.id),
                metadata={"channel": channel, "created": created, "phone": mask_phone(phone), "simulation": simulation},
            )
            return draft, user, ""
    except Exception as exc:
        logger.exception("Journey could not save a draft for %s", mask_phone(phone))
        return None, user, exc.__class__.__name__


# --------------------------------------------------------------------------------------
# Look up
# --------------------------------------------------------------------------------------


def _open_challenges(lang: str, channel: str) -> str:
    from apps.programs.selectors import ProgramSelector

    now = timezone.now()
    programs = [
        p
        for p in ProgramSelector.public_programs(None).filter(status=ProgramStatus.PUBLISHED, is_general_intake=False).order_by("closes_at", "closing_date", "title")[:20]
        if p.is_submission_open()
    ][: 3 if channel == "ussd" else 5]
    if not programs:
        return {"en": "There are no open challenges right now.", "tn": "Ga go na dikgaisano tse di butsweng jaanong."}.get(lang) or ""  # TODO tn-review
    lines = []
    for index, program in enumerate(programs, start=1):
        closes = program.closes_at or program.closing_date
        suffix = f" (closes {timezone.localtime(closes):%d %b})" if closes and closes > now else ""
        if lang == "tn" and suffix:
            suffix = f" (e tswala {timezone.localtime(closes):%d %b})"  # TODO tn-review
        lines.append(f"{index}. {program.title[: 28 if channel == 'ussd' else 60]}{suffix}")
    return "\n".join(lines)


def _idea_status(reference: str, phone: str, user, lang: str) -> str:
    from apps.submissions.models import ApplicationDraft, Submission
    from apps.submissions.status_labels import public_status_label

    reference = (reference or "").strip().upper()
    if reference == "0":  # "0 for my latest idea"
        reference = ""
    owner = {"innovator": user} if user else {"guest_phone": phone}
    if reference:
        submission = Submission.objects.filter(reference_number__iexact=reference, **owner).first()
        draft = None if submission else ApplicationDraft.objects.filter(reference_number__iexact=reference, status=ApplicationDraft.STATUS_DRAFT, **owner).first()
    else:
        submission = Submission.objects.filter(**owner).order_by("-created_at").first() if (user or phone) else None
        draft = None if submission else (ApplicationDraft.objects.filter(status=ApplicationDraft.STATUS_DRAFT, **owner).order_by("-updated_at").first() if (user or phone) else None)
    if submission is not None:
        label = public_status_label(submission.current_status)
        return {"en": f"{submission.reference_number}: {label}", "tn": f"{submission.reference_number}: {label}"}.get(lang) or ""
    if draft is not None:
        return {
            "en": f"{draft.reference_number}: not sent yet. Finish it on the website.",
            "tn": f"{draft.reference_number}: ga e ise e romelwe. E fetse mo webosaeteng.",  # TODO tn-review
        }.get(lang) or ""
    return {"en": "We could not find an idea for this number.", "tn": "Ga re a bona kakanyo ya nomoro e."}.get(lang) or ""  # TODO tn-review


def _upcoming_events(lang: str) -> str:
    from apps.events.models import Event

    events = Event.objects.filter(starts_at__gte=timezone.now(), program__is_public=True).order_by("starts_at")[:3]
    if not events:
        return {"en": "No events are planned yet.", "tn": "Ga go na ditiragalo tse di rulagantsweng."}.get(lang) or ""  # TODO tn-review
    return "\n".join(f"{timezone.localtime(e.starts_at):%d %b}: {e.title[:40]}" for e in events)


def _faq(question: str, lang: str) -> str:
    from apps.support.models import FAQ

    words = [w for w in (question or "").lower().split() if len(w) > 3]
    queryset = FAQ.objects.filter(is_public=True)
    best, best_score = None, 0
    for faq in queryset[:200]:
        haystack = f"{faq.question} {(faq.translations or {}).get('tn', {}).get('question', '')}".lower()
        score = sum(1 for w in words if w in haystack) + (1 if "whatsapp_bot" in (faq.placements or []) else 0)
        if score > best_score:
            best, best_score = faq, score
    if best is None or (words and best_score <= 1 and not any(w in best.question.lower() for w in words)):
        return {"en": "We do not have an answer for that yet. Choose Talk to us to ask a person.", "tn": "Ga re na karabo ya seo. Tlhopha Bua le rona go botsa motho."}.get(lang) or ""  # TODO tn-review
    if lang == "tn":
        return ((best.translations or {}).get("tn") or {}).get("answer") or best.answer
    return best.answer


def lookup(*, settings: dict, variables: dict, phone: str, user, lang: str, channel: str = "whatsapp") -> str:
    kind = settings.get("lookup") or ""
    try:
        if kind == "open_challenges":
            return _open_challenges(lang, channel)
        if kind == "idea_status":
            return _idea_status(str(variables.get(settings.get("input_variable") or "") or ""), phone, user, lang)
        if kind == "upcoming_events":
            return _upcoming_events(lang)
        if kind == "faq":
            return _faq(str(variables.get(settings.get("input_variable") or "") or ""), lang)
    except Exception:
        logger.exception("Journey look up %s failed", kind)
    return pick(NOTHING_FOUND, lang)


LOOKUPS = (
    ("open_challenges", "Open challenges"),
    ("idea_status", "My idea's status (by reference number, or the latest for this phone)"),
    ("upcoming_events", "Upcoming events"),
    ("faq", "An FAQ answer"),
)


# --------------------------------------------------------------------------------------
# Subscribe
# --------------------------------------------------------------------------------------


def subscribe(*, settings: dict, phone: str, lang: str) -> bool:
    from apps.content.part2_services import SubscriptionService

    if not phone:
        return False
    try:
        SubscriptionService.subscribe(phone=phone, topics=settings.get("topics") or None, language=lang)
        return True
    except Exception:
        logger.exception("Journey could not subscribe %s", mask_phone(phone))
        return False

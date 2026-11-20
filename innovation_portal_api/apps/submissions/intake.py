"""Idea intake for visitors and innovators (screens 1.1, 1.2, 1.5 and 2.3).

Guest flow, all through the API:
1. POST /api/drafts/quick-start/ creates a draft with no innovator and returns a
   resume token, which the browser sends back in the X-Draft-Token header.
2. The visitor proves their phone: POST /api/auth/otp/request/ sends a code, then
   either
   - signs in with it (POST /api/auth/otp/verify/) and claims the draft
     (POST /api/drafts/{id}/claim/), or
   - confirms it on the draft without signing in (POST /api/drafts/{id}/verify-phone/).
3. POST /api/drafts/{id}/submit/ with consent=true. A guest who only verified the
   phone either gets an account made from that phone (create_account=true, the
   default) or submits as a guest (create_account=false), keeping only name and phone.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.audit.services import AuditService
from apps.core.i18n import get_text
from apps.core.constants import CommunicationChannel, CommunicationStatus, ProgramStatus, ProgramTypeCode, SubmissionType
from apps.core.phone import mask_phone
from apps.programs.general_intake import GeneralIntakeService
from apps.submissions.draft_services import ApplicationDraftService
from apps.submissions.models import ApplicationDraft, Submission

DRAFT_TOKEN_HEADER = "X-Draft-Token"
_TOKEN_SALT = "apps.submissions.draft-resume"

SUBMISSION_TYPE_BY_PROGRAM_TYPE = {
    ProgramTypeCode.IDEA: SubmissionType.IDEA,
    ProgramTypeCode.CHALLENGE_CALL: SubmissionType.IDEA,
    ProgramTypeCode.HACKATHON: SubmissionType.HACKATHON_APPLICATION,
    ProgramTypeCode.INNOVATION_CHALLENGE: SubmissionType.INNOVATION_CHALLENGE,
}


def submission_type_for(program) -> str:
    return SUBMISSION_TYPE_BY_PROGRAM_TYPE.get(program.program_type.code, SubmissionType.IDEA)


class DraftTokenService:
    """Signed, expiring resume tokens for guest drafts."""

    @staticmethod
    def max_age() -> int:
        return int(getattr(settings, "DRAFT_RESUME_TOKEN_MAX_AGE", 30 * 24 * 3600))

    @staticmethod
    def issue(draft: ApplicationDraft) -> str:
        return signing.dumps({"draft": str(draft.id)}, salt=_TOKEN_SALT)

    @classmethod
    def draft_id(cls, token: str | None) -> str | None:
        if not token:
            return None
        try:
            payload = signing.loads(token, salt=_TOKEN_SALT, max_age=cls.max_age())
        except signing.BadSignature:  # includes SignatureExpired
            return None
        return payload.get("draft") if isinstance(payload, dict) else None

    @classmethod
    def guest_draft(cls, token: str | None, draft_id) -> ApplicationDraft | None:
        """The open guest draft `draft_id` if `token` was issued for it, else None.

        A token stops working once the draft is claimed by an account or submitted.
        """
        if not token or cls.draft_id(token) != str(draft_id):
            return None
        return (
            ApplicationDraft.objects.filter(id=draft_id, innovator__isnull=True, status=ApplicationDraft.STATUS_DRAFT)
            .select_related("program__program_type", "sector")
            .first()
        )

    @staticmethod
    def token_from_request(request) -> str | None:
        return request.headers.get(DRAFT_TOKEN_HEADER) or None


class QuickStartService:
    @staticmethod
    def _program_for(program_id):
        if not program_id:
            return GeneralIntakeService.program()
        from apps.programs.selectors import ProgramSelector

        program = ProgramSelector.public_programs(None).filter(id=program_id, status=ProgramStatus.PUBLISHED).select_related("program_type").first()
        if program is None:
            raise ValidationError({"program_id": {"code": "program_not_found", "detail": "This programme is not open for ideas."}})
        if not program.is_submission_open():
            raise ValidationError({"program_id": {"code": "program_closed", "detail": "This programme is not open for ideas right now."}})
        return program

    @classmethod
    @transaction.atomic
    def start(cls, *, title: str, sector, program_id=None, ip_address: str | None = None) -> tuple[ApplicationDraft, str]:
        program = cls._program_for(program_id)
        draft = ApplicationDraft(
            reference_number=ApplicationDraftService.generate_reference_number(program),
            program=program,
            innovator=None,
            submission_type=submission_type_for(program),
            title=title,
            sector=sector,
            is_general_idea=bool(program.is_general_intake),
            draft_data={},
            metadata={"quick_start": True},
        )
        draft.progress_metadata = ApplicationDraftService.build_progress_metadata(draft, {}, current_section_code="")
        draft.save()
        AuditService.log_raw_action(
            actor=None,
            action_type="guest_draft_started",
            target_model="ApplicationDraft",
            target_id=str(draft.id),
            metadata={"program_id": str(program.id), "ip": ip_address or ""},
        )
        return draft, DraftTokenService.issue(draft)


class GuestDraftService:
    EDITABLE_FIELDS = ("title", "sector", "draft_data", "current_section_code")

    @staticmethod
    @transaction.atomic
    def update(*, draft: ApplicationDraft, data: dict) -> ApplicationDraft:
        if "program" in data and data["program"] is not None and data["program"].id != draft.program_id:
            raise ValidationError({"program": "Sign in to move this idea to another programme."})
        if "team" in data and data["team"] is not None:
            raise ValidationError({"team": "Sign in to add a team."})
        for name in GuestDraftService.EDITABLE_FIELDS:
            if name in data:
                setattr(draft, name, data[name] if data[name] is not None or name == "sector" else getattr(draft, name))
        draft.draft_data = draft.draft_data or {}
        draft.version += 1
        draft.progress_metadata = ApplicationDraftService.build_progress_metadata(
            draft, draft.draft_data, current_section_code=draft.current_section_code
        )
        draft.save()
        return draft

    @staticmethod
    @transaction.atomic
    def verify_phone(*, draft: ApplicationDraft, phone: str, code: str) -> ApplicationDraft:
        """Mark the guest's phone as proved with a code from POST /api/auth/otp/request/. No account is made."""
        from apps.accounts.models import LoginCode
        from apps.accounts.otp_services import OTPService

        OTPService.check_code_or_raise(target_type=LoginCode.TargetType.PHONE, target=phone, code=code)
        draft.guest_phone = phone
        draft.guest_phone_verified_at = timezone.now()
        draft.save(update_fields=["guest_phone", "guest_phone_verified_at", "updated_at"])
        AuditService.log_action(actor=None, action_type="guest_draft_phone_verified", target=draft, metadata={"phone": mask_phone(phone)})
        return draft


class DraftClaimService:
    @staticmethod
    def _assert_no_other_open_draft(*, user, draft: ApplicationDraft):
        if draft.is_general_idea:
            return
        other = ApplicationDraft.objects.filter(innovator=user, program=draft.program, status=ApplicationDraft.STATUS_DRAFT).exclude(id=draft.id).first()
        if other:
            raise ValidationError(
                {"code": "draft_exists", "detail": "You already have an unfinished idea for this programme.", "draft_id": str(other.id)}
            )

    @classmethod
    @transaction.atomic
    def claim(cls, *, draft: ApplicationDraft, user) -> ApplicationDraft:
        cls._assert_no_other_open_draft(user=user, draft=draft)
        draft.innovator = user
        draft.save(update_fields=["innovator", "updated_at"])
        ApplicationDraftService._sync_shared_profile_fields(innovator=user, draft_data=draft.draft_data)
        AuditService.log_action(actor=user, action_type="guest_draft_claimed", target=draft, metadata={"program_id": str(draft.program_id)})
        return draft


class DraftStepService:
    @staticmethod
    @transaction.atomic
    def save_step(*, draft: ApplicationDraft, section_code: str, answers: dict, actor=None) -> dict:
        form = getattr(draft.program, "submission_form", None)
        section = form.sections.filter(code=section_code, is_active=True).first() if form else None
        if section is None:
            raise NotFound({"code": "step_not_found", "detail": "This step is not part of the form."})
        if not isinstance(answers, dict):
            raise ValidationError({"answers": "Send the answers as an object of field key to value."})

        section_keys = set(section.fields.filter(is_active=True).values_list("key", flat=True))
        unknown = sorted(key for key in answers if key not in section_keys)
        errors = {key: ["This question is not part of this step."] for key in unknown}

        draft_data = dict(draft.draft_data or {})
        for key, value in answers.items():
            if key in section_keys:
                draft_data[key] = value
        errors.update(ApplicationDraftService.validate_section(draft, section, draft_data))

        draft.draft_data = draft_data
        draft.current_section_code = section.code
        draft.version += 1
        draft.progress_metadata = ApplicationDraftService.build_progress_metadata(draft, draft_data, current_section_code=section.code)
        draft.save()
        if draft.innovator_id:
            ApplicationDraftService._sync_shared_profile_fields(innovator=draft.innovator, draft_data=draft_data)
        AuditService.log_action(
            actor=actor,
            action_type="draft_step_saved",
            target=draft,
            metadata={"section_code": section.code, "error_fields": sorted(errors)},
        )
        progress = draft.progress_metadata or {}
        return {
            "saved_at": draft.updated_at.isoformat(),
            "step_status": progress.get("step_status", {}),
            "percent_complete": progress.get("percent_complete", 0),
            "errors": errors,
        }


@dataclass
class SubmitOutcome:
    submission: Submission
    account_created: bool = False
    account_user: object = None
    copy_sent_to: dict | None = None
    next_steps: list = field(default_factory=list)


def sector_payload(sector, lang: str = "en") -> dict | None:
    if sector is None:
        return None
    return {"id": str(sector.id), "slug": sector.slug, "name": get_text(sector.name, lang if lang != "all" else "en")}


def _mask_email(email: str) -> str:
    local, _, domain = (email or "").partition("@")
    if not domain:
        return ""
    return f"{local[:1]}***@{domain}"


class IdeaSubmitService:
    @staticmethod
    def _guest_name(draft: ApplicationDraft, name: str) -> str:
        if name and name.strip():
            return name.strip()[:255]
        data = draft.draft_data or {}
        return " ".join(part for part in (str(data.get("first_name") or "").strip(), str(data.get("last_name") or "").strip()) if part)[:255]

    @staticmethod
    def _copy_contact_to_account(user, *, district=None, email: str = "") -> None:
        """R-22: keep the district and email a guest gave when their account is made."""
        from apps.accounts.models import User
        from apps.profiles.models import InnovatorProfile

        if email and not user.email and not User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            user.email = email
            user.save(update_fields=["email", "updated_at"])
        if district is not None:
            profile, _ = InnovatorProfile.objects.get_or_create(user=user)
            if not profile.district_id:
                profile.district = district
                profile.save(update_fields=["district", "updated_at"])

    @staticmethod
    def copy_sent_to(submission: Submission) -> dict | None:
        """Where the acknowledgement went, for the confirmation screen (masked)."""
        from apps.communications.models import CommunicationLog

        log = (
            CommunicationLog.objects.filter(
                related_submission=submission,
                status=CommunicationStatus.SENT,
                channel__in=[CommunicationChannel.EMAIL, CommunicationChannel.SMS],
            )
            .select_related("recipient")
            .order_by("-created_at")
            .first()
        )
        if not log:
            return None
        if log.channel == CommunicationChannel.EMAIL:
            address = log.to_address or (log.recipient.email if log.recipient_id else "")
            return {"channel": "email", "to": _mask_email(address)}
        return {"channel": "sms", "to": mask_phone(log.to_address)}

    @classmethod
    def submit(
        cls,
        *,
        draft: ApplicationDraft,
        user=None,
        consent: bool = False,
        create_account: bool = True,
        name: str = "",
        first_name: str = "",
        last_name: str = "",
        district=None,
        email: str = "",
        ip_address: str | None = None,
    ) -> SubmitOutcome:
        """Submit as the owner (user owns the draft) or as a guest holding the resume token (user None)."""
        from apps.accounts.models import LoginCode
        from apps.accounts.otp_services import OTPService
        from apps.submissions.timeline import SubmissionTimelineService

        account_created = False
        guest_name = ""
        with transaction.atomic():
            if draft.innovator_id is None:
                if consent is not True:
                    # Same check as in submit_draft, before any account is made.
                    raise ValidationError({"consent": {"code": "consent_required", "detail": "Please agree to the terms before sending your idea."}})
                if not draft.guest_phone or not draft.guest_phone_verified_at:
                    raise ValidationError(
                        {"code": "phone_verification_required", "detail": "Confirm your phone number with the code we sent before sending your idea."}
                    )
                first_name, last_name = (first_name or "").strip()[:150], (last_name or "").strip()[:150]
                if first_name or last_name:
                    name = " ".join(part for part in (first_name, last_name) if part)
                guest_name = cls._guest_name(draft, name)
                if create_account:
                    if first_name or last_name:
                        first, last = first_name, last_name
                    else:
                        first, _, last = guest_name.partition(" ")
                    user, account_created = OTPService.user_for_verified_target(
                        target_type=LoginCode.TargetType.PHONE,
                        target=draft.guest_phone,
                        source="idea_quick_start",
                        first_name=first,
                        last_name=last,
                    )
                    DraftClaimService.claim(draft=draft, user=user)
                    if account_created and (first_name or last_name):
                        # The names typed on the submit screen win over earlier answers copied by claim.
                        user.first_name, user.last_name = first or user.first_name, last or user.last_name
                        user.save(update_fields=["first_name", "last_name", "updated_at"])
                    cls._copy_contact_to_account(user, district=district, email=email)
                else:
                    if draft.program.is_innovation_challenge:
                        raise ValidationError({"code": "account_required", "detail": "Challenge entries need an account. Send with create_account set to true."})
                    if not guest_name:
                        raise ValidationError({"name": {"code": "name_required", "detail": "Tell us your name."}})
                    user = None
            elif user is None or draft.innovator_id != user.id:
                raise PermissionDenied("This draft belongs to another account.")

            submission = ApplicationDraftService.submit_draft(
                draft=draft,
                actor=user,
                require_consent=True,
                consent=consent,
                ip_address=ip_address,
                guest_name=guest_name,
                district=district,
                guest_email=email if user is None else "",
            )
        submission.refresh_from_db()
        return SubmitOutcome(
            submission=submission,
            account_created=account_created,
            account_user=user,
            copy_sent_to=cls.copy_sent_to(submission),
            next_steps=SubmissionTimelineService.next_steps(submission),
        )

    @staticmethod
    def response_payload(outcome: SubmitOutcome, *, lang: str = "en") -> dict:
        submission = outcome.submission
        account = None
        if outcome.account_user is not None and submission.innovator_id:
            account = {
                "created": outcome.account_created,
                "sign_in_with": "phone_code" if not submission.innovator.email else "email",
            }
        return {
            "submission_id": str(submission.id),
            "reference": submission.reference_number,
            "title": submission.title,
            "sector": sector_payload(submission.sector, lang),
            "is_guest": submission.is_guest,
            "next_steps": outcome.next_steps,
            "copy_sent_to": outcome.copy_sent_to,
            "account": account,
            "first_name": IdeaSubmitService.first_name(submission),
        }

    @staticmethod
    def first_name(submission: Submission) -> str:
        """For "Well done, Neo" on the confirmation screen."""
        if submission.innovator_id and submission.innovator.first_name:
            return submission.innovator.first_name
        return (submission.guest_name or "").split(" ")[0]

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.communications.services import CommunicationService
from apps.core.constants import RoleType, ScoreSheetStatus, SubmissionFormFieldType, SubmissionStatus
from apps.documents.models import SubmissionDocument
from apps.programs.condition_services import FormConditionService
from apps.notifications.services import NotificationService
from apps.programs.models import SubmissionFormField
from apps.submissions.models import Submission, SubmissionFeedbackSnapshot, SubmissionResponse, SubmissionVersion
from apps.workflow.services import WorkflowRuntimeService


class ReferenceNumberService:
    PREFIX_MAP = {
        "idea": "CEDA-INNOV",
        "hackathon": "CEDA-HACK",
        "challenge_call": "CEDA-CHALL",
        "innovation_challenge": "CEDA-IC",
    }

    @classmethod
    def generate(cls, program) -> str:
        year = timezone.now().year
        prefix = cls.PREFIX_MAP.get(program.program_type.code, "CEDA-PROG")
        stem = f"{prefix}-{year}-"
        sequence = Submission.objects.filter(reference_number__startswith=stem).exclude(reference_number="").count() + 1
        while True:
            candidate = f"{stem}{sequence:06d}"
            if not Submission.objects.filter(reference_number=candidate).exists():
                return candidate
            sequence += 1


class SubmissionService:
    @staticmethod
    def _response_defaults(field: SubmissionFormField, value, *, form_version: int):
        return {
            "value": value,
            "field_key_snapshot": field.key,
            "field_label_snapshot": field.label,
            "field_type_snapshot": field.field_type,
            "form_version_snapshot": form_version,
        }

    @staticmethod
    def _validate_required_fields(submission: Submission):
        form = getattr(submission.program, "submission_form", None)
        if not form:
            return
        fields = form.fields.filter(is_active=True).prefetch_related("field_rules")
        response_map = {response.form_field_id: response.value for response in submission.responses.all()}
        values = {
            field.key: response_map.get(field.id)
            for field in fields
        }
        age = FormConditionService._derive_age(values)
        if age is not None:
            values["applicant_age"] = age
        for doc in SubmissionDocument.objects.filter(submission=submission, is_active=True, is_current=True).exclude(field_key=""):
            if not isinstance(values.get(doc.field_key), list):
                values[doc.field_key] = []
            values[doc.field_key].append(
                {
                    "original_filename": doc.original_filename,
                    "mime_type": doc.mime_type,
                    "size_bytes": doc.size_bytes,
                }
            )
        missing = []
        from apps.submissions.draft_services import ApplicationDraftService

        for field in fields:
            state = FormConditionService.field_state(field, values)
            if not state["visible"] or not state["enabled"]:
                continue
            value = values.get(field.key)
            if state["required"] and value in (None, "", []):
                missing.append(field.label)
                continue
            media_config = field.media_config or {}
            if field.field_type == SubmissionFormFieldType.FILE:
                file_items = value if isinstance(value, list) else ([value] if value else [])
                min_files = int(media_config.get("min_files", 1 if state["required"] else 0))
                if state["required"] and len(file_items) < min_files:
                    missing.append(field.label)
                    continue
                for file_item in file_items:
                    for rule in field.field_rules.filter(is_active=True):
                        error = ApplicationDraftService._validate_rule(field, rule, file_item)
                        if error:
                            raise ValidationError({field.key: [error]})
        if missing:
            raise ValidationError({"missing_fields": missing})

    @staticmethod
    def _validate_team_rules(submission: Submission):
        program = submission.program
        if program.allow_team_submission is False and submission.team_id:
            raise ValidationError("This program does not allow team submissions.")
        if program.allow_individual_submission is False and not submission.team_id:
            raise ValidationError("This program requires a team submission.")
        if submission.team_id and program.max_team_size and submission.team.members.count() > program.max_team_size:
            raise ValidationError("Selected team exceeds maximum team size.")

    @staticmethod
    @transaction.atomic
    def create_draft(*, innovator, program, submission_type, title, team=None, metadata=None):
        submission = Submission.objects.create(
            program=program,
            innovator=innovator,
            submission_type=submission_type,
            title=title,
            team=team,
            metadata=metadata or {},
        )
        SubmissionVersion.objects.create(submission=submission, version_number=1, snapshot={"title": title}, submitted_by=innovator)
        NotificationService.notify(
            user=innovator,
            notification_type="submission_created",
            title="Draft created",
            message=f"Your CEDA Innovation Portal draft '{title}' has been created.",
        )
        AuditService.log_action(actor=innovator, action_type="submission_created", target=submission, after_state={"status": submission.current_status})
        return submission

    @staticmethod
    @transaction.atomic
    def save_responses(submission: Submission, responses: list[dict], actor):
        if submission.locked_for_editing:
            raise ValidationError("Submission is locked for editing.")
        form = submission.program.submission_form
        field_map = {str(field.id): field for field in SubmissionFormField.objects.filter(form=form)}
        for item in responses:
            field = field_map[str(item["form_field"])]
            SubmissionResponse.objects.update_or_create(
                submission=submission,
                form_field=field,
                defaults=SubmissionService._response_defaults(field, item["value"], form_version=form.version),
            )
        AuditService.log_action(actor=actor, action_type="submission_updated", target=submission, metadata={"response_count": len(responses)})
        return submission

    @staticmethod
    @transaction.atomic
    def finalize_submission(submission: Submission, actor):
        if not submission.program.is_submission_open():
            raise ValidationError("This CEDA programme is not currently open for final submission.")
        SubmissionService._validate_required_fields(submission)
        SubmissionService._validate_team_rules(submission)
        if hasattr(submission, "workflow_instance"):
            raise ValidationError("This submission has already been submitted.")
        if not submission.reference_number:
            submission.reference_number = ReferenceNumberService.generate(submission.program)
        submission.submitted_at = timezone.now()
        submission.form_version_number = getattr(getattr(submission.program, "submission_form", None), "version", 1)
        submission.save(update_fields=["reference_number", "submitted_at", "form_version_number", "updated_at"])
        if submission.program.is_innovation_challenge:
            from apps.programs.challenge_judging import ChallengeJudgingService

            ChallengeJudgingService.sync_workflow(submission.program)
        SubmissionVersion.objects.update_or_create(
            submission=submission,
            version_number=submission.latest_version_number,
            defaults={"snapshot": {"status": SubmissionStatus.SUBMITTED, "title": submission.title}, "submitted_by": actor},
        )
        WorkflowRuntimeService.start_workflow(submission, actor)
        submission.refresh_from_db()
        CommunicationService.queue_submission_acknowledgement(submission)
        NotificationService.notify(
            user=submission.innovator,
            notification_type="submission_submitted",
            title="Submission received",
            message=f"Your submission {submission.reference_number} has been submitted to the CEDA Innovation Portal.",
            send_email=False,
        )
        AuditService.log_action(actor=actor, action_type="submission_submitted", target=submission, after_state={"status": submission.current_status, "reference_number": submission.reference_number})
        return submission

    @staticmethod
    @transaction.atomic
    def resubmit(submission: Submission, actor):
        if submission.current_status not in {SubmissionStatus.REQUIRES_MORE_INFORMATION, SubmissionStatus.RETURNED}:
            raise ValidationError("Only returned submissions can be resubmitted.")
        if not submission.program.is_submission_open():
            raise ValidationError("This CEDA programme is not currently open for resubmission.")
        SubmissionService._validate_required_fields(submission)
        SubmissionService._validate_team_rules(submission)
        submission.latest_version_number += 1
        submission.submitted_at = timezone.now()
        submission.save(update_fields=["latest_version_number", "submitted_at", "updated_at"])
        SubmissionVersion.objects.create(
            submission=submission,
            version_number=submission.latest_version_number,
            snapshot={"status": SubmissionStatus.SUBMITTED, "title": submission.title},
            submitted_by=actor,
        )
        if not hasattr(submission, "workflow_instance"):
            raise ValidationError("Returned submissions must have a workflow instance before resubmission.")
        WorkflowRuntimeService.resubmit(submission.workflow_instance, actor, comment="Submission resubmitted after correction.")
        submission.refresh_from_db()
        AuditService.log_action(actor=actor, action_type="submission_resubmitted", target=submission, after_state={"status": submission.current_status, "version": submission.latest_version_number})
        return submission


class ApplicantFeedbackSnapshotService:
    MANAGER_SOURCE_STEP_CODES = {
        "innovation_manager_review": "officer_review",
        "committee_manager_review": "committee_review",
    }
    RELEASE_ACTIONS = {"approve", "return", "reject", "screen_out"}

    @staticmethod
    def _iso(value):
        return value.isoformat() if value else None

    @classmethod
    def _latest_completed_cycle(cls, *, submission: Submission, source_step_code: str):
        from apps.evaluation.models import ReviewCycle

        return (
            ReviewCycle.objects
            .filter(
                submission=submission,
                workflow_step__code=source_step_code,
                status=ReviewCycle.STATUS_COMPLETED,
            )
            .select_related("workflow_step", "stage_config")
            .order_by("-closed_at", "-created_at")
            .first()
        )

    @classmethod
    def _cycle_payload(cls, cycle):
        if not cycle:
            return None, []

        aggregate = {
            "score": float(cycle.aggregate_score) if cycle.aggregate_score is not None else None,
            "pct": float(cycle.aggregate_pct) if cycle.aggregate_pct is not None else None,
            "outcome": cycle.outcome,
            "completed_reviews": cycle.completed_count,
            "decision_note": cycle.decision_note or "",
            "source_stage_code": cycle.workflow_step.code if cycle.workflow_step_id else "",
            "source_stage_name": cycle.workflow_step.name if cycle.workflow_step_id else "",
        }

        config = cycle.stage_config
        if not (config and config.allow_applicant_feedback):
            return aggregate, []

        reviews = []
        sheets = (
            cycle.scorecards
            .filter(status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED], is_final=True)
            .prefetch_related(
                "criterion_scores__criterion",
                "criterion_scores__stage_criterion",
                "criterion_scores__marking_criteria_item",
            )
            .order_by("submitted_at", "created_at")
        )
        for idx, sheet in enumerate(sheets, start=1):
            scores = list(sheet.criterion_scores.all())
            max_score = sum(float(score.criterion_max_score) for score in scores)
            pct = round(float(sheet.total_score) / max_score * 100, 1) if max_score else None
            reviews.append({
                "id": str(sheet.id),
                "reviewer_label": f"Reviewer {idx}",
                "submitted_at": cls._iso(sheet.submitted_at),
                "total_score": float(sheet.total_score) if sheet.total_score is not None else None,
                "max_score": max_score,
                "total_pct": pct,
                "overall_comment": sheet.overall_comment or "",
                "criteria": [
                    {
                        "id": str(score.id),
                        "criterion_name": score.criterion_name,
                        "raw_score": float(score.raw_score),
                        "max_score": float(score.criterion_max_score),
                        "comment": score.comment or "",
                    }
                    for score in scores
                ],
            })
        return aggregate, reviews

    @classmethod
    def capture_release(
        cls,
        *,
        submission: Submission,
        workflow_instance,
        release_step,
        action: str,
        actor=None,
        comment: str = "",
        source_action_log=None,
    ):
        comment = (comment or "").strip()
        if not release_step or action not in cls.RELEASE_ACTIONS or not comment:
            return None
        if source_action_log and hasattr(source_action_log, "feedback_snapshot"):
            return source_action_log.feedback_snapshot

        is_manager_release = release_step.role_required == RoleType.INNOVATION_MANAGER
        log_status = (getattr(source_action_log, "metadata", {}) or {}).get("status", "")
        final_public_statuses = {"approved", "rejected", "screened_out", "shortlisted", "finalist", "winner", "closed"}
        is_terminal_direct_release = action in {"return", "reject", "screen_out"} or (
            action == "approve" and log_status in final_public_statuses
        )
        if not is_manager_release and not is_terminal_direct_release:
            return None

        source_step_code = cls.MANAGER_SOURCE_STEP_CODES.get(release_step.code, release_step.code)
        cycle = cls._latest_completed_cycle(submission=submission, source_step_code=source_step_code) if source_step_code else None
        aggregate, reviews = cls._cycle_payload(cycle)
        released_at = getattr(source_action_log, "timestamp", None) or timezone.now()
        state = "returned" if action == "return" else "rejected" if action in {"reject", "screen_out"} else "completed"
        label = "Manager comment" if is_manager_release else "CEDA Innovation Team"

        payload = {
            "schema_version": 1,
            "id": str(source_action_log.id) if source_action_log else "",
            "code": release_step.code,
            "label": release_step.name,
            "state": state,
            "timestamp": cls._iso(released_at),
            "release": {
                "action": action,
                "comment": comment,
                "released_at": cls._iso(released_at),
                "source_stage_code": source_step_code,
                "source_stage_name": cycle.workflow_step.name if cycle and cycle.workflow_step_id else "",
            },
            "comments": [
                {
                    "id": str(source_action_log.id) if source_action_log else "",
                    "kind": "manager" if is_manager_release else "status",
                    "label": label,
                    "action": action,
                    "comment": comment,
                    "timestamp": cls._iso(released_at),
                }
            ],
            "aggregate": aggregate,
            "reviews": reviews,
        }

        return SubmissionFeedbackSnapshot.objects.create(
            submission=submission,
            workflow_instance=workflow_instance,
            stage_code=release_step.code,
            stage_name=release_step.name,
            release_action=action,
            source_review_cycle=cycle,
            source_action_log=source_action_log,
            released_at=released_at,
            payload_json=payload,
        )

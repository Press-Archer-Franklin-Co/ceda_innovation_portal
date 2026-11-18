from __future__ import annotations

from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import SubmissionFormFieldType
from apps.documents.models import SubmissionDocument
from apps.programs.access import ProgramAccessService
from apps.programs.condition_services import FormConditionService
from apps.programs.models import FieldValidationRule, SubmissionFormField
from apps.profiles.models import InnovatorProfile
from apps.submissions.models import ApplicationDraft, Submission, SubmissionResponse
from apps.submissions.services import SubmissionService


class ApplicationDraftService:
    @staticmethod
    def generate_reference_number(program) -> str:
        timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"DRAFT-{program.program_type.code.upper()}-{timestamp}-{uuid4().hex[:6].upper()}"

    @staticmethod
    def _field_state(field: SubmissionFormField, values: dict) -> dict:
        return FormConditionService.field_state(field, values)

    @staticmethod
    def _effective_values(draft: ApplicationDraft, draft_data: dict | None) -> dict:
        values = dict(draft_data or {})
        age = FormConditionService._derive_age(values)
        if age is not None:
            values["applicant_age"] = age
        uploaded = {}
        for item in SubmissionDocument.objects.filter(application_draft=draft, is_active=True, is_current=True).exclude(field_key=""):
            uploaded.setdefault(item.field_key, []).append(
                {
                    "original_filename": item.original_filename,
                    "mime_type": item.mime_type,
                    "size_bytes": item.size_bytes,
                }
            )
        for field_key, items in uploaded.items():
            current = values.get(field_key)
            if current in (None, "", []):
                values[field_key] = items
        return values

    @staticmethod
    def _validate_rule(field: SubmissionFormField, rule, value):
        if value in (None, "", []):
            return None
        rule_value = rule.rule_value
        if rule.rule_type == FieldValidationRule.RuleType.EXACT_LENGTH and len(str(value)) != int(rule_value):
            return rule.error_message or f"{field.label} must be exactly {rule_value} characters long."
        if rule.rule_type == FieldValidationRule.RuleType.MIN_LENGTH and len(str(value)) < int(rule_value):
            return rule.error_message or f"{field.label} must be at least {rule_value} characters long."
        if rule.rule_type == FieldValidationRule.RuleType.MAX_LENGTH and len(str(value)) > int(rule_value):
            return rule.error_message or f"{field.label} must be at most {rule_value} characters long."
        if rule.rule_type == FieldValidationRule.RuleType.MIN_VALUE and float(value) < float(rule_value):
            return rule.error_message or f"{field.label} must be at least {rule_value}."
        if rule.rule_type == FieldValidationRule.RuleType.MAX_VALUE and float(value) > float(rule_value):
            return rule.error_message or f"{field.label} must be at most {rule_value}."
        if rule.rule_type == FieldValidationRule.RuleType.REGEX:
            import re

            if not re.match(rule_value, str(value)):
                return rule.error_message or f"{field.label} is not in the expected format."
        if field.field_type in {SubmissionFormFieldType.FILE, SubmissionFormFieldType.URL} and isinstance(value, dict):
            if rule.rule_type == FieldValidationRule.RuleType.FILE_TYPE:
                allowed = [item.strip() for item in str(rule_value).split(",") if item.strip()]
                if value.get("mime_type") and value["mime_type"] not in allowed:
                    return rule.error_message or f"{field.label} must be one of: {', '.join(allowed)}."
            if rule.rule_type == FieldValidationRule.RuleType.FILE_SIZE_MB:
                size_mb = (value.get("size_bytes") or 0) / (1024 * 1024)
                if size_mb > float(rule_value):
                    return rule.error_message or f"{field.label} must be no larger than {rule_value} MB."
            if rule.rule_type == FieldValidationRule.RuleType.REQUIRED_EXTENSION:
                filename = value.get("original_filename", "")
                if filename and not filename.lower().endswith(str(rule_value).lower()):
                    return rule.error_message or f"{field.label} must use the {rule_value} extension."
        return None

    @classmethod
    def validate_draft_data(cls, draft: ApplicationDraft, draft_data: dict) -> None:
        form = getattr(draft.program, "submission_form", None)
        if not form:
            return
        errors = {}
        fields = form.fields.filter(is_active=True).prefetch_related("field_rules")
        values = cls._effective_values(draft, draft_data)
        for field in fields:
            state = cls._field_state(field, values)
            if not state["visible"] or not state["enabled"]:
                continue
            value = values.get(field.key)
            media_config = field.media_config or {}
            if field.field_type == SubmissionFormFieldType.FILE:
                file_items = value if isinstance(value, list) else ([value] if value else [])
                min_files = int(media_config.get("min_files", 1 if state["required"] else 0))
                max_files = int(media_config.get("max_files", 1 if not media_config.get("multiple") else max(1, media_config.get("max_files", 5))))
                if state["required"] and len(file_items) < min_files:
                    errors[field.key] = ["This file field requires at least one upload."]
                    continue
                if file_items and len(file_items) > max_files:
                    errors.setdefault(field.key, []).append(f"No more than {max_files} files are allowed.")
            if state["required"] and value in (None, "", []):
                errors[field.key] = ["This field is required."]
                continue
            rule_qs = field.field_rules.filter(is_active=True)
            if field.field_type == SubmissionFormFieldType.FILE and isinstance(value, list):
                for file_item in value:
                    for rule in rule_qs:
                        error = cls._validate_rule(field, rule, file_item)
                        if error:
                            errors.setdefault(field.key, []).append(error)
            else:
                for rule in rule_qs:
                    error = cls._validate_rule(field, rule, value)
                    if error:
                        errors.setdefault(field.key, []).append(error)
        if errors:
            raise ValidationError({"draft_data": errors})

    @classmethod
    def build_progress_metadata(cls, draft: ApplicationDraft, draft_data: dict, *, current_section_code: str = "") -> dict:
        form = getattr(draft.program, "submission_form", None)
        if not form:
            return {}
        effective_values = cls._effective_values(draft, draft_data)
        section_payloads = []
        total = completed = required_total = required_completed = 0
        sections = form.sections.filter(is_active=True).prefetch_related("fields__field_rules").order_by("ordering")
        for section in sections:
            section_total = section_completed = section_required = section_required_completed = 0
            missing_required = []
            for field in section.fields.filter(is_active=True).order_by("ordering"):
                state = cls._field_state(field, effective_values)
                if not state["visible"]:
                    continue
                value = effective_values.get(field.key)
                section_total += 1
                total += 1
                if value not in (None, "", []):
                    section_completed += 1
                    completed += 1
                if state["required"]:
                    section_required += 1
                    required_total += 1
                    if value not in (None, "", []):
                        section_required_completed += 1
                        required_completed += 1
                    else:
                        missing_required.append(field.key)
            section_payloads.append(
                {
                    "section_code": section.code,
                    "section_title": section.title,
                    "percent_complete": int((section_completed / section_total) * 100) if section_total else 0,
                    "missing_required_fields": missing_required,
                    "current": section.code == current_section_code,
                }
            )
        return {
            "current_section_code": current_section_code,
            "total_visible_fields": total,
            "completed_visible_fields": completed,
            "required_visible_fields": required_total,
            "completed_required_fields": required_completed,
            "percent_complete": int((completed / total) * 100) if total else 0,
            "sections": section_payloads,
        }

    @staticmethod
    def _sync_shared_profile_fields(*, innovator, draft_data: dict | None) -> None:
        if not innovator or not isinstance(draft_data, dict):
            return

        user_updates = {}
        first_name = str(draft_data.get("first_name") or "").strip()
        last_name = str(draft_data.get("last_name") or "").strip()
        contact_number = str(draft_data.get("contact_number") or "").strip()

        if first_name and first_name != innovator.first_name:
            user_updates["first_name"] = first_name
        if last_name and last_name != innovator.last_name:
            user_updates["last_name"] = last_name
        if contact_number and contact_number != innovator.phone_number:
            user_updates["phone_number"] = contact_number

        if user_updates:
            for field, value in user_updates.items():
                setattr(innovator, field, value)
            innovator.save(update_fields=[*user_updates.keys(), "updated_at"])

        profile, _ = InnovatorProfile.objects.get_or_create(user=innovator)
        profile_updates = {}

        shared_mappings = {
            "country_code": "country_code",
            "country": "country",
            "id_passport_number": "national_id",
            "gender": "gender",
            "person_type": "person_type",
            "person_type_other": "person_type_other",
            "linkedin_link": "linkedin_url",
            "linkedin_profile": "linkedin_url",
            "website_link": "portfolio_url",
            "website_portfolio": "portfolio_url",
        }

        for source_key, target_field in shared_mappings.items():
            raw_value = draft_data.get(source_key)
            if raw_value in (None, "", []):
                continue
            value = str(raw_value).strip() if isinstance(raw_value, str) else raw_value
            if value in ("", [], None):
                continue
            if getattr(profile, target_field) != value:
                profile_updates[target_field] = value

        raw_birthday = draft_data.get("birthday", draft_data.get("age_group"))
        parsed_birthday = parse_date(str(raw_birthday).strip()) if raw_birthday not in (None, "", []) else None
        if parsed_birthday and profile.date_of_birth != parsed_birthday:
            profile_updates["date_of_birth"] = parsed_birthday

        if profile_updates:
            for field, value in profile_updates.items():
                setattr(profile, field, value)
            profile.save(update_fields=[*profile_updates.keys(), "updated_at"])

    @classmethod
    @transaction.atomic
    def save_draft(
        cls,
        *,
        program,
        innovator,
        submission_type,
        title,
        draft_data: dict,
        team=None,
        draft: ApplicationDraft | None = None,
        current_section_code: str = "",
        metadata: dict | None = None,
    ) -> ApplicationDraft:
        ProgramAccessService.assert_can_enter(program, innovator)
        draft = draft or ApplicationDraft.objects.filter(
            innovator=innovator,
            program=program,
            status=ApplicationDraft.STATUS_DRAFT,
        ).first()
        if draft is None:
            draft = ApplicationDraft(
                reference_number=cls.generate_reference_number(program),
                program=program,
                innovator=innovator,
                submission_type=submission_type,
            )
        else:
            draft.version += 1
        draft.team = team
        draft.title = title
        draft.draft_data = draft_data or {}
        cls._sync_shared_profile_fields(innovator=innovator, draft_data=draft.draft_data)
        draft.current_section_code = current_section_code
        draft.progress_metadata = cls.build_progress_metadata(draft, draft.draft_data, current_section_code=current_section_code)
        if metadata:
            draft.metadata = metadata
        draft.save()
        AuditService.log_action(actor=innovator, action_type="draft_saved", target=program, metadata={"draft_id": str(draft.id), "reference_number": draft.reference_number})
        return draft

    @classmethod
    @transaction.atomic
    def submit_draft(cls, *, draft: ApplicationDraft, actor):
        if draft.status != ApplicationDraft.STATUS_DRAFT:
            raise ValidationError("Only active drafts can be submitted.")
        ProgramAccessService.assert_can_enter(draft.program, actor)
        cls.validate_draft_data(draft, draft.draft_data)
        submission = Submission.objects.create(
            reference_number="",
            program=draft.program,
            submission_type=draft.submission_type,
            innovator=draft.innovator,
            team=draft.team,
            title=draft.title,
            metadata=draft.metadata,
            form_version_number=getattr(getattr(draft.program, "submission_form", None), "version", 1),
        )
        form_version = getattr(getattr(draft.program, "submission_form", None), "version", 1)
        field_map = {
            field.key: field
            for field in draft.program.submission_form.fields.filter(is_active=True)
        }
        effective_values = cls._effective_values(draft, draft.draft_data)
        for key, value in effective_values.items():
            field = field_map.get(key)
            if not field:
                continue
            if value in (None, "", []):
                continue
            SubmissionResponse.objects.update_or_create(
                submission=submission,
                form_field=field,
                defaults={
                    "value": value,
                    "field_key_snapshot": field.key,
                    "field_label_snapshot": field.label,
                    "field_type_snapshot": field.field_type,
                    "form_version_snapshot": form_version,
                },
            )
        SubmissionDocument.objects.filter(application_draft=draft).update(submission=submission, application_draft=None)
        SubmissionService.finalize_submission(submission, actor)
        draft.status = ApplicationDraft.STATUS_SUBMITTED
        draft.submitted_submission = submission
        draft.submitted_at = timezone.now()
        draft.save(update_fields=["status", "submitted_submission", "submitted_at", "updated_at"])
        AuditService.log_action(actor=actor, action_type="draft_submitted", target=submission, metadata={"draft_id": str(draft.id)})
        return submission

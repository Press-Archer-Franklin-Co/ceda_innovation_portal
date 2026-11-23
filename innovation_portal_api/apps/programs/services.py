from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import ProgramStatus
from apps.programs.models import Program


class ProgramService:
    @staticmethod
    @transaction.atomic
    def publish(program: Program, actor):
        problems = program.publish_problems()
        if problems:
            raise ValidationError(problems)
        # Prompt 31: publishing an idea call no longer closes the other idea calls. One General ideas
        # programme is kept by the database (programs 0025); idea calls are challenges with their own dates.
        program.status = ProgramStatus.PUBLISHED
        program.is_public = True
        program.published_at = timezone.now()
        program.save(update_fields=["status", "is_public", "published_at", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="program_published",
            target=program,
            after_state={"status": program.status},
        )
        return program

    @staticmethod
    @transaction.atomic
    def close(program: Program, actor):
        program.status = ProgramStatus.CLOSED
        program.save(update_fields=["status", "updated_at"])
        AuditService.log_action(actor=actor, action_type="program_closed", target=program, after_state={"status": program.status})
        return program

    @staticmethod
    @transaction.atomic
    def unpublish(program: Program, actor):
        program.status = ProgramStatus.DRAFT
        program.is_public = False
        program.published_at = None
        program.save(update_fields=["status", "is_public", "published_at", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="program_unpublished",
            target=program,
            after_state={"status": program.status},
        )
        return program

    @staticmethod
    @transaction.atomic
    def archive(program: Program, actor):
        program.status = ProgramStatus.ARCHIVED
        program.is_public = False
        program.save(update_fields=["status", "is_public", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="program_archived",
            target=program,
            after_state={"status": program.status},
        )
        return program

    @staticmethod
    @transaction.atomic
    def set_status(program: Program, status_value: str, actor):
        if status_value == ProgramStatus.PUBLISHED:
            return ProgramService.publish(program, actor)
        if status_value == ProgramStatus.DRAFT:
            return ProgramService.unpublish(program, actor)
        if status_value == ProgramStatus.CLOSED:
            return ProgramService.close(program, actor)
        if status_value == ProgramStatus.ARCHIVED:
            return ProgramService.archive(program, actor)
        raise ValueError(f"Unsupported program status: {status_value}")


class SubmissionFormLifecycleService:
    @staticmethod
    @transaction.atomic
    def bump_version(form, *, actor=None, reason: str = "form_structure_updated"):
        previous_version = form.version
        form.version += 1
        form.save(update_fields=["version", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type=reason,
            target=form,
            before_state={"version": previous_version},
            after_state={"version": form.version},
            metadata={"program_id": str(form.program_id)},
        )
        return form


# Copilot helpers (no AI here) ---------------------------------------------------------------------------------------


def create_draft_form_from_document(document: dict, *, title: str = "", actor, program=None):
    """Makes a new draft form and saves the whole form document into it, in one transaction.

    Returns (form, errors). errors is the form builder's [{path, message}] list; when there are errors nothing is
    saved and form is None. Never publishes. title defaults to the document's English name. With "id" in the
    document, that draft form is updated in place instead (the AI lane's "revise keeps the same draft"); only a
    draft can be updated. With a challenge that has no form yet, a new draft becomes its form; a challenge that
    already has a form keeps it.
    """
    from apps.programs.form_builder import FormDocumentService, FormLibraryService
    from apps.programs.models import SubmissionForm

    if not isinstance(document, dict):
        return None, [{"path": "", "message": "Send the form as one JSON object."}]
    document = dict(document)
    existing_id = document.pop("id", None)
    name = document.get("name")
    title = (title or (name.get("en") if isinstance(name, dict) else name) or "").strip()[:255]
    if not title and not existing_id:
        return None, [{"path": "title", "message": "Give the form a name."}]
    existing = None
    if existing_id:
        existing = SubmissionForm.objects.filter(pk=existing_id).first() if _is_uuid(existing_id) else None
        if existing is None:
            return None, [{"path": "id", "message": "There is no form with this id."}]
        if existing.status != SubmissionForm.Status.DRAFT:
            return None, [{"path": "id", "message": "Only a draft form can be changed here. Make a copy of a live form."}]
    errors = FormDocumentService.validate_document(document)
    if errors:
        return None, errors
    try:
        with transaction.atomic():
            form = existing or FormLibraryService.create(start="blank", name=title, actor=actor)
            FormDocumentService.save_document(form, document, actor=actor, audit=False)
            form.refresh_from_db()
            attached = False
            if existing is None and program is not None and program.form_id is None:
                program.form = form
                program.save(update_fields=["form", "updated_at"])
                attached = True
            AuditService.log_action(
                actor=actor,
                action_type="form_draft_updated" if existing else "form_draft_created",
                target=form,
                after_state={"title": form.title, "status": form.status},
                metadata={"source": "document", "program_id": str(program.id) if program else None, "attached_to_program": attached},
            )
    except ValidationError as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
        found = detail.get("errors")
        if isinstance(found, list):
            return None, [{"path": str(item.get("path", "")), "message": str(item.get("message", ""))} for item in found]
        return None, [{"path": str(key), "message": " ".join(str(part) for part in (value if isinstance(value, list) else [value]))} for key, value in detail.items()]
    return form, []


def _is_uuid(value) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False

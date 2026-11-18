from django.db import transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.core.constants import ProgramStatus
from apps.programs.models import Program


class ProgramService:
    @staticmethod
    @transaction.atomic
    def publish(program: Program, actor):
        try:
            type_code = program.program_type.code
        except Exception:
            type_code = ""

        if type_code == "idea":
            superseded = Program.objects.filter(
                program_type__code="idea",
                status=ProgramStatus.PUBLISHED,
            ).exclude(id=program.id)
            for other in superseded:
                other.status = ProgramStatus.CLOSED
                other.save(update_fields=["status", "updated_at"])
                AuditService.log_action(
                    actor=actor,
                    action_type="program_closed",
                    target=other,
                    after_state={"status": other.status},
                    metadata={"reason": "superseded_by_new_idea_program", "new_program_id": str(program.id)},
                )

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

from django.db import transaction
from rest_framework.exceptions import ValidationError
from django.utils import timezone

from apps.assignments.models import Assignment, AssignmentAcceptance, ConflictOfInterestDeclaration
from apps.audit.services import AuditService
from apps.communications.services import CommunicationService
from apps.core.constants import AssignmentRoleType, AssignmentStatus, RoleType
from apps.notifications.services import NotificationService
from apps.workflow.services import TaskExecutionService, WorkflowRuntimeService
from apps.accounts.services import RoleService


class AssignmentService:
    ACTIVE_ASSIGNMENT_STATUSES = [
        AssignmentStatus.ASSIGNED,
        AssignmentStatus.ACCEPTED,
        AssignmentStatus.COMPLETED,
    ]

    @staticmethod
    def _locked_assignment(assignment):
        return Assignment.objects.select_for_update().select_related("submission", "assignee").get(id=assignment.id)

    @staticmethod
    def _latest_task(assignment):
        return assignment.tasks.order_by("-created_at").first()

    STAFF_WORKER_ROLE_CODES = [
        RoleType.JUDGE, RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER,
        RoleType.INNOVATION_ANALYST, RoleType.STAFF_MEMBER, RoleType.SPECIALIST,
        RoleType.EXO, RoleType.MENTOR, RoleType.ADMINISTRATOR,
    ]

    ROLE_ELIGIBILITY_MAP = {
        AssignmentRoleType.JUDGE:      [RoleType.JUDGE, RoleType.ADMINISTRATOR],
        AssignmentRoleType.MENTOR:     [RoleType.MENTOR, RoleType.ADMINISTRATOR],
        AssignmentRoleType.REVIEWER:   STAFF_WORKER_ROLE_CODES,
        AssignmentRoleType.SPECIALIST: [RoleType.SPECIALIST, RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR],
        AssignmentRoleType.OFFICER:    [RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.INNOVATION_ANALYST, RoleType.ADMINISTRATOR],
        AssignmentRoleType.MANAGER:    [RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR],
        AssignmentRoleType.ANALYST:    [RoleType.INNOVATION_ANALYST, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR],
        AssignmentRoleType.STAFF:      [RoleType.STAFF_MEMBER, RoleType.ADMINISTRATOR],
        AssignmentRoleType.EXO:        [RoleType.EXO, RoleType.ADMINISTRATOR],
    }

    @classmethod
    def eligible_assignment_roles_for_user(cls, user, requested_role: str | None = None) -> set[str]:
        if requested_role:
            user_codes = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
            if requested_role in {RoleType.ADMINISTRATOR, "admin"}:
                if user.is_superuser or RoleType.ADMINISTRATOR in user_codes:
                    return set(cls.ROLE_ELIGIBILITY_MAP.keys())
            if requested_role not in user_codes:
                return set()
            assignment_role = cls.assignment_role_for_user_role(requested_role)
            return {assignment_role} if assignment_role else set()
        if user.is_superuser:
            return set(cls.ROLE_ELIGIBILITY_MAP.keys())
        user_codes = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        return {
            role_type
            for role_type, allowed in cls.ROLE_ELIGIBILITY_MAP.items()
            if user_codes & set(allowed)
        }

    ROLE_TO_ASSIGNMENT_ROLE = {
        RoleType.JUDGE: AssignmentRoleType.JUDGE,
        RoleType.INNOVATION_OFFICER: AssignmentRoleType.OFFICER,
        RoleType.INNOVATION_MANAGER: AssignmentRoleType.MANAGER,
        RoleType.INNOVATION_ANALYST: AssignmentRoleType.ANALYST,
        RoleType.STAFF_MEMBER: AssignmentRoleType.STAFF,
        RoleType.SPECIALIST: AssignmentRoleType.SPECIALIST,
        RoleType.MENTOR: AssignmentRoleType.MENTOR,
        RoleType.EXO: AssignmentRoleType.EXO,
    }

    @classmethod
    def resolve_current_role(cls, user, requested_role: str | None) -> str | None:
        role_codes = list(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        if requested_role:
            if requested_role not in role_codes:
                return None
            return requested_role
        primary, _ = RoleService.get_primary_role(user)
        if primary:
            return primary
        return role_codes[0] if role_codes else None

    @classmethod
    def assignment_role_for_user_role(cls, user_role: str | None) -> str | None:
        if not user_role:
            return None
        return cls.ROLE_TO_ASSIGNMENT_ROLE.get(user_role)

    @staticmethod
    def _ensure_eligible_assignee(user, role_type):
        required_roles = AssignmentService.ROLE_ELIGIBILITY_MAP.get(role_type)
        if required_roles is None:
            raise ValidationError(f"Unknown assignment role type: {role_type}")
        if not user.is_superuser and not user.roles.filter(code__in=required_roles, user_roles__is_active=True).exists():
            raise ValidationError("Assignee does not have the required role.")

    @staticmethod
    @transaction.atomic
    def claim_submission(*, submission, actor):
        submission = submission.__class__.objects.select_for_update().get(id=submission.id)
        submission = submission.__class__.objects.select_related("workflow_instance__current_step").get(id=submission.id)
        current_step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if not current_step:
            raise ValidationError("This submission does not have an active workflow step.")
        if not current_step.requires_assignment:
            raise ValidationError("The current workflow step is not open for claims.")

        claimable_step_roles = list(AssignmentRoleType.values)
        step_role = current_step.assignment_role
        if step_role not in claimable_step_roles:
            raise ValidationError("The current workflow step is not open for self-claiming.")

        AssignmentService._ensure_eligible_assignee(actor, step_role)

        required_slots = current_step.minimum_assignments or 0
        try:
            from apps.evaluation.models import StageEvaluationConfig

            config = getattr(current_step, "evaluation_config", None)
            if (
                current_step.requires_evaluation
                and config
                and config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
            ):
                required_slots = config.maximum_reviews_allowed or required_slots or 20
        except Exception:
            pass
        if required_slots <= 0:
            raise ValidationError("This workflow step does not have any claim slots configured.")

        active_assignments = Assignment.objects.select_for_update().filter(
            submission=submission,
            workflow_step=current_step,
            role_type=step_role,
            status__in=AssignmentService.ACTIVE_ASSIGNMENT_STATUSES,
        )
        if active_assignments.filter(assignee=actor).exists():
            raise ValidationError("You have already claimed this submission.")
        if active_assignments.count() >= required_slots:
            raise ValidationError("All available slots for this submission have already been claimed.")

        assignment = AssignmentService.create_assignment(
            submission=submission,
            assignee=actor,
            role_type=step_role,
            assigned_by=actor,
            deadline=getattr(getattr(submission, "workflow_instance", None), "due_at", None),
        )
        return AssignmentService.respond(assignment, actor, accept=True, note="Claimed by evaluator.")

    @staticmethod
    @transaction.atomic
    def create_assignment(*, submission, assignee, role_type, assigned_by, deadline=None, panel=None, previous_assignment=None, notify=True):
        submission = submission.__class__.objects.select_for_update().get(id=submission.id)
        AssignmentService._ensure_eligible_assignee(assignee, role_type)
        current_step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if not current_step:
            raise ValidationError("Assignments require an active workflow step.")
        if not current_step.requires_assignment:
            raise ValidationError("The current workflow step does not accept assignments.")
        if current_step.assignment_role and current_step.assignment_role != role_type:
            raise ValidationError("The current workflow step does not accept this assignment role.")
        assignment = Assignment.objects.create(
            submission=submission,
            workflow_step=current_step,
            previous_assignment=previous_assignment,
            assignee=assignee,
            role_type=role_type,
            assigned_by=assigned_by,
            deadline=deadline,
            panel=panel,
        )
        if notify:
            CommunicationService.queue_assignment_notification(assignment)
            NotificationService.notify(
                user=assignee,
                notification_type="assignment_created",
                title="New workflow assignment",
                message=f"You have been assigned as {role_type} for submission {submission.reference_number or submission.title}.",
                send_email=True,
            )
        if hasattr(submission, "workflow_instance"):
            WorkflowRuntimeService._log_action(
                submission.workflow_instance,
                current_step,
                "assign",
                assigned_by,
                comment=f"Assigned {assignee.full_name} as {role_type}.",
                metadata={"assignment_id": str(assignment.id), "assignee_id": str(assignee.id), "status": submission.current_status},
            )
        AuditService.log_action(
            actor=assigned_by,
            action_type="assignment_created",
            target=submission,
            metadata={
                "assignment_id": str(assignment.id),
                "assignee_id": str(assignee.id),
                "previous_assignment_id": str(previous_assignment.id) if previous_assignment else "",
            },
        )
        TaskExecutionService.ensure_assignment_task(assignment)
        return assignment

    @staticmethod
    @transaction.atomic
    def reassign(*, assignment, assignee, actor, deadline=None):
        assignment = AssignmentService._locked_assignment(assignment)
        previous_state = {"status": assignment.status, "assignee_id": str(assignment.assignee_id)}
        current_task = AssignmentService._latest_task(assignment)
        assignment.status = AssignmentStatus.REASSIGNED
        assignment.reassigned_at = timezone.now()
        assignment.save(update_fields=["status", "reassigned_at", "updated_at"])
        if current_task and current_task.status in [current_task.STATUS_PENDING, current_task.STATUS_CLAIMED]:
            current_task.status = current_task.STATUS_REASSIGNED
            current_task.completed_at = timezone.now()
            current_task.comment = f"Reassigned from {assignment.assignee.full_name} to {assignee.full_name}."
            current_task.save(update_fields=["status", "completed_at", "comment", "updated_at"])
        WorkflowRuntimeService._log_action(
            assignment.submission.workflow_instance,
            assignment.workflow_step,
            "reassign",
            actor,
            comment=f"Reassigned from {assignment.assignee.full_name} to {assignee.full_name}.",
            metadata={"previous_assignee_id": str(assignment.assignee_id), "new_assignee_id": str(assignee.id)},
        )
        replacement = AssignmentService.create_assignment(
            submission=assignment.submission,
            assignee=assignee,
            role_type=assignment.role_type,
            assigned_by=actor,
            deadline=deadline or assignment.deadline,
            panel=assignment.panel,
            previous_assignment=assignment,
        )
        AuditService.log_action(
            actor=actor,
            action_type="assignment_reassigned",
            target=assignment.submission,
            before_state=previous_state,
            after_state={"status": assignment.status, "replacement_assignment_id": str(replacement.id), "new_assignee_id": str(assignee.id)},
            metadata={"assignment_id": str(assignment.id), "replacement_assignment_id": str(replacement.id)},
        )
        return replacement

    @staticmethod
    @transaction.atomic
    def unassign(*, assignment, actor):
        assignment = AssignmentService._locked_assignment(assignment)
        previous_state = {"status": assignment.status, "assignee_id": str(assignment.assignee_id)}
        assignment.status = AssignmentStatus.REASSIGNED
        assignment.reassigned_at = timezone.now()
        assignment.save(update_fields=["status", "reassigned_at", "updated_at"])
        assignment.tasks.update(status="cancelled", completed_at=timezone.now(), updated_at=timezone.now(), comment="Unassigned by officer/admin.")
        if hasattr(assignment.submission, "workflow_instance"):
            WorkflowRuntimeService._log_action(
                assignment.submission.workflow_instance,
                assignment.workflow_step,
                "unassign",
                actor,
                comment=f"Assignment removed from {assignment.assignee.full_name}.",
                metadata={"assignee_id": str(assignment.assignee_id)},
            )
        AuditService.log_action(
            actor=actor,
            action_type="assignment_unassigned",
            target=assignment.submission,
            before_state=previous_state,
            after_state={"status": assignment.status, "reassigned_at": assignment.reassigned_at.isoformat() if assignment.reassigned_at else ""},
            metadata={"assignment_id": str(assignment.id)},
        )
        return assignment

    @staticmethod
    @transaction.atomic
    def respond(assignment, actor, accept: bool, note: str = ""):
        assignment = AssignmentService._locked_assignment(assignment)
        if assignment.assignee != actor:
            raise ValidationError("You can only respond to your own assignment.")
        previous_status = assignment.status
        assignment.status = AssignmentStatus.ACCEPTED if accept else AssignmentStatus.DECLINED
        assignment.save(update_fields=["status", "updated_at"])
        AssignmentAcceptance.objects.update_or_create(
            assignment=assignment,
            defaults={"accepted": accept, "response_note": note},
        )
        acceptance = assignment.acceptance
        AuditService.log_action(
            actor=actor,
            action_type="assignment_response",
            target=assignment.submission,
            before_state={"status": previous_status},
            after_state={"status": assignment.status, "responded_at": acceptance.responded_at.isoformat() if acceptance.responded_at else ""},
            metadata={"accepted": accept, "assignment_id": str(assignment.id), "note": note},
        )
        if accept:
            task = AssignmentService._latest_task(assignment)
            if task:
                TaskExecutionService.claim(task, actor)
        else:
            assignment.tasks.filter(status__in=["pending", "claimed"]).update(
                status="rejected",
                completed_at=timezone.now(),
                outcome="reject",
                comment=note,
                updated_at=timezone.now(),
            )
        return assignment

    @staticmethod
    @transaction.atomic
    def declare_conflict(assignment, actor, details: str):
        assignment = AssignmentService._locked_assignment(assignment)
        if assignment.assignee != actor:
            raise ValidationError("You can only declare conflict on your own assignment.")
        ConflictOfInterestDeclaration.objects.update_or_create(
            assignment=assignment,
            defaults={"declared_by": actor, "conflict_details": details},
        )
        assignment.status = AssignmentStatus.REASSIGNED
        assignment.reassigned_at = timezone.now()
        assignment.save(update_fields=["status", "reassigned_at", "updated_at"])
        assignment.tasks.update(status="reassigned", completed_at=timezone.now(), updated_at=timezone.now(), comment=details)
        CommunicationService.queue_conflict_notification(assignment, details)
        NotificationService.notify(
            user=assignment.assigned_by,
            notification_type="assignment_conflict_declared",
            title="Assignment conflict declared",
            message=f"{assignment.assignee.full_name} declared a conflict on submission {assignment.submission.reference_number or assignment.submission.title}.",
        )
        AuditService.log_action(actor=actor, action_type="conflict_declared", target=assignment.submission, metadata={"assignment_id": str(assignment.id), "details": details})
        return assignment

    @staticmethod
    @transaction.atomic
    def complete(assignment, actor, note: str = ""):
        assignment = AssignmentService._locked_assignment(assignment)
        if assignment.assignee != actor and not actor.roles.filter(code__in=[RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR], user_roles__is_active=True).exists() and not actor.is_superuser:
            raise ValidationError("You do not have permission to complete this assignment.")
        previous_status = assignment.status
        task = AssignmentService._latest_task(assignment)
        if task and task.status != task.STATUS_COMPLETED:
            TaskExecutionService.complete(task, actor, outcome="approve", comment=note)
            assignment.refresh_from_db(fields=["status", "completed_at", "updated_at"])
        else:
            assignment.status = AssignmentStatus.COMPLETED
            assignment.completed_at = timezone.now()
            assignment.save(update_fields=["status", "completed_at", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="assignment_completed",
            target=assignment.submission,
            before_state={"status": previous_status},
            after_state={"status": assignment.status, "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else ""},
            metadata={"assignment_id": str(assignment.id), "note": note},
        )
        return assignment

    @staticmethod
    @transaction.atomic
    def resolve_conflict(assignment, actor, resolution_note: str = "", reopen_assignment: bool = False):
        assignment = AssignmentService._locked_assignment(assignment)
        if not hasattr(assignment, "conflict_declaration"):
            raise ValidationError("This assignment does not have a conflict declaration.")
        declaration = assignment.conflict_declaration
        declaration.resolved = True
        declaration.save(update_fields=["resolved", "updated_at"])
        if reopen_assignment:
            assignment.status = AssignmentStatus.ASSIGNED
            assignment.save(update_fields=["status", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="assignment_conflict_resolved",
            target=assignment.submission,
            metadata={"assignment_id": str(assignment.id), "reopen_assignment": reopen_assignment, "resolution_note": resolution_note},
        )
        return assignment

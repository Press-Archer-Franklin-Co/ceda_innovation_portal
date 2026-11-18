from django.db.models import Avg, Count, F, Q
from django.utils import timezone

from apps.assignments.models import Assignment
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog
from apps.notifications.services import NotificationService
from apps.core.constants import AssignmentStatus, AssignmentRoleType, CommunicationStatus
from apps.evaluation.models import ScoreSheet
from apps.support.models import EscalationRecord, InternalTask
from apps.workflow.models import WorkflowInstance


class OperationsService:
    @staticmethod
    def stuck_workflows():
        cutoff = timezone.now() - timezone.timedelta(hours=72)
        return WorkflowInstance.objects.select_related("submission", "current_step", "workflow_definition").filter(
            status__in=[WorkflowInstance.STATUS_IN_PROGRESS, WorkflowInstance.STATUS_RETURNED]
        ).filter(Q(updated_at__lte=cutoff) | Q(due_at__lt=timezone.now()))

    @staticmethod
    def overdue_workflows():
        return WorkflowInstance.objects.select_related("submission", "current_step").filter(
            status=WorkflowInstance.STATUS_IN_PROGRESS,
            due_at__isnull=False,
            due_at__lt=timezone.now(),
        )

    @staticmethod
    def overdue_assignments():
        return Assignment.objects.select_related("submission", "assignee", "workflow_step").filter(
            deadline__lt=timezone.now(),
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
        )

    @staticmethod
    def overdue_evaluations():
        return OperationsService.overdue_assignments().filter(role_type=AssignmentRoleType.JUDGE)

    @staticmethod
    def notification_failures():
        return CommunicationLog.objects.select_related("recipient", "notification").filter(status=CommunicationStatus.FAILED)

    @staticmethod
    def workflow_throughput():
        completed = WorkflowInstance.objects.filter(status__in=[WorkflowInstance.STATUS_COMPLETED, WorkflowInstance.STATUS_REJECTED, WorkflowInstance.STATUS_CANCELLED])
        return {
            "completed_workflows": completed.count(),
            "average_completion_hours": round(
                sum((item.completed_at - item.created_at).total_seconds() / 3600 for item in completed if item.completed_at) / completed.count(),
                2,
            ) if completed.exists() else 0,
        }

    @staticmethod
    def bottlenecks():
        rows = WorkflowInstance.objects.filter(status__in=[WorkflowInstance.STATUS_IN_PROGRESS, WorkflowInstance.STATUS_PAUSED]).values(
            "workflow_definition__program__title",
            "current_step__name",
        ).annotate(
            total=Count("id"),
            overdue=Count("id", filter=Q(due_at__lt=timezone.now())),
        ).order_by("-overdue", "-total")
        return list(rows)

    @staticmethod
    def dashboard():
        return {
            "stuck_workflows": OperationsService.stuck_workflows().count(),
            "overdue_workflows": OperationsService.overdue_workflows().count(),
            "overdue_assignments": OperationsService.overdue_assignments().count(),
            "overdue_evaluations": OperationsService.overdue_evaluations().count(),
            "notification_failures": OperationsService.notification_failures().count(),
            "pending_support_tasks": InternalTask.objects.filter(status="open").count(),
            "throughput": OperationsService.workflow_throughput(),
        }

    @staticmethod
    def reminders_preview():
        return {
            "assignment_reminders": [
                {
                    "assignment_id": str(item.id),
                    "reference_number": item.submission.reference_number,
                    "assignee_name": item.assignee.full_name,
                    "deadline": item.deadline,
                }
                for item in OperationsService.overdue_assignments()[:20]
            ],
            "evaluation_reminders": [
                {
                    "assignment_id": str(item.id),
                    "reference_number": item.submission.reference_number,
                    "assignee_name": item.assignee.full_name,
                    "deadline": item.deadline,
                }
                for item in OperationsService.overdue_evaluations()[:20]
            ],
        }

    @staticmethod
    def dispatch_reminders_and_escalations():
        sent = {"assignment_reminders": 0, "evaluation_reminders": 0, "escalations": 0}
        for assignment in OperationsService.overdue_assignments().select_related("submission", "assignee")[:100]:
            NotificationService.notify(
                user=assignment.assignee,
                notification_type="assignment_overdue",
                title="Assignment overdue",
                message=f"Your assignment for {assignment.submission.reference_number or assignment.submission.title} is overdue.",
                send_email=True,
            )
            sent["assignment_reminders"] += 1
            if assignment.role_type == AssignmentRoleType.JUDGE:
                sent["evaluation_reminders"] += 1
            task = InternalTask.objects.create(
                title=f"Escalate overdue assignment {assignment.submission.reference_number or assignment.submission.title}",
                description=f"Assignment {assignment.id} is overdue and may require reassignment.",
                assignee=assignment.assigned_by,
                due_date=timezone.localdate(),
                status="open",
            )
            EscalationRecord.objects.create(task=task, reason="Automatic escalation for overdue assignment.", escalated_by=assignment.assigned_by)
            sent["escalations"] += 1
        return sent

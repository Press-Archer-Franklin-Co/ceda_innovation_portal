from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.communications.models import CommunicationLog, Notification
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.evaluation.models import EvaluationRound, Rubric, RubricCriterion
from apps.notifications.services import NotificationService
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.models import WorkflowInstance
from apps.workflow.services import WorkflowRuntimeService


class OperationsWorkflowSafetyApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="ops-officer@example.com", password="StrongPass123", first_name="Ops", last_name="Officer")
        self.judge = User.objects.create_user(email="ops-judge@example.com", password="StrongPass123", first_name="Ops", last_name="Judge")
        self.innovator = User.objects.create_user(email="ops-innovator@example.com", password="StrongPass123", first_name="Ops", last_name="Innovator")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Ops Hackathon",
            slug="ops-hackathon",
            description="Ops",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Ops Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem",
            key="problem",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Ops Submission",
        )
        SubmissionService.save_responses(self.submission, [{"form_field": self.field.id, "value": "Needs judging"}], actor=self.innovator)
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="screen")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="shortlist")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="judge")
        self.assignment = AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
            deadline=timezone.now() - timezone.timedelta(days=1),
        )
        AssignmentService.respond(self.assignment, self.judge, accept=True)
        self.rubric = Rubric.objects.create(title="Ops Rubric", program_type=program_type, total_weight=100)
        self.criterion = RubricCriterion.objects.create(rubric=self.rubric, name="Innovation", weight=100, min_score=0, max_score=10, ordering=1)
        self.evaluation_round = EvaluationRound.objects.create(program=self.program, rubric=self.rubric, name="Round", required_judges=2)
        instance = self.submission.workflow_instance
        instance.due_at = timezone.now() - timezone.timedelta(days=1)
        instance.save(update_fields=["due_at", "updated_at"])

    def test_stuck_and_overdue_endpoints_and_force_controls(self):
        self.client.force_authenticate(self.officer)
        stuck = self.client.get("/api/workflows/stuck/")
        overdue = self.client.get("/api/workflows/overdue/")
        pause = self.client.post(f"/api/workflows/{self.submission.workflow_instance.id}/pause/", {"reason": "Waiting for CEDA panel"}, format="json")
        resume = self.client.post(f"/api/workflows/{self.submission.workflow_instance.id}/resume/", {"reason": "Panel available"}, format="json")
        force_advance = self.client.post(f"/api/submissions/{self.submission.id}/workflow-action/force-advance/", {"reason": "Emergency override"}, format="json")
        force_close = self.client.post(f"/api/submissions/{self.submission.id}/workflow-action/force-close/", {"reason": "Withdrawn"}, format="json")

        self.assertEqual(stuck.status_code, 200)
        self.assertEqual(overdue.status_code, 200)
        self.assertEqual(pause.status_code, 200)
        self.assertEqual(resume.status_code, 200)
        self.assertEqual(force_advance.status_code, 200)
        self.assertEqual(force_close.status_code, 200)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.current_status, "closed")

    def test_pending_overdue_readiness_and_assignment_operations(self):
        self.client.force_authenticate(self.officer)
        pending = self.client.get("/api/evaluations/pending/")
        overdue = self.client.get("/api/evaluations/overdue/")
        readiness = self.client.get(f"/api/submissions/{self.submission.id}/evaluation-readiness/")
        stats = self.client.get("/api/reviewer-queue/stats/")
        assignments_overdue = self.client.get("/api/assignments/overdue/")
        suggestions = self.client.get(f"/api/reviewer-suggestions/?submission={self.submission.id}&role_type=judge")
        reassign = self.client.post(f"/api/assignments/{self.assignment.id}/reassign/", {"assignee": str(self.judge.id)}, format="json")
        unassign = self.client.post(f"/api/assignments/{self.assignment.id}/unassign/", {}, format="json")

        self.assertEqual(pending.status_code, 200)
        self.assertEqual(overdue.status_code, 200)
        self.assertEqual(readiness.status_code, 200)
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(assignments_overdue.status_code, 200)
        self.assertEqual(suggestions.status_code, 200)
        self.assertEqual(reassign.status_code, 200)
        self.assertEqual(unassign.status_code, 200)

    def test_notification_retry_and_operations_dashboard(self):
        self.client.force_authenticate(self.officer)
        with patch("apps.communications.services.EmailNotificationService.send_generic_notification_email", side_effect=RuntimeError("smtp failed")):
            notification = NotificationService.notify(
                user=self.innovator,
                notification_type="assignment_created",
                title="Assigned",
                message="You have a new assignment.",
                send_email=True,
            )
        log = CommunicationLog.objects.get(notification=notification)
        self.assertEqual(log.status, "failed")

        self.client.force_authenticate(self.innovator)
        delivery_status = self.client.get("/api/notifications/delivery-status/")
        retry = self.client.post(f"/api/notifications/{notification.id}/retry/", {}, format="json")
        unread = self.client.get("/api/notifications/unread-count/")

        self.client.force_authenticate(self.officer)
        dashboard = self.client.get("/api/operations/dashboard/")
        bottlenecks = self.client.get("/api/operations/bottlenecks/")
        throughput = self.client.get("/api/operations/workflow-throughput/")
        failures = self.client.get("/api/operations/notification-failures/")
        reminders = self.client.get("/api/operations/reminders-preview/")
        audit_workflows = self.client.get("/api/audit/workflows/")
        audit_notifications = self.client.get("/api/audit/notifications/")

        self.assertEqual(delivery_status.status_code, 200)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(unread.status_code, 200)
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(bottlenecks.status_code, 200)
        self.assertEqual(throughput.status_code, 200)
        self.assertEqual(failures.status_code, 200)
        self.assertEqual(reminders.status_code, 200)
        self.assertEqual(audit_workflows.status_code, 200)
        self.assertEqual(audit_notifications.status_code, 200)

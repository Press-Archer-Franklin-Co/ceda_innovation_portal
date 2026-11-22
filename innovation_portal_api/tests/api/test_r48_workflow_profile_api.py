"""R-48 c to e: workflow templates and the board (3.21a, 3.22), step settings and staff teams (3.21), daily summary and profile (3.39)."""

import io
from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from apps.accounts.models import User
from apps.assignments.models import Assignment, ReviewPanel
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog, Notification, NotificationPreference
from apps.core.constants import AssignmentRoleType, AssignmentStatus, SubmissionStatus, SubmissionType
from apps.evaluation.models import MarkingCriteria, StageEvaluationConfig
from apps.notifications.daily_summary import send_daily_summaries
from apps.notifications.services import NotificationService
from apps.programs.models import Program
from apps.submissions.models import Submission
from apps.workflow.models import TaskExecution, WorkflowDefinition, WorkflowInstance
from tests.api.test_challenges_b5_api import B5TestCase, data


class WorkflowBuilderTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.officer)
        self.program = self.challenge("Cold chain")
        self.general = Program.objects.create(title="General ideas", slug="general-ideas", program_type=self.type, owner=self.officer, is_general_intake=True)

    def create(self, **body):
        return self.client.post("/api/workflow-definitions/", body, format="json")

    def test_templates_create_from_and_copy(self):
        templates = data(self.client.get("/api/workflow-templates/"))
        self.assertEqual([item["name"] for item in templates], ["Challenge with panel", "General idea review", "Quick yes or no"])
        self.assertEqual(templates[0]["step_count"], 3)

        made = self.create(from_template="challenge_with_panel", name="Cold chain panel", program=str(self.program.id))
        self.assertEqual(made.status_code, 201, made.content)
        made = data(made)
        self.assertEqual((made["step_count"], made["status"]), (3, "draft"))
        self.assertEqual(made["used_by"], [{"id": str(self.program.id), "title": "Cold chain", "general_ideas": False}])
        self.assertEqual([step["code"] for step in made["steps"]], ["screening", "judging", "final_decision"])

        general = data(self.create(from_template="quick_yes_no", name="Yes or no", general_ideas=True))
        self.assertEqual(general["used_by"][0]["title"], "General ideas")
        self.assertTrue(general["used_by"][0]["general_ideas"])

        copy = data(self.create(copy_of=made["id"], name="Copy for general", general_ideas=True))
        self.assertEqual((copy["step_count"], copy["program"]), (3, str(self.general.id)))
        self.assertTrue(AuditLog.objects.filter(action_type="workflow_created_from").exists())

        listed = {item["id"]: item for item in data(self.client.get("/api/workflow-definitions/"))}
        self.assertEqual(listed[made["id"]]["step_count"], 3)
        for body in ({"name": "x", "from_template": "nope", "program": str(self.program.id)}, {"from_template": "quick_yes_no", "program": str(self.program.id)}, {"name": "x", "from_template": "quick_yes_no"}):
            self.assertEqual(self.create(**body).status_code, 400, body)

    def test_step_settings_and_teams(self):
        definition = WorkflowDefinition.objects.get(id=data(self.create(from_template="challenge_with_panel", name="Panel", program=str(self.program.id)))["id"])
        judging = definition.steps.get(code="judging")
        judges = [User.objects.create_user(email=f"r48-judge{n}@example.com", password="StrongPass123", first_name=f"Judge{n}") for n in range(2)]
        team = self.client.post("/api/staff-teams/", {"name": "Agribusiness panel", "members": [str(user.id) for user in judges]}, format="json")
        self.assertEqual(team.status_code, 201, team.content)
        team = data(team)
        self.assertEqual((team["member_count"], team["label"]), (2, "Agribusiness panel (2 people)"))

        settings = data(self.client.get(f"/api/workflow-steps/{judging.id}/settings/"))
        self.assertEqual((settings["judges_per_idea"], settings["share_out"], settings["time_limit_days"]), (3, "least_busy", 7))
        self.assertTrue(settings["duties"]["conflict_first"])

        criteria = MarkingCriteria.objects.create(title="Challenge criteria")
        final = definition.steps.get(code="final_decision")
        body = {
            "who_has_it": {"mode": "team", "team_id": team["id"]},
            "judges_per_idea": 2,
            "share_out": "take_turns",
            "duties": {"comment_every_criterion": True, "see_other_scores": False},
            "buttons": ["approve", "reject", "request_info"],
            "marking_criteria": str(criteria.id),
            "pass_mark": 60,
            "time_limit_days": 5,
            "reminder_after_days": 2,
            "next_steps": [{"when": "score>=60", "to_step": str(final.id)}],
        }
        response = self.client.patch(f"/api/workflow-steps/{judging.id}/settings/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        saved = data(response)
        self.assertEqual(saved["who_has_it"]["mode"], "team")
        self.assertEqual(saved["who_has_it"]["team_id"], team["id"])
        self.assertEqual((saved["judges_per_idea"], saved["pass_mark"], saved["time_limit_days"], saved["reminder_after_days"]), (2, 60.0, 5, 2))
        self.assertEqual(saved["duties"], {"conflict_first": True, "comment_every_criterion": True, "see_other_scores": False})
        self.assertEqual(saved["next_steps"], [{"when": "score>=60", "to_step": str(final.id)}])
        judging.refresh_from_db()
        self.assertEqual((judging.due_in_hours, judging.minimum_assignments, judging.actions_allowed), (120, 2, ["approve", "reject", "request_info"]))
        config = StageEvaluationConfig.objects.get(workflow_step=judging)
        self.assertEqual((config.marking_criteria_id, config.required_reviewer_count, config.blind_scoring), (criteria.id, 2, True))

        for bad in ({"who_has_it": {"mode": "team", "team_id": str(self.officer.id)}}, {"buttons": []}, {"share_out": "random"}, {"next_steps": [{"when": "always", "to_step": str(self.officer.id)}]}):
            self.assertEqual(self.client.patch(f"/api/workflow-steps/{judging.id}/settings/", bad, format="json").status_code, 400, bad)

        self.assertEqual(self.client.delete(f"/api/staff-teams/{team['id']}/").status_code, 200)
        self.assertFalse(ReviewPanel.objects.get(id=team["id"]).is_active)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get("/api/staff-teams/").status_code, 403)

    def test_board(self):
        definition = WorkflowDefinition.objects.get(id=data(self.create(from_template="general_idea_review", name="Review", program=str(self.program.id)))["id"])
        screening, review = definition.steps.get(code="screening"), definition.steps.get(code="under_review")
        now = timezone.now()

        def idea(title, step, days, status=WorkflowInstance.STATUS_IN_PROGRESS):
            submission = Submission.objects.create(
                reference_number=f"R48-{Submission.objects.count() + 1:04d}", program=self.program, innovator=self.innovator,
                submission_type=SubmissionType.IDEA, title=title, submitted_at=now, current_status=SubmissionStatus.SCREENING,
            )  # fmt: skip
            instance = WorkflowInstance.objects.create(submission=submission, workflow_definition=definition, current_step=step, status=status, started_at=now - timedelta(days=days))
            task = TaskExecution.objects.create(workflow_instance=instance, workflow_step=step, assignee=self.officer)
            TaskExecution.objects.filter(pk=task.pk).update(created_at=now - timedelta(days=days))
            return submission, instance

        late, _ = idea("Solar dryer", screening, 5)  # limit 3 days
        idea("Water tank", screening, 1)
        reviewed, _ = idea("Cold room", review, 2)
        Assignment.objects.create(submission=reviewed, assignee=self.officer, workflow_step=review, role_type=AssignmentRoleType.OFFICER, status=AssignmentStatus.ASSIGNED)
        _, finished = idea("Old idea", review, 9, status=WorkflowInstance.STATUS_COMPLETED)
        WorkflowInstance.objects.filter(pk=finished.pk).update(completed_at=now)
        done_task = TaskExecution.objects.create(workflow_instance=finished, workflow_step=screening, status=TaskExecution.STATUS_COMPLETED, completed_at=now)
        TaskExecution.objects.filter(pk=done_task.pk).update(created_at=now - timedelta(days=2))

        result = data(self.client.get(f"/api/workflow-definitions/{definition.id}/board/"))
        columns = {column["name"]: column for column in result["columns"]}
        self.assertEqual([column["name"] for column in result["columns"]], ["Quick check", "Officer review", "Manager decision"])
        self.assertEqual((columns["Quick check"]["count"], columns["Quick check"]["time_limit_days"]), (2, 3.0))
        first = columns["Quick check"]["items"][0]
        self.assertEqual((first["title"], first["days_waiting"], first["overdue"]), ("Solar dryer", 5, True))
        self.assertFalse(columns["Quick check"]["items"][1]["overdue"])
        self.assertEqual(columns["Officer review"]["items"][0]["owner"], "Kago T.")
        self.assertEqual(result["done"]["count"], 1)
        waits = {row["name"]: row["days"] for row in result["average_days_waiting"]}
        self.assertEqual((waits["Quick check"], waits["Manager decision"]), (2.0, None))


class DailySummaryAndProfileTests(B5TestCase):
    def test_daily_summary_holds_emails_and_sends_one(self):
        self.client.force_authenticate(self.officer)
        prefs = data(self.client.get("/api/notifications/preferences/"))
        self.assertFalse(prefs["daily_summary"])
        self.assertEqual([group["code"] for group in prefs["staff_groups"]], ["new_assignment", "replies", "approvals", "deadlines"])
        self.assertIn("assignment_created", prefs["staff_groups"][0]["types"])
        response = self.client.put("/api/notifications/preferences/", {"daily_summary": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(data(response)["daily_summary"])

        with patch("apps.communications.services.CommunicationService._dispatch_or_enqueue"):
            NotificationService.notify(user=self.officer, notification_type="assignment_created", title="New idea for you", message="Solar dryer", send_email=True)
            NotificationService.notify(user=self.officer, notification_type="applicant_reply", title="Neo replied", message="", send_email=True)
            self.assertFalse(CommunicationLog.objects.filter(recipient=self.officer).exists())  # held back
            self.assertEqual(send_daily_summaries(), 1)
        log = CommunicationLog.objects.get(recipient=self.officer)
        self.assertIn("New idea for you: Solar dryer", log.rendered_body)
        self.assertIn("Neo replied", log.rendered_body)
        self.assertEqual(send_daily_summaries(), 0)  # nothing new since
        self.assertEqual(Notification.objects.filter(recipient=self.officer).count(), 2)
        self.assertIsNotNone(NotificationPreference.objects.get(user=self.officer).daily_summary_sent_at)

    @override_settings(MEDIA_ROOT="/tmp/r48-media")
    def test_profile_update_and_photo(self):
        self.client.force_authenticate(self.officer)
        response = self.client.patch("/api/auth/me/", {"first_name": "Kagiso", "phone_number": "+267 71 234 567", "preferred_language": "tn"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        me = data(response)
        self.assertEqual((me["first_name"], me["phone_number"], me["preferred_language"], me["photo_url"]), ("Kagiso", "+267 71 234 567", "tn", None))
        self.assertTrue(AuditLog.objects.filter(action_type="account_profile_updated").exists())
        self.assertEqual(self.client.patch("/api/auth/me/", {"first_name": " "}, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/auth/me/", {"preferred_language": "fr"}, format="json").status_code, 400)

        buffer = io.BytesIO()
        Image.new("RGB", (800, 600), "green").save(buffer, format="PNG")
        photo = SimpleUploadedFile("me.png", buffer.getvalue(), content_type="image/png")
        response = self.client.post("/api/auth/me/photo/", {"file": photo}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(data(response)["photo_url"].endswith(".jpg"))
        self.officer.refresh_from_db()
        with Image.open(self.officer.photo.path) as saved:
            self.assertEqual(saved.size, (512, 512))
        self.assertIsNotNone(data(self.client.get("/api/auth/me/"))["photo_url"])
        bad = SimpleUploadedFile("me.png", b"not a photo", content_type="image/png")
        self.assertEqual(self.client.post("/api/auth/me/photo/", {"file": bad}, format="multipart").status_code, 400)
        self.assertIsNone(data(self.client.delete("/api/auth/me/photo/"))["photo_url"])
        self.officer.refresh_from_db()
        self.assertFalse(self.officer.photo)

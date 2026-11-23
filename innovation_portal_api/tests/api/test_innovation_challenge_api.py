from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.communications.models import Notification
from apps.content.models import HackathonDetail, WinnerSpotlight
from apps.core.constants import ProgramAudience, ProgramTypeCode, RoleType, SubmissionStatus, SubmissionType
from apps.evaluation.models import ReviewCycle
from apps.programs.challenge_results import ChallengeResultsService
from apps.programs.general_idea import ensure_published_version
from apps.programs.models import Program, ProgramType, SubmissionForm
from apps.submissions.models import Submission
from apps.workflow.models import WorkflowDefinition, WorkflowInstance


class InnovationChallengeTestMixin:
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="officer@ceda.co.bw", password="StrongPass123", first_name="Ofi", last_name="Cer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.staff = User.objects.create_user(email="staff@ceda.co.bw", password="StrongPass123", first_name="Staff", last_name="Member", email_verified=True)
        self.outsider = User.objects.create_user(email="person@example.com", password="StrongPass123", first_name="Pub", last_name="Lic", email_verified=True)
        RoleService.assign_roles(self.staff, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.outsider, [RoleType.INNOVATOR])
        self.challenge_type, _ = ProgramType.objects.get_or_create(
            code=ProgramTypeCode.INNOVATION_CHALLENGE, defaults={"name": "Innovation Challenge"}
        )

    def make_challenge(self, *, audience=ProgramAudience.INTERNAL, opens_in_days=-1, closes_in_days=5, title="Staff Challenge"):
        now = timezone.now()
        program = Program.objects.create(
            title=title,
            description="Challenge",
            program_type=self.challenge_type,
            opening_date=now + timezone.timedelta(days=opens_in_days),
            closing_date=now + timezone.timedelta(days=closes_in_days),
            owner=self.officer,
            status="published",
            is_public=True,
            audience=audience,
        )
        ensure_published_version(SubmissionForm.objects.create(program=program, title="Entry form"))
        program.refresh_from_db()
        return program

    def save_draft(self, user, program):
        self.client.force_authenticate(user)
        return self.client.post(
            "/api/drafts/",
            {"program": str(program.id), "submission_type": SubmissionType.INNOVATION_CHALLENGE, "title": "My entry", "draft_data": {}},
            format="json",
        )


class InnovationChallengeAccessTests(InnovationChallengeTestMixin, TestCase):
    def public_titles(self, user=None):
        if user:
            self.client.force_authenticate(user)
        else:
            self.client.force_authenticate(None)
        response = self.client.get("/api/programs/public/")
        self.assertEqual(response.status_code, 200)
        return {item["title"] for item in response.data}

    def test_internal_challenge_is_only_listed_for_ceda_staff(self):
        self.make_challenge(audience=ProgramAudience.INTERNAL, title="Internal one")
        self.assertIn("Internal one", self.public_titles(self.staff))
        self.assertNotIn("Internal one", self.public_titles(self.outsider))
        self.assertNotIn("Internal one", self.public_titles())

    def test_internal_challenge_detail_is_hidden_from_outsiders(self):
        program = self.make_challenge(audience=ProgramAudience.INTERNAL)
        HackathonDetail.objects.create(program=program, is_published=True, eligibility="CEDA staff")
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f"/api/programs/{program.id}/").status_code, 404)
        self.assertEqual(self.client.get("/api/content/hackathons/", {"program": str(program.id)}).data, [])

        self.client.force_authenticate(self.staff)
        response = self.client.get(f"/api/programs/{program.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["entry"]["can_enter"])
        self.assertEqual(response.data["entry"]["entries_used"], 0)

    def test_staff_can_enter_internal_challenge_and_outsider_cannot(self):
        program = self.make_challenge(audience=ProgramAudience.INTERNAL)
        self.assertEqual(self.save_draft(self.staff, program).status_code, 201)
        self.assertEqual(self.save_draft(self.outsider, program).status_code, 403)

    def test_ceda_staff_are_blocked_from_public_challenge(self):
        program = self.make_challenge(audience=ProgramAudience.PUBLIC)
        self.assertEqual(self.save_draft(self.staff, program).status_code, 403)
        self.assertEqual(self.save_draft(self.outsider, program).status_code, 201)

    def test_entry_limit_per_person(self):
        program = self.make_challenge()
        program.max_entries_per_person = 1
        program.save(update_fields=["max_entries_per_person"])
        Submission.objects.create(
            program=program,
            innovator=self.staff,
            submission_type=SubmissionType.INNOVATION_CHALLENGE,
            title="First entry",
            submitted_at=timezone.now(),
        )
        response = self.save_draft(self.staff, program)
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum of 1 entry", str(response.data))

        self.client.force_authenticate(self.staff)
        entry = self.client.get(f"/api/programs/{program.id}/").data["entry"]
        self.assertEqual((entry["can_enter"], entry["blocked_by"], entry["entries_used"], entry["max_entries"]), (False, "limit", 1, 1))

        other = User.objects.create_user(email="second@ceda.co.bw", password="StrongPass123", first_name="Sec", last_name="Ond", email_verified=True)
        self.assertEqual(self.save_draft(other, program).status_code, 201)

    def test_entries_are_locked_before_start_and_after_end(self):
        not_open = self.make_challenge(opens_in_days=1, closes_in_days=5, title="Not open")
        self.assertEqual(self.save_draft(self.staff, not_open).status_code, 400)

        open_now = self.make_challenge(title="Open")
        response = self.save_draft(self.staff, open_now)
        self.assertEqual(response.status_code, 201)
        open_now.closing_date = timezone.now() - timezone.timedelta(minutes=1)
        open_now.save(update_fields=["closing_date"])

        draft_id = response.data["id"]
        edit = self.client.patch(f"/api/drafts/{draft_id}/", {"title": "Edited late"}, format="json")
        self.assertEqual(edit.status_code, 400)
        self.assertEqual(self.client.post(f"/api/drafts/{draft_id}/submit/").status_code, 400)


class ChallengeResultsTests(InnovationChallengeTestMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.make_challenge(opens_in_days=-10, closes_in_days=-2)
        self.program.judging_end = timezone.now() - timezone.timedelta(hours=1)
        self.program.save(update_fields=["judging_end"])
        HackathonDetail.objects.create(
            program=self.program,
            prizes=[
                {"position": "1st Place", "label": "Grand Prize", "amount": "BWP 50,000"},
                {"position": "2nd Place", "label": "Runner-up", "amount": "BWP 20,000"},
            ],
        )
        self.definition = WorkflowDefinition.objects.create(name="Flow", code="flow", program=self.program, version=1)
        self.entrants = [
            User.objects.create_user(email=f"entrant{i}@ceda.co.bw", password="StrongPass123", first_name=f"E{i}", last_name="Ntrant")
            for i in range(3)
        ]

    def add_entry(self, index, *, score, workflow_status="completed"):
        submission = Submission.objects.create(
            program=self.program,
            innovator=self.entrants[index],
            submission_type=SubmissionType.INNOVATION_CHALLENGE,
            title=f"Entry {index}",
            reference_number=f"CEDA-IC-2026-00000{index}",
            submitted_at=timezone.now() - timezone.timedelta(days=2, minutes=index),
            current_status=SubmissionStatus.UNDER_JUDGING,
        )
        WorkflowInstance.objects.create(submission=submission, workflow_definition=self.definition, status=workflow_status)
        if score is not None:
            ReviewCycle.objects.create(
                submission=submission,
                status=ReviewCycle.STATUS_COMPLETED,
                aggregate_pct=Decimal(score),
                closed_at=timezone.now(),
            )
        return submission

    def test_waits_until_marking_closes_even_when_everything_is_marked(self):
        self.add_entry(0, score="80")
        self.add_entry(1, score="70")
        self.program.judging_end = timezone.now() + timezone.timedelta(hours=1)
        self.program.save(update_fields=["judging_end"])
        self.assertFalse(ChallengeResultsService.try_announce(self.program))
        self.program.refresh_from_db()
        self.assertIsNone(self.program.results_announced_at)

        self.program.judging_end = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["judging_end"])
        self.assertTrue(ChallengeResultsService.try_announce(self.program))

    def test_unmarked_entries_are_left_out(self):
        self.add_entry(0, score="80")
        unmarked = self.add_entry(1, score=None, workflow_status="in_progress")
        self.assertTrue(ChallengeResultsService.try_announce(self.program))
        self.assertFalse(WinnerSpotlight.objects.filter(submission=unmarked).exists())

    def test_missing_marking_closes_holds_results(self):
        self.program.judging_end = None
        self.program.save(update_fields=["judging_end"])
        self.add_entry(0, score="80")
        self.assertFalse(ChallengeResultsService.try_announce(self.program))
        self.program.refresh_from_db()
        self.assertIn("Marking Closes", self.program.results_hold_reason)

    def test_announces_winners_with_prizes_and_emails_everyone(self):
        first = self.add_entry(0, score="91.5")
        second = self.add_entry(1, score="78")
        third = self.add_entry(2, score="60")

        self.assertEqual(ChallengeResultsService.process_due(), 1)

        self.program.refresh_from_db()
        self.assertIsNotNone(self.program.results_announced_at)
        for submission in (first, second, third):
            submission.refresh_from_db()
        self.assertEqual(first.current_status, SubmissionStatus.WINNER)
        self.assertEqual(second.current_status, SubmissionStatus.WINNER)
        self.assertEqual(third.current_status, SubmissionStatus.UNDER_JUDGING)

        spotlight = WinnerSpotlight.objects.get(submission=first)
        self.assertEqual((spotlight.position, spotlight.prize_label, spotlight.prize_amount), ("1st", "Grand Prize", "BWP 50,000"))
        self.assertEqual(WinnerSpotlight.objects.get(submission=second).position, "2nd")
        self.assertFalse(WinnerSpotlight.objects.filter(submission=third).exists())

        self.assertTrue(Notification.objects.filter(recipient=first.innovator, notification_type="challenge_winner").exists())
        self.assertTrue(Notification.objects.filter(recipient=third.innovator, notification_type="challenge_results").exists())

        self.assertEqual(ChallengeResultsService.process_due(), 0)

    def test_tie_on_a_winning_position_holds_results_and_alerts_owner(self):
        self.add_entry(0, score="90")
        self.add_entry(1, score="75")
        self.add_entry(2, score="75")

        self.assertFalse(ChallengeResultsService.try_announce(self.program))

        self.program.refresh_from_db()
        self.assertIsNone(self.program.results_announced_at)
        self.assertIn("CEDA-IC-2026-000001", self.program.results_hold_reason)
        self.assertIn("CEDA-IC-2026-000002", self.program.results_hold_reason)
        self.assertTrue(Notification.objects.filter(recipient=self.officer, notification_type="challenge_results_on_hold").exists())
        self.assertFalse(WinnerSpotlight.objects.exists())

    def test_does_not_run_before_entries_close(self):
        self.program.closing_date = timezone.now() + timezone.timedelta(hours=1)
        self.program.save(update_fields=["closing_date"])
        self.add_entry(0, score="80")
        self.assertFalse(ChallengeResultsService.try_announce(self.program))


class HackathonMediaUploadTests(InnovationChallengeTestMixin, TestCase):
    def test_officer_can_upload_media_to_challenge_page(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        from apps.content.models import HackathonMedia

        program = self.make_challenge()
        detail = HackathonDetail.objects.create(program=program)
        self.client.force_authenticate(self.officer)
        response = self.client.post(
            "/api/content/media/",
            {
                "hackathon_detail": str(detail.id),
                "file": SimpleUploadedFile("team.png", b"\x89PNG\r\n\x1a\n", content_type="image/png"),
                "caption": "Kick-off",
                "media_type": "photo",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(HackathonMedia.objects.get().hackathon_detail, detail)

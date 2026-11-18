from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.content.models import WinnerSpotlight
from apps.core.constants import AssignmentStatus, ProgramTypeCode, RoleType, SubmissionStatus, SubmissionType
from apps.evaluation.models import MarkingCriteria, MarkingCriteriaItem
from apps.evaluation.services import EvaluationService, ReviewCycleService
from apps.programs.challenge_judging import JUDGING_STEP_CODE, ChallengeJudgingService
from apps.programs.challenge_results import ChallengeResultsService
from apps.programs.models import ChallengeJudge, Program, ProgramType
from apps.submissions.models import Submission
from apps.submissions.services import SubmissionService

SEND = "apps.communications.email_notifications.EmailNotificationService._send"


class ChallengeJudgingFlowTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="judging-officer@ceda.co.bw", password="StrongPass123", first_name="Of", last_name="Ficer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.INNOVATION_CHALLENGE, defaults={"name": "Innovation Challenge"})
        self.criteria = MarkingCriteria.objects.create(title="Challenge criteria", created_by=self.officer)
        self.items = [
            MarkingCriteriaItem.objects.create(criteria=self.criteria, name="Impact", max_score=Decimal("10"), ordering=1),
            MarkingCriteriaItem.objects.create(criteria=self.criteria, name="Feasibility", max_score=Decimal("10"), ordering=2),
        ]
        now = timezone.now()
        self.program = Program.objects.create(
            title="Judged Challenge",
            description="x",
            program_type=program_type,
            owner=self.officer,
            status="published",
            opening_date=now - timezone.timedelta(days=3),
            closing_date=now + timezone.timedelta(days=1),
            judging_end=now + timezone.timedelta(days=5),
            marking_criteria=self.criteria,
        )
        ChallengeJudgingService.sync_workflow(self.program)

        self.entries = []
        for i in range(2):
            entrant = User.objects.create_user(email=f"entrant{i}@ceda.co.bw", password="StrongPass123", first_name=f"E{i}", last_name="Ntrant")
            draft = SubmissionService.create_draft(innovator=entrant, program=self.program, submission_type=SubmissionType.INNOVATION_CHALLENGE, title=f"Entry {i}")
            self.entries.append(SubmissionService.finalize_submission(draft, entrant))

        self.client.force_authenticate(self.officer)
        for name, email in [("Kabo Judge", "kabo@ceda.co.bw"), ("Ext Expert", "Expert@Example.com")]:
            response = self.client.post(f"/api/programs/{self.program.id}/judges/", {"name": name, "email": email}, format="json")
            self.assertEqual(response.status_code, 201, response.data)

        self.program.closing_date = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["closing_date"])
        self.judge_users = [
            User.objects.create_user(email="kabo@ceda.co.bw", password="StrongPass123", first_name="Kabo", last_name="Judge"),
            User.objects.create_user(email="expert@example.com", password="StrongPass123", first_name="Ext", last_name="Expert"),
        ]

    def accept(self, user, judge):
        self.client.force_authenticate(user)
        return self.client.post(f"/api/programs/judge-invite/{judge.token}/")

    def mark(self, user, entry, scores):
        entry = Submission.objects.select_related("program", "workflow_instance").get(pk=entry.pk)
        step = entry.workflow_instance.current_step
        cycle = ReviewCycleService.get_or_open(submission=entry, workflow_step=step)
        EvaluationService.save_cycle_scores(
            submission=entry,
            judge=user,
            review_cycle=cycle,
            scores=[{"criterion_id": str(item.id), "type": "library", "raw_score": score} for item, score in zip(self.items, scores)],
        )
        EvaluationService.submit_cycle_scores(submission=entry, judge=user, review_cycle=cycle)

    def test_entries_use_the_managed_one_step_judging_workflow(self):
        for entry in self.entries:
            self.assertEqual(entry.workflow_instance.current_step.code, JUDGING_STEP_CODE)
        config = ChallengeJudgingService.judging_step(self.program).evaluation_config
        self.assertEqual(config.marking_criteria, self.criteria)
        self.assertEqual(config.required_reviewer_count, 2)

    def test_judges_are_invited_only_on_marking_day(self):
        self.program.closing_date = timezone.now() + timezone.timedelta(hours=1)
        self.program.save(update_fields=["closing_date"])
        with patch(SEND) as send:
            ChallengeJudgingService.process_due()
        send.assert_not_called()

        self.program.closing_date = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["closing_date"])
        with patch(SEND) as send:
            ChallengeJudgingService.process_due()
            ChallengeJudgingService.process_due()
        self.assertEqual(send.call_count, 2)
        self.assertEqual({call.kwargs["to_email"] for call in send.call_args_list}, {"kabo@ceda.co.bw", "expert@example.com"})
        self.assertTrue(all(judge.invited_at for judge in ChallengeJudge.objects.all()))

    def test_invite_link_only_works_for_the_invited_email(self):
        judge = ChallengeJudge.objects.get(email="kabo@ceda.co.bw")
        response = self.accept(self.judge_users[1], judge)
        self.assertEqual(response.status_code, 403)
        self.assertIn("kabo@ceda.co.bw", str(response.data))

    def test_accepting_assigns_every_entry_without_claiming(self):
        judge = ChallengeJudge.objects.get(email="expert@example.com")
        response = self.accept(self.judge_users[1], judge)
        self.assertEqual(response.status_code, 200, response.data)
        assignments = Assignment.objects.filter(assignee=self.judge_users[1])
        self.assertEqual(assignments.count(), 2)
        self.assertTrue(all(a.status == AssignmentStatus.ACCEPTED for a in assignments))
        self.assertTrue(self.judge_users[1].roles.filter(code=RoleType.JUDGE).exists())
        self.assertEqual(self.accept(self.judge_users[1], judge).status_code, 200)
        self.assertEqual(Assignment.objects.filter(assignee=self.judge_users[1]).count(), 2)

    def test_reminders_until_marked_then_winners_announced(self):
        with patch(SEND):
            ChallengeJudgingService.process_due()
        judges = [ChallengeJudge.objects.get(email="kabo@ceda.co.bw"), ChallengeJudge.objects.get(email="expert@example.com")]
        for user, judge in zip(self.judge_users, judges):
            self.accept(user, judge)

        later = timezone.now() + timezone.timedelta(hours=25)
        with patch(SEND) as send:
            ChallengeJudgingService.process_due(now=later)
        self.assertEqual(send.call_count, 2)

        for entry, scores in zip(self.entries, [(9, 9), (6, 5)]):
            for user in self.judge_users:
                self.mark(user, entry, scores)

        with patch(SEND) as send:
            ChallengeJudgingService.process_due(now=later + timezone.timedelta(hours=25))
        send.assert_not_called()

        for entry in self.entries:
            entry.workflow_instance.refresh_from_db()
            self.assertEqual(entry.workflow_instance.status, "in_progress")
        with patch(SEND):
            self.assertFalse(ChallengeResultsService.try_announce(self.program))

        self.program.judging_end = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["judging_end"])
        with patch(SEND):
            self.assertTrue(ChallengeResultsService.try_announce(self.program))
        for entry in self.entries:
            entry.workflow_instance.refresh_from_db()
            self.assertEqual(entry.workflow_instance.status, "completed")
        first = WinnerSpotlight.objects.get(position="1st")
        self.assertEqual(first.submission, self.entries[0])
        self.entries[0].refresh_from_db()
        self.assertEqual(self.entries[0].current_status, SubmissionStatus.WINNER)

    def test_marking_deadline_settles_with_the_marks_that_are_in(self):
        with patch(SEND):
            ChallengeJudgingService.process_due()
        judge = ChallengeJudge.objects.get(email="kabo@ceda.co.bw")
        self.accept(self.judge_users[0], judge)
        self.mark(self.judge_users[0], self.entries[1], (8, 8))

        self.program.judging_end = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["judging_end"])
        with self.assertRaisesMessage(Exception, "Marking for this challenge has closed"):
            self.mark(self.judge_users[0], self.entries[0], (1, 1))

        with patch(SEND):
            self.assertTrue(ChallengeResultsService.try_announce(self.program))
        self.assertEqual(WinnerSpotlight.objects.get(position="1st").submission, self.entries[1])
        self.assertEqual(WinnerSpotlight.objects.count(), 1)

    def test_judge_added_late_still_marks_every_entry(self):
        with patch(SEND):
            ChallengeJudgingService.process_due()
        for user, email in zip(self.judge_users, ["kabo@ceda.co.bw", "expert@example.com"]):
            self.accept(user, ChallengeJudge.objects.get(email=email))
        for entry, marks in zip(self.entries, [(7, 7), (5, 5)]):
            for user in self.judge_users:
                self.mark(user, entry, marks)

        self.client.force_authenticate(self.officer)
        self.client.post(f"/api/programs/{self.program.id}/judges/", {"name": "Late Judge", "email": "late@ceda.co.bw"}, format="json")
        with patch(SEND) as send:
            ChallengeJudgingService.process_due()
        self.assertEqual([call.kwargs["to_email"] for call in send.call_args_list], ["late@ceda.co.bw"])

        late = User.objects.create_user(email="late@ceda.co.bw", password="StrongPass123", first_name="Late", last_name="Judge")
        self.assertEqual(self.accept(late, ChallengeJudge.objects.get(email="late@ceda.co.bw")).status_code, 200)
        self.assertEqual(Assignment.objects.filter(assignee=late).count(), 2)
        for entry in self.entries:
            self.mark(late, entry, (1, 1))

        self.program.judging_end = timezone.now() - timezone.timedelta(minutes=1)
        self.program.save(update_fields=["judging_end"])
        with patch(SEND):
            self.assertTrue(ChallengeResultsService.try_announce(self.program))
        self.assertEqual(ChallengeResultsService._final_score(self.entries[0]), 50.0)
        self.assertEqual(ChallengeResultsService._final_score(self.entries[1]), 36.67)

    def test_marking_page_shows_the_criteria_scorecard_not_approve_reject(self):
        with patch(SEND):
            ChallengeJudgingService.process_due()
        judge = ChallengeJudge.objects.get(email="kabo@ceda.co.bw")
        self.accept(self.judge_users[0], judge)

        self.client.force_authenticate(self.judge_users[0])
        response = self.client.get(f"/api/evaluations/{self.entries[0].id}/cycle/")
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data.get("data", response.data)
        self.assertEqual([c["name"] for c in data["criteria"]], ["Impact", "Feasibility"])
        self.assertTrue(data["can_score"])
        self.assertTrue(ChallengeJudgingService.judging_step(self.program).requires_evaluation)

    def test_existing_judging_step_is_repaired_to_use_criteria(self):
        step = ChallengeJudgingService.judging_step(self.program)
        step.requires_evaluation = False
        step.save(update_fields=["requires_evaluation"])
        ChallengeJudgingService.sync_workflow(self.program)
        step.refresh_from_db()
        self.assertTrue(step.requires_evaluation)

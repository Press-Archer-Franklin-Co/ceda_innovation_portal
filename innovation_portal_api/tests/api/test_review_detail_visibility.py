"""
Review detail visibility tests — post-submission scorecard shape.

Verifies:
  1. Own marks + comments visible via MyCycleView after submission
  2. Overall comment included in own scorecard
  3. max_score present on every criterion score row
  4. Peer criterion marks + comments visible after reviewer submits (blind lifted)
  5. Peer overall_comment included in peer scorecard
  6. reviewer_name included for staff (officers); anonymised for judges
  7. submitted_at present on own and peer scorecards
  8. pending_scorecards placeholders for reviewers who haven't submitted
  9. SubmissionReviewFeedbackView — per-reviewer breakdown for staff
 10. SubmissionReviewFeedbackView — applicant sees scorecards when feedback allowed
 11. SubmissionReviewFeedbackView — applicant blocked when feedback not allowed
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.core.constants import (
    AssignmentRoleType, ProgramTypeCode, RoleType,
    ScoreSheetStatus, SubmissionFormFieldType, SubmissionType,
)
from apps.evaluation.models import (
    ReviewCycle, ScoreSheet, StageCriterion, StageEvaluationConfig,
)
from apps.evaluation.services import EvaluationService, ReviewCycleService
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService



def _make_user(email, role, first="Test", last="User"):
    u = User.objects.create_user(
        email=email, password="Pass123!", first_name=first, last_name=last
    )
    RoleService.assign_roles(u, [role])
    return u


def _make_program(pt, officer):
    return Program.objects.create(
        title="Detail Vis Program",
        slug=f"detail-vis-{pt.id}",
        description="Test",
        program_type=pt,
        opening_date=timezone.now(),
        closing_date=timezone.now() + timezone.timedelta(days=30),
        owner=officer,
    )


def _make_submission(innovator, program, field):
    sub = SubmissionService.create_draft(
        innovator=innovator, program=program,
        submission_type=SubmissionType.HACKATHON_APPLICATION,
        title="Detail Vis Submission",
    )
    SubmissionService.save_responses(
        sub, responses=[{"form_field": field.id, "value": "idea"}], actor=innovator
    )
    return SubmissionService.finalize_submission(sub, innovator)


def _advance(submission, officer, steps=3):
    for _ in range(steps):
        try:
            WorkflowRuntimeService.perform_action(
                submission=submission, actor=officer, action="approve", comment="adv"
            )
        except Exception:
            break


def _assign_accept(submission, judge, officer):
    a = AssignmentService.create_assignment(
        submission=submission, assignee=judge,
        role_type=AssignmentRoleType.JUDGE, assigned_by=officer,
    )
    AssignmentService.respond(a, judge, accept=True)
    return a


def _make_config(step, required=1, blind=True, allow_feedback=True):
    cfg = StageEvaluationConfig.objects.create(
        workflow_step=step,
        required_reviewer_count=required,
        threshold_reject_below=Decimal("40"),
        threshold_pass_above=Decimal("70"),
        blind_scoring=blind,
        allow_applicant_feedback=allow_feedback,
    )
    StageCriterion.objects.create(
        stage_config=cfg, name="Innovation",
        max_score=Decimal("10"), min_score=Decimal("0"), weight=Decimal("1"), ordering=1,
    )
    StageCriterion.objects.create(
        stage_config=cfg, name="Feasibility",
        max_score=Decimal("10"), min_score=Decimal("0"), weight=Decimal("1"), ordering=2,
    )
    return cfg


def _save_and_submit(submission, judge, cycle, config, s1=8, s2=7, comment1="c1", comment2="c2", overall="overall note"):
    criteria = list(config.custom_criteria.order_by("ordering"))
    EvaluationService.save_cycle_scores(
        submission=submission, judge=judge, review_cycle=cycle,
        scores=[
            {"criterion_id": str(criteria[0].id), "type": "stage",
             "raw_score": Decimal(str(s1)), "comment": comment1},
            {"criterion_id": str(criteria[1].id), "type": "stage",
             "raw_score": Decimal(str(s2)), "comment": comment2},
        ],
        overall_comment=overall,
    )
    return EvaluationService.submit_cycle_scores(
        submission=submission, judge=judge, review_cycle=cycle
    )



class ReviewDetailBase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

        self.officer   = _make_user("rdv-officer@example.com",   RoleType.INNOVATION_OFFICER, "Officer", "Detail")
        self.judge1    = _make_user("rdv-judge1@example.com",    RoleType.JUDGE, "Alice", "Judge")
        self.judge2    = _make_user("rdv-judge2@example.com",    RoleType.JUDGE, "Bob", "Judge")
        self.innovator = _make_user("rdv-innovator@example.com", RoleType.INNOVATOR)

        pt      = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Detail Vis PT"})[0]
        program = _make_program(pt, self.officer)
        form    = SubmissionForm.objects.create(program=program, title="F")
        field   = SubmissionFormField.objects.create(
            form=form, label="Idea", key="idea",
            field_type=SubmissionFormFieldType.TEXTAREA, required=True, ordering=1,
        )
        self.submission = _make_submission(self.innovator, program, field)
        _advance(self.submission, self.officer, steps=3)
        self.submission.refresh_from_db()

        self.step = getattr(
            getattr(self.submission, "workflow_instance", None), "current_step", None
        )

    def _cycle(self):
        return ReviewCycleService.get_or_open(
            submission=self.submission, workflow_step=self.step
        )

    def _cycle_data(self, user):
        """Fetch the cycle view response data dict."""
        self.client.force_authenticate(user)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200, r.data)
        return r.data.get("data") or r.data



class OwnMarksVisibilityTests(ReviewDetailBase):

    def setUp(self):
        super().setUp()
        self.config = _make_config(self.step, required=1, blind=True)
        _assign_accept(self.submission, self.judge1, self.officer)
        cycle = self._cycle()
        _save_and_submit(
            self.submission, self.judge1, cycle, self.config,
            s1=8, s2=6, comment1="Very innovative", comment2="Needs work",
            overall="Great idea overall",
        )

    def test_own_scores_present_in_my_scorecard(self):
        data = self._cycle_data(self.judge1)
        sc = data.get("my_scorecard")
        self.assertIsNotNone(sc)
        raw_scores = sorted([s["raw_score"] for s in sc["scores"]])
        self.assertEqual(raw_scores, [6.0, 8.0])

    def test_own_comments_present(self):
        data = self._cycle_data(self.judge1)
        sc = data["my_scorecard"]
        comments = [s["comment"] for s in sc["scores"]]
        self.assertIn("Very innovative", comments)
        self.assertIn("Needs work", comments)

    def test_overall_comment_present(self):
        data = self._cycle_data(self.judge1)
        sc = data["my_scorecard"]
        self.assertEqual(sc["overall_comment"], "Great idea overall")

    def test_max_score_on_every_score_row(self):
        data = self._cycle_data(self.judge1)
        sc = data["my_scorecard"]
        for s in sc["scores"]:
            self.assertIn("max_score", s, f"max_score missing from score row: {s}")
            self.assertEqual(s["max_score"], 10.0)

    def test_submitted_at_present(self):
        data = self._cycle_data(self.judge1)
        sc = data["my_scorecard"]
        self.assertIsNotNone(sc.get("submitted_at"))

    def test_reviewer_name_present(self):
        data = self._cycle_data(self.judge1)
        sc = data["my_scorecard"]
        self.assertEqual(sc.get("reviewer_name"), self.judge1.full_name)



class PeerMarksDetailTests(ReviewDetailBase):

    def setUp(self):
        super().setUp()
        self.config = _make_config(self.step, required=2, blind=True)
        _assign_accept(self.submission, self.judge1, self.officer)
        _assign_accept(self.submission, self.judge2, self.officer)
        cycle = self._cycle()
        _save_and_submit(
            self.submission, self.judge2, cycle, self.config,
            s1=9, s2=8, comment1="Excellent", comment2="Solid",
            overall="Impressive submission",
        )
        _save_and_submit(
            self.submission, self.judge1, cycle, self.config,
            s1=7, s2=5, comment1="Good", comment2="Weak",
            overall="Could be stronger",
        )

    def test_peer_scorecard_present(self):
        data = self._cycle_data(self.judge1)
        peers = data.get("peer_scorecards", [])
        self.assertEqual(len(peers), 1)

    def test_peer_criterion_scores_present(self):
        data = self._cycle_data(self.judge1)
        peer = data["peer_scorecards"][0]
        raw_scores = sorted([s["raw_score"] for s in peer["scores"]])
        self.assertEqual(raw_scores, [8.0, 9.0])

    def test_peer_criterion_comments_present(self):
        data = self._cycle_data(self.judge1)
        peer = data["peer_scorecards"][0]
        comments = [s["comment"] for s in peer["scores"]]
        self.assertIn("Excellent", comments)
        self.assertIn("Solid", comments)

    def test_peer_overall_comment_present(self):
        data = self._cycle_data(self.judge1)
        peer = data["peer_scorecards"][0]
        self.assertEqual(peer.get("overall_comment"), "Impressive submission")

    def test_peer_max_score_present(self):
        data = self._cycle_data(self.judge1)
        peer = data["peer_scorecards"][0]
        for s in peer["scores"]:
            self.assertIn("max_score", s)
            self.assertEqual(s["max_score"], 10.0)

    def test_peer_submitted_at_present(self):
        data = self._cycle_data(self.judge1)
        peer = data["peer_scorecards"][0]
        self.assertIsNotNone(peer.get("submitted_at"))



class ReviewerIdentityTests(ReviewDetailBase):

    def setUp(self):
        super().setUp()
        self.config = _make_config(self.step, required=2, blind=False)
        _assign_accept(self.submission, self.judge1, self.officer)
        _assign_accept(self.submission, self.judge2, self.officer)
        cycle = self._cycle()
        _save_and_submit(self.submission, self.judge2, cycle, self.config, s1=9, s2=8)
        _save_and_submit(self.submission, self.judge1, cycle, self.config, s1=7, s2=5)

    def test_officer_sees_real_name(self):
        """Officers get real reviewer names in peer_scorecards."""
        data = self._cycle_data(self.officer)
        all_labels = [
            s["reviewer_label"]
            for s in (data.get("peer_scorecards") or [])
        ]
        real_names = {self.judge1.full_name, self.judge2.full_name}
        self.assertTrue(
            any(label in real_names for label in all_labels),
            f"Expected real name in {all_labels}, judges are {real_names}",
        )

    def test_judge_sees_anonymised_label(self):
        """Regular judges see 'Reviewer N' labels, not real names."""
        data = self._cycle_data(self.judge1)
        peers = data.get("peer_scorecards", [])
        for peer in peers:
            label = peer.get("reviewer_label", "")
            self.assertNotIn(self.judge2.full_name, label,
                f"Judge saw real peer name: {label}")
            self.assertIsNone(peer.get("reviewer_name"),
                "reviewer_name should be None for judge view")



class PendingReviewerPlaceholderTests(ReviewDetailBase):

    def setUp(self):
        super().setUp()
        self.config = _make_config(self.step, required=2, blind=True)
        _assign_accept(self.submission, self.judge1, self.officer)
        _assign_accept(self.submission, self.judge2, self.officer)
        cycle = self._cycle()
        _save_and_submit(self.submission, self.judge1, cycle, self.config, s1=8, s2=7)

    def test_pending_count_reflects_missing_reviewers(self):
        data = self._cycle_data(self.judge1)
        self.assertEqual(data.get("pending_count"), 1)

    def test_pending_scorecards_placeholder_present(self):
        data = self._cycle_data(self.judge1)
        pending = data.get("pending_scorecards", [])
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["status"], "pending")

    def test_peer_scorecards_empty_before_peers_submit(self):
        """Peer scorecards should be empty (blind + no other submissions yet)."""
        data = self._cycle_data(self.judge1)
        peers = data.get("peer_scorecards", [])
        self.assertEqual(len(peers), 0)



class FeedbackViewDetailTests(ReviewDetailBase):

    def setUp(self):
        super().setUp()
        self.config = _make_config(self.step, required=1, blind=False, allow_feedback=True)
        _assign_accept(self.submission, self.judge1, self.officer)
        cycle = self._cycle()
        _save_and_submit(
            self.submission, self.judge1, cycle, self.config,
            s1=8, s2=6, comment1="Innovative idea", comment2="Needs refinement",
            overall="Strong submission",
        )

    def _feedback(self, user):
        self.client.force_authenticate(user)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200, r.data)
        return r.data.get("data") or r.data

    def test_staff_sees_per_reviewer_scorecards(self):
        data = self._feedback(self.officer)
        scorecards = data.get("scorecards", [])
        self.assertEqual(len(scorecards), 1)
        sc = scorecards[0]
        raw_scores = sorted([s["raw_score"] for s in sc["scores"]])
        self.assertEqual(raw_scores, [6.0, 8.0])

    def test_staff_sees_real_reviewer_name(self):
        data = self._feedback(self.officer)
        sc = data["scorecards"][0]
        self.assertEqual(sc.get("reviewer_name"), self.judge1.full_name)

    def test_staff_sees_criterion_comments(self):
        data = self._feedback(self.officer)
        sc = data["scorecards"][0]
        comments = [s["comment"] for s in sc["scores"]]
        self.assertIn("Innovative idea", comments)
        self.assertIn("Needs refinement", comments)

    def test_staff_sees_overall_comment(self):
        data = self._feedback(self.officer)
        sc = data["scorecards"][0]
        self.assertEqual(sc.get("overall_comment"), "Strong submission")

    def test_staff_sees_submitted_at(self):
        data = self._feedback(self.officer)
        sc = data["scorecards"][0]
        self.assertIsNotNone(sc.get("submitted_at"))

    def test_applicant_sees_scorecards_when_allowed(self):
        data = self._feedback(self.innovator)
        scorecards = data.get("scorecards", [])
        self.assertGreater(len(scorecards), 0)
        sc = scorecards[0]
        self.assertGreater(len(sc.get("scores", [])), 0)

    def test_applicant_sees_anonymised_reviewer(self):
        data = self._feedback(self.innovator)
        sc = data["scorecards"][0]
        self.assertIsNone(sc.get("reviewer_name"))
        self.assertIn("Reviewer", sc.get("reviewer_label", ""))

    def test_applicant_sees_max_score_on_criteria(self):
        data = self._feedback(self.innovator)
        sc = data["scorecards"][0]
        for s in sc["scores"]:
            self.assertIn("max_score", s)

    def test_applicant_blocked_when_feedback_disabled(self):
        """When allow_applicant_feedback=False, applicant gets 403."""
        self.config.allow_applicant_feedback = False
        self.config.save()
        self.client.force_authenticate(self.innovator)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 403)

    def test_criteria_feedback_aggregate_present(self):
        """criteria_feedback list must still be included for backward compat."""
        data = self._feedback(self.officer)
        cf = data.get("criteria_feedback", [])
        self.assertEqual(len(cf), 2)
        names = [c["criterion_name"] for c in cf]
        self.assertIn("Innovation", names)
        self.assertIn("Feasibility", names)

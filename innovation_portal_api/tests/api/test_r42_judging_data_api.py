"""R-42: data for the U8 staff screens (3.15 to 3.20)."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.communications.models import Message, MessageThread
from apps.content.models import ContentItem
from apps.content.services import ApprovalService
from apps.core.constants import AssignmentRoleType, AssignmentStatus, RoleType
from apps.profiles.models import InnovatorProfile
from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.models import ChallengeJudge, FormSection, SubmissionForm, SubmissionFormField, SubmissionFormFieldOption
from apps.reference.models import District
from apps.submissions.models import Submission, SubmissionInternalNote, SubmissionResponse

from tests.api import test_challenge_judging_api as judging

MEANINGS = [{"en": f"Score {n}", "tn": f"Palo {n}"} for n in range(1, 6)]


def data(response):
    return response.json()["data"]


class R42Base(TestCase):
    """The challenge from the judging tests, marked 1 to 5 on two criteria of weight 50."""

    accept = judging.ChallengeJudgingFlowTests.accept
    mark = judging.ChallengeJudgingFlowTests.mark

    def setUp(self):
        judging.ChallengeJudgingFlowTests.setUp(self)
        for item in self.items:
            item.max_score, item.min_score, item.weight = Decimal("5"), Decimal("1"), Decimal("50")
            item.score_meanings, item.comment_required_scores = MEANINGS, [1]
            item.save()
        self.program.pass_mark = Decimal("70")
        self.program.save(update_fields=["pass_mark"])
        with patch(judging.SEND):
            ChallengeJudgingService.process_due()
        self.judges = list(ChallengeJudge.objects.filter(program=self.program).order_by("email"))  # expert@, kabo@
        self.kabo, self.expert = self.judge_users
        self.accept(self.kabo, ChallengeJudge.objects.get(email="kabo@ceda.co.bw"))
        self.accept(self.expert, ChallengeJudge.objects.get(email="expert@example.com"))

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


class JudgingTests(R42Base):
    def test_judge_list_summary_cycle_and_scores_overview(self):
        rows = data(self.as_user(self.kabo).get("/api/evaluations/my-assigned/"))
        self.assertEqual(len(rows), 2)
        row = next(item for item in rows if item["submission_id"] == str(self.entries[0].id))
        self.assertEqual(row["program"], {"id": str(self.program.id), "title": "Judged Challenge"})
        self.assertEqual((row["assignment_id"], row["conflict"], row["my_score"]), (row["id"], "none", None))
        self.assertEqual(self.client.post(f"/api/assignments/{row['assignment_id']}/accept/").status_code, 200)

        cycle = data(self.client.get(f"/api/evaluations/{self.entries[0].id}/cycle/", {"lang": "tn"}))
        impact = cycle["criteria"][0]
        self.assertEqual((impact["min_score"], impact["max_score"]), (1.0, 5.0))
        self.assertEqual(impact["score_meanings"], [f"Palo {n}" for n in range(1, 6)])
        self.assertEqual(impact["comment_required_scores"], [1])
        bad = self.client.post(
            f"/api/evaluations/{self.entries[0].id}/cycle/scores/",
            {"scores": [{"criterion_id": impact["id"], "type": "library", "raw_score": 1}]},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

        self.mark(self.kabo, self.entries[0], [5, 4])  # 90
        self.mark(self.expert, self.entries[0], [2, 4])  # 60
        cycle = data(self.as_user(self.kabo).get(f"/api/evaluations/{self.entries[0].id}/cycle/"))
        self.assertEqual(cycle["my_scorecard"]["weighted_total"], 90.0)
        rows = {item["submission_id"]: item for item in data(self.client.get("/api/evaluations/my-assigned/"))}
        self.assertEqual(rows[str(self.entries[0].id)]["conflict"], "confirmed_none")
        self.assertEqual(rows[str(self.entries[0].id)]["my_score"], 90.0)
        summary = data(self.client.get("/api/evaluations/my-assigned/summary/"))
        self.assertEqual((summary["assigned"], summary["scored"], summary["programs"]), (2, 1, 1))
        self.assertEqual(summary["due_at"] is None, not Assignment.objects.filter(assignee=self.kabo, deadline__isnull=False).exists())

        # Judges may not read everyone's scores.
        self.assertEqual(self.client.get(f"/api/evaluations/{self.entries[0].id}/scores-overview/").status_code, 403)
        response = self.as_user(self.officer).get(f"/api/evaluations/{self.entries[0].id}/scores-overview/")
        overview = data(response)
        self.assertEqual((overview["average"], overview["pass_mark"], overview["judges_scored"], overview["judges_assigned"]), (75.0, 70.0, 2, 2))
        self.assertEqual(overview["disagreement_threshold"], 2.0)
        criteria = {item["name"]: item for item in overview["criteria"]}
        self.assertEqual(criteria["Impact"]["scores"], [{"judge": 1, "score": 5.0}, {"judge": 2, "score": 2.0}])
        self.assertEqual((criteria["Impact"]["average"], criteria["Impact"]["spread"], criteria["Impact"]["flagged"]), (3.5, 3.0, True))
        self.assertEqual((criteria["Feasibility"]["spread"], criteria["Feasibility"]["flagged"]), (0.0, False))
        self.assertNotIn("Kabo", response.content.decode())
        self.assertIsNotNone(overview["last_scored_at"])

        self.program.disagreement_threshold = Decimal("3")
        self.program.save(update_fields=["disagreement_threshold"])
        overview = data(self.client.get(f"/api/evaluations/{self.entries[0].id}/scores-overview/"))
        self.assertFalse(next(item for item in overview["criteria"] if item["name"] == "Impact")["flagged"])
        csv = self.client.get(f"/api/evaluations/{self.entries[0].id}/scores-overview/", {"format": "csv"})
        self.assertEqual(csv.status_code, 200)
        self.assertTrue(csv["Content-Type"].startswith("text/csv"))
        self.assertIn("Impact,50.0,5.0,2.0,3.5,3.0,no", csv.content.decode())

    def test_overview_counts_judges_across_cycles_of_one_step(self):
        """R-47: each submit may close its own cycle; both judges still count."""
        from apps.evaluation.models import ReviewCycle, ScoreSheet

        self.mark(self.kabo, self.entries[0], [5, 4])  # 90
        self.mark(self.expert, self.entries[0], [2, 4])  # 60
        first = ScoreSheet.objects.get(submission=self.entries[0], judge=self.kabo, is_final=True)
        second = ScoreSheet.objects.get(submission=self.entries[0], judge=self.expert, is_final=True)
        old = first.review_cycle
        old.status = ReviewCycle.STATUS_COMPLETED
        old.save(update_fields=["status"])
        newer = ReviewCycle.objects.create(
            submission=self.entries[0], workflow_step=old.workflow_step, stage_config=old.stage_config, cycle_number=old.cycle_number + 1
        )
        ScoreSheet.objects.filter(pk=second.pk).update(review_cycle=newer)
        overview = data(self.as_user(self.officer).get(f"/api/evaluations/{self.entries[0].id}/scores-overview/"))
        self.assertEqual((overview["judges_scored"], overview["judges_assigned"], overview["average"]), (2, 2, 75.0))
        impact = next(item for item in overview["criteria"] if item["name"] == "Impact")
        self.assertEqual((impact["scores"], impact["flagged"]), ([{"judge": 1, "score": 5.0}, {"judge": 2, "score": 2.0}], True))

        # A cancelled round does not count.
        ReviewCycle.objects.filter(pk=old.pk).update(status=ReviewCycle.STATUS_CANCELLED)
        overview = data(self.client.get(f"/api/evaluations/{self.entries[0].id}/scores-overview/"))
        self.assertEqual(overview["judges_scored"], 1)

    def test_threshold_is_a_judging_setting(self):
        settings = data(self.as_user(self.officer).get(f"/api/programs/{self.program.id}/judging/"))
        self.assertEqual(settings["disagreement_threshold"], 2.0)
        body = {
            "criteria": [{"id": str(item.id), "name": item.name, "weight": "50"} for item in self.items],
            "disagreement_threshold": "1.5",
        }
        response = self.client.put(f"/api/programs/{self.program.id}/judging/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(data(response)["disagreement_threshold"], 1.5)

    def test_step_without_config_scores_on_the_challenge_criteria(self):
        step = ChallengeJudgingService.judging_step(self.program)
        step.evaluation_config.delete()
        self.program.refresh_from_db()
        response = self.as_user(self.kabo).get(f"/api/evaluations/{self.entries[1].id}/cycle/")
        self.assertEqual([item["name"] for item in data(response)["criteria"]], ["Impact", "Feasibility"])


class StaffListTests(R42Base):
    def setUp(self):
        super().setUp()
        self.maun = District.objects.create(slug="r42-maun", name={"en": "Maun", "tn": "Maun"})
        first, second = self.entries
        Submission.objects.filter(pk=first.pk).update(channel="whatsapp", district=self.maun)
        Submission.objects.filter(pk=second.pk).update(current_status="shortlisted")
        Assignment.objects.create(submission=second, assignee=self.officer, role_type=AssignmentRoleType.OFFICER, assigned_by=self.officer)
        self.mark(self.kabo, first, [5, 4])

    def test_rows_views_filters_and_ordering(self):
        listing = data(self.as_user(self.officer).get("/api/submissions/staff-list/", {"ordering": "-score"}))
        self.assertEqual(listing["count"], 2)
        self.assertEqual(listing["views"], {"all": 2, "mine": 1, "needs_input": 0, "shortlisted": 1, "channels": 1})
        top = listing["results"][0]
        self.assertEqual(top["id"], str(self.entries[0].id))
        self.assertEqual((top["score"], top["channel"], top["district"]["name"]), (90.0, "whatsapp", "Maun"))
        self.assertEqual(top["innovator"], {"name": "E0 Ntrant", "initials": "EN", "is_guest": False, "contact": None})
        self.assertIsNone(listing["results"][1]["score"])
        self.assertEqual(listing["results"][1]["stage_label"], "Shortlisted")

        def ids(**params):
            return [row["id"] for row in data(self.client.get("/api/submissions/staff-list/", params))["results"]]

        self.assertEqual(ids(view="mine"), [str(self.entries[1].id)])
        self.assertEqual(ids(channel="whatsapp"), [str(self.entries[0].id)])
        self.assertEqual(ids(district="r42-maun"), [str(self.entries[0].id)])
        self.assertEqual(ids(stage="shortlisted"), [str(self.entries[1].id)])
        self.assertEqual(ids(search="E1"), [str(self.entries[1].id)])
        self.assertEqual(ids(submitted_from=(date.today() + timedelta(days=2)).isoformat()), [])
        page = data(self.client.get("/api/submissions/staff-list/", {"page_size": 1, "page": 2, "ordering": "title"}))
        self.assertEqual(([row["title"] for row in page["results"]], page["count"]), (["Entry 1"], 2))
        # The view counts ignore view but follow the other filters.
        self.assertEqual(data(self.client.get("/api/submissions/staff-list/", {"view": "mine", "channel": "whatsapp"}))["views"]["all"], 1)
        for bad in ({"view": "x"}, {"ordering": "reference"}, {"stage": "x"}, {"submitted_from": "21/11"}):
            self.assertEqual(self.client.get("/api/submissions/staff-list/", bad).status_code, 400, bad)
        self.assertEqual(self.as_user(self.kabo).get("/api/submissions/staff-list/").status_code, 403)

    def test_a_guest_entry_shows_how_to_reach_them(self):
        # Sent without an account (23 Nov): the officer sees the guest's email, or phone when there is no email.
        common = {"program": self.program, "innovator": None, "is_guest": True, "submission_type": self.entries[0].submission_type,
                  "current_status": self.entries[0].current_status, "submitted_at": timezone.now()}
        by_email = Submission.objects.create(title="Guest by email", reference_number="CEDA-IP-2026-90001", guest_name="Neo Guest", guest_email="neo@example.co.bw", guest_phone="+26771234567", **common)
        by_phone = Submission.objects.create(title="Guest by phone", reference_number="CEDA-IP-2026-90002", guest_name="Kago Guest", guest_phone="+26772345678", **common)
        rows = {row["id"]: row["innovator"] for row in data(self.as_user(self.officer).get("/api/submissions/staff-list/", {"search": "Guest"}))["results"]}
        self.assertEqual(rows[str(by_email.id)], {"name": "Neo Guest", "initials": "NG", "is_guest": True, "contact": "neo@example.co.bw"})
        self.assertEqual(rows[str(by_phone.id)]["contact"], "+26772345678")

    def test_saved_views_for_the_list(self):
        body = {"name": "WhatsApp in Maun", "scope": "submissions", "filters": {"view": "channels", "district": "r42-maun", "search": "solar"}}
        response = self.as_user(self.officer).post("/api/saved-views/", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        listed = data(self.client.get("/api/saved-views/", {"scope": "submissions"}))
        self.assertEqual([item["name"] for item in listed], ["WhatsApp in Maun"])
        self.assertEqual(data(self.client.get("/api/saved-views/"))[:1], [])


class StaffSummaryTests(R42Base):
    def setUp(self):
        super().setUp()
        form = SubmissionForm.objects.create(title="Idea form", languages=["en", "tn"])
        about = FormSection.objects.create(form=form, code="about", title="About the idea", ordering=1, translations={"tn": {"title": "Ka ga kakanyo"}})
        SubmissionFormField.objects.create(form=form, section=about, key="summary", label="Summary", field_type="textarea", ordering=1, translations={"tn": {"label": "Kakaretso"}})
        stage = SubmissionFormField.objects.create(form=form, section=about, key="stage", label="Stage", field_type="select", ordering=2)
        SubmissionFormFieldOption.objects.create(field=stage, value="idea", label="Just an idea", translations={"tn": {"label": "Kakanyo fela"}})
        self.program.form = form
        self.program.save(update_fields=["form"])
        self.entry = Submission.objects.get(pk=self.entries[0].pk)
        person = self.entry.innovator
        person.phone_number = "+26771000000"
        person.save(update_fields=["phone_number"])
        district = District.objects.create(slug="r42-kasane", name={"en": "Kasane", "tn": "Kasane"})
        InnovatorProfile.objects.update_or_create(user=person, defaults={"date_of_birth": date(2000, 1, 1), "district": district})
        SubmissionResponse.objects.create(submission=self.entry, form_field=form.fields.get(key="summary"), field_key_snapshot="summary", value="Solar pumps for small farms")
        SubmissionResponse.objects.create(submission=self.entry, form_field=stage, field_key_snapshot="stage", value="idea")
        Submission.objects.create(program=self.program, innovator=person, submission_type=self.entry.submission_type, title="Another one", current_status="shortlisted", submitted_at=timezone.now())
        Submission.objects.filter(pk=self.entries[1].pk).update(title="Judged entry 0", submitted_at=self.entry.submitted_at - timedelta(days=3))
        Assignment.objects.create(
            submission=self.entry, assignee=self.officer, role_type=AssignmentRoleType.OFFICER, assigned_by=self.officer, deadline=timezone.now() + timedelta(days=2)
        )
        SubmissionInternalNote.objects.create(submission=self.entry, author=self.officer, note="Looks strong")
        thread = MessageThread.objects.create(submission=self.entry)
        Message.objects.create(thread=thread, author=person, author_role="applicant", body="Hello")
        self.mark(self.kabo, self.entry, [5, 4])

    def test_summary(self):
        summary = data(self.as_user(self.officer).get(f"/api/submissions/{self.entry.id}/staff-summary/"))
        self.assertEqual(summary["language"], "en")
        self.assertEqual(summary["steps"], [{"code": "challenge_judging", "title": "Judging", "state": "current"}])
        self.assertEqual(
            summary["answers"],
            [
                {
                    "step_code": "about",
                    "step_title": "About the idea",
                    "items": [
                        {"key": "summary", "label": "Summary", "value": "Solar pumps for small farms", "value_other_language": None},
                        {"key": "stage", "label": "Stage", "value": "Just an idea", "value_other_language": "Kakanyo fela"},
                    ],
                }
            ],
        )
        person = summary["innovator"]
        self.assertEqual((person["name"], person["initials"], person["phone"], person["district"]), ("E0 Ntrant", "EN", "+26771000000", "Kasane"))
        self.assertGreaterEqual(person["age"], 25)
        self.assertEqual(person["other_ideas"], {"count": 1, "shortlisted": 1})
        self.assertEqual(summary["assigned_to"]["name"], "Of Ficer")
        self.assertIsNotNone(summary["reply_due"])
        self.assertEqual(summary["scores"], {"average": 90.0, "judges_scored": 1, "judges_assigned": 2})
        self.assertEqual(summary["counts"], {"documents": 0, "messages": 1, "notes": 1, "related": 1})
        self.assertEqual(summary["related"][0]["title"], "Judged entry 0")

        tn = data(self.client.get(f"/api/submissions/{self.entry.id}/staff-summary/", {"lang": "tn"}))
        self.assertEqual(tn["answers"][0]["step_title"], "Ka ga kakanyo")
        self.assertEqual(tn["answers"][0]["items"][1], {"key": "stage", "label": "Stage", "value": "Kakanyo fela", "value_other_language": "Just an idea"})
        self.assertEqual(tn["answers"][0]["items"][0]["label"], "Kakaretso")

    def test_access_follows_the_detail(self):
        stranger = User.objects.create_user(email="r42-staff@ceda.co.bw", password="StrongPass123")
        RoleService.assign_roles(stranger, [RoleType.STAFF_MEMBER])
        self.assertEqual(self.as_user(stranger).get(f"/api/submissions/{self.entry.id}/staff-summary/").status_code, 404)
        innovator = self.entry.innovator
        self.assertEqual(self.as_user(innovator).get(f"/api/submissions/{self.entry.id}/staff-summary/").status_code, 403)


class MyWorkTests(R42Base):
    def test_tabs_and_kinds(self):
        entry = self.entries[1]
        review = Assignment.objects.create(
            submission=entry, assignee=self.officer, role_type=AssignmentRoleType.OFFICER, assigned_by=self.officer, deadline=timezone.now() - timedelta(hours=1)
        )
        thread = MessageThread.objects.create(submission=entry)
        Message.objects.create(thread=thread, author=entry.innovator, author_role="applicant", body="Here is the answer you asked for")
        Assignment.objects.create(submission=self.entries[0], assignee=self.kabo, role_type=AssignmentRoleType.REVIEWER, assigned_by=self.officer)

        work = data(self.as_user(self.officer).get("/api/me/work/"))
        kinds = sorted(item["kind"] for item in work["items"])
        self.assertEqual(kinds, ["reply", "review"])
        first = work["items"][0]
        self.assertEqual((first["kind"], first["overdue"], first["why"]["kind"]), ("review", True, "person"))
        self.assertEqual(first["submission"]["reference"], entry.reference_number)
        self.assertEqual(first["link"], f"/submissions/{entry.id}")
        self.assertEqual(work["counts"], {"open": 2, "done_week": 0, "assigned_by_me": 1})

        by_me = data(self.client.get("/api/me/work/", {"tab": "assigned_by_me"}))["items"]
        self.assertEqual([(item["why"]["name"], item["kind"]) for item in by_me], [("Kabo Judge", "review")])

        Assignment.objects.filter(pk=review.pk).update(status=AssignmentStatus.COMPLETED, completed_at=timezone.now())
        done = data(self.client.get("/api/me/work/", {"tab": "done_week"}))
        self.assertEqual([item["id"] for item in done["items"]], [str(review.id)])
        self.assertEqual(self.client.get("/api/me/work/", {"tab": "later"}).status_code, 400)

    def test_judges_see_scoring_and_invites(self):
        late = User.objects.create_user(email="late@ceda.co.bw", password="StrongPass123", first_name="La", last_name="Te")
        RoleService.assign_roles(late, [RoleType.JUDGE])
        ChallengeJudge.objects.create(program=self.program, name="La Te", email="late@ceda.co.bw", invited_at=timezone.now())
        invites = data(self.as_user(late).get("/api/me/work/"))["items"]
        self.assertEqual([(item["kind"], item["title"]) for item in invites], [("invite", "Judged Challenge")])

        scoring = data(self.as_user(self.kabo).get("/api/me/work/"))["items"]
        self.assertEqual({item["kind"] for item in scoring}, {"score"})
        self.assertEqual(scoring[0]["link"], f"/judging/{scoring[0]['submission']['id']}")
        self.assertEqual(scoring[0]["step"], {"name": "Judging", "number": 1, "of": 1})

    def test_website_approvals(self):
        manager = User.objects.create_user(email="r42-manager@ceda.co.bw", password="StrongPass123")
        RoleService.assign_roles(manager, [RoleType.INNOVATION_MANAGER])
        post = ContentItem.objects.create(title="Pitch day", excerpt="Come along", status="draft")
        ApprovalService.create(post, actor=self.officer, summary="Post: Pitch day")
        items = data(self.as_user(manager).get("/api/me/work/"))["items"]
        self.assertEqual([(item["kind"], item["title"], item["link"]) for item in items], [("approve", "Post: Pitch day", "/content/approvals")])
        innovator = User.objects.create_user(email="r42-guest@example.com", password="StrongPass123")
        RoleService.assign_roles(innovator, [RoleType.INNOVATOR])
        self.assertEqual(self.as_user(innovator).get("/api/me/work/").status_code, 403)

"""B2: innovator home data, My ideas tabs, updates, challenges, link-challenge, profile completeness, similar ideas."""
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.communications.models import Notification
from apps.content.models import ContentItem, WinnerSpotlight
from apps.core.constants import ProgramStatus, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionStatus, SubmissionType
from apps.platform_config.testing import set_features
from apps.profiles.models import InnovatorProfile
from apps.programs.general_intake import GeneralIntakeService
from apps.programs.models import FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.reference.models import District, Sector
from apps.submissions.models import ApplicationDraft, Submission, SubmissionResponse, SubmissionStatusHistory
from apps.workflow.models import WorkflowDefinition, WorkflowInstance, WorkflowStep


def make_user(email, **extra):
    user = User.objects.create_user(email=email, password="StrongPass123!", first_name="Neo", last_name="Kebadile", email_verified=True, **extra)
    RoleService.assign_roles(user, [RoleType.INNOVATOR])
    return user


class DashboardFixtureMixin:
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.sectors = list(Sector.objects.filter(active=True).order_by("ordering")[:3])
        self.user = make_user("dash.innovator@example.com")
        self.owner = make_user("dash.owner@example.com")
        self.general = GeneralIntakeService.program()
        self.client.force_authenticate(self.user)

    def challenge(self, title, sectors, *, open_now=True, extra_fields=()):
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.CHALLENGE_CALL, defaults={"name": "Challenge call"})
        now = timezone.now()
        program = Program.objects.create(
            title=title,
            slug=title.lower().replace(" ", "-"),
            description=title,
            program_type=program_type,
            status=ProgramStatus.PUBLISHED,
            is_public=True,
            opening_date=now - timedelta(days=5),
            closing_date=now + timedelta(days=20) if open_now else now - timedelta(days=1),
            owner=self.owner,
        )
        program.sectors.set(sectors)
        form = SubmissionForm.objects.create(program=program, title=f"{title} form")
        section = FormSection.objects.create(form=form, title="Entry", code="entry", ordering=1)
        for order, (key, label, required) in enumerate([("problem", "Problem", True), *extra_fields], start=1):
            SubmissionFormField.objects.create(
                form=form, section=section, key=key, label=label, field_type=SubmissionFormFieldType.TEXTAREA, required=required, ordering=order
            )
        return program

    def draft(self, title, *, sector=None, data=None, percent=0):
        return ApplicationDraft.objects.create(
            reference_number=f"DRAFT-TEST-{title}",
            program=self.general,
            innovator=self.user,
            submission_type=SubmissionType.IDEA,
            title=title,
            sector=sector,
            is_general_idea=True,
            draft_data=data or {},
            progress_metadata={"percent_complete": percent},
        )

    def submission(self, title, status, *, sector=None, due_at=None):
        submission = Submission.objects.create(
            reference_number=f"CEDA-IP-2026-{Submission.objects.count() + 1:05d}",
            program=self.general,
            innovator=self.user,
            submission_type=SubmissionType.IDEA,
            title=title,
            current_status=status,
            submitted_at=timezone.now(),
            sector=sector,
        )
        if due_at:
            definition = WorkflowDefinition.objects.create(name="wf", program=self.general, status="active", is_active=True)
            step = WorkflowStep.objects.create(workflow_definition=definition, name="Screening", code="screening", order=1)
            WorkflowInstance.objects.create(
                submission=submission, workflow_definition=definition, current_step=step, status=WorkflowInstance.STATUS_RETURNED, due_at=due_at
            )
        return submission


class MyIdeasApiTests(DashboardFixtureMixin, TestCase):
    def test_tabs_and_counts_merge_drafts_and_submissions(self):
        self.draft("Draft one", sector=self.sectors[0], percent=40)
        self.draft("Draft two")
        self.submission("Reviewing", SubmissionStatus.SCREENING)
        self.submission("Asked a question", SubmissionStatus.REQUIRES_MORE_INFORMATION)
        self.submission("Approved", SubmissionStatus.APPROVED)
        self.submission("Not selected", SubmissionStatus.REJECTED)
        # Someone else's idea must not appear.
        Submission.objects.create(
            reference_number="CEDA-IP-2026-09999", program=self.general, innovator=self.owner,
            submission_type=SubmissionType.IDEA, title="Not mine", current_status="screening", submitted_at=timezone.now(),
        )

        response = self.client.get("/api/me/ideas/")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["counts"], {"all": 6, "needs_action": 1, "drafts": 2, "in_review": 1, "finished": 2})
        self.assertEqual(len(data["results"]), 6)
        self.assertNotIn("Not mine", [item["title"] for item in data["results"]])

        drafts = self.client.get("/api/me/ideas/?filter=drafts").json()["data"]["results"]
        self.assertEqual({item["title"] for item in drafts}, {"Draft one", "Draft two"})
        first = next(item for item in drafts if item["title"] == "Draft one")
        self.assertEqual(first["percent_complete"], 40)
        self.assertEqual(first["sector"]["id"], str(self.sectors[0].id))
        self.assertEqual(first["kind"], "draft")

        waiting = self.client.get("/api/me/ideas/?filter=needs_action").json()["data"]["results"]
        self.assertEqual([item["title"] for item in waiting], ["Asked a question"])
        self.assertTrue(waiting[0]["needs_action_reason"])
        self.assertEqual(waiting[0]["percent_complete"], 100)

        self.assertEqual(len(self.client.get("/api/me/ideas/?filter=finished").json()["data"]["results"]), 2)
        self.assertEqual(self.client.get("/api/me/ideas/?filter=nonsense").status_code, 400)

    def test_items_carry_stages_dates_and_feedback(self):
        from apps.submissions.models import SubmissionFeedbackSnapshot, SubmissionOutcome

        self.draft("Draft one")
        reviewing = self.submission("Reviewing", SubmissionStatus.SCREENING, due_at=timezone.now() + timedelta(days=2))
        approved = self.submission("Approved", SubmissionStatus.APPROVED)
        decided = timezone.now() - timedelta(days=1)
        SubmissionOutcome.objects.create(submission=approved, program=self.general, outcome_type="approved", decided_at=decided)
        SubmissionFeedbackSnapshot.objects.create(submission=approved, stage_code="panel", stage_name="Panel", release_action="release", released_at=decided)

        items = {item["title"]: item for item in self.client.get("/api/me/ideas/").json()["data"]["results"]}
        draft = items["Draft one"]
        self.assertEqual((draft["stages"], draft["submitted_at"], draft["decided_at"], draft["has_feedback"]), ([], None, None, False))

        review = items["Reviewing"]
        self.assertTrue(review["submitted_at"])
        self.assertIsNone(review["decided_at"])
        self.assertEqual(review["stages"][0], {"code": "submitted", "name": review["stages"][0]["name"], "status": "done"})
        self.assertIn({"code": "screening", "name": "Screening", "status": "current"}, review["stages"])
        self.assertTrue(all(set(stage) == {"code", "name", "status"} for stage in review["stages"]))

        done = items["Approved"]
        self.assertTrue(done["decided_at"].startswith(decided.date().isoformat()))
        self.assertTrue(done["has_feedback"])

    def test_requires_sign_in(self):
        self.client.force_authenticate(None)
        for url in ("/api/me/summary/", "/api/me/ideas/", "/api/me/updates/", "/api/me/challenges/recommended/"):
            self.assertEqual(self.client.get(url).status_code, 401, url)


class MySummaryAndUpdatesApiTests(DashboardFixtureMixin, TestCase):
    def test_summary_points_to_the_question_waiting_for_an_answer(self):
        self.draft("Unfinished", percent=20)
        reply_by = timezone.now() + timedelta(days=3)
        waiting = self.submission("Needs answer", SubmissionStatus.RETURNED, due_at=reply_by)
        Notification.objects.create(recipient=self.user, title="Hello", body="New message")
        Notification.objects.create(recipient=self.user, title="Old", body="Read", is_read=True)

        data = self.client.get("/api/me/summary/").json()["data"]
        self.assertEqual(data["unread_notifications"], 1)
        self.assertEqual(data["next_action"]["type"], "answer_question")
        self.assertEqual(data["next_action"]["idea_id"], str(waiting.id))
        self.assertTrue(data["next_action"]["reply_by"].startswith(reply_by.date().isoformat()))
        self.assertEqual(data["active_idea"]["id"], str(waiting.id))

    def test_summary_suggests_finishing_a_draft(self):
        draft = self.draft("Unfinished", percent=20)
        data = self.client.get("/api/me/summary/").json()["data"]
        self.assertEqual(data["next_action"]["type"], "finish_draft")
        self.assertEqual(data["next_action"]["idea_id"], str(draft.id))
        self.assertEqual(data["active_idea"]["kind"], "draft")

    def test_updates_merge_notifications_and_status_changes_newest_first(self):
        submission = self.submission("Tracked", SubmissionStatus.SCREENING)
        old = SubmissionStatusHistory.objects.create(submission=submission, from_status="submitted", to_status="screening")
        SubmissionStatusHistory.objects.filter(id=old.id).update(created_at=timezone.now() - timedelta(days=60))
        SubmissionStatusHistory.objects.create(submission=submission, from_status="screening", to_status="under_review")
        Notification.objects.create(recipient=self.user, title="Panel date", body="Your panel is on Friday")

        data = self.client.get("/api/me/updates/").json()["data"]
        kinds = [item["type"] for item in data["results"]]
        self.assertEqual(sorted(kinds), ["notification", "status_change"])  # the 60-day-old change is outside the default window
        times = [item["at"] for item in data["results"]]
        self.assertEqual(times, sorted(times, reverse=True))
        status_item = next(item for item in data["results"] if item["type"] == "status_change")
        self.assertEqual(status_item["status"], "Under review")
        self.assertEqual(status_item["link"], {"type": "idea", "id": str(submission.id)})
        self.assertEqual(status_item["notification_type"], "status_change")
        note = next(item for item in data["results"] if item["type"] == "notification")
        self.assertIn("notification_type", note)

        since = (timezone.now() - timedelta(days=90)).isoformat()
        everything = self.client.get("/api/me/updates/", {"since": since}).json()["data"]["results"]
        self.assertEqual(len(everything), 3)
        self.assertEqual(self.client.get("/api/me/updates/?since=yesterday").status_code, 400)


class ChallengeMatchingApiTests(DashboardFixtureMixin, TestCase):
    def test_recommended_challenges_match_profile_and_idea_sectors(self):
        InnovatorProfile.objects.update_or_create(user=self.user, defaults={"sector": self.sectors[0]})
        self.draft("Idea in sector two", sector=self.sectors[1])
        by_profile = self.challenge("Agri challenge", [self.sectors[0]])
        by_idea = self.challenge("Health challenge", [self.sectors[1]])
        self.challenge("Other sector", [self.sectors[2]])
        self.challenge("Closed challenge", [self.sectors[0]], open_now=False)
        self.general.sectors.set([self.sectors[0]])  # the general programme is never "recommended"

        response = self.client.get("/api/me/challenges/recommended/")
        self.assertEqual(response.status_code, 200, response.content)
        ids = {item["id"] for item in response.json()["data"]}
        self.assertEqual(ids, {str(by_profile.id), str(by_idea.id)})

    def test_recommended_challenges_use_the_public_card_and_include_upcoming_calls(self):
        InnovatorProfile.objects.update_or_create(user=self.user, defaults={"sector": self.sectors[0]})
        open_call = self.challenge("Open call", [self.sectors[0]])
        later = self.challenge("Later call", [self.sectors[0]])
        Program.objects.filter(id=later.id).update(opening_date=timezone.now() + timedelta(days=10), closing_date=timezone.now() + timedelta(days=40))
        items = {item["id"]: item for item in self.client.get("/api/me/challenges/recommended/").json()["data"]}
        self.assertEqual(set(items), {str(open_call.id), str(later.id)})
        self.assertEqual(items[str(open_call.id)]["status"], "open")
        self.assertEqual(items[str(later.id)]["status"], "upcoming")
        for key in ("summary", "support_headline", "opens_at", "closes_at", "days_left", "window_progress", "matched_sectors", "program_type"):
            self.assertIn(key, items[str(open_call.id)])
        self.assertEqual(items[str(open_call.id)]["matched_sectors"][0]["id"], str(self.sectors[0].id))

    def test_link_challenge_copies_matching_answers_and_lists_what_is_left(self):
        idea = self.draft(
            "Cold milk",
            sector=self.sectors[0],
            data={"problem": "Milk spoils before market.", "solution": "Solar cooling."},
        )
        challenge = self.challenge(
            "Agri challenge", [self.sectors[0]], extra_fields=[("budget", "Budget", True), ("team_size", "Team size", False)]
        )

        matches = self.client.get(f"/api/me/ideas/{idea.id}/challenge-matches/")
        self.assertEqual(matches.status_code, 200, matches.content)
        match = next(item for item in matches.json()["data"]["results"] if item["id"] == str(challenge.id))
        self.assertEqual(match["answers_reused"], 1)
        self.assertEqual(match["questions_left"], 2)

        response = self.client.post(f"/api/me/ideas/{idea.id}/link-challenge/{challenge.id}/")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        self.assertEqual(data["copied_fields"], ["problem"])
        self.assertEqual([q["key"] for q in data["unanswered_questions"]], ["budget", "team_size"])
        self.assertTrue(data["unanswered_questions"][0]["required"])

        new_draft = ApplicationDraft.objects.get(id=data["draft"]["id"])
        self.assertEqual(new_draft.program, challenge)
        self.assertEqual(new_draft.innovator, self.user)
        self.assertEqual(new_draft.draft_data["problem"], "Milk spoils before market.")
        self.assertNotIn("solution", new_draft.draft_data)  # not a question in the challenge form
        self.assertEqual(new_draft.sector, self.sectors[0])
        self.assertEqual(ApplicationDraft.objects.get(id=idea.id).draft_data["solution"], "Solar cooling.")  # original untouched

    def test_link_challenge_from_a_submission_uses_its_answers(self):
        submission = self.submission("Sent idea", SubmissionStatus.SCREENING, sector=self.sectors[0])
        field = self.general.submission_form.fields.get(key="problem")
        SubmissionResponse.objects.create(submission=submission, form_field=field, field_key_snapshot="problem", value="Water is scarce.")
        challenge = self.challenge("Water challenge", [self.sectors[0]])

        data = self.client.post(f"/api/me/ideas/{submission.id}/link-challenge/{challenge.id}/").json()["data"]
        self.assertEqual(data["copied_fields"], ["problem"])
        self.assertEqual(data["unanswered_questions"], [])

    def test_cannot_link_someone_elses_idea_or_a_closed_challenge(self):
        other = ApplicationDraft.objects.create(
            reference_number="DRAFT-OTHER", program=self.general, innovator=self.owner, submission_type=SubmissionType.IDEA,
            title="Theirs", is_general_idea=True,
        )
        open_challenge = self.challenge("Open", [self.sectors[0]])
        closed = self.challenge("Closed", [self.sectors[0]], open_now=False)
        mine = self.draft("Mine", sector=self.sectors[0])
        self.assertEqual(self.client.post(f"/api/me/ideas/{other.id}/link-challenge/{open_challenge.id}/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/me/ideas/{mine.id}/link-challenge/{closed.id}/").status_code, 404)


class ProfileCompletenessApiTests(DashboardFixtureMixin, TestCase):
    def test_profile_reports_percent_complete_and_missing_fields(self):
        data = self.client.get("/api/profile/").json()
        data = data.get("data", data)
        missing = {item["field"] for item in data["missing_fields"]}
        self.assertIn("district", missing)
        self.assertNotIn("first_name", missing)
        before = data["percent_complete"]

        InnovatorProfile.objects.update_or_create(user=self.user, defaults={"district": District.objects.first(), "sector": self.sectors[0]})
        # force_authenticate reuses the same user object, which caches the profile; load it fresh.
        self.client.force_authenticate(User.objects.get(id=self.user.id))
        after = self.client.get("/api/profile/").json()
        after = after.get("data", after)
        self.assertGreater(after["percent_complete"], before)
        self.assertNotIn("district", {item["field"] for item in after["missing_fields"]})


class SimilarIdeasApiTests(DashboardFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        set_features(self, similar_ideas=True)
        applicant = make_user("winner.applicant@example.com", phone_number="+26772222222")
        InnovatorProfile.objects.update_or_create(user=applicant, defaults={"district": District.objects.order_by("ordering").first()})
        winning = Submission.objects.create(
            reference_number="CEDA-IC-2025-000001", program=self.general, innovator=applicant, submission_type=SubmissionType.IDEA,
            title="Secret internal title", current_status="winner", submitted_at=timezone.now(), sector=self.sectors[0],
        )
        WinnerSpotlight.objects.create(
            program=self.general, team_name="Team Mokoro", project_name="Solar milk cooling for dairy farmers",
            description="Keeps milk cold at rural collection points using solar power.", year=2025, submission=winning,
        )
        ContentItem.objects.create(
            title="How a farmer cut milk waste with solar cooling", excerpt="A story about solar milk cooling in Kweneng.",
            category="success_story", status="published", published_at=timezone.now(),
        )
        ContentItem.objects.create(
            title="Unpublished solar milk cooling story", excerpt="Draft story about solar milk cooling.",
            category="success_story", status="draft",
        )

    def test_returns_title_year_and_place_only(self):
        response = self.client.post("/api/ideas/similar/", {"text": "solar cooling for milk on farms"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        results = response.json()["data"]["results"]
        self.assertGreaterEqual(len(results), 2)
        self.assertLessEqual(len(results), 5)
        titles = [item["title"] for item in results]
        self.assertIn("Solar milk cooling for dairy farmers", titles)
        self.assertIn("How a farmer cut milk waste with solar cooling", titles)
        self.assertNotIn("Unpublished solar milk cooling story", titles)
        for item in results:
            self.assertEqual(set(item), {"kind", "title", "year", "place"})
        spotlight = next(item for item in results if item["kind"] == "published_idea")
        self.assertEqual(spotlight["year"], 2025)
        self.assertTrue(spotlight["place"])

        body = response.content.decode()
        for private in ("winner.applicant@example.com", "+26772222222", "Team Mokoro", "Secret internal title", "Kebadile", "CEDA-IC-2025-000001"):
            self.assertNotIn(private, body)

    def test_needs_sign_in_and_the_feature(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/api/ideas/similar/", {"text": "solar milk"}, format="json").status_code, 401)
        self.client.force_authenticate(self.user)
        set_features(self, similar_ideas=False)
        self.assertEqual(self.client.post("/api/ideas/similar/", {"text": "solar milk"}, format="json").status_code, 404)

    def test_unrelated_text_returns_nothing(self):
        response = self.client.post("/api/ideas/similar/", {"text": "quantum blockchain spaceship"}, format="json")
        self.assertEqual(response.json()["data"]["results"], [])

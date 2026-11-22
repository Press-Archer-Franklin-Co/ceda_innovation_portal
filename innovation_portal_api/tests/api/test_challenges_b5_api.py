"""B5: public challenge cards and detail, setup status, judging settings, rubric rules, saved views, staff search, judge isolation."""

from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramStatus, ProgramTypeCode, RoleType, SubmissionType
from apps.evaluation.models import MarkingCriteria, MarkingCriteriaItem
from apps.evaluation.services import EvaluationService, ReviewCycleService
from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.models import ChallengeJudge, Program, ProgramTimeline, ProgramType
from apps.reference.models import Sector
from apps.submissions.models import Submission
from apps.support.models import FAQ
from tests.api import test_challenge_judging_api as judging_flow


def data(response):
    return response.json()["data"]


class B5TestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="b5-officer@example.com", password="StrongPass123", first_name="Kago", last_name="T")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.innovator = User.objects.create_user(email="b5-innovator@example.com", password="StrongPass123", first_name="Neo", last_name="Kebadile")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        self.type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.INNOVATION_CHALLENGE, defaults={"name": "Innovation Challenge"})
        self.sector = Sector.objects.filter(active=True).order_by("ordering").first()

    def challenge(self, title, *, opens_in=-5, closes_in=5, status=ProgramStatus.PUBLISHED, public=True, **extra):
        now = timezone.now()
        program = Program.objects.create(
            title=title,
            slug=title.lower().replace(" ", "-"),
            description=f"{title} description",
            program_type=self.type,
            owner=self.officer,
            status=status,
            is_public=public,
            opening_date=now + timedelta(days=opens_in),
            closing_date=now + timedelta(days=closes_in),
            **extra,
        )
        if self.sector:
            program.sectors.add(self.sector)
        return program


class PublicChallengeTests(B5TestCase):
    def test_cards_counts_and_window_progress(self):
        self.challenge("Open one", support_headline="Up to P150 000 plus mentoring", summary="Cold chain ideas")
        self.challenge("Coming soon", opens_in=3, closes_in=20)
        self.challenge("Done", opens_in=-30, closes_in=-2)
        self.challenge("Hidden", public=False)
        self.challenge("Draft", status=ProgramStatus.DRAFT)
        listed = data(self.client.get("/api/programs/public/challenges/"))
        self.assertEqual(listed["counts"], {"open": 1, "upcoming": 1, "closed": 1, "all": 3})
        cards = {card["title"]: card for card in listed["results"]}
        self.assertEqual(set(cards), {"Open one", "Coming soon", "Done"})
        card = cards["Open one"]
        self.assertEqual((card["status"], card["support_headline"], card["summary"]), ("open", "Up to P150 000 plus mentoring", "Cold chain ideas"))
        self.assertEqual(card["days_left"], 4)
        self.assertAlmostEqual(card["window_progress"], 0.5, places=1)
        self.assertEqual(cards["Coming soon"]["window_progress"], 0.0)
        self.assertEqual(cards["Done"]["window_progress"], 1.0)
        self.assertEqual(cards["Done"]["has_results"], False)

        only_open = data(self.client.get("/api/programs/public/challenges/?status=open"))
        self.assertEqual([card["title"] for card in only_open["results"]], ["Open one"])
        self.assertEqual(only_open["counts"]["all"], 3)
        soon = data(self.client.get("/api/programs/public/challenges/?sort=closing_soon"))
        self.assertEqual([card["title"] for card in soon["results"]][0], "Done")
        # The older list keeps its shape.
        self.assertIsInstance(self.client.get("/api/programs/public/").json(), list)

    def test_detail_in_one_call_without_judges_or_scores(self):
        criteria = MarkingCriteria.objects.create(title="Agri criteria")
        MarkingCriteriaItem.objects.create(criteria=criteria, name="Impact", description="Who it helps", weight=Decimal("60"), max_score=Decimal("5"))
        MarkingCriteriaItem.objects.create(criteria=criteria, name="Feasibility", weight=Decimal("40"), max_score=Decimal("5"))
        program = self.challenge(
            "Agri tech",
            marking_criteria=criteria,
            problem_statement="Milk spoils",
            who_can_enter="Citizens 18 to 35",
            where="Anywhere in Botswana",
            what_we_look_for=[{"en": "Works off grid", "tn": "E dira kwa ntle ga motlakase"}],
            support_package=[{"title": {"en": "Grant", "tn": "Thuso"}, "amount_label": "P150 000", "description": {"en": "Cash", "tn": ""}}],
            translations={"tn": {"problem_statement": "Mashi a a senyega"}},
        )
        ChallengeJudge.objects.create(program=program, name="Secret Judge", email="secret.judge@example.com")
        ProgramTimeline.objects.create(program=program, title="Pitch day", starts_at=timezone.now() + timedelta(days=20), ends_at=timezone.now() + timedelta(days=21))
        FAQ.objects.create(question="Can teams enter?", answer="Yes", program=program)
        FAQ.objects.create(question="Hidden", answer="x", program=program, is_public=False)

        response = self.client.get(f"/api/programs/public/{program.slug}/")
        self.assertEqual(response.status_code, 200)
        detail = data(response)
        self.assertEqual(detail["judging_criteria"], [{"name": "Impact", "description": "Who it helps", "weight": 60.0}, {"name": "Feasibility", "description": "", "weight": 40.0}])
        self.assertEqual(detail["key_dates"][0]["title"], "Pitch day")
        self.assertEqual([faq["question"] for faq in detail["faqs"]], ["Can teams enter?"])
        self.assertEqual(detail["support_package"][0]["title"], "Grant")
        self.assertEqual(detail["started_count"], 0)
        body = response.content.decode()
        self.assertNotIn("secret.judge", body)
        self.assertNotIn("Secret Judge", body)
        self.assertNotIn("score", body.replace("score_", ""))
        setswana = data(self.client.get(f"/api/programs/public/{program.slug}/?lang=tn"))
        self.assertEqual(setswana["problem_statement"], "Mashi a a senyega")
        self.assertEqual(setswana["who_can_enter"], "Citizens 18 to 35")
        self.assertEqual(setswana["what_we_look_for"], ["E dira kwa ntle ga motlakase"])
        hidden = self.challenge("Not public", public=False)
        self.assertEqual(self.client.get(f"/api/programs/public/{hidden.slug}/").status_code, 404)



    def test_hackathon_schedule_and_updates_on_the_challenge_page(self):
        from apps.content.models import HackathonDetail, HackathonUpdate

        program = self.challenge("Hack week")
        self.assertIsNone(data(self.client.get(f"/api/programs/public/{program.slug}/"))["hackathon"])
        starts = (timezone.now() + timedelta(days=3)).isoformat()
        detail = HackathonDetail.objects.create(
            program=program, is_published=True,
            schedule_items=[{"id": "open", "starts_at": starts, "title": {"en": "Welcome", "tn": "Kamogelo"}}],
            draft={"schedule_items": [{"id": "x", "starts_at": starts, "title": {"en": "Draft only"}}]},
        )
        HackathonUpdate.objects.create(hackathon=detail, body={"en": "Doors open at 07:00", "tn": ""})
        block = data(self.client.get(f"/api/programs/public/{program.slug}/?lang=tn"))["hackathon"]
        self.assertEqual([(i["title"], i["now"]) for i in block["schedule"]], [("Kamogelo", False)])
        self.assertEqual([u["body"] for u in block["updates"]], ["Doors open at 07:00"])  # English when Setswana is empty

        detail.page_sections = [{"key": "schedule", "enabled": False, "order": 1}, {"key": "updates", "enabled": True, "order": 2}]
        detail.save()
        block = data(self.client.get(f"/api/programs/public/{program.slug}/"))["hackathon"]
        self.assertEqual(block["schedule"], [])
        detail.is_published = False
        detail.save()
        self.assertIsNone(data(self.client.get(f"/api/programs/public/{program.slug}/"))["hackathon"])

class BuilderTests(B5TestCase):
    def test_setup_status_reports_each_step(self):
        program = self.challenge("Builder")
        self.client.force_authenticate(self.officer)
        status = data(self.client.get(f"/api/programs/{program.id}/setup-status/"))
        steps = {item["step"]: item["complete"] for item in status["steps"]}
        self.assertEqual(list(steps), ["details", "dates", "support", "judging", "form", "panel"])
        self.assertEqual((steps["details"], steps["dates"], steps["support"], steps["judging"], steps["panel"]), (bool(self.sector), True, False, False, False))
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(f"/api/programs/{program.id}/setup-status/").status_code, 403)

    def test_judging_weights_must_total_100_and_settings_reach_the_stage(self):
        program = self.challenge("Judged")
        self.client.force_authenticate(self.officer)
        bad = self.client.put(f"/api/programs/{program.id}/judging/", {"criteria": [{"name": "Impact", "weight": 60}, {"name": "Cost", "weight": 30}]}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(float(bad.json()["errors"]["total"]), 90.0)

        library = self.client.post("/api/evaluations/criteria-library/", {"name": "Innovation", "description": "New idea", "score_meanings": ["Copied", "", "", "", "Never seen"], "comment_required_scores": [1, 5]}, format="json")
        self.assertEqual(library.status_code, 201, library.content)
        library_id = data(library)["id"]
        payload = {
            "criteria": [{"library_id": library_id, "weight": 40}, {"name": "Impact", "weight": 60, "comment_required_scores": [1]}],
            "pass_mark": 65,
            "reviewers_per_idea": 2,
        }
        saved = self.client.put(f"/api/programs/{program.id}/judging/", payload, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        settings = data(saved)
        self.assertEqual(settings["total"], 100.0)
        self.assertEqual(settings["criteria"][0]["library_id"], library_id)
        self.assertEqual(settings["criteria"][0]["name"], "Innovation")
        self.assertEqual(settings["criteria"][0]["comment_required_scores"], [1, 5])
        program.refresh_from_db()
        self.assertFalse(program.marking_criteria.is_library)
        config = ChallengeJudgingService.judging_step(program).evaluation_config
        self.assertEqual(config.threshold_pass_above, Decimal("65"))
        self.assertEqual(config.marking_criteria_id, program.marking_criteria_id)
        # Editing the challenge's copy leaves the library item alone.
        self.assertEqual(MarkingCriteriaItem.objects.get(id=library_id).weight, Decimal("0"))

    def test_draft_without_description_or_dates_then_publish_needs_them(self):
        self.client.force_authenticate(self.officer)
        response = self.client.post("/api/programs/", {"title": "Half done", "program_type_id": str(self.type.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        program_id = response.json()["id"]
        self.assertIsNone(response.json()["opening_date"])
        steps = {item["step"]: item["complete"] for item in data(self.client.get(f"/api/programs/{program_id}/setup-status/"))["steps"]}
        self.assertEqual((steps["details"], steps["dates"]), (False, False))

        refused = self.client.post(f"/api/programs/{program_id}/publish/")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(set(refused.json()["errors"]), {"description", "opening_date", "closing_date"})
        self.assertEqual(Program.objects.get(id=program_id).status, ProgramStatus.DRAFT)

        now = timezone.now()
        backwards = {"opening_date": (now + timedelta(days=5)).isoformat(), "closing_date": now.isoformat()}
        self.assertEqual(self.client.patch(f"/api/programs/{program_id}/", backwards, format="json").status_code, 400)
        filled = {"description": "Ideas for farmers", "opening_date": now.isoformat(), "closing_date": (now + timedelta(days=30)).isoformat()}
        self.assertEqual(self.client.patch(f"/api/programs/{program_id}/", filled, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"/api/programs/{program_id}/publish/").status_code, 200)
        self.assertEqual(Program.objects.get(id=program_id).status, ProgramStatus.PUBLISHED)

    def test_judging_and_results_jobs_skip_challenges_without_a_close_date(self):
        from apps.programs.challenge_results import ChallengeResultsService

        program = Program.objects.create(title="Dateless", slug="dateless", program_type=self.type, owner=self.officer)
        ChallengeJudge.objects.create(program=program, name="Judge", email="judge-dateless@example.com")
        ChallengeJudgingService.process_program(program)
        self.assertIsNone(ChallengeJudge.objects.get(program=program).invited_at)
        self.assertFalse(ChallengeResultsService.try_announce(program))

    def test_judges_have_an_organisation(self):
        program = self.challenge("Panel")
        self.client.force_authenticate(self.officer)
        response = self.client.post(f"/api/programs/{program.id}/judges/", {"name": "Dr T. Molefe", "email": "molefe@example.com", "organisation": "BUAN"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["organisation"], "BUAN")


class ScoringRuleTests(judging_flow.ChallengeJudgingFlowTests):
    """Reuses the judging flow fixture: two entries, two judges, two criteria out of 10."""

    def _cycle(self, entry):
        entry = Submission.objects.select_related("workflow_instance").get(pk=entry.pk)
        return entry, ReviewCycleService.get_or_open(submission=entry, workflow_step=entry.workflow_instance.current_step)

    def test_comment_required_for_chosen_scores_and_weighted_score_out_of_100(self):
        self.items[0].weight, self.items[0].comment_required_scores = Decimal("60"), [10]
        self.items[0].save()
        self.items[1].weight = Decimal("40")
        self.items[1].save()
        judge = ChallengeJudge.objects.get(program=self.program, email="kabo@ceda.co.bw")
        self.accept(self.judge_users[0], judge)
        entry, cycle = self._cycle(self.entries[0])
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=entry, judge=self.judge_users[0], review_cycle=cycle,
                scores=[{"criterion_id": str(self.items[0].id), "type": "library", "raw_score": 10}, {"criterion_id": str(self.items[1].id), "type": "library", "raw_score": 5}],
            )
        sheet = EvaluationService.save_cycle_scores(
            submission=entry, judge=self.judge_users[0], review_cycle=cycle,
            scores=[
                {"criterion_id": str(self.items[0].id), "type": "library", "raw_score": 10, "comment": "Best in the round"},
                {"criterion_id": str(self.items[1].id), "type": "library", "raw_score": 5},
            ],
        )
        from apps.evaluation.services import sheet_weighted_score

        self.assertEqual(sheet_weighted_score(sheet), 80.0)  # 60 * 10/10 + 40 * 5/10

    def test_judge_of_one_challenge_cannot_open_another_challenges_entries(self):
        judge = ChallengeJudge.objects.get(program=self.program, email="kabo@ceda.co.bw")
        self.accept(self.judge_users[0], judge)
        now = timezone.now()
        other = Program.objects.create(
            title="Other challenge", description="x", program_type=self.program.program_type, owner=self.officer, status="published",
            opening_date=now - timedelta(days=3), closing_date=now + timedelta(days=3),
        )
        entrant = User.objects.create_user(email="other-entrant@example.com", password="StrongPass123", first_name="O", last_name="E")
        from apps.submissions.services import SubmissionService

        draft = SubmissionService.create_draft(innovator=entrant, program=other, submission_type=SubmissionType.INNOVATION_CHALLENGE, title="Other entry")
        other_entry = SubmissionService.finalize_submission(draft, entrant)
        self.client.force_authenticate(self.judge_users[0])
        self.assertEqual(self.client.get(f"/api/submissions/{self.entries[0].id}/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/submissions/{other_entry.id}/").status_code, 404)


# Run only the tests written here, not the inherited judging-flow tests a second time.
for _name in [name for name in vars(judging_flow.ChallengeJudgingFlowTests) if name.startswith("test_")]:
    setattr(ScoringRuleTests, _name, None)


class SavedViewAndSearchTests(B5TestCase):
    def test_saved_views_belong_to_their_owner(self):
        other = User.objects.create_user(email="b5-other@example.com", password="StrongPass123")
        RoleService.assign_roles(other, [RoleType.INNOVATION_OFFICER])
        self.client.force_authenticate(self.officer)
        mine = self.client.post("/api/saved-views/", {"name": "Overdue agri", "filters": {"overdue": "true", "stage": "screening"}}, format="json")
        self.assertEqual(mine.status_code, 201, mine.content)
        self.client.post("/api/saved-views/", {"name": "Team view", "filters": {}, "is_shared": True}, format="json")
        self.assertEqual(self.client.post("/api/saved-views/", {"name": "Overdue agri", "filters": {}}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/saved-views/", {"name": "Bad", "filters": {"colour": "red"}}, format="json").status_code, 400)

        self.client.force_authenticate(other)
        names = {item["name"]: item for item in data(self.client.get("/api/saved-views/"))}
        self.assertEqual(set(names), {"Team view"})
        self.assertFalse(names["Team view"]["is_mine"])
        self.assertEqual(self.client.delete(f"/api/saved-views/{names['Team view']['id']}/").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/saved-views/{data(mine)['id']}/").status_code, 404)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get("/api/saved-views/").status_code, 403)

    def test_staff_search_groups_ideas_and_people(self):
        program = self.challenge("Search me")
        Submission.objects.create(reference_number="CEDA-IP-2026-00042", program=program, innovator=self.innovator, submission_type=SubmissionType.IDEA, title="Solar milk cooler", submitted_at=timezone.now())
        Submission.objects.create(reference_number="", program=program, innovator=self.innovator, submission_type=SubmissionType.IDEA, title="Solar draft")
        self.client.force_authenticate(self.officer)
        by_ref = data(self.client.get("/api/staff-search/?q=00042"))
        self.assertEqual([item["title"] for item in by_ref["ideas"]], ["Solar milk cooler"])
        by_name = data(self.client.get("/api/staff-search/?q=Neo Kebadile"))
        self.assertEqual(by_name["ideas"][0]["applicant"], "Neo Kebadile")
        self.assertEqual(by_name["people"][0]["email"], "b5-innovator@example.com")
        self.assertEqual(data(self.client.get("/api/staff-search/?q=s")), {"q": "s", "ideas": [], "people": []})
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get("/api/staff-search/?q=solar").status_code, 403)
        judge = User.objects.create_user(email="b5-judge@example.com", password="StrongPass123")
        RoleService.assign_roles(judge, [RoleType.JUDGE])
        self.client.force_authenticate(judge)
        self.assertEqual(self.client.get("/api/staff-search/?q=solar").status_code, 403)

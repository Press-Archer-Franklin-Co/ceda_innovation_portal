"""U10: can you enter (1.9, 1.9b), eligibility answers, results (1.10), my result (2.11), staff questions and publishing."""

from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.content.models import WinnerSpotlight
from apps.core.constants import ProgramAudience, RoleType, SubmissionStatus, SubmissionType
from apps.programs.models import EligibilityRule
from apps.submissions.models import ApplicationDraft, Submission
from tests.api.test_challenges_b5_api import B5TestCase, data


class EntryTestCase(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain", max_entries_per_person=1)
        self.botswana = EligibilityRule.objects.create(
            program=self.program, title="Lives in Botswana", question="Do you live in Botswana?", reason="This challenge is for people who live in Botswana.",
            ordering=1, translations={"tn": {"question": "A o nna mo Botswana?", "reason": "Kgaisano e ke ya batho ba ba nnang mo Botswana."}},
        )
        self.employee = EligibilityRule.objects.create(
            program=self.program, title="Not CEDA staff", question="Do you work for CEDA?", required_answer=False, reason="CEDA staff cannot enter.", ordering=2,
        )

    def entry(self, slug="cold-chain", lang="en"):
        return self.client.get(f"/api/programs/public/{slug}/entry/?lang={lang}")

    def answer(self, answers, slug="cold-chain"):
        return self.client.post(f"/api/programs/public/{slug}/eligibility/", {"answers": answers}, format="json")

    def send(self, program=None, user=None, status=SubmissionStatus.SUBMITTED, title="Solar milk cooler"):
        return Submission.objects.create(
            reference_number=f"CEDA-IP-2026-{Submission.objects.count() + 1:05d}", program=program or self.program, innovator=user or self.innovator,
            submission_type=SubmissionType.IDEA, title=title, submitted_at=timezone.now(), current_status=status,
        )


class EntryStateTests(EntryTestCase):
    def test_signed_out_is_asked_to_sign_in(self):
        state = data(self.entry())
        self.assertEqual(state["state"], "sign_in")
        self.assertEqual(state["questions"], [])
        self.assertEqual(state["challenge"]["slug"], "cold-chain")
        self.assertIsNone(state["entry"])

    def test_questions_in_order_and_in_setswana(self):
        self.client.force_authenticate(self.innovator)
        state = data(self.entry())
        self.assertEqual(state["state"], "questions")
        self.assertEqual([q["question"] for q in state["questions"]], ["Do you live in Botswana?", "Do you work for CEDA?"])
        tn = data(self.entry(lang="tn"))
        self.assertEqual(tn["questions"][0]["question"], "A o nna mo Botswana?")
        self.assertEqual(tn["questions"][1]["question"], "Do you work for CEDA?")  # no Setswana yet: English

    def test_closed_and_not_open(self):
        self.client.force_authenticate(self.innovator)
        self.challenge("Done", opens_in=-30, closes_in=-2)
        self.challenge("Soon", opens_in=3, closes_in=20)
        self.assertEqual(data(self.entry("done"))["state"], "closed")
        self.assertEqual(data(self.entry("soon"))["state"], "not_open")

    def test_already_entered_links_to_the_entry(self):
        sent = self.send()
        self.client.force_authenticate(self.innovator)
        state = data(self.entry())
        self.assertEqual(state["state"], "entered")
        self.assertEqual(state["entry"]["reference_number"], sent.reference_number)
        self.assertEqual(state["entry"]["url"], f"/my-ideas/{sent.id}")

    def test_limit_above_one(self):
        self.program.max_entries_per_person = 2
        self.program.save()
        self.send()
        self.send(title="Second")
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.entry())["state"], "limit")

    def test_other_audience(self):
        self.program.audience = ProgramAudience.INTERNAL
        self.program.save()
        self.client.force_authenticate(self.innovator)
        state = data(self.entry())
        self.assertEqual(state["state"], "audience")
        self.assertIn("CEDA staff", state["message"])

    def test_old_links_by_id_work(self):
        self.assertEqual(data(self.entry(str(self.program.id)))["challenge"]["slug"], "cold-chain")

    def test_hidden_challenge_is_404(self):
        self.challenge("Hidden", public=False)
        self.assertEqual(self.entry("hidden").status_code, 404)


class EligibilityTests(EntryTestCase):
    def test_eligible_opens_the_challenge_draft_then_the_form(self):
        self.client.force_authenticate(self.innovator)
        result = data(self.answer({str(self.botswana.id): True, str(self.employee.id): False}))
        self.assertTrue(result["eligible"])
        draft = ApplicationDraft.objects.get(id=result["draft_id"])
        self.assertEqual(draft.program, self.program)
        self.assertFalse(draft.is_general_idea)
        self.assertTrue(draft.metadata["eligibility"]["passed"])
        state = data(self.entry())
        self.assertEqual((state["state"], state["draft_id"]), ("form", str(draft.id)))
        # Asking again reuses the same draft.
        again = data(self.answer({str(self.botswana.id): True, str(self.employee.id): False}))
        self.assertEqual(again["draft_id"], str(draft.id))
        self.assertEqual(ApplicationDraft.objects.filter(program=self.program).count(), 1)
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_eligibility_passed").exists())

    def test_not_eligible_gives_reasons_and_stores_nothing(self):
        self.client.force_authenticate(self.innovator)
        result = data(self.answer({str(self.botswana.id): False, str(self.employee.id): True}))
        self.assertFalse(result["eligible"])
        self.assertEqual([r["reason"] for r in result["reasons"]], ["This challenge is for people who live in Botswana.", "CEDA staff cannot enter."])
        self.assertEqual(result["general_idea_url"], "/submit")
        self.assertFalse(ApplicationDraft.objects.filter(program=self.program).exists())

    def test_every_question_needs_an_answer(self):
        self.client.force_authenticate(self.innovator)
        response = self.answer({str(self.botswana.id): True})
        self.assertEqual(response.status_code, 400)
        self.assertIn(str(self.employee.id), str(response.json()))

    def test_no_questions_goes_straight_to_the_form(self):
        program = self.challenge("Open door")
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.entry("open-door"))["state"], "form")
        result = data(self.answer({}, slug="open-door"))
        self.assertTrue(result["eligible"])
        self.assertTrue(ApplicationDraft.objects.filter(program=program, innovator=self.innovator).exists())

    def test_closed_or_full_is_refused(self):
        self.send()
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.answer({str(self.botswana.id): True, str(self.employee.id): False}).status_code, 400)

    def test_needs_sign_in(self):
        self.assertEqual(self.answer({}).status_code, 401)


class ResultsTests(EntryTestCase):
    def setUp(self):
        super().setUp()
        self.done = self.challenge("Done", opens_in=-30, closes_in=-2, share_scores_with_entrants=False)
        self.other = User.objects.create_user(email="u10-other@example.com", password="StrongPass123", first_name="Mpho", last_name="Dube")
        RoleService.assign_roles(self.other, [RoleType.INNOVATOR])
        self.winning = self.send(program=self.done, user=self.other, status=SubmissionStatus.WINNER, title="Cool boxes")
        self.mine = self.send(program=self.done, status=SubmissionStatus.SHORTLISTED, title="Solar milk cooler")

    def test_nothing_shows_before_results_are_published(self):
        results = data(self.client.get("/api/programs/public/done/results/"))
        self.assertFalse(results["published"])
        self.assertEqual((results["winners"], results["shortlisted"]), ([], []))
        self.client.force_authenticate(self.innovator)
        mine = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual(mine["outcome"], "waiting")
        self.assertEqual(mine["entry"]["title"], "Solar milk cooler")

    def test_winners_and_shortlist_once_published(self):
        WinnerSpotlight.objects.create(program=self.done, team_name="Mpho Dube", project_name="Cool boxes", position="1st", year=2026, submission=self.winning, prize_amount="P50 000")
        self.done.results_announced_at = timezone.now()
        self.done.save()
        results = data(self.client.get("/api/programs/public/done/results/"))
        self.assertTrue(results["published"])
        self.assertEqual([(w["position"], w["title"], w["prize_amount"]) for w in results["winners"]], [("1st", "Cool boxes", "P50 000")])
        # Names show by default, for winners and the shortlist (Nshathisi, 22 Nov).
        self.assertEqual(results["shortlisted"], [{"title": "Solar milk cooler", "name": "Neo Kebadile", "district": ""}])
        self.assertEqual((results["winners"][0]["name"], results["show_names"]), ("Mpho Dube", True))
        self.assertNotIn("score", str(results))
        # Off: idea titles only, for everyone.
        self.done.show_names_on_results = False
        self.done.save()
        hidden = data(self.client.get("/api/programs/public/done/results/"))
        self.assertEqual(hidden["shortlisted"], [{"title": "Solar milk cooler", "name": "", "district": ""}])
        self.assertEqual((hidden["winners"][0]["name"], hidden["winners"][0]["title"], hidden["show_names"]), ("", "Cool boxes", False))
        self.assertNotIn("Neo", str(hidden))
        self.assertNotIn("Mpho", str(hidden))

        self.client.force_authenticate(self.innovator)
        mine = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual((mine["outcome"], mine["scores"]), ("shortlisted", None))
        self.client.force_authenticate(self.other)
        theirs = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual((theirs["outcome"], theirs["position"]), ("winner", "1st"))

    def test_results_say_how_it_was_judged_and_my_result_gives_feedback_and_next_step(self):
        from datetime import timedelta
        from decimal import Decimal

        from apps.evaluation.models import MarkingCriteria, MarkingCriteriaItem
        from apps.reference.models import District
        from apps.submissions.models import SubmissionFeedbackSnapshot

        criteria = MarkingCriteria.objects.create(title="Green rubric", created_by=self.officer)
        MarkingCriteriaItem.objects.create(criteria=criteria, name="Problem", max_score=Decimal("5"), weight=Decimal("3"), ordering=1)
        MarkingCriteriaItem.objects.create(criteria=criteria, name="Team", max_score=Decimal("5"), weight=Decimal("1"), ordering=2)
        kweneng, _ = District.objects.get_or_create(slug="kweneng", defaults={"name": {"en": "Kweneng", "tn": "Kweneng"}})
        self.winning.district = kweneng
        self.winning.save()
        WinnerSpotlight.objects.create(program=self.done, team_name="Mpho Dube", project_name="Cool boxes", position="1st", year=2026, submission=self.winning)
        SubmissionFeedbackSnapshot.objects.create(
            submission=self.mine, stage_code="committee_review", stage_name="Committee", release_action="approve", released_at=timezone.now(),
            payload_json={"release": {"comment": "Real demand. Show your running costs."}, "reviews": [{"reviewer_label": "Reviewer 1", "total_score": 4}]},
        )
        self.done.marking_criteria = criteria
        self.done.event_date = timezone.now() + timedelta(days=10)
        self.done.results_announced_at = timezone.now()
        self.done.save()

        results = data(self.client.get("/api/programs/public/done/results/"))
        self.assertEqual(results["criteria"], [{"name": "Problem", "weight": 75}, {"name": "Team", "weight": 25}])
        self.assertEqual((results["winners"][0]["district"], results["districts_count"]), ("Kweneng", 1))

        self.client.force_authenticate(self.innovator)
        mine = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual(mine["feedback"], "Real demand. Show your running costs.")
        self.assertNotIn("Reviewer", str(mine))
        self.assertEqual((mine["entries_count"], mine["shortlisted_count"]), (2, 2))
        self.assertIsNotNone(mine["next_step"]["at"])
        self.done.event_date = timezone.now() - timedelta(days=1)
        self.done.save()
        self.assertIsNone(data(self.client.get("/api/programs/public/done/my-result/"))["next_step"])

    def test_not_selected_and_no_entry(self):
        self.mine.current_status = SubmissionStatus.SUBMITTED
        self.mine.save()
        WinnerSpotlight.objects.create(program=self.done, team_name="Mpho Dube", project_name="Cool boxes", position="1st", year=2026, submission=self.winning)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.client.get("/api/programs/public/done/my-result/"))["outcome"], "not_selected")
        self.client.force_authenticate(self.officer)
        self.assertEqual(data(self.client.get("/api/programs/public/done/my-result/"))["outcome"], "no_entry")

    def test_my_result_needs_sign_in(self):
        self.assertEqual(self.client.get("/api/programs/public/done/my-result/").status_code, 401)


class StaffTests(EntryTestCase):
    def test_officer_replaces_the_questions(self):
        self.client.force_authenticate(self.officer)
        url = f"/api/programs/{self.program.id}/eligibility/"
        self.assertEqual(len(data(self.client.get(url))["rules"]), 2)
        body = {"rules": [
            {"id": str(self.employee.id), "question": "Are you a CEDA employee?", "required_answer": False, "reason": "Staff cannot enter."},
            {"question": "Are you 18 or older?", "reason": "You must be 18 or older."},
        ]}
        rules = data(self.client.put(url, body, format="json"))["rules"]
        self.assertEqual([r["question"] for r in rules], ["Are you a CEDA employee?", "Are you 18 or older?"])
        self.assertFalse(EligibilityRule.objects.filter(id=self.botswana.id).exists())
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_eligibility_updated").exists())

    def test_questions_need_text_and_staff(self):
        url = f"/api/programs/{self.program.id}/eligibility/"
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.put(url, {"rules": [{"question": ""}]}, format="json").status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(f"/api/programs/{self.program.id}/results/publish/").status_code, 403)

    def test_publish_hand_picked_winners(self):
        done = self.challenge("Done", opens_in=-30, closes_in=-2)
        entry = self.send(program=done, status=SubmissionStatus.WINNER)
        WinnerSpotlight.objects.create(program=done, team_name="Neo", project_name="Solar milk cooler", position="1st", year=2026, submission=entry)
        self.client.force_authenticate(self.officer)
        result = data(self.client.post(f"/api/programs/{done.id}/results/publish/"))
        self.assertTrue(result["published"])
        done.refresh_from_db()
        self.assertIsNotNone(done.results_announced_at)

    def test_publish_can_hide_names_and_the_switch_is_editable(self):
        done = self.challenge("Done", opens_in=-30, closes_in=-2)
        entry = self.send(program=done, status=SubmissionStatus.WINNER)
        WinnerSpotlight.objects.create(program=done, team_name="Neo", project_name="Solar milk cooler", position="1st", year=2026, submission=entry)
        self.client.force_authenticate(self.officer)
        result = data(self.client.post(f"/api/programs/{done.id}/results/publish/", {"show_names": False}, format="json"))
        self.assertEqual((result["published"], result["show_names"]), (True, False))
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_results_names_changed").exists())
        self.assertEqual(data(self.client.get("/api/programs/public/done/results/"))["winners"][0]["name"], "")
        # After publishing, the switch can still change (staff programme endpoint), with the scores switch beside it.
        response = self.client.patch(f"/api/programs/{done.id}/", {"show_names_on_results": True, "share_scores_with_entrants": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        done.refresh_from_db()
        self.assertEqual((done.show_names_on_results, done.share_scores_with_entrants), (True, True))
        self.assertEqual(data(self.client.get("/api/programs/public/done/results/"))["winners"][0]["name"], "Neo")

    def test_publish_waits_for_the_close(self):
        self.client.force_authenticate(self.officer)
        response = self.client.post(f"/api/programs/{self.program.id}/results/publish/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("still_open", str(response.json()))

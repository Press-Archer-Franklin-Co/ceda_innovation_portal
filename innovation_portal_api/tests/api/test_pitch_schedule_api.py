"""R-84: the list behind the staff Pitch schedule."""

import json

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuthorizationRefusal
from apps.core.constants import RoleType, SubmissionOutcomeType, SubmissionStatus, SubmissionType
from apps.programs import pitch
from apps.programs.models import PitchSession, ProgramStage
from apps.submissions.models import Submission, SubmissionOutcome
from tests.api.test_challenges_b5_api import B5TestCase, data

STAGE_TIME = {"starts_at": "2026-11-28T09:00:00+02:00", "format": "in_person", "place": {"en": "CEDA House", "tn": ""}}
OWN_TIME = {"starts_at": "2026-11-28T11:30:00+02:00", "format": "online", "meeting_link": "https://meet.example.com/ceda"}


class PitchScheduleTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")
        self.url = f"/api/programs/{self.program.id}/pitch-schedule/"
        self.client.force_authenticate(self.officer)
        self.neo = self.entry(self.innovator, "Solar dryer")

    def entry(self, owner, title, *, status=SubmissionStatus.SHORTLISTED, **extra):
        number = Submission.objects.count() + 1
        return Submission.objects.create(
            reference_number=f"PS-{number:04d}", program=self.program, innovator=owner, submission_type=SubmissionType.IDEA,
            title=title, submitted_at=timezone.now(), current_status=status, **extra,
        )

    def person(self, n, first="Lesedi", last="Molefe"):
        user = User.objects.create_user(email=f"ps-{n}@example.com", password="StrongPass123", first_name=first, last_name=last, phone_number=f"+2677100000{n}")
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        return user

    def stage_session(self):
        stage = ProgramStage.objects.create(program=self.program, code="pitch", name="Pitch day", takes_part="shortlisted")
        return pitch.save_for_stage(self.program, stage, STAGE_TIME, actor=self.officer)

    def get(self, **params):
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)

    def test_shortlisted_only_with_the_agreed_shape_and_no_contact_details(self):
        self.entry(self.person(1), "Still in review", status=SubmissionStatus.UNDER_REVIEW)
        by_outcome = self.entry(self.person(2, "Mpho", "Dube"), "Picked by outcome", status=SubmissionStatus.UNDER_JUDGING)
        SubmissionOutcome.objects.create(submission=by_outcome, program=self.program, outcome_type=SubmissionOutcomeType.SHORTLISTED, decided_at=timezone.now(), is_current=True)
        guest = self.entry(None, "Guest idea", is_guest=True, guest_name="Tebogo Moeng", guest_phone="+26772222222", guest_email="guest@example.com")
        response = self.client.get(self.url)
        body = data(response)
        self.assertEqual({row["title"] for row in body["results"]}, {"Solar dryer", "Picked by outcome", "Guest idea"})
        self.assertEqual((body["count"], body["not_set_count"], body["stage_session"]), (3, 3, None))
        row = next(item for item in body["results"] if item["submission_id"] == str(self.neo.id))
        self.assertEqual(set(row), {"submission_id", "reference", "title", "innovator", "own", "shown"})
        self.assertEqual(row["innovator"], {"name": "Neo Kebadile", "first_name": "Neo"})
        self.assertEqual((row["own"], row["shown"]), (None, None))
        self.assertEqual(next(item for item in body["results"] if item["submission_id"] == str(guest.id))["innovator"]["name"], "Tebogo Moeng")
        text = json.dumps(body)
        for private in ("@example.com", "+2677", "+26772222222"):
            self.assertNotIn(private, text)

    def test_own_time_beats_the_stage_time(self):
        other = self.entry(self.person(3), "Tractor hire")
        self.stage_session()
        pitch.save_for_idea(self.neo, OWN_TIME, actor=self.officer)
        body = self.get()
        rows = {row["submission_id"]: row for row in body["results"]}
        mine, theirs = rows[str(self.neo.id)], rows[str(other.id)]
        self.assertEqual((mine["own"]["time"], mine["shown"]["time"], mine["shown"]["set_for"]), ("11:30", "11:30", "idea"))
        self.assertEqual((theirs["own"], theirs["shown"]["time"], theirs["shown"]["set_for"]), (None, "09:00", "stage"))
        self.assertEqual(body["stage_session"]["time"], "09:00")
        self.assertEqual(body["not_set_count"], 0)
        # The list and the innovator's own view always agree.
        self.assertEqual(mine["shown"]["starts_at"], pitch.payload(pitch.session_for(self.neo))["starts_at"])
        self.assertEqual(theirs["shown"]["starts_at"], pitch.payload(pitch.session_for(other))["starts_at"])

    def test_not_set_filter_search_ordering_and_paging(self):
        second = self.entry(self.person(4, "Amo", "Sechele"), "Tractor hire")
        pitch.save_for_idea(second, OWN_TIME, actor=self.officer)
        unset = self.get(not_set="true")
        self.assertEqual(([row["title"] for row in unset["results"]], unset["count"], unset["not_set_count"]), (["Solar dryer"], 1, 1))
        self.assertEqual(self.get(search="sechele")["count"], 1)
        self.assertEqual(self.get(search="solar")["results"][0]["title"], "Solar dryer")
        self.assertEqual(self.get(search=self.neo.reference_number)["count"], 1)
        self.assertEqual(self.get(search="sechele")["not_set_count"], 1)  # the button's count ignores the search
        self.assertEqual([row["innovator"]["first_name"] for row in self.get()["results"]], ["Amo", "Neo"])
        self.assertEqual([row["innovator"]["first_name"] for row in self.get(ordering="-name")["results"]], ["Neo", "Amo"])
        for ordering in ("starts_at", "-starts_at"):  # no time comes last both ways
            self.assertEqual(self.get(ordering=ordering)["results"][-1]["title"], "Solar dryer")
        page = self.get(page=2, page_size=1)
        self.assertEqual((page["count"], len(page["results"]), page["results"][0]["innovator"]["first_name"]), (2, 1, "Neo"))
        for bad in ({"ordering": "colour"}, {"page": "x"}, {"page_size": 0}):
            self.assertEqual(self.client.get(self.url, bad).status_code, 400, bad)

    def test_query_count_does_not_grow_with_the_list(self):
        self.stage_session()
        self.get()  # the first request also fills the capability cache
        with CaptureQueriesContext(connection) as few:
            self.get()
        for n in range(5, 9):
            idea = self.entry(self.person(n), f"Idea {n}")
            pitch.save_for_idea(idea, OWN_TIME, actor=self.officer)
        with CaptureQueriesContext(connection) as many:
            body = self.get()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(many), len(few))

    def test_refused_without_the_capability_and_recorded(self):
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        row = AuthorizationRefusal.objects.get()
        self.assertEqual((row.status_code, row.route_pattern, row.user_id), (403, "/api/programs/<uuid:program_id>/pitch-schedule/", self.innovator.id))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_another_challenges_entries_and_sessions_stay_out(self):
        other_program = self.challenge("Other")
        elsewhere = Submission.objects.create(reference_number="PS-OTHER", program=other_program, innovator=self.innovator, submission_type=SubmissionType.IDEA, title="Elsewhere", submitted_at=timezone.now(), current_status=SubmissionStatus.SHORTLISTED)
        pitch.save_for_idea(elsewhere, OWN_TIME, actor=self.officer)
        body = self.get()
        self.assertEqual(([row["title"] for row in body["results"]], PitchSession.objects.filter(program=self.program).count()), (["Solar dryer"], 0))

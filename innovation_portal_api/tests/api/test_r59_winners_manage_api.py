"""R-59 part 3: the winners manager (3.37) and what the public results (1.10) show."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.content.models import WinnerSpotlight
from apps.core.constants import RoleType, SubmissionStatus
from tests.api import test_challenge_entry_u10_api as u10
from tests.api.test_challenges_b5_api import data


@override_settings(MEDIA_ROOT="/tmp/r59-media")
class WinnersManageTests(u10.EntryTestCase):
    def setUp(self):
        super().setUp()
        self.done = self.challenge("Done", opens_in=-30, closes_in=-2)
        self.other = User.objects.create_user(email="r59-other@example.com", password="StrongPass123", first_name="Mpho", last_name="Dube")
        RoleService.assign_roles(self.other, [RoleType.INNOVATOR])
        self.winning = self.send(program=self.done, user=self.other, status=SubmissionStatus.WINNER, title="Cool boxes")
        self.first = self.send(program=self.done, status=SubmissionStatus.SHORTLISTED, title="Solar milk cooler")
        self.second = self.send(program=self.done, status=SubmissionStatus.SHORTLISTED, title="Akwa crates")
        self.send(program=self.done, status=SubmissionStatus.REJECTED, title="Not chosen")
        WinnerSpotlight.objects.create(program=self.done, team_name="Mpho Dube", project_name="Cool boxes", position="1st", year=2026, submission=self.winning)
        self.done.results_announced_at = timezone.now()
        self.done.save()
        self.url = f"/api/programs/{self.done.id}/results/manage/"
        self.client.force_authenticate(self.officer)

    def test_manage_and_public_results(self):
        managed = data(self.client.get(self.url))
        self.assertTrue(managed["results_published"] and managed["show_names"])
        self.assertEqual([(row["title"], row["place"]) for row in managed["entries"]], [("Cool boxes", "1st"), ("Akwa crates", "shortlisted"), ("Solar milk cooler", "shortlisted")])
        self.assertEqual(managed["entries"][0]["applicant"], "Mpho D.")

        # Put Solar first, hide Akwa, add a story, hide names.
        self.assertEqual(self.client.patch(f"{self.url}{self.first.id}/", {"order": 1, "story": {"en": "Cooling milk with the sun.", "tn": ""}}, format="json").status_code, 200)
        self.client.patch(f"{self.url}{self.second.id}/", {"show_on_results": False}, format="json")
        self.client.patch(f"{self.url}{self.winning.id}/", {"story": {"en": "Boxes that keep vegetables cold.", "tn": "Mabokose a a tsidifatsang merogo."}}, format="json")
        # Names use the one switch on the challenge (#72), as the staff Winners screen does.
        switched = self.client.patch(f"/api/programs/{self.done.id}/", {"show_names_on_results": False}, format="json")
        self.assertEqual(switched.status_code, 200, switched.content)
        self.assertFalse(data(self.client.get(self.url))["show_names"])
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_result_entry_updated").exists())

        public = data(self.client.get("/api/programs/public/done/results/?lang=tn"))
        self.assertEqual(public["shortlisted"], [{"title": "Solar milk cooler", "name": "", "district": ""}])
        winner = public["winners"][0]
        self.assertEqual((winner["name"], winner["members_count"], winner["district"], winner["story"]), ("", 0, "", "Mabokose a a tsidifatsang merogo."))
        self.assertFalse(public["show_names"])

        buffer = io.BytesIO()
        Image.new("RGB", (40, 40), "red").save(buffer, format="PNG")
        photo = self.client.post(f"{self.url}{self.winning.id}/photo/", {"file": SimpleUploadedFile("w.png", buffer.getvalue(), content_type="image/png")}, format="multipart")
        self.assertEqual(photo.status_code, 200, photo.content)
        self.assertIsNotNone(data(photo)["photo_url"])
        self.assertIsNotNone(data(self.client.get("/api/programs/public/done/results/"))["winners"][0]["photo_url"])

    def test_only_winning_or_shortlisted_and_staff(self):
        rejected = self.done.submissions.get(title="Not chosen")
        self.assertEqual(self.client.patch(f"{self.url}{rejected.id}/", {"order": 1}, format="json").status_code, 400)
        bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
        self.assertEqual(self.client.post(f"{self.url}{self.first.id}/photo/", {"file": bad}, format="multipart").status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(self.url).status_code, 403)

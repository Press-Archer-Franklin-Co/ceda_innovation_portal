from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.reference.models import District, Sector


class ReferenceListApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_sectors_are_seeded_in_order_and_public(self):
        response = self.client.get("/api/reference/sectors/")
        self.assertEqual(response.status_code, 200)
        names = [item["name"] for item in response.json()]
        self.assertEqual(
            names,
            ["Agriculture", "Retail & trade", "Manufacturing", "Tourism & hospitality", "Services", "Creative", "Community", "Other"],
        )
        self.assertEqual(set(response.json()[0]), {"id", "slug", "name", "ordering"})

    def test_districts_are_seeded(self):
        response = self.client.get("/api/reference/districts/")
        self.assertEqual(response.status_code, 200)
        slugs = {item["slug"] for item in response.json()}
        self.assertTrue({"central", "kweneng", "gaborone", "francistown", "chobe"} <= slugs)

    def test_lang_tn_falls_back_to_english(self):
        response = self.client.get("/api/reference/sectors/?lang=tn")
        self.assertEqual(response.json()[0]["name"], "Agriculture")

    def test_lang_tn_uses_setswana_when_present(self):
        Sector.objects.filter(slug="agriculture").update(name={"en": "Agriculture", "tn": "Temothuo"})
        self.assertEqual(self.client.get("/api/reference/sectors/?lang=tn").json()[0]["name"], "Temothuo")
        self.assertEqual(self.client.get("/api/reference/sectors/", HTTP_ACCEPT_LANGUAGE="tn-BW,en;q=0.5").json()[0]["name"], "Temothuo")
        self.assertEqual(self.client.get("/api/reference/sectors/?lang=en", HTTP_ACCEPT_LANGUAGE="tn").json()[0]["name"], "Agriculture")
        self.assertEqual(self.client.get("/api/reference/sectors/?lang=fr").json()[0]["name"], "Agriculture")

    def test_inactive_items_are_hidden(self):
        District.objects.filter(slug="chobe").update(active=False)
        slugs = {item["slug"] for item in self.client.get("/api/reference/districts/").json()}
        self.assertNotIn("chobe", slugs)

    def test_writes_are_not_allowed(self):
        self.assertEqual(self.client.post("/api/reference/sectors/", {"slug": "x"}, format="json").status_code, 405)


class ProfileReferenceFieldsTests(TestCase):
    def setUp(self):
        from apps.accounts.services import UserOnboardingService

        self.user = User.objects.create_user(email="profile@example.com", password="StrongPass123!", first_name="P", last_name="F")
        UserOnboardingService.ensure_user_onboarding(self.user, source="test", default_role_codes=["innovator"])
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_profile_accepts_sector_district_and_business_stage(self):
        sector = Sector.objects.get(slug="agriculture")
        district = District.objects.get(slug="kweneng")
        response = self.client.patch(
            "/api/profile/",
            {"sector": str(sector.id), "district": str(district.id), "business_stage": "testing", "region": "Molepolole"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["sector"], str(sector.id))
        self.assertEqual(body["sector_name"], "Agriculture")
        self.assertEqual(body["district_name"], "Kweneng")
        self.assertEqual(body["business_stage"], "testing")
        self.assertEqual(body["region"], "Molepolole")

    def test_profile_rejects_unknown_business_stage_and_inactive_sector(self):
        self.assertEqual(self.client.patch("/api/profile/", {"business_stage": "unicorn"}, format="json").status_code, 400)
        sector = Sector.objects.get(slug="other")
        sector.active = False
        sector.save()
        self.assertEqual(self.client.patch("/api/profile/", {"sector": str(sector.id)}, format="json").status_code, 400)

"""R-51 (2.9): where I am signed in, signing out one place, and deleting my account."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import AccountSession, User
from apps.audit.models import AuditLog
from apps.submissions.models import Submission

PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"


class SessionsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="r51@example.com", password="StrongPass123!", first_name="Neo", last_name="K", phone_number="+26771234567")

    def sign_in(self, agent):
        client = APIClient(HTTP_USER_AGENT=agent)
        response = client.post("/api/auth/login/", {"email": "r51@example.com", "password": "StrongPass123!"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client, response.data["refresh"]

    def test_list_sign_out_one_and_refresh_refused(self):
        phone, phone_refresh = self.sign_in(PHONE)
        laptop, laptop_refresh = self.sign_in(LAPTOP)
        rows = laptop.get("/api/auth/sessions/").json()["data"]
        self.assertEqual(sorted(row["device"] for row in rows), ["Chrome on Windows", "Safari on iPhone"])
        self.assertEqual([row["device"] for row in rows if row["current"]], ["Chrome on Windows"])
        other = next(row for row in rows if not row["current"])

        self.assertEqual(laptop.post(f"/api/auth/sessions/{other['id']}/sign-out/").status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action_type="account_session_ended").exists())
        self.assertEqual(APIClient().post("/api/auth/refresh/", {"refresh": phone_refresh}, format="json").status_code, 401)
        self.assertEqual(APIClient().post("/api/auth/refresh/", {"refresh": laptop_refresh}, format="json").status_code, 200)
        self.assertEqual(len(laptop.get("/api/auth/sessions/").json()["data"]), 1)
        self.assertEqual(laptop.post(f"/api/auth/sessions/{other['id']}/sign-out/").status_code, 400)

        stranger = User.objects.create_user(email="r51-other@example.com", password="StrongPass123!", first_name="X")
        client = APIClient()
        client.force_authenticate(stranger)
        mine = AccountSession.objects.filter(user=self.user, ended_at__isnull=True).first()
        self.assertEqual(client.post(f"/api/auth/sessions/{mine.id}/sign-out/").status_code, 400)

    def test_delete_account(self):
        laptop, refresh = self.sign_in(LAPTOP)
        self.assertEqual(laptop.post("/api/auth/me/delete/", {"confirm": "delete"}, format="json").status_code, 400)
        self.assertEqual(laptop.post("/api/auth/me/delete/", {"confirm": "DELETE"}, format="json").status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual((self.user.email, self.user.phone_number, self.user.is_active), (None, "", False))
        self.assertEqual(APIClient().post("/api/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)
        self.assertEqual(APIClient().post("/api/auth/login/", {"email": "r51@example.com", "password": "StrongPass123!"}, format="json").status_code // 100, 4)
        self.assertTrue(AuditLog.objects.filter(action_type="account_deleted").exists())
        self.assertEqual(Submission.objects.filter(innovator=self.user).count(), 0)  # nothing removed that was not there

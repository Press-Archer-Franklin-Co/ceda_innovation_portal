from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.communications.models import NotificationPreference
from apps.profiles.models import InnovatorProfile


class AuthProfileApiTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_register_user(self):
        payload = {
            "email": "newuser@example.com",
            "first_name": "New",
            "last_name": "User",
            "phone_number": "+26712345678",
            "password": "StrongPass123",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="newuser@example.com")
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(NotificationPreference.objects.filter(user=user).exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="local_registration_success").exists())

    def test_password_login_repairs_missing_profile_and_preferences(self):
        user = User.objects.create_user(
            email="legacy@example.com",
            password="StrongPass123!",
            first_name="Legacy",
            last_name="User",
        )
        response = self.client.post(
            "/api/auth/login/",
            {"email": "legacy@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(NotificationPreference.objects.filter(user=user).exists())
        self.assertIn("user", response.data)
        self.assertEqual(response.data["user"]["email"], "legacy@example.com")
        self.assertFalse(response.data["user"]["is_staff"])
        self.assertFalse(response.data["user"]["is_superuser"])
        self.assertFalse(response.data["user"]["is_admin"])
        self.assertIn("profile", response.data["user"])
        self.assertIsNotNone(response.data["user"]["profile"])

    def test_password_login_returns_tokens_for_follow_up_requests(self):
        User.objects.create_user(
            email="sessionuser@example.com",
            password="StrongPass123!",
            first_name="Session",
            last_name="User",
        )
        response = self.client.post(
            "/api/auth/login/",
            {"email": "sessionuser@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], "sessionuser@example.com")
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        # JWT only (Nshathisi, 20 Nov): without the token the API does not know the person.
        self.assertIn(self.client.get("/api/auth/account-security/").status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        follow_up = self.client.get("/api/auth/account-security/")
        self.assertEqual(follow_up.status_code, status.HTTP_200_OK)

    def test_refresh_returns_user_with_profile_details(self):
        User.objects.create_user(
            email="refreshuser@example.com",
            password="StrongPass123!",
            first_name="Refresh",
            last_name="User",
            email_verified=True,
        )
        login_response = self.client.post(
            "/api/auth/login/",
            {"email": "refreshuser@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        refresh_response = self.client.post(
            "/api/auth/refresh/",
            {"refresh": login_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)
        self.assertIn("refresh", refresh_response.data)
        self.assertEqual(refresh_response.data["user"]["email"], "refreshuser@example.com")
        self.assertFalse(refresh_response.data["user"]["is_admin"])
        self.assertIn("profile", refresh_response.data["user"])
        self.assertIsNotNone(refresh_response.data["user"]["profile"])

    def test_login_returns_admin_flags_for_staff_superuser(self):
        user = User.objects.create_user(
            email="adminflags@example.com",
            password="StrongPass123!",
            first_name="Admin",
            last_name="Flags",
            email_verified=True,
            is_staff=True,
            is_superuser=True,
        )
        response = self.client.post(
            "/api/auth/login/",
            {"email": "adminflags@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], user.email)
        self.assertTrue(response.data["user"]["is_staff"])
        self.assertTrue(response.data["user"]["is_superuser"])
        self.assertTrue(response.data["user"]["is_admin"])

    def test_logout_blacklists_the_refresh_token(self):
        User.objects.create_user(
            email="logoutsession@example.com",
            password="StrongPass123!",
            first_name="Logout",
            last_name="Session",
        )
        login = self.client.post(
            "/api/auth/login/",
            {"email": "logoutsession@example.com", "password": "StrongPass123!"},
            format="json",
        )
        refresh = login.data["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        response = self.client.post("/api/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, status.HTTP_205_RESET_CONTENT)

        # The blacklisted refresh token cannot get a new access token.
        self.client.credentials()
        again = self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(again.status_code, status.HTTP_401_UNAUTHORIZED)

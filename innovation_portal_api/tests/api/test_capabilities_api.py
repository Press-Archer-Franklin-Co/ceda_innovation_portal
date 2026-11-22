"""S1: one capability map; HasCapability; capabilities on /api/auth/me/; refusals recorded without leaks."""

import re
import uuid
from pathlib import Path

from django.test import RequestFactory, TestCase
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuthorizationRefusal
from apps.core.capabilities import CAPABILITIES, capabilities_for, user_has
from apps.core.constants import RoleType
from apps.core.permissions import HasCapability

API_ROOT = Path(__file__).resolve().parents[2]


def _all_views(resolver=None, prefix=""):
    resolver = resolver or get_resolver()
    for entry in resolver.url_patterns:
        if isinstance(entry, URLResolver):
            yield from _all_views(entry, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            view = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
            yield prefix + str(entry.pattern), view


class CapabilityMapTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()

    def make(self, *roles, email=None):
        user = User.objects.create_user(email=email or f"{uuid.uuid4().hex[:8]}@example.com", password="StrongPass123")
        RoleService.assign_roles(user, list(roles))
        return user

    def test_every_capability_is_held_by_its_roles_and_refused_to_everyone_else(self):
        all_roles = [choice for choice, _ in RoleType.choices]
        users = {role: self.make(role) for role in all_roles}
        nobody = self.make()
        for capability, roles in CAPABILITIES.items():
            with self.subTest(capability=capability):
                self.assertFalse(user_has(nobody, capability))
                for role, user in users.items():
                    self.assertEqual(user_has(user, capability), role in roles, f"{role} / {capability}")

    def test_unknown_capability_fails_early(self):
        with self.assertRaises(KeyError):
            HasCapability.of("content.destroy")

    def test_every_capability_named_in_code_exists(self):
        used = set()
        for path in (API_ROOT / "apps").rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            used |= set(re.findall(r'HasCapability\.of\("([a-z_.]+)"', text))
            used |= set(re.findall(r'user_has\([^,]+,\s*"([a-z_.]+)"\)', text))
        self.assertTrue(used)
        self.assertEqual(sorted(used - set(CAPABILITIES)), [])

    def test_every_api_route_has_a_permission_class(self):
        missing = []
        for route, view in _all_views():
            if not route.startswith("api/") or view is None or not issubclass(view, APIView):
                continue
            overrides = any("get_permissions" in vars(klass) for klass in view.__mro__ if klass not in (APIView, object) and klass.__module__.startswith("apps."))
            if not view.permission_classes and not overrides:
                missing.append(route)
        self.assertEqual(missing, [])

    def test_superuser_holds_everything_and_anonymous_nothing(self):
        admin = User.objects.create_superuser(email="root-s1@example.com", password="StrongPass123")
        self.assertEqual(capabilities_for(admin), sorted(CAPABILITIES))
        from django.contrib.auth.models import AnonymousUser

        self.assertEqual(capabilities_for(AnonymousUser()), [])

    def test_write_capability_applies_to_unsafe_methods(self):
        reader = self.make(RoleType.MANAGEMENT_VIEWER)
        permission = HasCapability.of("analytics.view", write="settings.manage")()
        factory = RequestFactory()
        for method, allowed in (("get", True), ("post", False)):
            request = getattr(factory, method)("/x/")
            request.user = reader
            self.assertEqual(permission.has_permission(request, None), allowed, method)


class CapabilityEndpointTests(TestCase):
    """A denied and an allowed request for each area moved to HasCapability."""

    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="s1-officer@example.com", password="StrongPass123", first_name="Of", last_name="Ficer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="s1-manager@example.com", password="StrongPass123")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.viewer = User.objects.create_user(email="s1-viewer@example.com", password="StrongPass123")
        RoleService.assign_roles(self.viewer, [RoleType.MANAGEMENT_VIEWER])
        self.admin = User.objects.create_user(email="s1-admin@example.com", password="StrongPass123")
        RoleService.assign_roles(self.admin, [RoleType.ADMINISTRATOR])

    def status_for(self, user, method, url, payload=None):
        self.client.force_authenticate(user)
        return getattr(self.client, method)(url, payload or {}, format="json").status_code

    def test_areas(self):
        cases = [
            ("forms.manage", "get", "/api/forms/", self.officer, self.manager),
            ("content.edit", "post", "/api/content/news/", self.manager, self.viewer),
            ("content.edit", "get", "/api/content/pages/home/draft/", self.manager, self.viewer),
            # S2: the approval flow decides per step; at the door, people with no website capability are refused.
            ("content.approve", "post", "/api/content/approvals/00000000-0000-0000-0000-000000000000/approve/", self.manager, self.viewer),
            ("entries.search", "get", "/api/staff-search/?q=solar", self.manager, self.viewer),
            ("audit.view", "get", "/api/audit/logs/", self.viewer, self.manager),
            ("settings.manage", "get", "/api/platform/features/", self.admin, self.officer),
        ]
        for capability, method, url, allowed, denied in cases:
            with self.subTest(capability=capability):
                self.assertEqual(self.status_for(denied, method, url), 403)
                self.assertNotEqual(self.status_for(allowed, method, url), 403)

    def test_me_lists_capabilities_and_keeps_roles(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get("/api/auth/me/").json()["data"]
        self.assertIn("roles", data)
        self.assertEqual(data["capabilities"], ["assistant.build", "assistant.hints", "content.approve", "content.edit", "conversations.reply", "entries.review", "entries.search"])
        self.client.force_authenticate(self.officer)
        self.assertIn("content.edit", self.client.get("/api/auth/me/").json()["data"]["capabilities"])


class RefusalRecordingTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.innovator = User.objects.create_user(email="s1-innovator@example.com", password="StrongPass123")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])

    def test_refusals_are_grouped_by_route_pattern_without_query_strings(self):
        self.client.force_authenticate(self.innovator)
        form_id = uuid.uuid4()
        with self.assertLogs("security.authorization", level="INFO") as logs:
            for _ in range(3):
                self.client.get(f"/api/forms/{form_id}/draft/?phone=+26771234567", HTTP_X_CEDA_CLIENT="admin@abc123")
        rows = list(AuthorizationRefusal.objects.all())
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row.count, row.status_code, row.method, row.client_build, row.user_id), (3, 403, "GET", "admin@abc123", self.innovator.id))
        self.assertEqual(row.route_pattern, "/api/forms/<uuid:form_id>/draft/")
        self.assertEqual(len(logs.output), 3)
        for line in logs.output:
            self.assertNotIn("26771234567", line)
            self.assertNotIn(str(form_id), line)

    def test_anonymous_and_missing_client_header(self):
        self.client.get("/api/forms/")
        row = AuthorizationRefusal.objects.get()
        self.assertEqual((row.status_code, row.user_id, row.client_build), (401, None, ""))

    def test_allowed_requests_are_not_recorded(self):
        self.client.get("/api/platform/public-config/")
        self.assertFalse(AuthorizationRefusal.objects.exists())


class CapabilityR25Tests(TestCase):
    """R-25: approvals list for editors or approvers, judges score, managers edit content."""

    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.users = {}
        for role in (RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.JUDGE, RoleType.INNOVATOR):
            user = User.objects.create_user(email=f"r25-{role}@example.com", password="StrongPass123")
            RoleService.assign_roles(user, [role])
            self.users[role] = user

    def status(self, role, method, url):
        self.client.force_authenticate(self.users[role])
        return getattr(self.client, method)(url, {}, format="json").status_code

    def test_approvals_list_for_editors_and_approvers(self):
        for role in (RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER):
            self.assertEqual(self.status(role, "get", "/api/content/approvals/"), 200, role)
        for role in (RoleType.JUDGE, RoleType.INNOVATOR):
            self.assertEqual(self.status(role, "get", "/api/content/approvals/"), 403, role)

    def test_only_judges_hold_entries_score(self):
        self.assertTrue(user_has(self.users[RoleType.JUDGE], "entries.score"))
        for role in (RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.INNOVATOR):
            self.assertFalse(user_has(self.users[role], "entries.score"), role)


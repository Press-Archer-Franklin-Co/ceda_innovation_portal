"""U9 API (3.23 to 3.29): write-only keys and service states, "needs setup", live chat hours for the bubble,
audit before and after with filters and CSV, invite and deactivate, and the approvals compare."""

import csv
import io
import json

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.audit.services import HIDDEN, AuditService, mask_ip
from apps.core.constants import RoleType
from apps.platform_config.models import FeatureFlag, IntegrationConnection
from apps.platform_config.testing import reset_platform_caches, set_features

SECRET = "twilio-auth-token-SECRET-77"


def data(response):
    return response.json()["data"]


class U9Base(TestCase):
    def setUp(self):
        cache.clear()
        reset_platform_caches(self)
        RoleService.ensure_default_roles()
        self.admin = self.person("u9-admin@example.com", RoleType.ADMINISTRATOR, "Lorato", "Sebina")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def person(self, email, role, first="Kago", last="Tau"):
        user = User.objects.create_user(email=email, password="StrongPass123", first_name=first, last_name=last)
        RoleService.assign_roles(user, [role])
        return user


class ServicesAndKeysTests(U9Base):
    def test_keys_are_write_only_and_audited_without_the_key(self):
        created = self.client.post(
            "/api/platform/integrations/",
            {"kind": "sms", "provider": "twilio", "name": "Twilio", "config": {"account_sid": "AC123", "from_number": "+26771000000"}, "secrets": {"auth_token": SECRET}},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertNotIn(SECRET[-4:], created.content.decode())
        connection_id = data(created)["id"]
        listed = self.client.get(f"/api/platform/integrations/{connection_id}/")
        self.assertEqual(data(listed)["secrets"]["auth_token"], {"is_set": True, "last4": ""})
        self.assertNotIn(SECRET[-4:], listed.content.decode())

        self.client.patch(f"/api/platform/integrations/{connection_id}/", {"secrets": {"auth_token": SECRET + "-new"}}, format="json")
        entries = AuditLog.objects.filter(target_model="IntegrationConnection")
        self.assertEqual(entries.count(), 2)
        self.assertNotIn("SECRET", json.dumps([[row.before_state, row.after_state, row.metadata] for row in entries]))
        update = entries.get(action_type="integration_updated")
        self.assertEqual((update.before_state["keys"]["auth_token"], update.after_state["keys"]["auth_token"]), ("set", "set"))
        self.assertEqual(update.after_state["status"], "draft")

    def test_service_states_and_what_switching_off_hides(self):
        services = {row["kind"]: row for row in data(self.client.get("/api/platform/services/"))}
        self.assertEqual((services["whatsapp"]["state"], services["whatsapp"]["state_label"]), ("not_set_up", "Not set up"))

        draft = IntegrationConnection.objects.create(kind="whatsapp", provider="whatsapp_log_only", name="Draft WA")
        reset_platform_caches(self)
        self.assertEqual({row["kind"]: row for row in data(self.client.get("/api/platform/services/"))}["whatsapp"]["state"], "testing")

        draft.is_active, draft.status = True, "active"
        draft.save()
        set_features(self, whatsapp_messages=True)
        reset_platform_caches(self)
        whatsapp = {row["kind"]: row for row in data(self.client.get("/api/platform/services/"))}["whatsapp"]
        self.assertEqual(whatsapp["state"], "active")
        self.assertEqual([item["key"] for item in whatsapp["hides_when_off"]], ["whatsapp_messages"])

        url = f"/api/platform/integrations/{draft.id}/deactivate/"
        self.assertEqual([item["key"] for item in data(self.client.get(url))["hidden_features"]], ["whatsapp_messages"])
        off = self.client.post(url)
        self.assertEqual(off.status_code, 200, off.content)
        self.assertEqual([item["key"] for item in data(off)["hidden_features"]], ["whatsapp_messages"])
        entry = AuditLog.objects.get(action_type="integration_deactivated")
        self.assertEqual((entry.before_state["active"], entry.after_state["active"]), (True, False))
        self.assertEqual(entry.metadata["features_hidden"], ["whatsapp_messages"])

    def test_services_are_admin_only(self):
        self.client.force_authenticate(self.person("u9-officer@example.com", RoleType.INNOVATION_OFFICER))
        self.assertEqual(self.client.get("/api/platform/services/").status_code, 403)


class NeedsSetupTests(U9Base):
    def test_feature_reports_needs_setup_and_public_config_hides_it(self):
        FeatureFlag.objects.filter(key="staff_sso").update(enabled=True, is_public=True)
        reset_platform_caches(self)
        flags = {row["key"]: row for row in data(self.client.get("/api/platform/features/"))}
        self.assertTrue(flags["staff_sso"]["needs_setup"])
        self.assertEqual(flags["staff_sso"]["service"]["kind"], "sso")
        self.assertFalse(flags["public_search"]["needs_setup"])
        self.assertIsNone(flags["public_search"]["service"])
        self.assertFalse(data(APIClient().get("/api/platform/public-config/"))["features"]["staff_sso"])

        IntegrationConnection.objects.create(kind="sso", provider="generic_oidc", name="CEDA", is_active=True, status="active")
        reset_platform_caches(self)
        flags = {row["key"]: row for row in data(self.client.get("/api/platform/features/"))}
        self.assertFalse(flags["staff_sso"]["needs_setup"])
        self.assertEqual(flags["staff_sso"]["service"]["state"], "active")
        self.assertTrue(data(APIClient().get("/api/platform/public-config/"))["features"]["staff_sso"])


class LiveChatBubbleTests(U9Base):
    def test_public_status_has_hours_and_messages_only(self):
        self.client.put("/api/live-chat/settings/", {"enabled": True, "saved_replies": [{"title": "Hi", "body": {"en": "Hello", "tn": ""}}]}, format="json")
        status = data(APIClient().get("/api/help-chat/status/?lang=en"))
        self.assertEqual(set(status["hours"]), {"mon", "tue", "wed", "thu", "fri", "sat", "sun"})
        self.assertTrue(status["welcome"])
        self.assertIn("timezone", status)
        self.assertNotIn("saved_replies", status)
        self.assertNotIn("answerers", status)
        entry = AuditLog.objects.filter(action_type="live_chat_settings_updated").latest("created_at")
        self.assertEqual((entry.before_state["enabled"], entry.after_state["enabled"]), (False, True))


class AuditLogTests(U9Base):
    def test_setting_change_shows_before_and_after_with_filters_and_csv(self):
        officer = self.person("u9-reader@example.com", RoleType.INNOVATION_OFFICER)
        AuditService.log_raw_action(actor=officer, action_type="submission_status_changed", target_model="Submission", target_id="s1", label="CEDA-2026-0142")
        self.client.patch("/api/platform/features/public_search/", {"enabled": False}, format="json", REMOTE_ADDR="102.65.4.9", HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) Chrome/120.0")

        rows = data_rows = self.client.get("/api/audit/logs/", {"area": "settings"}).json()["results"]
        self.assertEqual(len(rows), 1)
        row = data_rows[0]
        self.assertEqual((row["action_label"], row["area"], row["area_label"]), ("Changed a setting", "settings", "Platform settings"))
        self.assertEqual(row["changes"], [{"field": "Enabled", "before": "On", "after": "Off"}])
        self.assertEqual((row["ip_address"], row["device"]), ("102.65.x.x", "Chrome on Windows"))
        self.assertEqual(row["actor_name"], "Lorato Sebina")

        self.assertEqual(self.client.get("/api/audit/logs/", {"actor": str(officer.id)}).json()["count"], 1)
        self.assertEqual(self.client.get("/api/audit/logs/", {"search": "0142"}).json()["count"], 1)
        self.assertEqual(self.client.get("/api/audit/logs/", {"days": 7, "area": "ideas"}).json()["count"], 1)
        self.assertEqual(self.client.get("/api/audit/logs/", {"date_to": "2020-01-01"}).json()["count"], 0)
        self.assertEqual(self.client.get("/api/audit/logs/", {"area": "space"}).status_code, 400)
        self.assertEqual(self.client.get("/api/audit/logs/", {"actor": "nobody"}).status_code, 400)

        export = self.client.get("/api/audit/logs/export/", {"area": "settings"})
        self.assertEqual(export.status_code, 200)
        self.assertIn("text/csv", export["Content-Type"])
        lines = list(csv.reader(io.StringIO(export.content.decode())))
        self.assertEqual(lines[0][:4], ["When", "Who", "Email", "Action"])
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1][3], "Changed a setting")
        self.assertIn("Enabled: On -> Off", lines[1][6])

    def test_read_only_scrubbed_and_formula_safe(self):
        AuditService.log_raw_action(
            actor=self.admin, action_type="integration_updated", target_model="IntegrationConnection", target_id="=x",
            before_state={"api_key": "abc123", "client_secret": "s", "via_token": True, "keys": {"api_key": "set"}}, label="=HYPERLINK(1)",
        )
        entry = AuditLog.objects.get(target_id="=x")
        self.assertEqual(entry.before_state, {"api_key": HIDDEN, "client_secret": HIDDEN, "via_token": True, "keys": {"api_key": "set"}})
        self.assertEqual(mask_ip("10.1.2.3"), "10.1.x.x")
        lines = list(csv.reader(io.StringIO(self.client.get("/api/audit/logs/export/").content.decode())))
        self.assertEqual(lines[1][11], "'=x")  # Item id column: no spreadsheet formulas
        for method in ("post", "put", "patch", "delete"):
            self.assertEqual(getattr(self.client, method)("/api/audit/logs/").status_code, 405)

    def test_audit_needs_the_capability(self):
        self.client.force_authenticate(self.person("u9-judge@example.com", RoleType.JUDGE))
        self.assertEqual(self.client.get("/api/audit/logs/").status_code, 403)
        self.assertEqual(self.client.get("/api/audit/logs/export/").status_code, 403)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserAdminTests(U9Base):
    def test_invite_deactivate_reactivate(self):
        with self.captureOnCommitCallbacks(execute=True):
            invited = self.client.post("/api/auth/users/invite/", {"full_name": "Mpho Dintwe", "email": "Mpho.D@ceda.co.bw", "roles": ["innovation_officer"]}, format="json")
        self.assertEqual(invited.status_code, 201, invited.content)
        person = data(invited)
        self.assertEqual((person["status"], person["email"], person["first_name"], person["last_name"]), ("invited", "mpho.d@ceda.co.bw", "Mpho", "Dintwe"))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(AuditLog.objects.get(action_type="user_invited").after_state["roles"], ["innovation_officer"])
        self.assertEqual(self.client.post("/api/auth/users/invite/", {"full_name": "X", "email": "mpho.d@ceda.co.bw", "roles": ["judge"]}, format="json").status_code, 400)
        self.assertEqual(self.client.get("/api/auth/users/", {"status": "invited"}).json()["count"], 1)

        user_id = person["id"]
        off = self.client.post(f"/api/auth/users/{user_id}/deactivate/", {"reason": "Left CEDA"}, format="json")
        self.assertEqual(data(off)["status"], "deactivated")
        entry = AuditLog.objects.get(action_type="user_deactivated")
        self.assertEqual((entry.before_state["status"], entry.after_state["status"]), ("invited", "deactivated"))
        self.assertEqual(data(self.client.post(f"/api/auth/users/{user_id}/reactivate/"))["status"], "invited")
        self.assertTrue(User.objects.filter(id=user_id).exists())  # never deleted

    def test_deactivate_guards_and_permission(self):
        self.assertEqual(self.client.post(f"/api/auth/users/{self.admin.id}/deactivate/", {}, format="json").status_code, 400)
        other = self.person("u9-officer2@example.com", RoleType.INNOVATION_OFFICER)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(f"/api/auth/users/{self.admin.id}/deactivate/", {}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/auth/users/invite/", {"full_name": "A B", "email": "a@b.bw", "roles": ["judge"]}, format="json").status_code, 403)

    def test_last_admin_cannot_be_deactivated(self):
        # Only reachable by a superuser without the administrator role: any other caller is an administrator too.
        root = User.objects.create_superuser(email="u9-root@example.com", password="StrongPass123")
        self.client.force_authenticate(root)
        response = self.client.post(f"/api/auth/users/{self.admin.id}/deactivate/", {}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("last active administrator", response.content.decode())

    def test_role_change_records_before_and_after(self):
        officer = self.person("u9-officer3@example.com", RoleType.INNOVATION_OFFICER)
        self.client.patch(f"/api/auth/users/{officer.id}/role/", {"roles": ["innovation_officer", "judge"]}, format="json")
        entry = AuditLog.objects.filter(action_type="user_role_updated", target_id=str(officer.id)).latest("created_at")
        self.assertEqual((entry.before_state["roles"], entry.after_state["roles"]), (["innovation_officer"], ["innovation_officer", "judge"]))


class ApprovalCompareTests(U9Base):
    def setUp(self):
        super().setUp()
        from apps.content.services import PageService

        self.officer = self.person("u9-editor@example.com", RoleType.INNOVATION_MANAGER, "Lesego", "Moremi")
        self.manager = self.person("u9-approver@example.com", RoleType.INNOVATION_MANAGER, "Tebogo", "Mmusi")
        page = PageService.home()
        sections = PageService.draft_sections(page)
        PageService.publish(page, PageService.validate_sections(sections), actor=self.admin)
        sections[0]["settings"]["headline"] = {"en": "Plant the seed. CEDA helps it grow.", "tn": "Jala peo."}
        PageService.save_draft(page, sections, actor=self.officer)
        self.approval = PageService.submit(page, actor=self.officer)

    def test_live_and_proposed_side_by_side(self):
        self.client.force_authenticate(self.manager)
        detail = data(self.client.get(f"/api/content/approvals/{self.approval.id}/"))
        compare = detail["compare"]
        self.assertEqual(compare["change_type"], "edit")
        self.assertEqual(compare["changed_groups"], ["Banner"])
        headline = [row for row in compare["fields"] if row["changed"]]
        self.assertEqual(len(headline), 1)
        self.assertEqual((headline[0]["group"], headline[0]["label"]), ("Banner", "Headline"))
        self.assertEqual(headline[0]["proposed"], {"en": "Plant the seed. CEDA helps it grow.", "tn": "Jala peo."})
        self.assertNotEqual(headline[0]["live"], headline[0]["proposed"])
        listed = {row["id"]: row for row in data(self.client.get("/api/content/approvals/"))}
        self.assertEqual(listed[str(self.approval.id)]["change_type"], "edit")

    def test_nobody_approves_their_own_change_and_send_back_needs_a_comment(self):
        self.client.force_authenticate(self.officer)
        detail = data(self.client.get(f"/api/content/approvals/{self.approval.id}/"))
        self.assertEqual((detail["own_change"], detail["can_approve"]), (True, False))
        refused = self.client.post(f"/api/content/approvals/{self.approval.id}/approve/", {}, format="json")
        self.assertEqual(refused.status_code, 403)
        self.assertIn("own change", refused.content.decode())

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f"/api/content/approvals/{self.approval.id}/reject/", {"comment": ""}, format="json").status_code, 400)
        approved = self.client.post(f"/api/content/approvals/{self.approval.id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.content)
        self.assertEqual(data(approved)["status"], "approved")

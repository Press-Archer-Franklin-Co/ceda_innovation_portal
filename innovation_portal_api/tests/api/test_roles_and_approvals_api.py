"""S2: roles and the capability matrix in the database, locks, and the website approval flow."""

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, RoleCapability, User
from apps.accounts.services import RoleService
from apps.communications.models import Notification
from apps.content.models import ApprovalRequest, ContentItem
from apps.core.capabilities import CAPABILITIES, capabilities_for, role_map, user_has
from apps.core.constants import RoleType


def data(response):
    return response.json()["data"]


class S2TestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.admin = self.make("s2-admin@example.com", RoleType.ADMINISTRATOR)
        self.officer = self.make("s2-officer@example.com", RoleType.INNOVATION_OFFICER)
        self.manager = self.make("s2-manager@example.com", RoleType.INNOVATION_MANAGER)
        self.judge = self.make("s2-judge@example.com", RoleType.JUDGE)
        self.innovator = self.make("s2-innovator@example.com", RoleType.INNOVATOR)

    def make(self, email, *roles):
        user = User.objects.create_user(email=email, password="StrongPass123", first_name=email.split("@")[0], last_name="S2")
        RoleService.assign_roles(user, list(roles))
        return user

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def role(self, code):
        return Role.objects.get(code=code)

    def new_role(self, name="Setswana reviewer"):
        self.as_admin()
        response = self.client.post("/api/admin/roles/", {"name": {"en": name, "tn": "Mosekaseki wa Setswana"}}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return Role.objects.get(id=data(response)["id"])


class DefaultMapTests(S2TestCase):
    def test_the_database_map_starts_equal_to_the_day_one_map(self):
        current = role_map()
        for capability, roles in CAPABILITIES.items():
            self.assertEqual(current[capability], set(roles), capability)
        self.assertEqual(set(current), set(CAPABILITIES))

    def test_built_in_roles_are_system_roles(self):
        self.assertTrue(all(Role.objects.get(code=code).is_system for code in RoleType.values))


class MatrixTests(S2TestCase):
    def test_adding_a_capability_lets_the_role_in_and_removing_refuses(self):
        self.client.force_authenticate(self.judge)
        self.assertEqual(self.client.get("/api/content/pages/home/draft/").status_code, 403)
        self.as_admin()
        judge_role = self.role(RoleType.JUDGE)
        held = list(judge_role.capabilities.values_list("capability", flat=True))
        response = self.client.put(f"/api/admin/roles/{judge_role.id}/capabilities/", {"capabilities": held + ["content.edit"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.client.force_authenticate(self.judge)
        self.assertEqual(self.client.get("/api/content/pages/home/draft/").status_code, 200)
        self.assertIn("content.edit", self.client.get("/api/auth/me/").json()["data"]["capabilities"])

        officer_role = self.role(RoleType.INNOVATION_OFFICER)
        remaining = [key for key in officer_role.capabilities.values_list("capability", flat=True) if key != "forms.manage"]
        self.as_admin()
        self.client.put(f"/api/admin/roles/{officer_role.id}/capabilities/", {"capabilities": remaining}, format="json")
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.get("/api/forms/").status_code, 403)

    def test_cache_is_cleared_on_save(self):
        self.assertFalse(user_has(self.judge, "content.edit"))
        RoleCapability.objects.create(role=self.role(RoleType.JUDGE), capability="content.edit")
        self.assertTrue(user_has(self.judge, "content.edit"))

    def test_locks(self):
        self.as_admin()
        manager_role = self.role(RoleType.INNOVATION_MANAGER)
        admin_role = self.role(RoleType.ADMINISTRATOR)
        innovator_role = self.role(RoleType.INNOVATOR)
        held = list(manager_role.capabilities.values_list("capability", flat=True))
        refused = self.client.put(f"/api/admin/roles/{manager_role.id}/capabilities/", {"capabilities": held + ["settings.manage"]}, format="json")
        self.assertEqual(refused.status_code, 400)
        admin_held = [key for key in admin_role.capabilities.values_list("capability", flat=True) if key != "users.manage"]
        self.assertEqual(self.client.put(f"/api/admin/roles/{admin_role.id}/capabilities/", {"capabilities": admin_held}, format="json").status_code, 400)
        self.assertEqual(self.client.put(f"/api/admin/roles/{innovator_role.id}/capabilities/", {"capabilities": ["entries.review"]}, format="json").status_code, 400)
        matrix = data(self.client.get(f"/api/admin/roles/{admin_role.id}/capabilities/"))
        locked = {item["key"]: item for item in matrix["capabilities"] if item["locked"]}
        self.assertEqual(locked["users.manage"]["lock_reason"], "Administrators always keep this.")

    def test_last_administrator_and_own_role_are_protected(self):
        self.as_admin()
        own = self.client.patch(f"/api/auth/users/{self.admin.id}/role/", {"roles": [RoleType.INNOVATION_OFFICER]}, format="json")
        self.assertEqual(own.status_code, 400)
        second = self.make("s2-admin2@example.com", RoleType.ADMINISTRATOR)
        self.client.force_authenticate(second)
        self.assertEqual(self.client.patch(f"/api/auth/users/{self.admin.id}/role/", {"roles": [RoleType.INNOVATION_OFFICER]}, format="json").status_code, 200)
        self.client.force_authenticate(self.admin)
        # The first admin is no longer an admin; the second is now the last one.
        self.client.force_authenticate(second)
        self.assertEqual(self.client.patch(f"/api/auth/users/{second.id}/role/", {"roles": [RoleType.INNOVATION_OFFICER]}, format="json").status_code, 400)

    def test_settings_manage_only(self):
        for user in (self.officer, self.manager, self.innovator):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/admin/roles/").status_code, 403)
            self.assertEqual(self.client.get("/api/admin/approval-flows/content/").status_code, 403)


class CustomRoleTests(S2TestCase):
    def test_create_give_to_a_person_retire_and_delete(self):
        role = self.new_role()
        self.assertFalse(role.is_system)
        self.assertEqual(role.translations["tn"]["name"], "Mosekaseki wa Setswana")
        person = self.make("s2-reviewer@example.com", RoleType.INNOVATOR)
        response = self.client.patch(f"/api/auth/users/{person.id}/role/", {"roles": [role.code]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        listed = {item["code"]: item for item in data(self.client.get("/api/admin/roles/"))}
        self.assertEqual(listed[role.code]["people_count"], 1)
        self.assertEqual(data(self.client.delete(f"/api/admin/roles/{role.id}/"))["result"], "retired")
        role.refresh_from_db()
        self.assertFalse(role.is_active)
        unused = self.new_role("Board member")
        self.assertEqual(data(self.client.delete(f"/api/admin/roles/{unused.id}/"))["result"], "deleted")
        system = self.role(RoleType.JUDGE)
        self.assertEqual(self.client.delete(f"/api/admin/roles/{system.id}/").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/admin/roles/{system.id}/", {"name": "Marker"}, format="json").status_code, 400)

    def test_translation_review_goes_to_a_custom_role(self):
        role = self.new_role()
        reviewer = self.make("s2-tn@example.com")
        RoleService.set_roles(user=reviewer, role_codes=[role.code], actor=self.admin)
        self.client.force_authenticate(self.officer)
        form = self.client.post("/api/forms/", {"start": "scratch", "name": "Translations"}, format="json").json()["data"]
        response = self.client.post(f"/api/forms/{form['id']}/translations/request-review/", {"role": role.code}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(data(response)["notified"], 1)
        self.assertTrue(Notification.objects.filter(recipient=reviewer, notification_type="form_translation_review").exists())

    def test_workflow_steps_take_a_custom_role(self):
        from apps.workflow.models import WorkflowStep

        role = self.new_role("Board member")
        field = WorkflowStep._meta.get_field("role_required")
        self.assertFalse(field.choices)
        field.clean(role.code, None)


class ApprovalFlowTests(S2TestCase):
    def setUp(self):
        super().setUp()
        self.tn_role = self.new_role()
        self.tn_reviewer = self.make("s2-tn-reviewer@example.com")
        RoleService.set_roles(user=self.tn_reviewer, role_codes=[self.tn_role.code], actor=self.admin)
        self.both = self.make("s2-both@example.com", RoleType.INNOVATION_MANAGER)
        RoleService.set_roles(user=self.both, role_codes=[RoleType.INNOVATION_MANAGER, self.tn_role.code], actor=self.admin)

    def set_flow(self, steps, own_work=True):
        self.as_admin()
        response = self.client.put("/api/admin/approval-flows/content/", {"approvers_can_approve_own_work": own_work, "steps": steps}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)

    def language_flow(self, own_work=True):
        return self.set_flow(
            [
                {"name": "English", "approver": {"role": RoleType.INNOVATION_MANAGER}, "approvals_needed": 1, "language": "en"},
                {"name": "Setswana", "approver": {"role": self.tn_role.code}, "approvals_needed": 1, "language": "tn"},
            ],
            own_work=own_work,
        )

    def post(self, author, *, tn=False):
        self.client.force_authenticate(author)
        title = {"en": "Pitch day", "tn": "Letsatsi la go tlhalosa"} if tn else {"en": "Pitch day"}
        created = self.client.post("/api/content/posts/", {"title": title, "excerpt": "Come"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        post_id = data(created)["id"]
        submitted = self.client.post(f"/api/content/posts/{post_id}/submit/", {}, format="json")
        self.assertEqual(submitted.status_code, 201, submitted.content)
        return post_id, ApprovalRequest.objects.get(id=data(submitted)["id"])

    def approve(self, user, approval, expected=200):
        self.client.force_authenticate(user)
        response = self.client.post(f"/api/content/approvals/{approval.id}/approve/", {}, format="json")
        self.assertEqual(response.status_code, expected, response.content)
        return response

    def status(self, post_id):
        return ContentItem.objects.get(id=post_id).status

    def test_default_flow_is_one_manager_approval(self):
        self.as_admin()
        flow = data(self.client.get("/api/admin/approval-flows/content/"))
        self.assertEqual(flow["steps"][0]["approver"], {"capability": "content.approve"})
        post_id, approval = self.post(self.officer)
        self.approve(self.officer, approval, expected=403)
        self.approve(self.manager, approval)
        self.assertEqual(self.status(post_id), "published")

    def test_two_steps_in_order(self):
        comms = self.new_role("Comms officer")
        comms_person = self.make("s2-comms@example.com")
        RoleService.set_roles(user=comms_person, role_codes=[comms.code], actor=self.admin)
        self.set_flow(
            [
                {"name": "Comms check", "approver": {"role": comms.code}, "approvals_needed": 1, "language": "all"},
                {"name": "Manager", "approver": {"capability": "content.approve"}, "approvals_needed": 1, "language": "all"},
            ]
        )
        post_id, approval = self.post(self.officer)
        self.approve(comms_person, approval)
        self.assertEqual(self.status(post_id), "pending_approval")
        self.approve(self.manager, approval)
        self.assertEqual(self.status(post_id), "published")

    def test_a_change_without_setswana_skips_the_setswana_step(self):
        self.language_flow()
        post_id, approval = self.post(self.officer)
        self.assertEqual(approval.languages, ["en"])
        self.assertEqual(len(approval.step_ids), 1)
        self.approve(self.tn_reviewer, approval, expected=403)
        self.approve(self.manager, approval)
        self.assertEqual(self.status(post_id), "published")

    def test_plain_editor_waits_for_both_in_either_order(self):
        self.language_flow()
        post_id, approval = self.post(self.officer, tn=True)
        self.assertEqual(approval.languages, ["en", "tn"])
        self.client.force_authenticate(self.tn_reviewer)
        listed = {item["id"]: item for item in data(self.client.get("/api/content/approvals/?status=pending"))}
        self.assertTrue(listed[str(approval.id)]["can_approve"])
        self.client.force_authenticate(self.officer)
        listed = {item["id"]: item for item in data(self.client.get("/api/content/approvals/?status=pending"))}
        self.assertFalse(listed[str(approval.id)]["can_approve"])
        self.approve(self.tn_reviewer, approval)
        self.assertEqual(self.status(post_id), "pending_approval")
        self.approve(self.manager, approval)
        self.assertEqual(self.status(post_id), "published")
        notified = set(Notification.objects.filter(notification_type="content_approval").values_list("recipient_id", flat=True))
        self.assertIn(self.manager.id, notified)
        self.assertIn(self.tn_reviewer.id, notified)
        self.assertNotIn(self.officer.id, notified)

    def test_manager_and_setswana_reviewer_publishes_alone_when_own_work_is_on(self):
        self.language_flow(own_work=True)
        post_id, approval = self.post(self.both, tn=True)
        self.client.force_authenticate(self.both)
        listed = {item["id"]: item for item in data(self.client.get("/api/content/approvals/?status=pending"))}
        self.assertTrue(listed[str(approval.id)]["can_approve"])
        self.approve(self.both, approval)
        self.assertEqual(self.status(post_id), "published")
        self.assertTrue(approval.decisions.filter(own_work=True).exists())

    def test_own_work_off_means_someone_else_approves(self):
        self.language_flow(own_work=False)
        post_id, approval = self.post(self.both, tn=True)
        self.approve(self.both, approval, expected=403)
        self.approve(self.manager, approval)
        self.approve(self.tn_reviewer, approval)
        self.assertEqual(self.status(post_id), "published")

    def test_send_back_from_any_step_and_flow_checks(self):
        self.language_flow()
        post_id, approval = self.post(self.officer, tn=True)
        self.client.force_authenticate(self.tn_reviewer)
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/reject/", {"comment": "Fix the Setswana"}, format="json").status_code, 200)
        self.assertEqual(self.status(post_id), "draft")
        self.as_admin()
        self.assertEqual(self.client.put("/api/admin/approval-flows/content/", {"steps": [{"approver": {"role": self.tn_role.code}, "language": "tn"}]}, format="json").status_code, 400)
        self.assertEqual(self.client.put("/api/admin/approval-flows/content/", {"steps": [{"approver": {"capability": "nope.nope"}}]}, format="json").status_code, 400)

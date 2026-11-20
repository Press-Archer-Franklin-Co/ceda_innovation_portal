"""R-29 (monthly views, send on going live, changes to live posts wait for approval), R-32 (review roles), R-27 (CORS)."""

from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.accounts.services import RoleService
from apps.content.models import ApprovalRequest, ContentItem, PostBlast, PostMonthlyViews, Subscriber
from apps.content.services import PostService, publish_due_content
from apps.core.constants import RoleType


def data(response):
    return response.json()["data"]


class ContentTestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="c21-officer@example.com", password="StrongPass123", first_name="Kago", last_name="T")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="c21-manager@example.com", password="StrongPass123", first_name="Mpho", last_name="M")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])

    def live_post(self, **extra):
        return ContentItem.objects.create(title="Pitch day", excerpt="Come along", status="published", published_at=timezone.now(), **extra)

    def approve_latest(self):
        approval = ApprovalRequest.objects.filter(status="pending").latest("created_at")
        self.client.force_authenticate(self.manager)
        response = self.client.post(f"/api/content/approvals/{approval.id}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return approval


class MonthlyViewTests(ContentTestCase):
    def test_views_this_month_and_last_month(self):
        post = self.live_post()
        PostService.count_view(post)
        PostService.count_view(post)
        last_month = (timezone.localdate().replace(day=1) - timedelta(days=1)).replace(day=1)
        PostMonthlyViews.objects.create(post=post, month=last_month, count=5)
        self.client.force_authenticate(self.officer)
        counts = data(self.client.get("/api/content/posts/"))["counts"]
        self.assertEqual((counts["views_this_month"], counts["views_last_month"]), (2, 5))
        post.refresh_from_db()
        self.assertEqual(post.view_count, 2)


class SendToSubscribersTests(ContentTestCase):
    def setUp(self):
        super().setUp()
        Subscriber.objects.create(email="reader@example.com", confirmed_at=timezone.now())

    def test_sent_once_when_approved(self):
        self.client.force_authenticate(self.officer)
        created = data(self.client.post("/api/content/posts/", {"title": "News", "excerpt": "x", "send_to_subscribers": True}, format="json"))
        self.assertTrue(created["send_to_subscribers"])
        self.client.post(f"/api/content/posts/{created['id']}/submit/", {}, format="json")
        with self.captureOnCommitCallbacks(execute=True):
            self.approve_latest()
        post = ContentItem.objects.get(id=created["id"])
        self.assertEqual(post.status, "published")
        self.assertEqual(PostBlast.objects.filter(post=post).count(), 1)
        PostService.went_live(post)
        self.assertEqual(PostBlast.objects.filter(post=post).count(), 1)

    def test_sent_when_a_scheduled_post_goes_live(self):
        post = ContentItem.objects.create(title="Later", excerpt="x", status="scheduled", publish_at=timezone.now() - timedelta(minutes=1), send_to_subscribers=True)
        with self.captureOnCommitCallbacks(execute=True):
            publish_due_content()
        self.assertEqual(PostBlast.objects.filter(post=post).count(), 1)

    def test_not_sent_without_the_flag(self):
        self.client.force_authenticate(self.officer)
        created = data(self.client.post("/api/content/posts/", {"title": "Quiet", "excerpt": "x"}, format="json"))
        self.client.post(f"/api/content/posts/{created['id']}/submit/", {}, format="json")
        self.approve_latest()
        self.assertFalse(PostBlast.objects.exists())


class LivePostChangeTests(ContentTestCase):
    def test_a_change_to_a_live_post_waits_for_approval(self):
        post = self.live_post()
        self.client.force_authenticate(self.officer)
        response = self.client.patch(f"/api/content/posts/{post.id}/", {"title": {"en": "Pitch day, new date", "tn": "Letsatsi le lesha"}}, format="json")
        self.assertEqual(response.status_code, 202, response.content)
        body = data(response)
        self.assertEqual(body["title"]["en"], "Pitch day")
        self.assertEqual(body["pending_change"]["changes"]["title"]["en"], "Pitch day, new date")
        post.refresh_from_db()
        self.assertEqual((post.title, post.status), ("Pitch day", "published"))
        approval = ApprovalRequest.objects.get(status="pending")
        self.assertEqual(approval.languages, ["en", "tn"])
        self.client.force_authenticate(self.manager)
        listed = {item["id"]: item for item in data(self.client.get("/api/content/approvals/?status=pending"))}
        self.assertEqual(listed[str(approval.id)]["kind"], "edit")
        self.approve_latest()
        post.refresh_from_db()
        self.assertEqual((post.title, post.status), ("Pitch day, new date", "published"))
        self.assertEqual(post.translations["tn"]["title"], "Letsatsi le lesha")

    def test_sending_a_change_back_keeps_the_live_post(self):
        post = self.live_post()
        self.client.force_authenticate(self.officer)
        self.client.patch(f"/api/content/posts/{post.id}/", {"excerpt": "Changed"}, format="json")
        approval = ApprovalRequest.objects.get(status="pending")
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/reject/", {"comment": "Not yet"}, format="json").status_code, 200)
        post.refresh_from_db()
        self.assertEqual((post.excerpt, post.status), ("Come along", "published"))

    def test_bad_changes_are_refused_before_approval(self):
        post = self.live_post(type="event", event_starts_at=timezone.now() + timedelta(days=2), event_place="Maun")
        self.client.force_authenticate(self.officer)
        response = self.client.patch(f"/api/content/posts/{post.id}/", {"title": {"en": ""}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(ApprovalRequest.objects.exists())

    def test_drafts_still_save_straight_away(self):
        post = ContentItem.objects.create(title="Draft", excerpt="x")
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.patch(f"/api/content/posts/{post.id}/", {"excerpt": "y"}, format="json").status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.excerpt, "y")


class ReviewRolesAndCorsTests(ContentTestCase):
    def test_form_editors_see_custom_review_roles(self):
        Role.objects.create(code="setswana_reviewer", name="Setswana reviewer", translations={"tn": {"name": "Mosekaseki"}})
        Role.objects.create(code="old_role", name="Old", is_active=False)
        self.client.force_authenticate(self.officer)
        roles = {item["code"]: item for item in data(self.client.get("/api/forms/review-roles/"))}
        self.assertEqual(roles["setswana_reviewer"]["name"], {"en": "Setswana reviewer", "tn": "Mosekaseki"})
        self.assertNotIn("old_role", roles)
        self.assertNotIn(RoleType.INNOVATOR, roles)
        innovator = User.objects.create_user(email="c21-innovator@example.com", password="StrongPass123")
        RoleService.assign_roles(innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(innovator)
        self.assertEqual(self.client.get("/api/forms/review-roles/").status_code, 403)

    def test_cors_allows_the_client_header(self):
        self.assertIn("x-ceda-client", settings.CORS_ALLOW_HEADERS)
        self.assertIn("authorization", settings.CORS_ALLOW_HEADERS)

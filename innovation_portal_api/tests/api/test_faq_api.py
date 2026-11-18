from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import RoleType
from apps.support.models import FAQ


class FAQApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(
            email="faq.officer@example.com",
            password="StrongPass123",
            first_name="FAQ",
            last_name="Officer",
        )
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])

    def test_public_list_filters_inactive_and_orders(self):
        FAQ.objects.create(question="B", answer="B answer", ordering=2, is_public=True)
        FAQ.objects.create(question="A", answer="A answer", ordering=1, is_public=True)
        FAQ.objects.create(question="Hidden", answer="No", ordering=0, is_public=False)

        response = self.client.get("/api/support/faqs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["question"], "A")
        self.assertEqual(response.data[1]["question"], "B")

    def test_admin_crud_and_reorder(self):
        self.client.force_authenticate(self.officer)

        create = self.client.post(
            "/api/support/admin/faqs/",
            {"question": "What is CEDA?", "answer": "Bank of Botswana", "ordering": 1, "is_public": True},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        faq_id = create.data["id"]

        update = self.client.patch(
            f"/api/support/admin/faqs/{faq_id}/",
            {"answer": "Updated answer", "ordering": 3},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data["answer"], "Updated answer")
        self.assertEqual(update.data["ordering"], 3)

        second = FAQ.objects.create(question="Second", answer="Second answer", ordering=2, is_public=True)
        reorder = self.client.post(
            "/api/support/admin/faqs/reorder/",
            [{"id": faq_id, "ordering": 2}, {"id": str(second.id), "ordering": 1}],
            format="json",
        )
        self.assertEqual(reorder.status_code, 200)
        self.assertEqual(reorder.data[0]["id"], str(second.id))
        self.assertEqual(reorder.data[1]["id"], faq_id)

        delete = self.client.delete(f"/api/support/admin/faqs/{faq_id}/")
        self.assertEqual(delete.status_code, 204)

    def test_admin_requires_permission(self):
        response = self.client.post(
            "/api/support/admin/faqs/",
            {"question": "Q", "answer": "A"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_validation_requires_question_and_answer(self):
        self.client.force_authenticate(self.officer)
        response = self.client.post("/api/support/admin/faqs/", {"question": ""}, format="json")
        self.assertEqual(response.status_code, 400)

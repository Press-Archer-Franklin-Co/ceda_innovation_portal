"""R-55: the review queue (3.3) gives due_at, program and stage_code, and the chip counts."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.workflow.models import TaskExecution
from tests.api import test_claimable_task_partial_fill_api as queue


class ReviewQueueFieldsTests(TestCase):
    """The partial-fill set-up: a three-officer step in a hackathon programme."""

    setUpTestData = classmethod(queue.PartialFillClaimableTaskTests.setUpTestData.__func__)
    _make_test_submission = queue.PartialFillClaimableTaskTests._make_test_submission

    def get(self, path):
        client = APIClient()
        client.force_authenticate(self.officer_c)
        response = client.get(path)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["data"]

    def test_fields_and_counts(self):
        now = timezone.now()
        late = self._make_test_submission("late")
        late.workflow_instance.due_at = now - timedelta(days=1)
        late.workflow_instance.save(update_fields=["due_at"])
        TaskExecution.objects.create(workflow_instance=late.workflow_instance, workflow_step=self.step, assignee=self.officer_c)
        mine = queue._claim(late, self.step, self.officer_c, self.officer_a)
        mine.deadline = now + timedelta(days=2)
        mine.save(update_fields=["deadline"])
        other = self._make_test_submission("other")
        other.workflow_instance.due_at = now + timedelta(days=5)
        other.workflow_instance.save(update_fields=["due_at"])

        rows = {row["id"]: row for row in self.get("/api/reviewer-queue/?role=innovation_officer")}
        self.assertEqual(rows[str(late.id)]["due_at"], mine.deadline.isoformat())  # your own deadline first
        self.assertEqual(rows[str(other.id)]["due_at"], other.workflow_instance.due_at.isoformat())
        self.assertEqual(rows[str(other.id)]["program"], {"id": str(self.program.id), "title": "Claim Test Program"})
        self.assertEqual(rows[str(other.id)]["stage_code"], self.step.code)

        counts = self.get("/api/reviewer-queue/counts/?role=innovation_officer")
        self.assertEqual(counts, {"all": 2, "mine": 1, "overdue": 1})
        # The queue itself is unchanged afterwards.
        self.assertEqual(len(self.get("/api/reviewer-queue/?role=innovation_officer")), 2)

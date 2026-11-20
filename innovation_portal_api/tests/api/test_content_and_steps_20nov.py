"""R-28: home page defaults are made once; R-30: advance_automatically is saved through the step API."""

import importlib
from datetime import timedelta

from django.apps import apps as django_apps
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import Page, PageSection
from apps.content.services import PageService
from apps.core.constants import ProgramTypeCode, RoleType
from apps.programs.models import Program, ProgramType
from apps.workflow.models import WorkflowStep
from apps.workflow.services import WorkflowDefinitionService


class HomeDefaultsRaceTests(TestCase):
    """Two first requests at the same time must not both make the default sections.

    No threads here (a TransactionTestCase would empty the seeded tables for later tests).
    Instead: another request makes the defaults between this request's first check and its
    lock, and home() must see them after the lock and make nothing.
    """

    def test_the_check_after_the_lock_stops_a_second_set(self):
        from unittest.mock import patch

        page = Page.objects.create(slug="home", title="Home")
        real_select_for_update = Page.objects.select_for_update

        def other_request_wins(*args, **kwargs):
            # The other request made the defaults while this one waited for the lock.
            if not PageSection.objects.filter(page=page).exists():
                for order, section_type in enumerate(["hero_banner", "news_flash"]):
                    PageSection.objects.create(page=page, type=section_type, order=order, settings={})
            return real_select_for_update(*args, **kwargs)

        with patch.object(Page.objects, "select_for_update", side_effect=other_request_wins):
            PageService.home()
        self.assertEqual(PageSection.objects.filter(page=page, type="hero_banner").count(), 1)
        self.assertEqual(PageSection.objects.filter(page=page).count(), 2)

    def test_first_open_makes_the_defaults_once(self):
        PageService.home()
        PageService.home()
        page = Page.objects.get(slug="home")
        self.assertEqual(page.sections.filter(type="hero_banner").count(), 1)
        self.assertEqual(page.sections.count(), len(set(page.sections.values_list("type", flat=True))))


class DuplicateCleanUpTests(TestCase):
    def test_clean_up_keeps_the_oldest_of_each_default_and_later_additions(self):
        page = PageService.home()
        first_ids = set(page.sections.values_list("id", flat=True))
        types = list(page.sections.order_by("order").values_list("type", flat=True))
        for order, section_type in enumerate(types):  # the racing second batch
            PageSection.objects.create(page=page, type=section_type, order=order, settings={})
        later = PageSection.objects.create(page=page, type="cta_band", order=99, settings={})
        PageSection.objects.filter(pk=later.pk).update(created_at=timezone.now() + timedelta(hours=1))
        migration = importlib.import_module("apps.content.migrations.0014_remove_duplicate_home_sections")
        migration.remove_duplicates(django_apps, None)
        remaining = set(page.sections.values_list("id", flat=True))
        self.assertEqual(remaining, first_ids | {later.id})
        self.assertEqual(page.sections.filter(type="hero_banner").count(), 1)
        self.assertEqual(sorted(page.sections.values_list("order", flat=True)), list(range(len(remaining))))

    def test_pages_without_duplicate_banners_are_left_alone(self):
        page = PageService.home()
        before = set(page.sections.values_list("id", flat=True))
        migration = importlib.import_module("apps.content.migrations.0014_remove_duplicate_home_sections")
        migration.remove_duplicates(django_apps, None)
        self.assertEqual(set(page.sections.values_list("id", flat=True)), before)


class StepAdvanceSettingApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="steps-20nov@example.com", password="StrongPass123")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})
        program = Program.objects.create(
            title="Steps", slug="steps-20nov", description="x", program_type=program_type, owner=self.officer,
            opening_date=timezone.now(), closing_date=timezone.now() + timedelta(days=5),
        )
        self.definition = WorkflowDefinitionService.create_definition(program=program, name="Draft flow", steps_data=[])
        self.client.force_authenticate(self.officer)

    def test_post_and_patch_keep_advance_automatically(self):
        response = self.client.post(
            f"/api/workflow-definitions/{self.definition.id}/steps/",
            {"name": "Review", "code": "review", "order": 1, "role_required": RoleType.INNOVATION_OFFICER,
             "actions_allowed": ["approve", "reject"], "execution_mode": "parallel_any", "advance_automatically": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIs(response.json()["data"]["advance_automatically"], True)
        step = WorkflowStep.objects.get(id=response.json()["data"]["id"])
        self.assertTrue(step.advance_automatically)
        patched = self.client.patch(f"/api/workflow-steps/{step.id}/", {"advance_automatically": False}, format="json")
        self.assertEqual(patched.status_code, 200, patched.content)
        self.assertFalse(WorkflowStep.objects.filter(workflow_definition__program=self.definition.program, code="review").order_by("-created_at").first().advance_automatically)

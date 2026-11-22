"""3.8 headline editor: the banner headline is plain text plus marks (highlight, bold, italic) per language."""
from importlib import import_module

from django.apps import apps as django_apps
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import Page, PageSection, PageVersion
from apps.content.sections import SettingsError, marks_from_words, normalize_settings, upgrade_hero_settings
from apps.content.services import PageService
from apps.core.constants import RoleType

DRAFT = "/api/content/pages/home/draft/"
HEADLINE = "Plant the seed. CEDA helps it grow."
SEED = {"start": 10, "end": 14, "type": "highlight"}
GROW = {"start": 30, "end": 34, "type": "highlight"}


class HeadlineMarksTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.editor = User.objects.create_user(email="editor.marks@example.com", password="x", first_name="E", last_name="D")
        RoleService.assign_roles(self.editor, [RoleType.INNOVATION_OFFICER])
        self.client.force_authenticate(self.editor)
        self.page = PageService.home()

    def hero_settings(self, **changes):
        sections = PageService.draft_document(self.page)["sections"]
        sections[0]["settings"].update(changes)
        return sections

    def test_highlighting_seed_and_grow_saves_and_shows_them_amber_on_the_public_hero(self):
        sections = self.hero_settings(headline={"en": HEADLINE, "tn": ""}, headline_marks={"en": [GROW, SEED], "tn": []})
        response = self.client.put(DRAFT, {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        saved = PageSection.objects.get(page=self.page, type="hero_banner").settings
        self.assertEqual(saved["headline_marks"]["en"], [SEED, GROW])  # sorted
        self.assertNotIn("highlighted_words", saved)

        PageService.publish(self.page, PageService.validate_sections(PageService.draft_sections(self.page)), actor=self.editor)
        hero = APIClient().get("/api/content/public/home/?lang=en").json()["data"]["sections"][0]
        self.assertEqual(hero["settings"]["headline"], HEADLINE)
        marks = hero["settings"]["headline_marks"]
        self.assertEqual([HEADLINE[m["start"]:m["end"]] for m in marks if m["type"] == "highlight"], ["seed", "grow"])

    def test_setswana_has_its_own_marks_and_falls_back_to_english_with_the_english_marks(self):
        tn = "Jala peo. CEDA e go thusa go gola."
        sections = self.hero_settings(
            headline={"en": HEADLINE, "tn": tn},
            headline_marks={"en": [SEED], "tn": [{"start": 5, "end": 8, "type": "highlight"}, {"start": 0, "end": 4, "type": "bold"}]},
        )
        PageService.save_draft(self.page, sections, actor=self.editor)
        rendered = PageService.render(PageService.draft_sections(self.page), lang="tn")[0]["settings"]
        self.assertEqual(rendered["headline"], tn)
        self.assertEqual([(tn[m["start"]:m["end"]], m["type"]) for m in rendered["headline_marks"]], [("Jala", "bold"), ("peo", "highlight")])

        sections = self.hero_settings(headline={"en": HEADLINE, "tn": ""}, headline_marks={"en": [SEED], "tn": []})
        PageService.save_draft(self.page, sections, actor=self.editor)
        rendered = PageService.render(PageService.draft_sections(self.page), lang="tn")[0]["settings"]
        self.assertEqual(rendered["headline"], HEADLINE)
        self.assertEqual(rendered["headline_marks"], [SEED])

    def test_overlapping_marks_of_one_type_join_and_types_can_overlap(self):
        settings = normalize_settings("hero_banner", {
            "headline": {"en": HEADLINE},
            "headline_marks": {"en": [{"start": 10, "end": 12, "type": "highlight"}, {"start": 11, "end": 14, "type": "highlight"}, {"start": 0, "end": 14, "type": "bold"}]},
        })
        self.assertEqual(settings["headline_marks"]["en"], [{"start": 0, "end": 14, "type": "bold"}, SEED])

    def test_bad_marks_are_refused_with_a_path(self):
        cases = [
            ({"en": [{"start": 5, "end": 5, "type": "highlight"}]}, "settings.headline_marks.en[0]"),
            ({"en": [{"start": 0, "end": 4, "type": "underline"}]}, "settings.headline_marks.en[0]"),
            ({"en": [{"start": 30, "end": 60, "type": "bold"}]}, "settings.headline_marks.en[0]"),
            ({"fr": []}, "settings.headline_marks"),
        ]
        for marks, path in cases:
            with self.subTest(marks=marks):
                with self.assertRaises(SettingsError) as raised:
                    normalize_settings("hero_banner", {"headline": {"en": HEADLINE}, "headline_marks": marks})
                self.assertIn(path, [e["path"] for e in raised.exception.errors])

    def test_old_highlighted_words_are_read_as_marks(self):
        self.assertEqual(marks_from_words(HEADLINE, "seed, grow"), [SEED, GROW])
        self.assertEqual(marks_from_words("Grow, grow, GROW", "grow"), [{"start": 0, "end": 4, "type": "highlight"}, {"start": 6, "end": 10, "type": "highlight"}, {"start": 12, "end": 16, "type": "highlight"}])
        upgraded = upgrade_hero_settings({"headline": {"en": HEADLINE, "tn": "Jala peo"}, "highlighted_words": "seed, peo"})
        self.assertNotIn("highlighted_words", upgraded)
        self.assertEqual(upgraded["headline_marks"], {"en": [SEED], "tn": [{"start": 5, "end": 8, "type": "highlight"}]})
        # An older client that still sends highlighted_words is accepted.
        settings = normalize_settings("hero_banner", {"headline": {"en": HEADLINE}, "highlighted_words": "grow"})
        self.assertEqual(settings["headline_marks"]["en"], [GROW])

    def test_migration_moves_saved_words_into_marks_everywhere(self):
        old = {"headline": {"en": HEADLINE, "tn": ""}, "highlighted_words": "seed, grow"}
        PageSection.objects.filter(page=self.page, type="hero_banner").update(settings=old)
        version = PageVersion.objects.create(page=self.page, number=1, sections=[{"id": None, "type": "hero_banner", "enabled": True, "settings": dict(old)}])
        import_module("apps.content.migrations.0022_hero_headline_marks").forwards(django_apps, None)
        draft = PageSection.objects.get(page=self.page, type="hero_banner").settings
        self.assertEqual(draft["headline_marks"]["en"], [SEED, GROW])
        self.assertNotIn("highlighted_words", draft)
        version.refresh_from_db()
        self.assertEqual(version.sections[0]["settings"]["headline_marks"]["en"], [SEED, GROW])
        self.assertTrue(Page.objects.filter(slug="home").exists())

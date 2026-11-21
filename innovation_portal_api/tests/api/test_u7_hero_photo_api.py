"""U7: the home banner's cut-out photo (PNG with a transparent background)."""
import shutil
import tempfile
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import HeroPhoto
from apps.content.services import PageService
from apps.core.constants import RoleType

URL = "/api/content/hero-photo/"


def png(width=600, height=1300, *, mode="RGBA", background=(0, 0, 0, 0), person=(30, 40, 50, 255), opaque_corner=False):
    image = Image.new(mode, (width, height), background if mode == "RGBA" else background[:3])
    colour = person if mode == "RGBA" else person[:3]
    # A narrow "head" on a wide "body", like a real cut-out: the trimmed photo keeps
    # transparent corners beside the head.
    for x in range(250, 350):
        for y in range(200, 400):
            image.putpixel((x, y), colour)
    for x in range(150, 450):
        for y in range(400, height):
            image.putpixel((x, y), colour)
    if opaque_corner:
        image.putpixel((0, 0), (255, 255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return SimpleUploadedFile("neo-molefe-cutout.png", buffer.getvalue(), content_type="image/png")


def jpg():
    buffer = BytesIO()
    Image.new("RGB", (600, 1300), (200, 200, 200)).save(buffer, format="JPEG")
    return SimpleUploadedFile("photo.jpg", buffer.getvalue(), content_type="image/jpeg")


class HeroPhotoApiTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media = tempfile.mkdtemp()
        cls.override = override_settings(MEDIA_ROOT=cls.media)
        cls.override.enable()

    @classmethod
    def tearDownClass(cls):
        cls.override.disable()
        shutil.rmtree(cls.media, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.editor = User.objects.create_user(email="editor.u7@example.com", password="x", first_name="E", last_name="D")
        RoleService.assign_roles(self.editor, [RoleType.INNOVATION_OFFICER])
        self.client.force_authenticate(self.editor)

    def upload(self, file):
        return self.client.post(URL, {"file": file}, format="multipart")

    def error_code(self, response):
        return response.json()["errors"]["file"]["code"]

    def test_transparent_png_is_trimmed_and_saved_in_three_sizes(self):
        response = self.upload(png())
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        photo = HeroPhoto.objects.get(id=data["id"])
        self.assertEqual((photo.width, photo.height), (300, 1100))  # transparent edges trimmed
        self.assertEqual([v["height"] for v in photo.variants], [480, 800, 1100])
        self.assertTrue(all(v["webp"].endswith(".webp") and v["png"].endswith(".png") for v in photo.variants))
        self.assertEqual(data["filename"], "neo-molefe-cutout.png")
        self.assertTrue(data["transparent"])
        self.assertEqual(len(data["srcset"].split(", ")), 3)
        saved = Image.open(f"{self.media}/{photo.variants[0]['webp']}")
        self.assertEqual(saved.mode, "RGBA")

    def test_jpg_is_refused(self):
        response = self.upload(jpg())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.error_code(response), "not_png")

    def test_png_with_a_solid_background_is_refused(self):
        response = self.upload(png(mode="RGB", background=(255, 255, 255, 255)))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.error_code(response), "has_background")
        self.assertIn("still has a background", response.json()["errors"]["file"]["detail"])

    def test_png_with_an_opaque_corner_is_refused(self):
        response = self.upload(png(opaque_corner=True))
        self.assertEqual(self.error_code(response), "has_background")

    def test_short_png_is_refused(self):
        response = self.upload(png(height=900))
        self.assertEqual(self.error_code(response), "too_small")
        self.assertFalse(HeroPhoto.objects.exists())

    def test_people_without_content_edit_cannot_upload(self):
        innovator = User.objects.create_user(email="inn.u7@example.com", password="x", first_name="I", last_name="N")
        RoleService.assign_roles(innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(innovator)
        self.assertEqual(self.upload(png()).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.upload(png()).status_code, 401)

    def test_banner_shows_the_photo_with_srcset_alt_and_size(self):
        photo_id = self.upload(png()).json()["data"]["id"]
        page = PageService.home()
        sections = PageService.draft_document(page)["sections"]
        hero = sections[0]
        self.assertEqual(hero["type"], "hero_banner")
        hero["settings"]["photo"] = {"asset": photo_id, "size": "large", "alt": {"en": "Young innovator holding a tablet", "tn": "Moitshimologi"}}
        PageService.save_draft(page, sections, actor=self.editor)
        rendered = PageService.render(PageService.draft_document(page)["sections"], lang="en")
        photo = rendered[0]["data"]["photo"]
        self.assertEqual(photo["size"], "large")
        self.assertEqual((photo["alt_en"], photo["alt_tn"]), ("Young innovator holding a tablet", "Moitshimologi"))
        self.assertIn(".webp", photo["src"])
        self.assertEqual(len(photo["srcset"].split(", ")), 3)
        self.assertTrue(photo["width"] and photo["height"])

    def test_banner_without_photo_has_none_and_photo_needs_a_description(self):
        page = PageService.home()
        rendered = PageService.render(PageService.draft_document(page)["sections"], lang="en")
        self.assertIsNone(rendered[0]["data"]["photo"])
        photo_id = self.upload(png()).json()["data"]["id"]
        sections = PageService.draft_document(page)["sections"]
        sections[0]["settings"]["photo"] = {"asset": photo_id, "size": "medium", "alt": {"en": "", "tn": ""}}
        response = self.client.put("/api/content/pages/home/draft/", {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("photo.alt", str(response.json()))
        sections[0]["settings"]["photo"] = {"asset": "00000000-0000-0000-0000-000000000000", "size": "medium", "alt": {"en": "x", "tn": ""}}
        self.assertEqual(self.client.put("/api/content/pages/home/draft/", {"sections": sections}, format="json").status_code, 400)

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
from apps.audit.models import AuditLog
from apps.core.constants import RoleType
from apps.media_library.models import MediaAsset

MB = 1024 * 1024
UPLOAD_URL = "/api/media/"


def png_bytes(size=(40, 20), color=(255, 255, 255, 255), draw_box=True, mode="RGBA"):
    image = Image.new(mode, size, color if mode == "RGBA" else color[:3])
    if draw_box:
        for x in range(10, 30):
            for y in range(5, 15):
                image.putpixel((x, y), (200, 30, 30, 255) if mode == "RGBA" else (200, 30, 30))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class MediaApiTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media_root = tempfile.mkdtemp(prefix="media-tests-")
        cls._override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        cls._override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.owner = User.objects.create_user(email="owner@example.com", password="StrongPass123!", first_name="O", last_name="W")
        RoleService.assign_roles(self.owner, [RoleType.INNOVATOR])
        self.other = User.objects.create_user(email="other@example.com", password="StrongPass123!", first_name="Ot", last_name="H")
        RoleService.assign_roles(self.other, [RoleType.INNOVATOR])
        self.officer = User.objects.create_user(email="officer@example.com", password="StrongPass123!", first_name="Of", last_name="F")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])

    def _upload(self, name, content, user=None, **fields):
        self.client.force_authenticate(user or self.owner)
        return self.client.post(UPLOAD_URL, {"file": SimpleUploadedFile(name, content), **fields}, format="multipart")

    # --- uploads ---------------------------------------------------------------

    def test_upload_image_returns_id_url_and_metadata(self):
        response = self._upload("logo.png", png_bytes(), alt_text='{"en": "CEDA logo", "tn": ""}')
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        self.assertEqual(data["kind"], "image")
        self.assertEqual(data["mime_type"], "image/png")
        self.assertEqual((data["width"], data["height"]), (40, 20))
        self.assertTrue(data["url"].startswith("http://testserver/media/media_assets/image/"))
        self.assertIsNone(data["monochrome_url"])
        self.assertEqual(data["alt_text"], "CEDA logo")
        asset = MediaAsset.objects.get(id=data["id"])
        self.assertEqual(asset.uploaded_by, self.owner)
        self.assertEqual(asset.alt_text, {"en": "CEDA logo", "tn": ""})
        self.assertNotIn("logo", asset.file.name)  # stored under a random name
        self.assertTrue(AuditLog.objects.filter(action_type="media_uploaded", target_id=str(asset.id)).exists())

    def test_upload_document_video_and_audio(self):
        pdf = self._upload("pitch.pdf", b"%PDF-1.7\n" + b"0" * 100)
        self.assertEqual(pdf.status_code, 201, pdf.content)
        self.assertEqual(pdf.json()["data"]["kind"], "document")
        video = self._upload("demo.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 100, duration_seconds="12.5")
        self.assertEqual(video.status_code, 201, video.content)
        self.assertEqual(video.json()["data"]["kind"], "video")
        self.assertEqual(video.json()["data"]["duration_seconds"], 12.5)
        audio = self._upload("voice.mp3", b"ID3" + b"\x00" * 100)
        self.assertEqual(audio.status_code, 201, audio.content)
        self.assertEqual(audio.json()["data"]["kind"], "audio")

    def test_video_with_captions(self):
        response = self._upload(
            "demo.mp4",
            b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 100,
            captions=SimpleUploadedFile("demo.vtt", b"WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n"),
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["data"]["captions_url"])

    def test_captions_rejected_for_non_video(self):
        response = self._upload("logo.png", png_bytes(), captions=SimpleUploadedFile("c.vtt", b"WEBVTT\n"))
        self.assertEqual(response.status_code, 400)

    def test_disallowed_type_is_rejected(self):
        response = self._upload("tool.exe", b"MZ" + b"\x00" * 100)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "unsupported_type")
        response = self._upload("vector.svg", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(MediaAsset.objects.exists())

    def test_renamed_file_is_rejected(self):
        response = self._upload("photo.png", b"MZ\x90\x00 not really a png")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "content_mismatch")

    def test_corrupt_image_is_rejected(self):
        response = self._upload("broken.png", b"\x89PNG\r\n\x1a\n" + b"garbage" * 10)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "invalid_image")

    def test_kind_mismatch_is_rejected(self):
        response = self._upload("pitch.pdf", b"%PDF-1.7\n", kind="image")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "kind_mismatch")

    def test_image_over_10_mb_is_rejected(self):
        content = b"\x89PNG\r\n\x1a\n" + b"\x00" * (10 * MB)
        response = self._upload("huge.png", content)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "too_large")

    def test_size_limits_per_kind(self):
        audio = self._upload("long.mp3", b"ID3" + b"\x00" * (10 * MB))
        self.assertEqual(audio.json()["errors"]["code"], "too_large")
        document = self._upload("big.pdf", b"%PDF" + b"0" * (20 * MB))
        self.assertEqual(document.json()["errors"]["code"], "too_large")
        # A 15 MB document is fine (limit 20 MB) though it would be too big as an image.
        ok = self._upload("ok.pdf", b"%PDF" + b"0" * (15 * MB))
        self.assertEqual(ok.status_code, 201, ok.content)

    @override_settings(MEDIA_UPLOAD_SIZE_LIMITS={"video": 1 * MB})
    def test_video_limit_is_enforced(self):
        response = self._upload("demo.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (1 * MB + 1))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "too_large")

    def test_upload_requires_login(self):
        response = APIClient().post(UPLOAD_URL, {"file": SimpleUploadedFile("logo.png", png_bytes())}, format="multipart")
        self.assertEqual(response.status_code, 401)

    def test_missing_file_is_a_validation_error(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(UPLOAD_URL, {}, format="multipart").status_code, 400)

    # --- monochrome logos -----------------------------------------------------

    def test_monochrome_copy_of_logo_on_white_background(self):
        response = self._upload("partner.png", png_bytes(), make_monochrome="true")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        self.assertTrue(data["url"])
        self.assertTrue(data["monochrome_url"])
        self.assertNotEqual(data["url"], data["monochrome_url"])
        asset = MediaAsset.objects.get(id=data["id"])
        with asset.monochrome_file.open("rb") as handle:
            mono = Image.open(handle)
            mono.load()
        self.assertEqual(mono.mode, "RGBA")
        self.assertEqual(mono.size, (40, 20))
        colours = {pixel[:3] for pixel in mono.getdata() if pixel[3] > 0}
        self.assertEqual(colours, {(0, 0, 0)})
        self.assertEqual(mono.getpixel((0, 0))[3], 0)  # white background became transparent
        self.assertGreater(mono.getpixel((15, 10))[3], 0)  # the logo shape is kept

    def test_monochrome_keeps_transparency_and_custom_colour(self):
        content = png_bytes(color=(0, 0, 0, 0))
        response = self._upload("partner.png", content, make_monochrome="true", monochrome_color="#ffffff")
        self.assertEqual(response.status_code, 201, response.content)
        asset = MediaAsset.objects.get(id=response.json()["data"]["id"])
        with asset.monochrome_file.open("rb") as handle:
            mono = Image.open(handle)
            mono.load()
        self.assertEqual(mono.getpixel((0, 0))[3], 0)
        self.assertEqual(mono.getpixel((15, 10)), (255, 255, 255, 255))

    def test_monochrome_rejected_for_non_image(self):
        response = self._upload("pitch.pdf", b"%PDF-1.7\n", make_monochrome="true")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "monochrome_not_image")

    # --- detail and delete ----------------------------------------------------

    def test_owner_and_staff_can_read_others_cannot(self):
        asset_id = self._upload("logo.png", png_bytes()).json()["data"]["id"]
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(f"{UPLOAD_URL}{asset_id}/").status_code, 200)
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.get(f"{UPLOAD_URL}{asset_id}/").status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"{UPLOAD_URL}{asset_id}/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{UPLOAD_URL}{asset_id}/").status_code, 401)

    def test_detail_honours_lang(self):
        asset_id = self._upload("logo.png", png_bytes(), alt_text='{"en": "Logo", "tn": "Letshwao"}').json()["data"]["id"]
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(f"{UPLOAD_URL}{asset_id}/?lang=tn").json()["data"]["alt_text"], "Letshwao")
        self.assertEqual(
            self.client.get(f"{UPLOAD_URL}{asset_id}/?lang=all").json()["data"]["alt_text"],
            {"en": "Logo", "tn": "Letshwao"},
        )

    def test_other_user_cannot_delete(self):
        asset_id = self._upload("logo.png", png_bytes()).json()["data"]["id"]
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(f"{UPLOAD_URL}{asset_id}/").status_code, 403)
        self.assertTrue(MediaAsset.objects.filter(id=asset_id).exists())

    def test_owner_delete_removes_files(self):
        asset_id = self._upload("logo.png", png_bytes(), make_monochrome="true").json()["data"]["id"]
        asset = MediaAsset.objects.get(id=asset_id)
        storage, names = asset.file.storage, [asset.file.name, asset.monochrome_file.name]
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(f"{UPLOAD_URL}{asset_id}/").status_code, 204)
        self.assertFalse(MediaAsset.objects.filter(id=asset_id).exists())
        for name in names:
            self.assertFalse(storage.exists(name))
        self.assertTrue(AuditLog.objects.filter(action_type="media_deleted", target_id=asset_id).exists())

    def test_staff_can_delete(self):
        asset_id = self._upload("logo.png", png_bytes()).json()["data"]["id"]
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.delete(f"{UPLOAD_URL}{asset_id}/").status_code, 204)

    def test_existing_document_endpoint_still_routes(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/documents/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(response.status_code, 404)

import time
from io import BytesIO

from django.test import SimpleTestCase
from PIL import Image, ImageChops

from apps.communications.email_notifications import EmailNotificationService


class EmailHeroImageTests(SimpleTestCase):
    def build(self, headline, intro):
        return EmailNotificationService._build_hero_png_bytes(headline=headline, intro=intro)

    def test_builds_distinct_png_images_quickly(self):
        first = self.build("Your idea has been received", "We will review it and let you know the next steps.")

        started = time.perf_counter()
        second = self.build("Your sign-in code", "Use this code to sign in to the CEDA Innovation Portal.")
        elapsed = time.perf_counter() - started

        for payload in (first, second):
            self.assertIsInstance(payload, bytes)
            self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))
            with Image.open(BytesIO(payload)) as image:
                self.assertEqual(image.format, "PNG")
                self.assertEqual(image.size, (1280, 620))

        with Image.open(BytesIO(first)) as a, Image.open(BytesIO(second)) as b:
            self.assertIsNotNone(ImageChops.difference(a.convert("RGB"), b.convert("RGB")).getbbox())

        self.assertLess(elapsed, 0.3, f"building the hero a second time took {elapsed:.3f}s")

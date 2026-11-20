"""R-33: confirm and stop links have their own, looser limit than sign-up."""

import uuid

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient


class SubscriptionLinkThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_sign_up_limit_does_not_block_links(self):
        for number in range(10):
            response = self.client.post("/api/content/public/subscriptions/", {"email": f"r33-{number}@example.com"}, format="json")
            self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.client.post("/api/content/public/subscriptions/", {"email": "r33-late@example.com"}, format="json").status_code, 429)
        # A token that matches nothing gets 404, not 429.
        self.assertEqual(self.client.get(f"/api/content/public/subscriptions/confirm/{uuid.uuid4()}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/content/public/unsubscribe/{uuid.uuid4()}/").status_code, 404)

    def test_links_have_their_own_limit(self):
        for _ in range(60):
            self.assertEqual(self.client.get(f"/api/content/public/unsubscribe/{uuid.uuid4()}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/content/public/subscriptions/confirm/{uuid.uuid4()}/").status_code, 429)

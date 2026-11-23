"""R-12: the OpenAPI schema describes what the B2 endpoints really send."""

from django.test import SimpleTestCase
from drf_spectacular.generators import SchemaGenerator


class B2SchemaTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def response_ref(self, path, method, code="200"):
        schema = self.schema["paths"][path][method]["responses"][code]["content"]["application/json"]["schema"]
        return schema.get("$ref", "").rsplit("/", 1)[-1]

    def component(self, name):
        return self.schema["components"]["schemas"][name]

    def test_responses_are_documented_with_the_wrapper(self):
        expected = {
            ("/api/me/summary/", "get", "200"): "MySummaryResponse",
            ("/api/me/ideas/", "get", "200"): "MyIdeasResponse",
            ("/api/me/updates/", "get", "200"): "MyUpdatesResponse",
            ("/api/me/challenges/recommended/", "get", "200"): "RecommendedChallengesResponse",
            ("/api/me/ideas/{idea_id}/challenge-matches/", "get", "200"): "ChallengeMatchesResponse",
            ("/api/me/ideas/{idea_id}/link-challenge/{program_id}/", "post", "201"): "LinkChallengeResponse",
            ("/api/drafts/{id}/steps/{section_code}/", "put", "200"): "DraftStepSaveResponse",
            ("/api/drafts/{id}/submit/", "post", "200"): "DraftSubmitResponse",
            ("/api/drafts/quick-start/", "post", "201"): "QuickStartResponse",
            ("/api/submissions/{id}/tracking-detail/", "get", "200"): "TrackingDetailResponse",
        }
        for (path, method, code), name in expected.items():
            with self.subTest(path=path):
                self.assertEqual(self.response_ref(path, method, code), name)
                self.assertEqual(set(self.component(name)["properties"]), {"success", "message", "data"})
        self.assertEqual(self.response_ref("/api/auth/otp/verify/", "post"), "LoginCodeVerifyResponse")
        self.assertIn("access", self.component("LoginCodeVerifyResponse")["properties"])

    def test_method_fields_have_types(self):
        draft = self.component("ApplicationDraft")["properties"]
        self.assertEqual(draft["percent_complete"]["type"], "integer")
        self.assertEqual(draft["guest_phone_verified"]["type"], "boolean")
        profile = self.component("InnovatorProfile")["properties"]
        self.assertEqual(profile["percent_complete"]["type"], "integer")
        self.assertEqual(profile["missing_fields"]["type"], "array")

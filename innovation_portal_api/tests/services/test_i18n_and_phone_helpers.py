from django.test import RequestFactory, SimpleTestCase
from rest_framework import serializers
from rest_framework.request import Request

from apps.core.i18n import (
    TranslatedTextField,
    get_text,
    missing_translations,
    resolve_request_language,
)
from apps.core.phone import InvalidPhoneNumber, normalize_phone


class _Item:
    def __init__(self, title):
        self.title = title


class _ItemSerializer(serializers.Serializer):
    title = TranslatedTextField(require_english=True)

    def update(self, instance, validated_data):
        instance.title = validated_data["title"]
        return instance


def _request(path="/", **headers):
    return Request(RequestFactory().get(path, **headers))


class GetTextTests(SimpleTestCase):
    def test_returns_requested_language(self):
        self.assertEqual(get_text({"en": "Hello", "tn": "Dumela"}, "tn"), "Dumela")
        self.assertEqual(get_text({"en": "Hello", "tn": "Dumela"}, "en"), "Hello")

    def test_tn_falls_back_to_english(self):
        self.assertEqual(get_text({"en": "Hello", "tn": ""}, "tn"), "Hello")
        self.assertEqual(get_text({"en": "Hello", "tn": "   "}, "tn"), "Hello")
        self.assertEqual(get_text({"en": "Hello"}, "tn"), "Hello")

    def test_plain_strings_and_unknown_languages(self):
        self.assertEqual(get_text("Legacy text", "tn"), "Legacy text")
        self.assertEqual(get_text({"en": "Hello", "tn": "Dumela"}, "fr"), "Hello")
        self.assertEqual(get_text(None, "tn"), "")


class LanguageResolutionTests(SimpleTestCase):
    def test_query_param_wins(self):
        self.assertEqual(resolve_request_language(_request("/?lang=tn", HTTP_ACCEPT_LANGUAGE="en")), "tn")

    def test_accept_language_header(self):
        self.assertEqual(resolve_request_language(_request(HTTP_ACCEPT_LANGUAGE="tn-BW,en;q=0.8")), "tn")
        self.assertEqual(resolve_request_language(_request(HTTP_ACCEPT_LANGUAGE="fr-FR,tn;q=0.4,en;q=0.9")), "en")

    def test_default_is_english(self):
        self.assertEqual(resolve_request_language(_request()), "en")
        self.assertEqual(resolve_request_language(_request("/?lang=zz")), "en")
        self.assertEqual(resolve_request_language(None), "en")


class TranslatedTextFieldTests(SimpleTestCase):
    def test_output_follows_lang_and_falls_back(self):
        item = _Item({"en": "Agriculture", "tn": ""})
        self.assertEqual(_ItemSerializer(item, context={"request": _request("/?lang=tn")}).data["title"], "Agriculture")

    def test_full_object_for_staff_editing(self):
        item = _Item({"en": "Agriculture", "tn": "Temothuo"})
        self.assertEqual(
            _ItemSerializer(item, context={"full_translations": True}).data["title"],
            {"en": "Agriculture", "tn": "Temothuo"},
        )
        self.assertEqual(
            _ItemSerializer(item, context={"request": _request("/?lang=all")}).data["title"],
            {"en": "Agriculture", "tn": "Temothuo"},
        )

    def test_input_validation(self):
        self.assertTrue(_ItemSerializer(data={"title": {"en": "A", "tn": "B"}}).is_valid())
        self.assertTrue(_ItemSerializer(data={"title": "Plain English"}).is_valid())
        self.assertFalse(_ItemSerializer(data={"title": {"fr": "Bonjour", "en": "Hi"}}).is_valid())
        self.assertFalse(_ItemSerializer(data={"title": {"en": 5}}).is_valid())
        self.assertFalse(_ItemSerializer(data={"title": {"tn": "Only Setswana"}}).is_valid())
        self.assertFalse(_ItemSerializer(data={"title": ["en"]}).is_valid())

    def test_partial_input_keeps_other_language(self):
        item = _Item({"en": "Agriculture", "tn": ""})
        serializer = _ItemSerializer(item, data={"title": {"tn": "Temothuo"}}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["title"], {"en": "Agriculture", "tn": "Temothuo"})


class MissingTranslationsTests(SimpleTestCase):
    def test_lists_missing_languages(self):
        obj = {"title": {"en": "Title", "tn": ""}, "body": {"en": "Body", "tn": "Mmele"}, "subtitle": {"en": "", "tn": ""}}
        self.assertEqual(
            missing_translations(obj, ["title", "body", "subtitle"], required=["title", "body"]),
            [{"field": "title", "missing": ["tn"]}],
        )
        self.assertEqual(
            missing_translations(obj, ["title", "subtitle"]),
            [{"field": "title", "missing": ["tn"]}, {"field": "subtitle", "missing": ["en", "tn"]}],
        )

    def test_works_on_model_like_objects(self):
        self.assertEqual(missing_translations(_Item({"en": "x", "tn": "y"}), ["title"]), [])


class NormalizePhoneTests(SimpleTestCase):
    def test_botswana_numbers(self):
        for raw in ("71234567", "71 234 567", "+267 71 234 567", "0026771234567", "26771234567", "(+267) 71-234-567"):
            self.assertEqual(normalize_phone(raw), "+26771234567", raw)

    def test_other_countries_keep_their_code(self):
        self.assertEqual(normalize_phone("+27 82 123 4567"), "+27821234567")

    def test_invalid(self):
        for raw in ("", "abc", "+2677123", "+267712345678", "12ab"):
            with self.assertRaises(InvalidPhoneNumber, msg=raw):
                normalize_phone(raw)

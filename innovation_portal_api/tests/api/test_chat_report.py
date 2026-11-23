"""Live chat report: GET /api/analytics/chat/ and its CSV and PDF export."""

import json
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, RoleCapability, User
from apps.accounts.services import RoleService
from apps.analytics.chat_report import next_opening
from apps.analytics.models import AnalyticsExport
from apps.audit.models import AuthorizationRefusal
from apps.conversations.models import Conversation, LiveChatSettings
from apps.core.capabilities import clear_cache
from apps.core.constants import RoleType
from apps.platform_config.models import FeatureFlag
from apps.platform_config.testing import reset_platform_caches, set_features

GAB = ZoneInfo("Africa/Gaborone")
URL = "/api/analytics/chat/"
PERIOD = {"from": "2026-11-16", "to": "2026-11-22"}  # Monday to Sunday
HOURS = {"mon": [{"opens": "08:00", "closes": "16:30"}], "tue": [{"opens": "08:00", "closes": "16:30"}], "wed": [{"opens": "08:00", "closes": "16:30"}], "thu": [{"opens": "08:00", "closes": "16:30"}], "fri": [{"opens": "08:00", "closes": "16:00"}], "sat": [], "sun": []}


def at(day, hour, minute=0):
    return datetime(2026, 11, day, hour, minute, tzinfo=GAB)


def data(response):
    return response.json()["data"]


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ChatReportBase(TestCase):
    def setUp(self):
        cache.clear()
        reset_platform_caches(self)
        RoleService.ensure_default_roles()
        self.officer = self.person("chat-officer@example.com", RoleType.INNOVATION_OFFICER, "Kago", "Tau")
        self.other = self.person("chat-other@example.com", RoleType.INNOVATION_OFFICER, "Mpho", "Dube")
        self.client = APIClient()
        self.client.force_authenticate(self.officer)
        config = LiveChatSettings.load()
        config.hours, config.holidays, config.escalate_after_minutes = HOURS, [], 15
        config.save()

    def person(self, email, role, first, last):
        user = User.objects.create_user(email=email, password="StrongPass123", first_name=first, last_name=last, phone_number="+26771234567")
        RoleService.assign_roles(user, [role])
        return user

    def chat(self, created, *, channel="web", status="closed", assignee=None, replied=None, closed=None, escalated=None, score=None):
        row = Conversation.objects.create(
            channel=channel, status=status, assignee=assignee, first_response_at=replied, closed_at=closed, escalated_at=escalated, satisfaction=score,
            contact_name="Private Person", contact_phone="+26779999999", contact_email="private@example.com", subject="Private subject",
        )
        Conversation.objects.filter(pk=row.pk).update(created_at=created)
        return row

    def report(self, **params):
        cache.clear()
        response = self.client.get(URL, {**PERIOD, **params})
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)


class NumbersTests(ChatReportBase):
    def test_empty_period_answers_nulls_not_zeros(self):
        body = self.report()
        self.assertEqual(body["first_reply_minutes"], {"median": None, "average": None, "within_5_min_pct": None})
        self.assertEqual(body["chat_length_minutes"], {"median": None})
        self.assertEqual(body["satisfaction"], {"average": None, "rated": 0, "by_score": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}})
        self.assertEqual(body["totals"], {"started": 0, "answered": 0, "not_answered": 0, "outside_hours": 0, "escalated": 0, "closed": 0, "open_now": 0})
        self.assertEqual((body["agents"], body["busiest_hours"], len(body["per_day"]), len(body["by_channel"])), ([], [], 7, 4))
        self.assertEqual(body["filters"], {"from": "2026-11-16", "to": "2026-11-22", "channel": None})

    def test_answered_and_not_answered(self):
        now = timezone.now()
        self.chat(at(16, 9), assignee=self.officer, replied=at(16, 9, 4), closed=at(16, 9, 30))
        self.chat(at(16, 10))  # closed with no reply
        self.chat(at(17, 10), status="waiting", escalated=at(17, 10, 15))  # escalated
        self.chat(at(18, 10), status="waiting")  # waiting longer than the escalation time
        recent = self.chat(now - timedelta(minutes=2), status="waiting")  # still inside the time: not counted as missed
        body = self.report(**{"from": "2026-11-16", "to": timezone.now().astimezone(GAB).date().isoformat()})
        self.assertEqual((body["totals"]["started"], body["totals"]["answered"], body["totals"]["not_answered"]), (5, 1, 3))
        self.assertEqual((body["totals"]["escalated"], body["totals"]["closed"], body["totals"]["open_now"]), (1, 2, 3))
        self.assertEqual(body["chat_length_minutes"]["median"], 30)
        self.assertIsNotNone(recent)

    def test_outside_hours_count_from_the_next_opening(self):
        # Monday 22:00, replied Tuesday 08:06: 6 minutes after opening, not 10 hours.
        self.chat(at(16, 22), assignee=self.officer, replied=at(17, 8, 6), closed=at(17, 9))
        # Saturday, replied on Monday 08:02.
        self.chat(at(21, 11), assignee=self.officer, replied=at(23, 8, 2), closed=at(23, 9))
        # Replied at night before opening: 0 minutes, never negative.
        self.chat(at(18, 23), assignee=self.officer, replied=at(18, 23, 30), closed=at(19, 0))
        # Inside hours: counts from the start.
        self.chat(at(19, 10), assignee=self.officer, replied=at(19, 10, 10), closed=at(19, 11))
        body = self.report()
        self.assertEqual(body["totals"]["outside_hours"], 3)
        self.assertEqual(body["first_reply_minutes"], {"median": 4, "average": 5, "within_5_min_pct": 50})

    def test_next_opening_skips_holidays_and_handles_no_hours(self):
        config = LiveChatSettings.load()
        config.holidays = ["2026-11-17"]
        self.assertEqual(next_opening(config, at(16, 22)), at(18, 8))
        config.hours = {day: [] for day in HOURS}
        self.assertIsNone(next_opening(config, at(16, 22)))

    def test_channel_filter_per_day_and_busiest_in_gaborone_time(self):
        self.chat(at(16, 9), channel="whatsapp", replied=at(16, 9, 1))
        self.chat(at(16, 9, 30), channel="whatsapp")
        self.chat(at(17, 0, 30), channel="ai")  # 22:30 UTC on Monday, but Tuesday in Gaborone
        all_channels = self.report()
        self.assertEqual({row["channel"]: (row["started"], row["answered"]) for row in all_channels["by_channel"]}, {"web": (0, 0), "whatsapp": (2, 1), "ussd": (0, 0), "ai": (1, 0)})
        self.assertEqual(next(row for row in all_channels["per_day"] if row["date"] == "2026-11-17")["started"], 1)
        self.assertEqual(all_channels["busiest_hours"], [{"weekday": 0, "hour": 9, "started": 2}, {"weekday": 1, "hour": 0, "started": 1}])
        only = self.report(channel="ai")
        self.assertEqual((only["totals"]["started"], [row["channel"] for row in only["by_channel"]], only["filters"]["channel"]), (1, ["ai"], "ai"))
        self.assertEqual(self.client.get(URL, {"channel": "office"}).status_code, 400)
        self.assertEqual(self.client.get(URL, {"from": "2026-11-20", "to": "2026-11-01"}).status_code, 400)
        self.assertEqual(self.client.get(URL, {"from": "2024-01-01", "to": "2026-11-01"}).status_code, 400)

    def test_satisfaction(self):
        for score in (5, 4, 4, None):
            self.chat(at(16, 9), replied=at(16, 9, 1), score=score)
        self.assertEqual(self.report()["satisfaction"], {"average": 4.3, "rated": 3, "by_score": {"1": 0, "2": 0, "3": 0, "4": 2, "5": 1}})

    def test_default_period_is_the_last_30_days(self):
        body = self.client.get(URL).json()["data"]
        self.assertEqual(len(body["per_day"]), 30)
        self.assertEqual(body["filters"]["to"], timezone.now().astimezone(GAB).date().isoformat())

    def test_works_while_live_chat_is_off(self):
        self.chat(at(16, 9))
        set_features(self, live_chat=False)
        body = self.report()
        self.assertEqual((body["live_chat_on"], body["totals"]["started"]), (False, 1))
        FeatureFlag.objects.filter(key="live_chat").update(enabled=True)
        reset_platform_caches(self)
        self.assertTrue(self.report()["live_chat_on"])


class PrivacyAndPermissionTests(ChatReportBase):
    def test_agents_have_no_contact_details(self):
        self.chat(at(16, 9), assignee=self.officer, replied=at(16, 9, 3), closed=at(16, 10), score=5)
        self.chat(at(16, 11), assignee=self.officer, status="assigned", replied=at(16, 11, 7))
        self.chat(at(16, 12), assignee=self.other, replied=at(16, 12, 1), closed=at(16, 13), score=2)
        body = self.report()
        first = body["agents"][0]
        self.assertEqual(set(first), {"id", "name", "handled", "median_first_reply_minutes", "average_satisfaction", "open_now"})
        self.assertEqual((first["name"], first["handled"], first["median_first_reply_minutes"], first["average_satisfaction"], first["open_now"]), ("Kago Tau", 2, 5, 5.0, 1))
        self.assertEqual([row["name"] for row in body["agents"]], ["Kago Tau", "Mpho Dube"])
        text = json.dumps(body)
        for private in ("Private Person", "+2677", "@example.com", "Private subject"):
            self.assertNotIn(private, text)

    def test_only_people_assigned_in_the_period(self):
        self.chat(at(2, 9), assignee=self.other)  # before the period
        self.chat(at(16, 9), assignee=self.officer)
        self.assertEqual([row["name"] for row in self.report()["agents"]], ["Kago Tau"])

    def test_refused_without_analytics_view_and_recorded(self):
        judge = self.person("chat-judge@example.com", RoleType.JUDGE, "Dr", "Mosweu")
        self.client.force_authenticate(judge)
        self.assertEqual(self.client.get(URL).status_code, 403)
        row = AuthorizationRefusal.objects.get()
        self.assertEqual((row.status_code, row.route_pattern, row.user_id), (403, "/api/analytics/chat/", judge.id))

    def test_export_needs_analytics_view_too(self):
        role = Role.objects.get(code=RoleType.INNOVATION_OFFICER)
        RoleCapability.objects.filter(role=role, capability="analytics.view").delete()
        clear_cache()
        self.addCleanup(clear_cache)
        response = self.client.post("/api/analytics/exports/", {"report": "chat", "format": "csv", "filters": PERIOD}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AnalyticsExport.objects.exists())


class ExportTests(ChatReportBase):
    def export(self, fmt, filters=None):
        with patch("apps.analytics.tasks.run_export.delay", side_effect=RuntimeError("no broker")), self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/analytics/exports/", {"report": "chat", "format": fmt, "filters": filters or PERIOD}, format="json")
        self.assertEqual(response.status_code, 202, response.content)
        detail = data(self.client.get(f"/api/analytics/exports/{data(response)['id']}/"))
        self.assertEqual(detail["status"], "ready", detail)
        return b"".join(self.client.get(f"/api/analytics/exports/{detail['id']}/download/").streaming_content)

    def test_csv_and_pdf(self):
        self.officer.first_name = "=SUM(1)"
        self.officer.save()
        self.chat(at(16, 9), channel="ai", assignee=self.officer, replied=at(16, 9, 3), closed=at(16, 10), score=5)
        text = self.export("csv", {**PERIOD, "channel": "ai"}).decode()
        self.assertIn("chat,totals.started,1", text)
        self.assertIn("chat,first_reply_minutes.median,3", text)
        self.assertIn("chat,per_day.2026-11-16.started,1", text)
        self.assertIn("'=SUM(1) Tau", text)  # a spreadsheet will not run it
        for private in ("Private Person", "+2677", "@example.com"):
            self.assertNotIn(private, text)
        self.assertTrue(self.export("pdf").startswith(b"%PDF"))

    def test_all_export_stays_the_dashboard_numbers(self):
        self.chat(at(16, 9))
        with patch("apps.analytics.tasks.run_export.delay", side_effect=RuntimeError("no broker")), self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/analytics/exports/", {"report": "all", "format": "csv"}, format="json")
        text = b"".join(self.client.get(f"/api/analytics/exports/{data(response)['id']}/download/").streaming_content).decode()
        self.assertNotIn("chat,", text)

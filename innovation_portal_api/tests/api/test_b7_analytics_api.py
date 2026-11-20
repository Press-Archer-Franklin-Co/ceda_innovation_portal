"""B7: dashboard numbers and exports, with one filter row."""

import tempfile
from datetime import date, datetime, time, timedelta

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.analytics.models import AnalyticsExport
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionType
from apps.profiles.models import InnovatorProfile
from apps.programs.models import Program, ProgramType
from apps.reference.models import District, Sector
from apps.submissions.models import Submission, SubmissionOutcome, SubmissionStatusHistory


def data(response):
    return response.json()["data"]


def at(day: date, hour=10):
    return timezone.make_aware(datetime.combine(day, time(hour)))


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AnalyticsTestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="b7-officer@example.com", password="StrongPass123")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.viewer = User.objects.create_user(email="b7-viewer@example.com", password="StrongPass123")
        RoleService.assign_roles(self.viewer, [RoleType.MANAGEMENT_VIEWER])
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea"})
        self.program = Program.objects.create(title="B7 ideas", slug="b7-ideas", program_type=program_type, owner=self.officer)
        self.agri, self.tech = Sector.objects.create(slug="b7-agri", name={"en": "Agri", "tn": ""}), Sector.objects.create(slug="b7-tech", name={"en": "Tech", "tn": ""})
        self.maun = District.objects.create(slug="b7-maun", name={"en": "Maun", "tn": ""}, is_rural=True)
        self.gabs = District.objects.create(slug="b7-gaborone", name={"en": "Gaborone", "tn": ""}, is_rural=False)
        self.today = timezone.localdate()
        self.number = 0

    def idea(self, *, days_ago=1, status="submitted", channel="web", sector=None, district=None, born=None, gender=""):
        self.number += 1
        person = User.objects.create_user(email=f"b7-person{self.number}@example.com", password="StrongPass123")
        InnovatorProfile.objects.update_or_create(user=person, defaults={"date_of_birth": born, "gender": gender})
        return Submission.objects.create(
            reference_number=f"CEDA-IP-2026-9{self.number:04d}", program=self.program, innovator=person, submission_type=SubmissionType.IDEA,
            title=f"Idea {self.number}", current_status=status, submitted_at=at(self.today - timedelta(days=days_ago)),
            channel=channel, sector=sector, district=district,
        )

    def get(self, path, user=None, **params):
        self.client.force_authenticate(user or self.officer)
        response = self.client.get(path, params)
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)


class KpiAndSeriesTests(AnalyticsTestCase):
    def test_kpis_with_change_waiting_and_days_to_decision(self):
        for days in (1, 2, 3):
            self.idea(days_ago=days)
        self.idea(days_ago=35)  # previous 30-day period
        decided = self.idea(days_ago=20, status="approved")
        SubmissionOutcome.objects.create(submission=decided, program=self.program, outcome_type="approved", decided_at=decided.submitted_at + timedelta(days=4))
        stuck = self.idea(days_ago=25, status="screening")
        SubmissionStatusHistory.objects.create(submission=stuck, from_status="submitted", to_status="screening")
        SubmissionStatusHistory.objects.filter(submission=stuck).update(created_at=timezone.now() - timedelta(days=10))

        kpis = self.get("/api/analytics/kpis/")
        self.assertEqual(kpis["submitted"], {"count": 5, "previous": 1, "change_pct": 400.0})
        self.assertEqual(kpis["in_review"]["count"], 5)
        self.assertEqual(kpis["in_review"]["waiting_over_7_days"], 2)  # the stuck one and the 35-day-old one
        self.assertEqual(kpis["days_to_decision"], {"average": 4.0, "decided": 1, "target": 10})
        self.assertEqual(kpis["waiting_for_me"], {"count": 0, "due_today": 0})

    def test_weekly_series_is_zero_filled(self):
        self.idea(days_ago=0)
        self.idea(days_ago=0)
        self.idea(days_ago=21)
        series = self.get("/api/analytics/submissions-series/", interval="week")
        self.assertEqual(len(series["points"]), 12)
        self.assertEqual(series["points"][-1]["count"], 2)
        self.assertEqual(sum(point["count"] for point in series["points"]), 3)
        self.assertTrue(any(point["count"] == 0 for point in series["points"]))
        monday = self.today - timedelta(days=self.today.weekday())
        self.assertEqual(series["points"][-1]["period_start"], monday.isoformat())
        months = self.get("/api/analytics/submissions-series/", interval="month")
        self.assertEqual(months["points"][-1]["period_start"], self.today.replace(day=1).isoformat())
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.get("/api/analytics/submissions-series/", {"interval": "day"}).status_code, 400)


class PipelineFunnelTests(AnalyticsTestCase):
    def test_pipeline_counts_and_bottleneck(self):
        self.idea(status="screening")
        old = self.idea(days_ago=20, status="under_judging")
        self.idea(days_ago=30, status="under_judging")
        self.idea(status="approved")  # finished, not in the pipeline
        stages = {stage["code"]: stage for stage in self.get("/api/analytics/pipeline/")["stages"]}
        self.assertEqual(stages["screening"]["count"], 1)
        self.assertEqual(stages["judging"], {"code": "judging", "label": "Under judging", "count": 2, "waiting_over_7_days": 2})
        self.assertEqual(self.get("/api/analytics/pipeline/")["bottleneck"], "judging")
        SubmissionStatusHistory.objects.create(submission=old, from_status="screening", to_status="under_judging")
        cache.clear()
        self.assertEqual({stage["code"]: stage for stage in self.get("/api/analytics/pipeline/")["stages"]}["judging"]["waiting_over_7_days"], 1)

    def test_no_bottleneck_when_nothing_waits(self):
        self.idea(status="screening")
        self.assertIsNone(self.get("/api/analytics/pipeline/")["bottleneck"])

    def test_funnel_uses_history(self):
        reviewed = self.idea(status="rejected")
        SubmissionStatusHistory.objects.create(submission=reviewed, from_status="screening", to_status="under_judging")
        self.idea(status="winner")
        self.idea(status="screening")
        funnel = self.get("/api/analytics/funnel/")
        self.assertEqual(
            {key: funnel[key] for key in ("submitted", "passed_check", "reviewed", "panel", "supported", "funded", "funded_tracked")},
            {"submitted": 3, "passed_check": 2, "reviewed": 2, "panel": 1, "supported": 1, "funded": None, "funded_tracked": False},
        )


class SourcesSectorsInclusionTests(AnalyticsTestCase):
    def test_channels_districts_sectors_and_filters(self):
        self.idea(channel="web", district=self.maun, sector=self.agri)
        self.idea(channel="web", district=self.maun, sector=self.agri)
        self.idea(channel="whatsapp", district=self.gabs, sector=self.tech)
        self.idea(channel="ussd")
        sources = self.get("/api/analytics/sources/")
        channels = {item["channel"]: item for item in sources["channels"]}
        self.assertEqual((channels["web"]["count"], channels["web"]["pct"]), (2, 50.0))
        self.assertEqual(channels["office"]["count"], 0)
        self.assertEqual([item["slug"] for item in sources["top_districts"]], ["b7-maun", "b7-gaborone"])
        self.assertEqual(sources["no_district"], 1)
        sectors = self.get("/api/analytics/sectors/")
        self.assertEqual([(item["slug"], item["count"]) for item in sectors["sectors"]], [("b7-agri", 2), ("b7-tech", 1)])
        # Every endpoint follows the same filters.
        self.assertEqual(self.get("/api/analytics/sources/", channel="whatsapp")["total"], 1)
        self.assertEqual(self.get("/api/analytics/sectors/", district="b7-maun")["sectors"][0]["count"], 2)
        self.assertEqual(self.get("/api/analytics/kpis/", sector=str(self.tech.id))["submitted"]["count"], 1)
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.get("/api/analytics/kpis/", {"channel": "fax"}).status_code, 400)

    def test_inclusion(self):
        on = self.today - timedelta(days=1)
        self.idea(born=on.replace(year=on.year - 25), gender="Female", district=self.maun)
        self.idea(born=on.replace(year=on.year - 40), gender="male", district=self.gabs)
        self.idea(born=on.replace(year=on.year - 35), gender="F")
        self.idea()
        inclusion = self.get("/api/analytics/inclusion/")
        self.assertEqual(inclusion["age"], {"youth_18_35": 2, "36_and_over": 1, "under_18": 0, "unknown": 1})
        self.assertEqual(inclusion["gender"], {"women": 2, "men": 1, "other_or_unknown": 0, "unknown": 1})
        self.assertEqual(inclusion["place"], {"rural": 1, "urban": 1, "unknown": 2})


class AccessAndExportTests(AnalyticsTestCase):
    def test_staff_only(self):
        innovator = User.objects.create_user(email="b7-innovator@example.com", password="StrongPass123")
        RoleService.assign_roles(innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(innovator)
        for path in ("kpis", "submissions-series", "pipeline", "funnel", "sources", "sectors", "inclusion"):
            self.assertEqual(self.client.get(f"/api/analytics/{path}/").status_code, 403, path)
        self.assertEqual(self.client.post("/api/analytics/exports/", {"report": "all", "format": "csv"}, format="json").status_code, 403)
        self.get("/api/analytics/kpis/", user=self.viewer)

    def test_csv_and_pdf_exports(self):
        self.idea(channel="web", sector=self.agri)
        self.client.force_authenticate(self.officer)
        for fmt, magic in (("csv", b"report,item,value"), ("pdf", b"%PDF")):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post("/api/analytics/exports/", {"report": "all", "format": fmt, "filters": {"channel": "web"}}, format="json")
            self.assertEqual(response.status_code, 202, response.content)
            detail = data(self.client.get(f"/api/analytics/exports/{data(response)['id']}/"))
            self.assertEqual(detail["status"], "ready", detail)
            download = self.client.get(f"/api/analytics/exports/{detail['id']}/download/")
            self.assertEqual(download.status_code, 200)
            self.assertTrue(b"".join(download.streaming_content).startswith(magic))
        self.assertEqual(self.client.post("/api/analytics/exports/", {"report": "all", "format": "xls"}, format="json").status_code, 400)
        other = User.objects.create_user(email="b7-other@example.com", password="StrongPass123")
        RoleService.assign_roles(other, [RoleType.INNOVATION_OFFICER])
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f"/api/analytics/exports/{AnalyticsExport.objects.first().id}/").status_code, 404)

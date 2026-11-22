"""Innovator tracking: 2.2 My ideas paged in the database, 2.4 feedback and documents, 2.4b returned for changes."""
import shutil
import tempfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionStatus, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.models import ApplicationDraft, ReturnRequest, Submission, SubmissionStatusHistory
from apps.submissions.services import SubmissionService
from apps.workflow.models import WorkflowActionLog


def data(response):
    return response.json()["data"]


def make_user(email, role, first="Test", last="User"):
    user = User.objects.create_user(email=email, password="StrongPass123!", first_name=first, last_name=last)
    RoleService.assign_roles(user, [role])
    return user


class TrackingBase(TestCase):
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
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = make_user("track-officer@example.com", RoleType.INNOVATION_OFFICER, "Kago", "Tau")
        self.innovator = make_user("track-innovator@example.com", RoleType.INNOVATOR, "Neo", "Molefe")
        self.other = make_user("track-other@example.com", RoleType.INNOVATOR, "Lesego", "Other")
        ptype = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Track Challenge", slug="track-challenge", description="Test", program_type=ptype,
            opening_date=timezone.now(), closing_date=timezone.now() + timedelta(days=30), owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Form")
        self.f_idea = SubmissionFormField.objects.create(form=form, label="Your idea", key="idea", field_type=SubmissionFormFieldType.TEXTAREA, required=True, ordering=1)
        self.f_price = SubmissionFormField.objects.create(form=form, label="Price per pouch", key="price", field_type=SubmissionFormFieldType.TEXT, required=False, ordering=2)
        self.f_district = SubmissionFormField.objects.create(form=form, label="District", key="district", field_type=SubmissionFormFieldType.TEXT, required=False, ordering=3)

    def submit(self, user=None, title="Solar-dried mopane snacks"):
        user = user or self.innovator
        sub = SubmissionService.create_draft(innovator=user, program=self.program, submission_type=SubmissionType.HACKATHON_APPLICATION, title=title)
        SubmissionService.save_responses(sub, responses=[
            {"form_field": self.f_idea.id, "value": "Dry mopane in the sun"},
            {"form_field": self.f_price.id, "value": "P10"},
            {"form_field": self.f_district.id, "value": "Central"},
        ], actor=user)
        return SubmissionService.finalize_submission(sub, user)

    def bulk(self, n, *, user=None, program=None):
        """n sent ideas straight in the database (paging does not need workflows)."""
        user = user or self.innovator
        now = timezone.now()
        rows = [
            Submission(
                program=program or self.program, innovator=user, submission_type=SubmissionType.IDEA, title=f"Idea {i:03d}",
                reference_number=f"CEDA-IP-2026-{10000 + i}", current_status=SubmissionStatus.SUBMITTED, submitted_at=now - timedelta(minutes=i),
            )
            for i in range(n)
        ]
        Submission.objects.bulk_create(rows)
        # updated_at is auto_now: set an order the test can predict (Idea 000 newest).
        for i, row in enumerate(Submission.objects.filter(innovator=user, title__startswith="Idea ")):
            Submission.objects.filter(pk=row.pk).update(updated_at=now - timedelta(minutes=int(row.title.split()[1])))


class MyIdeasPagingTests(TrackingBase):
    def test_ten_a_page_with_counts_search_challenge_and_sort(self):
        self.bulk(25)
        ApplicationDraft.objects.create(innovator=self.innovator, program=self.program, title="Hair salon booking", status=ApplicationDraft.STATUS_DRAFT)
        self.client.force_authenticate(self.innovator)
        first = data(self.client.get("/api/me/ideas/"))
        self.assertEqual((first["count"], first["page"], first["pages"], len(first["results"])), (26, 1, 3, 10))
        self.assertEqual(first["counts"], {"all": 26, "needs_action": 0, "drafts": 1, "in_review": 25, "finished": 0})
        self.assertEqual(first["results"][0]["title"], "Hair salon booking")  # the draft was saved last
        third = data(self.client.get("/api/me/ideas/?page=3"))
        self.assertEqual(len(third["results"]), 6)
        self.assertEqual(third["results"][-1]["title"], "Idea 024")

        found = data(self.client.get("/api/me/ideas/?q=10007"))
        self.assertEqual([r["reference"] for r in found["results"]], ["CEDA-IP-2026-10007"])
        self.assertEqual(found["counts"]["all"], 1)
        by_name = data(self.client.get("/api/me/ideas/?sort=name&filter=in_review&page_size=3"))
        self.assertEqual([r["title"] for r in by_name["results"]], ["Idea 000", "Idea 001", "Idea 002"])
        oldest = data(self.client.get("/api/me/ideas/?sort=oldest&filter=in_review"))
        self.assertEqual(oldest["results"][0]["title"], "Idea 024")

        other = Program.objects.create(title="Other call", slug="other-call", description="x", program_type=self.program.program_type, owner=self.officer)
        self.bulk(2, program=other)
        in_other = data(self.client.get(f"/api/me/ideas/?program={other.id}"))
        self.assertEqual(in_other["count"], 2)
        self.assertEqual({p["title"] for p in in_other["programs"]}, {"Track Challenge", "Other call"})

    def test_cost_does_not_grow_with_the_number_of_ideas(self):
        self.client.force_authenticate(self.innovator)
        self.bulk(15)
        with CaptureQueriesContext(connection) as small:
            self.assertEqual(len(data(self.client.get("/api/me/ideas/?page=1"))["results"]), 10)
        Submission.objects.filter(innovator=self.innovator).delete()
        self.bulk(300)
        with CaptureQueriesContext(connection) as large:
            response = self.client.get("/api/me/ideas/?page=20")
        self.assertEqual(data(response)["counts"]["all"], 300)
        self.assertEqual(len(data(response)["results"]), 10)
        self.assertLessEqual(len(large.captured_queries), len(small.captured_queries) + 2)

    def test_bad_parameters_are_refused(self):
        self.client.force_authenticate(self.innovator)
        for query in ("page=0", "page=x", "page_size=500", "sort=random", "filter=nope", "program=not-an-id"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/me/ideas/?{query}").status_code, 400)

    def test_only_my_own_ideas(self):
        self.bulk(3, user=self.other)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.client.get("/api/me/ideas/"))["count"], 0)


class SeedDemoIdeasTests(TrackingBase):
    def test_sixty_ideas_page_and_a_second_run_adds_nothing(self):
        from django.core.management import call_command

        call_command("seed_demo_ideas", email=self.innovator.email, count=60, verbosity=0)
        call_command("seed_demo_ideas", email=self.innovator.email, count=60, verbosity=0)
        self.client.force_authenticate(self.innovator)
        page = data(self.client.get("/api/me/ideas/?page=6"))
        self.assertEqual((page["count"], page["pages"], len(page["results"])), (60, 6, 10))
        first = data(self.client.get("/api/me/ideas/"))
        self.assertEqual(first["counts"], {"all": 60, "needs_action": 0, "drafts": 0, "in_review": 40, "finished": 20})
        self.assertGreater(len(first["results"][0]["stages"]), 1)  # real stages on the card
        from apps.workflow.models import TaskExecution

        self.assertFalse(TaskExecution.objects.filter(workflow_instance__submission__innovator=self.innovator).exists())  # no work for officers
        real = self.submit()
        call_command("seed_demo_ideas", email=self.innovator.email, clear=True, verbosity=0)
        self.assertEqual(list(Submission.objects.filter(innovator=self.innovator)), [real])


class DocumentsAndOwnershipTests(TrackingBase):
    def upload(self, sub, name="costing.xlsx", user=None, **extra):
        self.client.force_authenticate(user or self.innovator)
        return self.client.post(f"/api/documents/submissions/{sub.id}/documents/", {"file": SimpleUploadedFile(name, b"x" * 2048), **extra}, format="multipart")

    def test_documents_with_dates_sizes_and_older_versions_and_downloads_only_for_the_owner(self):
        sub = self.submit()
        first = self.upload(sub)
        self.assertEqual(first.status_code, 201, first.content)
        first_id = first.json().get("id") or first.json()["data"]["id"]
        self.assertEqual(self.upload(sub, "costing-v2.xlsx", replace_document_id=first_id).status_code, 201)
        docs = data(self.client.get(f"/api/me/ideas/{sub.id}/tracking/"))["documents"]
        self.assertEqual(len(docs), 1)
        self.assertEqual((docs[0]["name"], docs[0]["version"], docs[0]["size_bytes"]), ("costing-v2.xlsx", 2, 2048))
        self.assertEqual([v["name"] for v in docs[0]["older_versions"]], ["costing.xlsx"])
        self.assertTrue(docs[0]["sent_at"])

        self.assertEqual(self.client.get(docs[0]["download_url"]).status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertIn(self.client.get(docs[0]["download_url"]).status_code, (403, 404))
        self.assertEqual(self.client.get(f"/api/me/ideas/{sub.id}/tracking/").status_code, 404)

    def test_a_new_version_only_replaces_a_file_of_the_same_idea(self):
        mine, theirs = self.submit(), self.submit(user=self.other, title="Theirs")
        their_doc = self.upload(theirs, user=self.other)
        their_id = their_doc.json().get("id") or their_doc.json()["data"]["id"]
        self.assertEqual(self.upload(mine, replace_document_id=their_id).status_code, 400)

    def test_no_new_files_once_the_idea_is_finished(self):
        sub = self.submit()
        Submission.objects.filter(pk=sub.pk).update(current_status=SubmissionStatus.REJECTED)
        self.assertEqual(self.upload(sub).status_code, 400)
        self.assertFalse(data(self.client.get(f"/api/me/ideas/{sub.id}/tracking/"))["can_add_documents"])


class ReturnedForChangesTests(TrackingBase):
    def send_back(self, sub, items=None, **extra):
        self.client.force_authenticate(self.officer)
        body = {
            "reason": "Your idea is strong, but we need real costs before the panel.",
            "fix_by": (timezone.localdate() + timedelta(days=6)).isoformat(),
            "items": items if items is not None else [
                {"kind": "document", "field_key": "", "label": "Add your supplier quote"},
                {"kind": "answer", "field_key": "price", "label": 'Say your price per pouch in "Costs"'},
            ],
            **extra,
        }
        return self.client.post(f"/api/submissions/{sub.id}/send-back/", body, format="json")

    def test_officer_sends_back_two_items_and_the_innovator_fixes_and_resends_to_the_same_stage(self):
        sub = self.submit()
        step = sub.workflow_instance.current_step
        response = self.send_back(sub)
        self.assertEqual(response.status_code, 201, response.content)
        sub.refresh_from_db()
        self.assertEqual(sub.current_status, SubmissionStatus.RETURNED)

        self.client.force_authenticate(self.innovator)
        returned = data(self.client.get(f"/api/me/ideas/{sub.id}/tracking/"))["returned"]
        self.assertEqual(returned["requested_by"], "Kago T.")
        self.assertEqual([i["done"] for i in returned["items"]], [False, False])
        listed = data(self.client.get("/api/me/ideas/?filter=needs_action"))
        self.assertEqual([r["id"] for r in listed["results"]], [str(sub.id)])

        # Nothing done yet: refused, and nothing changes.
        refused = self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {}}, format="json")
        self.assertEqual(refused.status_code, 400)
        # Only the parts the officer asked about may change.
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"district": "Kweneng", "price": "P2.40"}}, format="json").status_code, 400)
        self.assertEqual(sub.responses.get(field_key_snapshot="district").value, "Central")
        # The answer alone is not enough: the quote is still missing.
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P2.40"}}, format="json").status_code, 400)
        self.assertEqual(sub.responses.get(field_key_snapshot="price").value, "P10")

        # A general upload does not tick the requested item; one with the item's key does.
        self.client.post(f"/api/documents/submissions/{sub.id}/documents/", {"file": SimpleUploadedFile("other.pdf", b"%PDF-1.4 other")}, format="multipart")
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P2.40"}}, format="json").status_code, 400)
        key = returned["items"][0]["field_key"]
        self.client.post(f"/api/documents/submissions/{sub.id}/documents/", {"file": SimpleUploadedFile("quote.pdf", b"%PDF-1.4 quote"), "field_key": key}, format="multipart")
        self.assertEqual([f["key"] for f in returned["fields"]], ["price"])
        done = self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P2.40"}}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertIsNone(data(done)["returned"])
        sub.refresh_from_db()
        self.assertEqual(sub.workflow_instance.current_step_id, step.id)
        self.assertEqual(sub.workflow_instance.status, "in_progress")
        self.assertEqual(sub.current_status, step.submission_status)
        self.assertEqual(sub.responses.get(field_key_snapshot="price").value, "P2.40")
        self.assertEqual(ReturnRequest.objects.get(submission=sub).status, ReturnRequest.Status.RESENT)
        self.assertTrue(WorkflowActionLog.objects.filter(workflow_instance=sub.workflow_instance, action=WorkflowActionLog.ACTION_RESUBMIT).exists())
        self.assertTrue(SubmissionStatusHistory.objects.filter(submission=sub, to_status=SubmissionStatus.RETURNED).exists())
        decisions = [e["decision"] for e in data(done)["feedback_by_stage"]]
        self.assertEqual(decisions[0], "received")
        self.assertIn("returned", decisions)
        self.assertIn("resent", decisions)
        self.assertLess(decisions.index("returned"), decisions.index("resent"))

    def test_send_back_needs_a_reason_real_questions_and_a_future_date(self):
        sub = self.submit()
        self.assertEqual(self.send_back(sub, reason="").status_code, 400)
        self.assertEqual(self.send_back(sub, items=[]).status_code, 400)
        self.assertEqual(self.send_back(sub, items=[{"kind": "answer", "field_key": "nope", "label": "x"}]).status_code, 400)
        self.assertEqual(self.send_back(sub, fix_by="2020-01-01").status_code, 400)
        self.assertEqual(self.send_back(sub).status_code, 201)
        self.assertEqual(self.send_back(sub).status_code, 400)  # already waiting

    def test_an_innovator_cannot_send_back_or_resend_someone_elses_idea(self):
        sub = self.submit()
        self.client.force_authenticate(self.innovator)
        self.assertIn(self.client.post(f"/api/submissions/{sub.id}/send-back/", {"reason": "x", "items": [{"kind": "document", "label": "x"}]}, format="json").status_code, (403, 404))
        self.send_back(sub)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P1"}}, format="json").status_code, 404)

    def test_staff_see_the_questions_they_can_point_at(self):
        sub = self.submit()
        self.client.force_authenticate(self.officer)
        info = data(self.client.get(f"/api/submissions/{sub.id}/send-back/"))
        self.assertIsNone(info["open"])
        self.assertEqual([(q["field_key"], q["kind"]) for q in info["questions"]], [("idea", "answer"), ("price", "answer"), ("district", "answer")])

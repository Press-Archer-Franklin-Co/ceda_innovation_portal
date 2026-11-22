"""One person, one account, whether they start on WhatsApp, USSD or the website."""

import importlib
import json
from unittest.mock import patch

from django.apps import apps as django_apps
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import LoginCode, User
from apps.accounts.otp_services import OTPService
from apps.accounts.phone_accounts import OTHER_ACCOUNT, join_accounts, join_refusal
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.channels.actions import find_user_by_phone
from apps.communications.senders import LocMemMessageSender, MessageSenderRegistry
from apps.core.constants import RoleType
from apps.platform_config.testing import reset_platform_caches, set_features
from apps.programs.general_intake import GeneralIntakeService
from apps.submissions.draft_services import ApplicationDraftService
from apps.submissions.models import ApplicationDraft, Submission

PHONE = "+26773000280"
FORMS = ("73000280", "26773000280", "+267 7300 0280", "+26773000280", "0026773000280")
SENDERS = {"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""}


@override_settings(MESSAGE_SENDERS=SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms", DEMO_LOGINS=False)
class Base(TestCase):
    def setUp(self):
        cache.clear()
        MessageSenderRegistry.reset() if hasattr(MessageSenderRegistry, "reset") else None
        LocMemMessageSender.outbox.clear() if hasattr(LocMemMessageSender, "outbox") else None
        reset_platform_caches(self)
        set_features(self, sms_messages=True, code_sign_in=True)
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.program = GeneralIntakeService.program()

    def whatsapp_account(self, phone=PHONE):
        user, _ = OTPService.user_for_verified_target(target_type=LoginCode.TargetType.PHONE, target=phone, source="whatsapp_journey", first_name="Neo")
        return user

    def web_account(self, email="neo@example.com", phone="", verified=False, signed_in=True):
        user = User.objects.create_user(email=email, password="StrongPass123", first_name="Neo", phone_number=phone, phone_verified=verified)
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        if signed_in:
            User.objects.filter(pk=user.pk).update(last_login=timezone.now())
            user.refresh_from_db()
        return user

    def draft(self, *, innovator=None, phone="", proved=True, channel="whatsapp", title="Solar dryer"):
        return ApplicationDraft.objects.create(
            reference_number=ApplicationDraftService.generate_reference_number(self.program), program=self.program, innovator=innovator,
            is_general_idea=True, channel=channel, title=title, draft_data={}, guest_phone=phone, guest_phone_verified_at=timezone.now() if proved and phone else None,
        )

    def guest_submission(self, phone=PHONE):
        return Submission.objects.create(reference_number=ApplicationDraftService.generate_reference_number(self.program), program=self.program, title="Guest idea", guest_phone=phone, channel="whatsapp", submission_type=self.draft().submission_type)


class SameAccountTests(Base):
    def test_every_form_finds_the_same_account(self):
        user = self.web_account(phone="7300 0280".replace(" ", ""), verified=True)
        for form in FORMS:
            self.assertEqual(find_user_by_phone(form), user, form)
            self.assertEqual(OTPService.find_user(target_type=LoginCode.TargetType.PHONE, target=form), user, form)

    def test_website_start_finds_the_whatsapp_account(self):
        self.whatsapp_account()
        for form in FORMS:
            cache.clear()
            response = self.client.post("/api/auth/start/", {"identifier": form}, format="json")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()["next"], "code", form)
        self.assertEqual(User.objects.filter(phone_number=PHONE).count(), 1)

    def test_signup_with_an_existing_phone_signs_in_instead(self):
        existing = self.whatsapp_account()
        before = User.objects.count()
        response = self.client.post("/api/auth/signup/", {"identifier": "new@example.com", "full_name": "Neo Moeng", "phone": "73000280", "email": "new@example.com", "consent": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["found_account"], body["created"], body["identifier"], body["next"]), (True, False, PHONE, "code"))
        self.assertIn("Welcome back", body["message"])
        self.assertEqual(User.objects.count(), before)
        self.assertEqual(find_user_by_phone(PHONE), existing)

    def test_profile_saves_the_normal_form_and_refuses_someone_elses_number(self):
        user = self.web_account()
        self.client.force_authenticate(user)
        self.assertEqual(self.client.patch("/api/auth/me/", {"phone_number": "+267 7111 2222"}, format="json").status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.phone_number, "+26771112222")
        self.web_account(email="other@example.com", phone=PHONE, verified=True)
        refused = self.client.patch("/api/auth/me/", {"phone_number": "73000280"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("another account", refused.content.decode())


class ClaimTests(Base):
    def test_claimed_on_code_sign_in_with_a_masked_audit(self):
        draft, submission = self.draft(phone="26773000280"), self.guest_submission()
        user = self.whatsapp_account()
        draft.refresh_from_db(), submission.refresh_from_db()
        self.assertEqual((draft.innovator, submission.innovator), (user, user))
        entries = AuditLog.objects.filter(action_type="guest_records_claimed")
        self.assertEqual(entries.count(), 2)
        self.assertNotIn("73000280", json.dumps([row.metadata for row in entries]))
        self.client.force_authenticate(user)
        ideas = self.client.get("/api/me/ideas/").json()["data"]["results"]
        self.assertEqual({(row["title"], row["channel"]) for row in ideas if row["kind"] == "draft"}, {("Solar dryer", "whatsapp")})

    def test_claimed_on_profile_phone_verify(self):
        draft = self.draft(phone=PHONE)
        user = self.web_account()
        self.client.force_authenticate(user)
        with patch("apps.accounts.otp_services.OTPService.check_code_or_raise"):
            response = self.client.post("/api/auth/me/phone/verify/", {"phone": "73000280", "code": "123456"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        draft.refresh_from_db(), user.refresh_from_db()
        self.assertEqual((draft.innovator, user.phone_number, user.phone_verified), (user, PHONE, True))

    def test_a_number_nobody_proved_is_not_claimed(self):
        draft = self.draft(phone=PHONE, proved=False)
        self.whatsapp_account()
        draft.refresh_from_db()
        self.assertIsNone(draft.innovator)

    def test_a_typed_number_never_receives_another_persons_ideas(self):
        typed = self.web_account(email="typed@example.com", phone=PHONE, verified=False)
        self.assertIsNone(find_user_by_phone(PHONE))
        draft = self.draft(phone=PHONE)
        owner = self.whatsapp_account()  # WhatsApp vouches for the number
        draft.refresh_from_db()
        self.assertNotEqual(owner, typed)
        self.assertEqual(draft.innovator, owner)
        self.assertEqual(find_user_by_phone(PHONE), owner)
        self.client.force_authenticate(typed)
        self.assertEqual(self.client.get("/api/me/ideas/").json()["data"]["results"], [])

    def test_website_code_for_a_typed_number_is_refused_and_audited(self):
        typed = self.web_account(email="typed@example.com", phone=PHONE, verified=False)
        with patch("apps.accounts.otp_services.OTPService.check_code_or_raise"):
            response = self.client.post("/api/auth/finish/", {"identifier": PHONE, "code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn(OTHER_ACCOUNT, response.content.decode())
        typed.refresh_from_db()
        self.assertFalse(typed.phone_verified)
        entry = AuditLog.objects.get(action_type="accounts_join_needed")
        self.assertNotIn("73000280", json.dumps(entry.metadata))


class JoinTests(Base):
    def test_join_moves_everything_and_switches_off_the_phone_account(self):
        phone_user = self.whatsapp_account()
        idea = self.draft(innovator=phone_user, title="From WhatsApp")
        main = self.web_account()
        self.client.force_authenticate(main)
        with patch("apps.accounts.otp_services.OTPService.check_code_or_raise"):
            response = self.client.post("/api/auth/me/phone/verify/", {"phone": PHONE, "code": "123456"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["joined"]["drafts"], 1)
        idea.refresh_from_db(), phone_user.refresh_from_db(), main.refresh_from_db()
        self.assertEqual((idea.innovator, phone_user.is_active, phone_user.phone_number, main.phone_number), (main, False, "", PHONE))
        self.assertEqual(AuditLog.objects.filter(action_type="accounts_joined").count(), 2)
        self.assertEqual(find_user_by_phone(PHONE), main)

    def test_dry_run_changes_nothing(self):
        phone_user, main = self.whatsapp_account(), self.web_account()
        idea = self.draft(innovator=phone_user)
        plan = join_accounts(phone_user, main, actor=main, dry_run=True)
        self.assertEqual((plan.allowed, plan.moves["drafts"]), (True, 1))
        idea.refresh_from_db(), phone_user.refresh_from_db()
        self.assertEqual((idea.innovator, phone_user.is_active), (phone_user, True))

    def test_refused_for_email_password_role_or_web_sign_in(self):
        main = self.web_account()
        cases = {}
        cases["email"] = self.web_account(email="b@example.com", signed_in=False)
        cases["password"] = User.objects.create_user(email=None, password="StrongPass123", phone_number="+26771000001")
        RoleService.assign_roles(cases["password"], [RoleType.INNOVATOR])
        cases["role"] = self.whatsapp_account("+26771000002")
        RoleService.assign_roles(cases["role"], [RoleType.JUDGE])
        cases["web"] = self.whatsapp_account("+26771000003")
        User.objects.filter(pk=cases["web"].pk).update(last_login=timezone.now())
        cases["web"].refresh_from_db()
        for name, other in cases.items():
            self.assertTrue(join_refusal(other, main), name)
            self.assertFalse(join_accounts(other, main, actor=main).allowed, name)
            other.refresh_from_db()
            self.assertTrue(other.is_active, name)

    def test_verified_number_of_a_real_account_is_refused(self):
        self.web_account(email="owner@example.com", phone=PHONE, verified=True)
        other = self.web_account(email="someone@example.com")
        self.client.force_authenticate(other)
        with patch("apps.accounts.otp_services.OTPService.check_code_or_raise") as check:
            response = self.client.post("/api/auth/me/phone/verify/", {"phone": PHONE, "code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn(OTHER_ACCOUNT, response.content.decode())
        check.assert_not_called()


class MigrationTests(Base):
    def test_normalises_claims_reports_and_can_reverse(self):
        module = importlib.import_module("apps.accounts.migrations.0017_one_account_per_phone")
        user = self.web_account(phone="73000280", verified=True)
        draft = self.draft(phone="26773000280")
        first = self.web_account(email="d1@example.com", phone="71000009")
        second = self.web_account(email="d2@example.com", phone="+26771000009")
        module.forwards(django_apps, None)
        user.refresh_from_db(), draft.refresh_from_db(), first.refresh_from_db(), second.refresh_from_db()
        self.assertEqual((user.phone_number, draft.guest_phone, draft.innovator), (PHONE, PHONE, user))
        self.assertTrue(first.is_active and second.is_active)
        report = AuditLog.objects.get(action_type="phone_duplicate_found")
        self.assertNotIn("71000009", json.dumps(report.metadata))
        self.assertEqual(set(report.metadata["accounts"]), {str(first.id), str(second.id)})
        operation = module.Migration.operations[0]
        self.assertTrue(operation.reversible)

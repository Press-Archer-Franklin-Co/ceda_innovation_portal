from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.communications.models import CommunicationLog
from apps.communications.senders import LocMemMessageSender
from apps.communications.services import CommunicationService
from apps.core.constants import CommunicationChannel, CommunicationStatus


@override_settings(MESSAGE_SENDERS={"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""})
class TextChannelDispatchTests(TestCase):
    def setUp(self):
        LocMemMessageSender.outbox = []
        self.user = User.objects.create_user(email="sms@example.com", password="StrongPass123!", first_name="S", last_name="M", phone_number="71234567")

    def _dispatch(self, channel):
        log = CommunicationService.log_communication(recipient=self.user, channel=channel, body="Hello")
        return CommunicationService.dispatch_log(str(log.id))

    def test_sms_goes_through_configured_sender(self):
        log = self._dispatch(CommunicationChannel.SMS)
        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(LocMemMessageSender.outbox[0].to, "+26771234567")

    def test_whatsapp_and_ussd_without_provider_are_skipped(self):
        for channel in (CommunicationChannel.WHATSAPP, CommunicationChannel.USSD):
            log = self._dispatch(channel)
            self.assertEqual(log.status, CommunicationStatus.SKIPPED)
            self.assertIn("provider", log.failure_reason)
        self.assertEqual(LocMemMessageSender.outbox, [])

    def test_recipient_without_phone_is_skipped(self):
        self.user.phone_number = ""
        self.user.save()
        log = self._dispatch(CommunicationChannel.SMS)
        self.assertEqual(log.status, CommunicationStatus.SKIPPED)

    def test_internal_channel_unchanged(self):
        log = self._dispatch(CommunicationChannel.INTERNAL)
        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(CommunicationLog.objects.count(), 1)

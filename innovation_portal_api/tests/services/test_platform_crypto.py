from io import StringIO

from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings

from apps.platform_config.crypto import decrypt_secrets, encrypt_secrets
from apps.platform_config.models import IntegrationConnection

OLD_KEY = Fernet.generate_key().decode()
NEW_KEY = Fernet.generate_key().decode()


class CryptoTests(SimpleTestCase):
    @override_settings(CONFIG_ENCRYPTION_KEYS=[OLD_KEY])
    def test_round_trip_and_ciphertext_hides_value(self):
        token = encrypt_secrets({"api_key": "super-secret-value"})
        self.assertNotIn("super-secret-value", token)
        self.assertEqual(decrypt_secrets(token), {"api_key": "super-secret-value"})

    @override_settings(CONFIG_ENCRYPTION_KEYS=[], CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY=False)
    def test_missing_key_is_refused_when_derivation_not_allowed(self):
        with self.assertRaises(ImproperlyConfigured):
            encrypt_secrets({"a": "b"})

    @override_settings(CONFIG_ENCRYPTION_KEYS=["not-a-fernet-key"])
    def test_invalid_key_is_refused(self):
        with self.assertRaises(ImproperlyConfigured):
            encrypt_secrets({"a": "b"})


class KeyRotationTests(TestCase):
    def test_rotate_command_re_encrypts_with_newest_key(self):
        with override_settings(CONFIG_ENCRYPTION_KEYS=[OLD_KEY]):
            connection = IntegrationConnection.objects.create(
                kind="sms", provider="log_only", name="x", secrets_encrypted=encrypt_secrets({"webhook_secret": "s3cret-value"})
            )
        with override_settings(CONFIG_ENCRYPTION_KEYS=[NEW_KEY, OLD_KEY]):
            call_command("rotate_config_encryption", stdout=StringIO())
        connection.refresh_from_db()
        with override_settings(CONFIG_ENCRYPTION_KEYS=[NEW_KEY]):
            self.assertEqual(decrypt_secrets(connection.secrets_encrypted), {"webhook_secret": "s3cret-value"})

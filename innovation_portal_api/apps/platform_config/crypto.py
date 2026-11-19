"""Encryption at rest for integration secrets.

Keys come from ``INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY``: one Fernet key, or a comma
separated list with the newest first. New data is always encrypted with the first key;
any listed key can decrypt. ``manage.py rotate_config_encryption`` re-encrypts all
secrets with the newest key, after which old keys can be removed.

Production refuses to start without a key. Local development and tests may derive a
key from SECRET_KEY (``CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY = True``).
"""

from __future__ import annotations

import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


class SecretDecryptionError(Exception):
    pass


def configured_keys() -> list[str]:
    keys = getattr(settings, "CONFIG_ENCRYPTION_KEYS", None) or []
    if isinstance(keys, str):
        keys = keys.split(",")
    return [key.strip() for key in keys if key and key.strip()]


def _derived_key() -> str:
    digest = hashlib.sha256(f"platform-config:{settings.SECRET_KEY}".encode()).digest()
    return base64.urlsafe_b64encode(digest).decode()


def get_fernet() -> MultiFernet:
    keys = configured_keys()
    if not keys:
        if not getattr(settings, "CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY", False):
            raise ImproperlyConfigured("INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY is not set.")
        keys = [_derived_key()]
    try:
        return MultiFernet([Fernet(key.encode()) for key in keys])
    except (ValueError, TypeError) as exc:
        raise ImproperlyConfigured("INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY is not a valid Fernet key.") from exc


def encrypt_secrets(values: dict) -> str:
    if not values:
        return ""
    return get_fernet().encrypt(json.dumps(values, sort_keys=True).encode()).decode()


def decrypt_secrets(token: str) -> dict:
    if not token:
        return {}
    try:
        return json.loads(get_fernet().decrypt(token.encode()).decode())
    except InvalidToken as exc:
        raise SecretDecryptionError("Saved secrets could not be decrypted with the configured keys.") from exc


def rotate_token(token: str) -> str:
    if not token:
        return token
    try:
        return get_fernet().rotate(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretDecryptionError("Saved secrets could not be decrypted with the configured keys.") from exc

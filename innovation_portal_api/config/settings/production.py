from .base import *  # noqa
from . import base as base_settings

DEBUG = False
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
if env.bool(base_settings._prefixed_name("SECURE_PROXY_SSL_HEADER_ENABLED"), default=True):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Integration secrets saved in Platform settings are encrypted with this key. Refuse to
# start without a valid one rather than store secrets we cannot protect.
from django.core.exceptions import ImproperlyConfigured  # noqa: E402

CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY = False
if not CONFIG_ENCRYPTION_KEYS:  # noqa: F405
    raise ImproperlyConfigured("INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY must be set in production.")
try:
    from cryptography.fernet import Fernet as _Fernet

    for _key in CONFIG_ENCRYPTION_KEYS:  # noqa: F405
        _Fernet(_key.encode())
except (ValueError, TypeError) as _exc:
    raise ImproperlyConfigured("INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY contains an invalid Fernet key.") from _exc

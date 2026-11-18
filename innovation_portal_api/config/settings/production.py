from .base import *  # noqa
from . import base as base_settings

DEBUG = False
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
if env.bool(base_settings._prefixed_name("SECURE_PROXY_SSL_HEADER_ENABLED"), default=True):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

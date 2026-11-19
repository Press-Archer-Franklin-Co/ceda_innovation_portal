from .base import *  # noqa

DEBUG = True

# Local development and tests may encrypt integration secrets with a key derived from SECRET_KEY.
CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY = True

# Write SMS (sign-in codes etc.) to the log during local development.
MESSAGE_SENDERS = {**MESSAGE_SENDERS, "sms": MESSAGE_SENDERS.get("sms") or "apps.communications.senders.ConsoleMessageSender"}  # noqa: F405

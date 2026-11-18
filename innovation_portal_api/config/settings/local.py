from .base import *  # noqa

DEBUG = True

# Write SMS (sign-in codes etc.) to the log during local development.
MESSAGE_SENDERS = {**MESSAGE_SENDERS, "sms": MESSAGE_SENDERS.get("sms") or "apps.communications.senders.ConsoleMessageSender"}  # noqa: F405

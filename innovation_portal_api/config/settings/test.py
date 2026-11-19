"""Settings for the test suite (pytest). Run the server with config.settings.local."""
from .local import *  # noqa: F401,F403

# Argon2 takes ~100 ms per password; tests create users in almost every setUp.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

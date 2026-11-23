import os
from pathlib import Path

import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, []),
    CORS_ALLOW_CREDENTIALS=(bool, True),
    CSRF_TRUSTED_ORIGINS=(list, []),
    SESSION_COOKIE_SECURE=(bool, True),
    CSRF_COOKIE_SECURE=(bool, True),
    SECURE_PROXY_SSL_HEADER_ENABLED=(bool, True),
    ADMIN_EMAIL=(str, ""),
    ADMIN_PASSWORD=(str, ""),
    ADMIN_FIRST_NAME=(str, "Portal"),
    ADMIN_LAST_NAME=(str, "Admin"),
    ACCESS_TOKEN_LIFETIME_MINUTES=(int, 30),
    REFRESH_TOKEN_LIFETIME_DAYS=(int, 7),
    GOOGLE_CLIENT_ID=(str, ""),
    GOOGLE_CLIENT_SECRET=(str, ""),
    GOOGLE_REDIRECT_URI=(str, ""),
    GOOGLE_OAUTH_CLIENT_ID=(str, ""),
    GOOGLE_OAUTH_CLIENT_SECRET=(str, ""),
    GOOGLE_OAUTH_REDIRECT_URI=(str, ""),
    GITHUB_CLIENT_ID=(str, ""),
    GITHUB_CLIENT_SECRET=(str, ""),
    GITHUB_REDIRECT_URI=(str, ""),
    GITHUB_OAUTH_CLIENT_ID=(str, ""),
    GITHUB_OAUTH_CLIENT_SECRET=(str, ""),
    GITHUB_OAUTH_REDIRECT_URI=(str, ""),
    MICROSOFT_CLIENT_ID=(str, ""),
    MICROSOFT_CLIENT_SECRET=(str, ""),
    MICROSOFT_REDIRECT_URI=(str, ""),
    MICROSOFT_OAUTH_CLIENT_ID=(str, ""),
    MICROSOFT_OAUTH_CLIENT_SECRET=(str, ""),
    MICROSOFT_OAUTH_REDIRECT_URI=(str, ""),
    MICROSOFT_OAUTH_TENANT_ID=(str, "common"),
    SECURITY_POLICY_STAFF_REQUIRE_PASSWORD_FALLBACK=(bool, True),
    SECURITY_POLICY_STAFF_REQUIRE_TWO_RECOVERY_METHODS=(bool, True),
    SECURITY_POLICY_STAFF_REQUIRE_VERIFIED_EMAIL=(bool, True),
    SECURITY_POLICY_WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK=(bool, False),
    SECURITY_POLICY_LEVEL_HIGH_THRESHOLD=(int, 4),
    SECURITY_POLICY_LEVEL_MEDIUM_THRESHOLD=(int, 2),
    DEFAULT_LOGIN_EMAIL_DOMAIN=(str, "ceda.co.bw"),
)
environ.Env.read_env(BASE_DIR / ".env")


def _prefixed_name(name: str) -> str:
    value = os.getenv(name)
    if value not in (None, ""):
        return name
    prefixed_name = f"INNOVATION_PORTAL_{name}"
    prefixed_value = os.getenv(prefixed_name)
    if prefixed_value not in (None, ""):
        return prefixed_name
    return name


def _database_url() -> str:
    from urllib.parse import urlparse
    _partial_parsed = None
    for name in ("DATABASE_URL", "INNOVATION_PORTAL_DATABASE_URL"):
        value = os.getenv(name)
        if value not in (None, ""):
            try:
                parsed = urlparse(value)
                if parsed.username and parsed.path and parsed.path.lstrip("/"):
                    return value
                if _partial_parsed is None:
                    _partial_parsed = parsed
            except Exception:
                pass

    user = os.getenv("INNOVATION_PORTAL_POSTGRES_USER") or "innovation"
    password = os.getenv("INNOVATION_PORTAL_POSTGRES_PASSWORD") or "innovation"
    database = os.getenv("INNOVATION_PORTAL_POSTGRES_DB") or "innovation_portal"
    host = (
        os.getenv("INNOVATION_PORTAL_POSTGRES_HOST")
        or (_partial_parsed.hostname if _partial_parsed else None)
        or "localhost"
    )
    port = (
        os.getenv("INNOVATION_PORTAL_POSTGRES_PORT")
        or (str(_partial_parsed.port) if _partial_parsed and _partial_parsed.port else None)
        or "5432"
    )
    return f"postgres://{user}:{password}@{host}:{port}/{database}"

SECRET_KEY = env(_prefixed_name("SECRET_KEY"), default="unsafe-dev-secret-key")
DEBUG = env("DEBUG")
_allowed_hosts_raw = env(_prefixed_name("ALLOWED_HOSTS"))
if isinstance(_allowed_hosts_raw, str):
    ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts_raw.split(",") if h.strip()]
else:
    ALLOWED_HOSTS = _allowed_hosts_raw

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "django_filters",
    "apps.core",
    "apps.accounts",
    "apps.profiles",
    "apps.organizations",
    "apps.teams",
    "apps.programs",
    "apps.submissions",
    "apps.documents",
    "apps.tracking",
    "apps.workflow",
    "apps.screening",
    "apps.assignments",
    "apps.evaluation",
    "apps.communications",
    "apps.notifications",
    "apps.events",
    "apps.capability",
    "apps.reports",
    "apps.operations",
    "apps.analytics",
    "apps.audit",
    "apps.support",
    "apps.content",
    "apps.reference",
    "apps.media_library",
    "apps.platform_config",
    "apps.assistant",
    "apps.channels",
    "apps.conversations",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.audit.refusals.RefusalRecordingMiddleware",
    "apps.accounts.sessions.CurrentRequestMiddleware",
]

# S1: refusals are logged to "security.authorization" (ceda-security section 5).
# A logger without a handler drops everything, so it gets its own console handler.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "security.authorization": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # C3: AI helper outcomes (no key, no text sent), so admins can see why it hid itself.
        "apps.assistant": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # C2: refused USSD and WhatsApp webhooks (security.webhook_rejected).
        "security.webhook": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # C2 prompt 10: one line per WhatsApp message and per failed send. No bodies, no full numbers.
        "apps.channels.whatsapp": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

DATABASES = {
    "default": env.db(
        _prefixed_name("DATABASE_URL"),
        default="postgres://innovation:innovation@localhost:5432/innovation_portal",
    )
}
DATABASES["default"] = env.db_url_config(_database_url())
DATABASES["default"]["CONN_MAX_AGE"] = env.int(_prefixed_name("DB_CONN_MAX_AGE"), default=60)

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Gaborone"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.api.custom_exception_handler",
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        "user": "120/minute",
        "ip_public": "20/minute",
        "auth": "5/minute",
        "platform_admin": "60/minute",
        "platform_test": "10/minute",
        "draft_quick_start": "10/hour",
        "similar_ideas": "30/minute",
        "form_published": "60/minute",
        "content_public": "120/minute",
        "subscribe": "10/hour",
        "subscription_link": "60/hour",
        "challenges_public": "120/minute",
        "assistant": "20/minute",
        "assistant_guest": "10/minute",
        "chat_typing": "30/minute",
        "help_chat": "20/hour",
    },
}

# Guest quick start (B2): how long the resume token kept by the browser is valid,
# and which version of the consent text the submit screen shows.
DRAFT_RESUME_TOKEN_MAX_AGE = int(os.getenv("INNOVATION_PORTAL_DRAFT_RESUME_TOKEN_MAX_AGE", str(30 * 24 * 3600)))
# U7: test accounts on the sign-in page. Only for demo servers; never set in production.
# Needs the "demo_logins" switch in Platform settings too (apps.accounts.demo_logins).
DEMO_LOGINS = os.getenv("INNOVATION_PORTAL_DEMO_LOGINS", "False").strip().lower() in ("1", "true", "yes", "on")
ACCOUNT_TERMS_VERSION = os.getenv("INNOVATION_PORTAL_ACCOUNT_TERMS_VERSION", "2026-11")
IDEA_SUBMISSION_CONSENT_VERSION = os.getenv("INNOVATION_PORTAL_IDEA_SUBMISSION_CONSENT_VERSION", "2026-11")
# Sign-in codes (R-4): seconds the screen waits before offering "Resend code".
LOGIN_CODE_RESEND_AFTER_SECONDS = int(os.getenv("INNOVATION_PORTAL_LOGIN_CODE_RESEND_AFTER_SECONDS", "60"))
# B7: the target for average days from submission to decision on the dashboard.
ANALYTICS_DECISION_TARGET_DAYS = int(os.getenv("INNOVATION_PORTAL_ANALYTICS_DECISION_TARGET_DAYS", "10"))

# Form builder (B4): dotted path to a class with translate(texts, source=, target=) for
# Setswana suggestions. Empty means suggestions are off (the endpoint answers 501).
FORM_TRANSLATION_PROVIDER = os.getenv("INNOVATION_PORTAL_FORM_TRANSLATION_PROVIDER", "")


from datetime import timedelta

SIMPLE_JWT = {
    "AUTH_HEADER_TYPES": ("Bearer",),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env("ACCESS_TOKEN_LIFETIME_MINUTES")),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env("REFRESH_TOKEN_LIFETIME_DAYS")),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CEDA Innovation Portal API",
    "DESCRIPTION": "Workflow-driven innovation management platform for ideas and hackathons.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# All email goes through the active Email connection in the staff console (3.27); no mail settings in the environment.
EMAIL_BACKEND = "apps.platform_config.email_backend.PlatformEmailBackend"
DEFAULT_FROM_EMAIL = "noreply@ceda-innovation.local"  # replaced by the connection's from address when sending
SYSTEM_EMAIL = ""
SERVER_EMAIL = DEFAULT_FROM_EMAIL

PUBLIC_BASE_URL = env(
    _prefixed_name("PUBLIC_BASE_URL"),
    default=f"http://{os.getenv('INNOVATION_PORTAL_SERVER_HOST', 'localhost')}:{os.getenv('INNOVATION_PORTAL_PUBLIC_PORT', '18180')}",
)
STAFF_BASE_URL = env(
    _prefixed_name("STAFF_BASE_URL"),
    default=f"http://{os.getenv('INNOVATION_PORTAL_SERVER_HOST', 'localhost')}:{os.getenv('INNOVATION_PORTAL_STAFF_PORT', '18181')}/staff",
)

DOCUMENT_X_ACCEL_REDIRECT_PREFIX = env(_prefixed_name("DOCUMENT_X_ACCEL_REDIRECT_PREFIX"), default="")

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_ALWAYS_EAGER = env.bool(_prefixed_name("CELERY_TASK_ALWAYS_EAGER"), default=False)
CELERY_BEAT_SCHEDULE = {
    "judge-reminders": {
        "task": "apps.notifications.tasks.send_pending_judge_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
    "operational-reminders": {
        "task": "apps.notifications.tasks.send_operational_reminders",
        "schedule": crontab(hour=9, minute=0),
    },
    "process-due-timed-review-cycles": {
        "task": "apps.evaluation.tasks.process_due_timed_review_cycles",
        "schedule": crontab(minute="*/5"),
        "options": {"expires": 240},
    },
    "process-challenge-judging": {
        "task": "apps.programs.tasks.process_challenge_judging",
        "schedule": crontab(minute="*/5"),
        "options": {"expires": 240},
    },
    "announce-due-challenge-results": {
        "task": "apps.programs.tasks.announce_due_challenge_results",
        "schedule": crontab(minute="*/5"),
        "options": {"expires": 240},
    },
    "publish-due-content": {
        "task": "apps.content.tasks.publish_due_content",
        "schedule": crontab(minute="*/5"),
        "options": {"expires": 240},
    },
    "escalate-unanswered-chats": {
        "task": "apps.conversations.tasks.escalate_unanswered_chats",
        "schedule": crontab(minute="*"),
        "options": {"expires": 50},
    },
    "daily-summaries": {
        "task": "apps.notifications.tasks.send_daily_summaries",
        "schedule": crontab(hour=7, minute=30),
    },
    "question-reminders": {
        "task": "apps.notifications.tasks.send_question_reminders",
        "schedule": crontab(hour=7, minute=30),
    },
    "purge-expired-tokens": {
        "task": "apps.notifications.tasks.purge_expired_tokens",
        "schedule": crontab(hour=2, minute=30),
    },
}

def _env_list(key: str) -> list:
    raw = env(key)
    if isinstance(raw, str):
        return [v.strip() for v in raw.split(",") if v.strip()]
    return raw or []

CORS_ALLOWED_ORIGINS = _env_list(_prefixed_name("CORS_ALLOWED_ORIGINS"))
CORS_ALLOW_CREDENTIALS = env.bool("CORS_ALLOW_CREDENTIALS", default=True)
# Both frontends send X-CEDA-Client (S1); a cross-origin set-up must allow it in the preflight.
from corsheaders.defaults import default_headers  # noqa: E402

CORS_ALLOW_HEADERS = (*default_headers, "x-ceda-client")
CSRF_TRUSTED_ORIGINS = _env_list(_prefixed_name("CSRF_TRUSTED_ORIGINS"))

FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 200 * 1024 * 1024

SESSION_COOKIE_SECURE = env.bool(_prefixed_name("SESSION_COOKIE_SECURE"), default=True)
CSRF_COOKIE_SECURE = env.bool(_prefixed_name("CSRF_COOKIE_SECURE"), default=True)

ADMIN_EMAIL = env(_prefixed_name("ADMIN_EMAIL"), default="")
ADMIN_PASSWORD = env(_prefixed_name("ADMIN_PASSWORD"), default="")
ADMIN_FIRST_NAME = env(_prefixed_name("ADMIN_FIRST_NAME"), default="Portal")
ADMIN_LAST_NAME = env(_prefixed_name("ADMIN_LAST_NAME"), default="Admin")

GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID") or env("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET") or env("GOOGLE_OAUTH_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI") or env("GOOGLE_OAUTH_REDIRECT_URI")

GITHUB_CLIENT_ID = env("GITHUB_CLIENT_ID") or env("GITHUB_OAUTH_CLIENT_ID")
GITHUB_CLIENT_SECRET = env("GITHUB_CLIENT_SECRET") or env("GITHUB_OAUTH_CLIENT_SECRET")
GITHUB_REDIRECT_URI = env("GITHUB_REDIRECT_URI") or env("GITHUB_OAUTH_REDIRECT_URI")

MICROSOFT_CLIENT_ID = env("MICROSOFT_CLIENT_ID") or env("MICROSOFT_OAUTH_CLIENT_ID")
MICROSOFT_CLIENT_SECRET = env("MICROSOFT_CLIENT_SECRET") or env("MICROSOFT_OAUTH_CLIENT_SECRET")
MICROSOFT_REDIRECT_URI = env("MICROSOFT_REDIRECT_URI") or env("MICROSOFT_OAUTH_REDIRECT_URI")
MICROSOFT_OAUTH_TENANT_ID = env("MICROSOFT_OAUTH_TENANT_ID")

DEFAULT_LOGIN_EMAIL_DOMAIN = env("DEFAULT_LOGIN_EMAIL_DOMAIN", default="ceda.co.bw")

# --- CEDA staff single sign-on (any OIDC provider, e.g. Microsoft Entra ID) ---------------
# Disabled until client id, secret, redirect URI and discovery URL are all set.
# Staff access is given only when the email domain or a group matches the allow lists.
CEDA_SSO_CLIENT_ID = env(_prefixed_name("CEDA_SSO_CLIENT_ID"), default="")
CEDA_SSO_CLIENT_SECRET = env(_prefixed_name("CEDA_SSO_CLIENT_SECRET"), default="")
CEDA_SSO_REDIRECT_URI = env(_prefixed_name("CEDA_SSO_REDIRECT_URI"), default="")
CEDA_SSO_DISCOVERY_URL = env(_prefixed_name("CEDA_SSO_DISCOVERY_URL"), default="")
CEDA_SSO_ISSUER = env(_prefixed_name("CEDA_SSO_ISSUER"), default="")
CEDA_SSO_SCOPES = env(_prefixed_name("CEDA_SSO_SCOPES"), default="openid email profile")
def _csv_env(name: str) -> list[str]:
    return [item.strip() for item in (os.getenv(_prefixed_name(name)) or "").split(",") if item.strip()]


CEDA_SSO_ALLOWED_DOMAINS = _csv_env("CEDA_SSO_ALLOWED_DOMAINS")
CEDA_SSO_ALLOWED_GROUPS = _csv_env("CEDA_SSO_ALLOWED_GROUPS")
CEDA_SSO_GROUPS_CLAIM = env(_prefixed_name("CEDA_SSO_GROUPS_CLAIM"), default="groups")
CEDA_SSO_DEFAULT_ROLE = env(_prefixed_name("CEDA_SSO_DEFAULT_ROLE"), default="staff_member")

# --- Text message senders (SMS now; WhatsApp and USSD later) ------------------------------
# Dotted path to a sender class per channel. Empty means "no provider": messages on that
# channel are logged and marked skipped. In DEBUG, SMS is written to the log.
MESSAGE_SENDERS = {
    "sms": env(
        _prefixed_name("SMS_SENDER"),
        default="apps.communications.senders.ConsoleMessageSender" if DEBUG else "",
    ),
    "whatsapp": env(_prefixed_name("WHATSAPP_SENDER"), default=""),
    "ussd": env(_prefixed_name("USSD_SENDER"), default=""),
}
# --- Platform settings: encryption of integration secrets ---------------------------------
# One Fernet key, or several separated by commas with the newest first (for rotation).
# Generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
CONFIG_ENCRYPTION_KEYS = _csv_env("CONFIG_ENCRYPTION_KEY")
# Only local development and tests may fall back to a key derived from SECRET_KEY.
CONFIG_ENCRYPTION_ALLOW_DERIVED_KEY = False

# Channel used for sign-in codes sent to a phone: "sms" or "whatsapp".
LOGIN_CODE_PHONE_CHANNEL = env(_prefixed_name("LOGIN_CODE_PHONE_CHANNEL"), default="sms")


ACCOUNT_SECURITY_POLICY = {
    "TRUSTED_PROVIDERS": ["google", "microsoft", "ceda_staff"],
    "STAFF_REQUIRE_PASSWORD_FALLBACK": env.bool("SECURITY_POLICY_STAFF_REQUIRE_PASSWORD_FALLBACK", default=True),
    "STAFF_REQUIRE_TWO_RECOVERY_METHODS": env.bool("SECURITY_POLICY_STAFF_REQUIRE_TWO_RECOVERY_METHODS", default=True),
    "STAFF_REQUIRE_VERIFIED_EMAIL": env.bool("SECURITY_POLICY_STAFF_REQUIRE_VERIFIED_EMAIL", default=True),
    "WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK": env.bool("SECURITY_POLICY_WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK", default=False),
    "LEVEL_THRESHOLDS": {
        "high": env.int("SECURITY_POLICY_LEVEL_HIGH_THRESHOLD", default=4),
        "medium": env.int("SECURITY_POLICY_LEVEL_MEDIUM_THRESHOLD", default=2),
    },
}

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from apps.accounts.managers import UserManager
from apps.core.constants import RoleType
from apps.core.models import TimeStampedModel, UUIDModel


class Role(UUIDModel, TimeStampedModel):
    """A role people can hold. Built-in roles (RoleType) are system roles; administrators can add more (S2)."""

    code = models.CharField(max_length=50, unique=True, help_text="Built-in codes come from RoleType; custom roles get their own.")
    name = models.CharField(max_length=100)
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"name": "...", "description": "..."}}')
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False, help_text="Built-in role: cannot be renamed in code, retired or deleted.")
    is_active = models.BooleanField(default=True, help_text="Retired roles keep their holders but give no capabilities.")

    def __str__(self) -> str:
        return self.name


class RoleCapability(UUIDModel, TimeStampedModel):
    """S2: one ticked box in the Roles & permissions matrix."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="capabilities")
    capability = models.CharField(max_length=60)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["role", "capability"], name="uq_role_capability")]


class User(UUIDModel, TimeStampedModel, AbstractBaseUser, PermissionsMixin):
    class PrimaryAuthMethod(models.TextChoices):
        PASSWORD = "password", "Password"
        GOOGLE = "google", "Google"
        GITHUB = "github", "GitHub"
        MICROSOFT = "microsoft", "Microsoft"
        CEDA_STAFF = "ceda_staff", "CEDA staff sign-in"
        PHONE_CODE = "phone_code", "Phone code"
        EMAIL_CODE = "email_code", "Email code"

    # Nullable so people who sign in with a phone code only can have an account.
    # Still unique when set (PostgreSQL allows many NULLs under a unique index).
    email = models.EmailField(unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=30, blank=True)
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    primary_auth_method = models.CharField(
        max_length=30,
        choices=PrimaryAuthMethod.choices,
        blank=True,
        default="",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    preferred_language = models.CharField(
        max_length=5, choices=(("en", "English"), ("tn", "Setswana")), default="en", help_text="Language for messages to this person."
    )
    # U7: test accounts for demos. They can sign in only while the server allows demo
    # logins (INNOVATION_PORTAL_DEMO_LOGINS); see apps.accounts.demo_logins.
    is_demo_account = models.BooleanField(default=False, db_index=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["last_name"]),
            # Kept on purpose (migration 0008): sorts the staff user list by name.
            models.Index(fields=["first_name", "last_name", "email"], name="user_sort_idx"),
        ]

    def __str__(self) -> str:
        return self.email or self.phone_number or str(self.pk)

    def save(self, *args, **kwargs):
        # Blank emails are stored as NULL so the unique index ignores them.
        if not self.email:
            self.email = None
        super().save(*args, **kwargs)

    @property
    def display_contact(self) -> str:
        return self.email or self.phone_number or ""

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class UserRole(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_roles")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "role")
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user} - {self.role.code}"


User.add_to_class(
    "roles",
    models.ManyToManyField(Role, through=UserRole, related_name="users"),
)


class UserSecurityToken(UUIDModel, TimeStampedModel):
    PURPOSE_PASSWORD_RESET = "password_reset"
    PURPOSE_EMAIL_VERIFICATION = "email_verification"
    PURPOSE_CHOICES = (
        (PURPOSE_PASSWORD_RESET, "Password Reset"),
        (PURPOSE_EMAIL_VERIFICATION, "Email Verification"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="security_tokens")
    purpose = models.CharField(max_length=40, choices=PURPOSE_CHOICES)
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose"]), models.Index(fields=["token"])]


class SocialAuthProvider(models.TextChoices):
    GOOGLE = "google", "Google"
    GITHUB = "github", "GitHub"
    MICROSOFT = "microsoft", "Microsoft"
    LINKEDIN = "linkedin", "LinkedIn"
    CEDA_STAFF = "ceda_staff", "CEDA staff sign-in"


class SocialAccount(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_accounts")
    provider = models.CharField(max_length=30, choices=SocialAuthProvider.choices)
    provider_user_id = models.CharField(max_length=255)
    provider_email = models.EmailField(blank=True)
    provider_email_verified = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    extra_data = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_user_id"], name="uq_social_provider_user"),
            models.UniqueConstraint(fields=["user", "provider"], name="uq_user_social_provider"),
        ]
        indexes = [
            models.Index(fields=["provider", "provider_email"]),
            models.Index(fields=["user", "provider"]),
        ]


class SocialAuthState(UUIDModel, TimeStampedModel):
    PURPOSE_LOGIN = "login"
    PURPOSE_LINK = "link"
    PURPOSE_CHOICES = (
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_LINK, "Link"),
    )

    provider = models.CharField(max_length=30, choices=SocialAuthProvider.choices)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_LOGIN)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="social_auth_states")
    state = models.CharField(max_length=120, unique=True, db_index=True)
    nonce = models.CharField(max_length=120, blank=True)
    redirect_uri = models.URLField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["provider", "state"]),
            models.Index(fields=["expires_at"]),
        ]


class UserMFAProfile(UUIDModel, TimeStampedModel):
    class MFAMethod(models.TextChoices):
        EMAIL = "email", "Email OTP"
        TOTP = "totp", "Authenticator App"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mfa_profile")
    is_enabled = models.BooleanField(default=False)
    method = models.CharField(max_length=20, choices=MFAMethod.choices, blank=True, default="")
    totp_secret = models.CharField(max_length=128, blank=True, default="")
    pending_totp_secret = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["user", "is_enabled", "method"])]


class MFAChallenge(UUIDModel, TimeStampedModel):
    class Purpose(models.TextChoices):
        LOGIN = "login", "Login"
        SETUP = "setup", "Setup"
        DISABLE = "disable", "Disable"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mfa_challenges")
    method = models.CharField(max_length=20, choices=UserMFAProfile.MFAMethod.choices)
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.LOGIN)
    auth_method = models.CharField(max_length=30, blank=True, default="")
    code_hash = models.CharField(max_length=128, blank=True, default="")
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "method", "purpose", "expires_at"])]


class LoginCode(UUIDModel, TimeStampedModel):
    """A one-time sign-in code sent to a phone or email address.

    Only a hash of the code is stored. A code is valid for ``expires_at`` and
    ``max_attempts`` wrong guesses, whichever comes first.
    """

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"

    class TargetType(models.TextChoices):
        PHONE = "phone", "Phone"
        EMAIL = "email", "Email"

    target_type = models.CharField(max_length=10, choices=TargetType.choices)
    target = models.CharField(max_length=255, db_index=True)
    channel = models.CharField(max_length=20, choices=Channel.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    used_at = models.DateTimeField(null=True, blank=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="login_codes")
    requested_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["target_type", "target", "used_at"], name="login_code_lookup_idx"),
            models.Index(fields=["expires_at"], name="login_code_expiry_idx"),
        ]


class AuthPolicy(models.Model):
    """U7: how people prove who they are after typing their phone number or email.

    One row (id 1). Read it with AuthPolicy.current(). Changed in the staff console
    (Platform settings) by people with settings.manage.
    """

    class SecondStep(models.TextChoices):
        CODE = "code", "A 6-digit code by WhatsApp, SMS or email"
        PASSWORD = "password", "A password"

    second_step = models.CharField(max_length=20, choices=SecondStep.choices, default=SecondStep.CODE)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def current(cls) -> "AuthPolicy":
        policy, _ = cls.objects.get_or_create(pk=1)
        return policy

    def __str__(self) -> str:
        return f"Second step: {self.second_step}"



class AccountSession(UUIDModel, TimeStampedModel):
    """R-51 (2.9): one place a person is signed in. Every refresh token of a sign-in carries its key ("sid")."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="account_sessions")
    key = models.UUIDField(unique=True, db_index=True)
    device = models.CharField(max_length=120, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-last_seen_at", "-created_at")

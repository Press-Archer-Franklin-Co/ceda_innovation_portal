"""U7: one sign-in for innovators, staff, judges and administrators.

Step 1, POST /api/auth/start/ {identifier}: a Botswana phone number or an email.
The answer says what comes next:
- "sso": the email's domain uses CEDA staff single sign-on; go to ``redirect``.
- "signup": nobody has this phone or email yet; ask for the "One more step" details.
- "code": a 6-digit code was sent (WhatsApp, SMS or email, whichever fits).
- "password": ask for the password.
Which second step is used is the owner's choice: AuthPolicy.second_step ("code" or
"password"). An account without a password always gets a code.

Step 2, POST /api/auth/finish/ {identifier, code | password, next?}: signs in (or
asks for the two-step check if the person switched it on) and says where to go.

Every role goes through the same endpoints, throttles and lockouts.
"""
from __future__ import annotations

from dataclasses import dataclass

from django.core.exceptions import ImproperlyConfigured
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts import demo_logins
from apps.accounts.models import AuthPolicy, LoginCode, User
from apps.audit.services import AuditService
from apps.core.phone import try_normalize_phone

INNOVATOR_HOME = "/home"
STAFF_HOME = "/staff/"
# Paths only staff may be sent to after sign-in.
STAFF_PREFIX = "/staff"



@dataclass(frozen=True)
class Identifier:
    kind: str  # LoginCode.TargetType.PHONE or EMAIL
    value: str  # E.164 phone or lower-case email

    @property
    def is_email(self) -> bool:
        return self.kind == LoginCode.TargetType.EMAIL


def parse_identifier(raw: str) -> Identifier:
    text = (raw or "").strip()
    if "@" in text:
        local, _, domain = text.rpartition("@")
        if local and "." in domain and " " not in text:
            return Identifier(LoginCode.TargetType.EMAIL, text.lower())
    else:
        phone = try_normalize_phone(text)
        if phone:
            return Identifier(LoginCode.TargetType.PHONE, phone)
    raise ValidationError({"identifier": {"code": "invalid_identifier", "detail": "Enter a Botswana phone number or an email address."}})


def find_user(identifier: Identifier) -> User | None:
    from apps.accounts.otp_services import OTPService

    return OTPService.find_user(target_type=identifier.kind, target=identifier.value)


def is_staff(user) -> bool:
    from apps.core.capabilities import capabilities_for

    return bool(capabilities_for(user))


def safe_redirect(user, requested: str | None) -> str:
    """Where to go after sign-in: the requested path if it is local and the person may use it."""
    home = STAFF_HOME if is_staff(user) else INNOVATOR_HOME
    path = (requested or "").strip()
    if not path.startswith("/") or path.startswith("//") or "\\" in path or "\n" in path:
        return home
    if path.startswith(STAFF_PREFIX) and not is_staff(user):
        return home
    if path in ("/sign-in", "/login") or path.startswith(("/sign-in?", "/login?")):
        return home
    return path


def _sso_redirect(identifier: Identifier) -> str | None:
    """The provider's sign-in address when this email's domain uses staff SSO and SSO is working."""
    if not identifier.is_email:
        return None
    domain = identifier.value.rsplit("@", 1)[1]
    try:
        from apps.accounts.identity_providers import IdentityProviderRegistry
        from apps.accounts.social_services import SocialAuthService

        provider = IdentityProviderRegistry.staff_provider()
        domains = {d.strip().lower().lstrip("@") for d in provider.allowed_domains() if d.strip()}
        if domain not in domains:
            return None
        payload = SocialAuthService.begin("ceda_staff")
        return payload.get("authorization_url") or None
    except (APIException, ImproperlyConfigured, ValueError, KeyError):
        # SSO switched off or not set up: fall back to the normal second step.
        return None


def second_step_for(user: User) -> str:
    policy = AuthPolicy.current().second_step
    if policy == AuthPolicy.SecondStep.PASSWORD and user.has_usable_password():
        return AuthPolicy.SecondStep.PASSWORD
    return AuthPolicy.SecondStep.CODE


def send_code(identifier: Identifier, *, ip: str | None) -> dict:
    from apps.accounts.otp_services import OTPService

    OTPService.assert_channel_available(identifier.kind)
    result = OTPService.request_code(target_type=identifier.kind, target=identifier.value, ip=ip)
    return {
        "next": "code",
        "channel": result.channel,
        "sent_to": result.destination_hint,
        "expires_in_seconds": result.expires_in_seconds,
        "resend_after_seconds": result.resend_after_seconds,
    }


def start(raw_identifier: str, *, ip: str | None = None, want_code: bool = False) -> dict:
    identifier = parse_identifier(raw_identifier)
    redirect = _sso_redirect(identifier)
    if redirect:
        return {"next": "sso", "redirect": redirect}
    user = find_user(identifier)
    if user is None:
        return {"next": "signup", "identifier_type": identifier.kind}
    if not user.is_active:
        raise ValidationError({"code": "account_disabled", "detail": "This account is switched off. Contact CEDA."})
    demo_logins.assert_can_sign_in(user)
    # want_code: "Forgot password?" signs in with a one-time code instead.
    if want_code or second_step_for(user) == AuthPolicy.SecondStep.CODE:
        return send_code(identifier, ip=ip)
    return {"next": "password"}


def check_password_for(identifier: Identifier, password: str) -> User:
    user = find_user(identifier)
    if user is None or not user.is_active or not user.has_usable_password():
        # Same work as for a real account, like Django's ModelBackend, so timing does not tell.
        User().set_password(password or "")
        raise ValidationError({"code": "invalid_credentials", "detail": "That password is not right."})
    if not user.check_password(password or ""):
        AuditService.log_action(actor=None, action_type="password_sign_in_failed", target=user, metadata={"identifier_type": identifier.kind})
        raise ValidationError({"code": "invalid_credentials", "detail": "That password is not right."})
    return user


def check_code_for(identifier: Identifier, code: str):
    from apps.accounts.otp_services import OTPService

    return OTPService.verify_code(target_type=identifier.kind, target=identifier.value, code=code)


def signup(*, identifier_raw: str, full_name: str, phone: str = "", email: str = "", language: str = "en",
           consent: bool = False, password: str = "", ip: str | None = None) -> tuple[User, dict]:
    """"One more step" (2.6): make the account for a new phone or email.

    Returns (user, next). With the code step the account is made unverified and a code is
    sent to the identifier the person started with; finishing with that code verifies it.
    With the password step the person chooses a password here and is signed in at once.
    """
    from django.db import transaction

    from apps.accounts.services import RoleService, UserOnboardingService
    from apps.core.constants import RoleType

    identifier = parse_identifier(identifier_raw)
    errors = {}
    name = " ".join((full_name or "").split())
    if len(name) < 2:
        errors["full_name"] = {"code": "required", "detail": "Tell us your full name."}
    phone_value = identifier.value if identifier.kind == LoginCode.TargetType.PHONE else (try_normalize_phone(phone) if phone else "")
    if phone and not phone_value:
        errors["phone"] = {"code": "invalid_phone", "detail": "Enter a Botswana phone number."}
    email_value = identifier.value if identifier.is_email else (email or "").strip().lower()
    if email_value and ("@" not in email_value or "." not in email_value.rsplit("@", 1)[-1]):
        errors["email"] = {"code": "invalid_email", "detail": "Enter a valid email address."}
    if consent is not True:
        errors["consent"] = {"code": "consent_required", "detail": "Please agree to the terms and privacy notice."}
    policy = AuthPolicy.current().second_step
    if policy == AuthPolicy.SecondStep.PASSWORD and len(password or "") < 8:
        errors["password"] = {"code": "password_too_short", "detail": "Choose a password of at least 8 characters."}
    if phone_value and User.objects.filter(phone_number=phone_value).exists():
        errors["phone"] = {"code": "phone_taken", "detail": "This phone number already has an account. Sign in instead."}
    if email_value and User.objects.filter(email__iexact=email_value).exists():
        errors["email"] = {"code": "email_taken", "detail": "This email address already has an account. Sign in instead."}
    if errors:
        raise ValidationError(errors)

    first, _, last = name.partition(" ")
    with transaction.atomic():
        user = User.objects.create_user(
            email=email_value or None,
            password=password if policy == AuthPolicy.SecondStep.PASSWORD else None,
            phone_number=phone_value or "",
            first_name=first,
            last_name=last,
            preferred_language="tn" if language == "tn" else "en",
        )
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        UserOnboardingService.ensure_user_onboarding(user, source="sign_in_signup", default_role_codes=[RoleType.INNOVATOR], metadata={"identifier_type": identifier.kind})
        _record_terms_consent(user, ip)
        AuditService.log_action(actor=user, action_type="account_created", target=user, metadata={"identifier_type": identifier.kind, "second_step": policy})
    if policy == AuthPolicy.SecondStep.PASSWORD:
        return user, {"next": "signed_in"}
    return user, send_code(identifier, ip=ip)


def _record_terms_consent(user, ip: str | None) -> None:
    from django.conf import settings
    from django.utils import timezone

    from apps.submissions.models import ConsentRecord

    ConsentRecord.objects.create(
        purpose="account_terms",
        text_version=getattr(settings, "ACCOUNT_TERMS_VERSION", "2026-11"),
        given_at=timezone.now(),
        ip_address=ip,
        user=user,
    )


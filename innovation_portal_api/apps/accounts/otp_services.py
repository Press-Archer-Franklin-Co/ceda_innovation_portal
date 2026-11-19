"""Password-less sign-in with a one-time code sent to a phone or email address.

Flow:
1. ``request_code`` creates a 6-digit code (valid 10 minutes, 5 tries) and sends it.
   The caller gets the same answer whether or not an account exists.
2. ``verify_code`` checks the code. An existing account is signed in; otherwise a new
   innovator account is created for that phone or email.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import secrets
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import LoginCode, User
from apps.audit.services import AuditService
from apps.core.phone import mask_phone

logger = logging.getLogger(__name__)


@dataclass
class LoginCodeRequestResult:
    target_type: str
    channel: str
    destination_hint: str
    expires_in_seconds: int
    resend_after_seconds: int = 60


@dataclass
class LoginCodeVerifyResult:
    user: User
    created: bool
    auth_method: str


class _VerifyOutcome:
    OK = "ok"
    EXPIRED = "expired"
    INVALID = "invalid"
    LOCKED = "locked"


class LoginCodeDelivery:
    """Sends a code over the right channel. Email uses the email service; phone
    channels go through the pluggable message senders (SMS now, WhatsApp later)."""

    @staticmethod
    def message_body(code: str) -> str:
        minutes = OTPService.LIFETIME_MINUTES
        return f"Your CEDA Innovation Portal code is {code}. It expires in {minutes} minutes. Do not share it with anyone."

    @staticmethod
    def send(*, channel: str, target: str, code: str, user=None) -> bool:
        if channel == LoginCode.Channel.EMAIL:
            from apps.communications.email_notifications import EmailNotificationService

            EmailNotificationService.send_login_code_email(to_email=target, code=code)
            return True
        from apps.communications.services import CommunicationService

        # The log keeps "sign-in code" only, never the code itself.
        _, result = CommunicationService.record_text_message(
            channel=channel,
            to=target,
            body_for_log="sign-in code",
            subject="Sign-in code",
            recipient=user,
            real_body=LoginCodeDelivery.message_body(code),
        )
        return result.sent


class OTPService:
    CODE_LENGTH = 6
    LIFETIME_MINUTES = 10
    MAX_ATTEMPTS = 5
    MAX_CODES_PER_TARGET_PER_HOUR = 5

    # ---- helpers -------------------------------------------------------------

    @staticmethod
    def _generate_code() -> str:
        return f"{secrets.randbelow(10 ** OTPService.CODE_LENGTH):0{OTPService.CODE_LENGTH}d}"

    @staticmethod
    def _hash_code(code: str) -> str:
        # Keyed hash: a leaked table of 6-digit code hashes cannot be reversed offline.
        return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()

    @staticmethod
    def _clean_ip(ip: str | None) -> str | None:
        if not ip:
            return None
        try:
            return str(ipaddress.ip_address(ip.strip()))
        except ValueError:
            return None

    @staticmethod
    def _phone_channel() -> str:
        channel = getattr(settings, "LOGIN_CODE_PHONE_CHANNEL", LoginCode.Channel.SMS) or LoginCode.Channel.SMS
        return channel if channel in {LoginCode.Channel.SMS, LoginCode.Channel.WHATSAPP} else LoginCode.Channel.SMS

    @staticmethod
    def codes_per_target_per_hour(target_type: str) -> int:
        """The per-number limit can be set on the active SMS connection."""
        if target_type == LoginCode.TargetType.PHONE:
            try:
                from apps.platform_config.selectors import IntegrationRuntimeSelector

                connection = IntegrationRuntimeSelector.active_connection("sms")
            except Exception:
                connection = None
            configured = (connection.config or {}).get("codes_per_number_per_hour") if connection else None
            if isinstance(configured, (int, float)) and configured > 0:
                return int(configured)
        return OTPService.MAX_CODES_PER_TARGET_PER_HOUR

    @staticmethod
    def assert_channel_available(target_type: str) -> None:
        """Codes by phone need SMS (or WhatsApp) switched on as well as code sign-in."""
        from apps.platform_config.flags import require_feature

        require_feature("code_sign_in")
        if target_type == LoginCode.TargetType.PHONE:
            channel = OTPService._phone_channel()
            require_feature("whatsapp_messages" if channel == LoginCode.Channel.WHATSAPP else "sms_messages")

    @staticmethod
    def _hint(target_type: str, target: str) -> str:
        if target_type == LoginCode.TargetType.PHONE:
            return mask_phone(target)
        from apps.accounts.mfa_services import MFAService

        return MFAService._mask_email(target)

    @staticmethod
    def find_user(*, target_type: str, target: str) -> User | None:
        if target_type == LoginCode.TargetType.EMAIL:
            return User.objects.filter(email__iexact=target).first()
        matches = list(User.objects.filter(phone_number=target).order_by("-phone_verified", "-last_login", "created_at")[:2])
        if not matches:
            return None
        if len(matches) > 1 and matches[0].phone_verified == matches[1].phone_verified:
            raise ValidationError(
                {
                    "code": "otp_ambiguous_account",
                    "detail": "More than one account uses this phone number. Sign in with your email address instead.",
                }
            )
        return matches[0]

    # ---- request -------------------------------------------------------------

    @staticmethod
    def request_code(*, target_type: str, target: str, ip: str | None = None) -> LoginCodeRequestResult:
        channel = LoginCode.Channel.EMAIL if target_type == LoginCode.TargetType.EMAIL else OTPService._phone_channel()
        result = LoginCodeRequestResult(
            target_type=target_type,
            channel=channel,
            destination_hint=OTPService._hint(target_type, target),
            expires_in_seconds=OTPService.LIFETIME_MINUTES * 60,
            resend_after_seconds=int(getattr(settings, "LOGIN_CODE_RESEND_AFTER_SECONDS", 60)),
        )
        now = timezone.now()
        window = LoginCode.objects.filter(
            target_type=target_type,
            target=target,
            created_at__gte=now - timezone.timedelta(hours=1),
        )
        recent = window.count()
        if recent >= OTPService.codes_per_target_per_hour(target_type):
            # Tell the screen when the hourly limit frees a slot (depends only on the target, not on any account).
            oldest = window.order_by("created_at").values_list("created_at", flat=True).first()
            if oldest:
                wait = int((oldest + timezone.timedelta(hours=1) - now).total_seconds()) + 1
                result.resend_after_seconds = max(result.resend_after_seconds, wait)
            # Same answer as a normal request so this cannot be used to probe accounts.
            AuditService.log_raw_action(
                actor=None,
                action_type="login_code_rate_limited",
                target_model="LoginCode",
                target_id=target,
                metadata={"target_type": target_type, "recent_codes": recent},
            )
            return result

        try:
            user = OTPService.find_user(target_type=target_type, target=target)
        except ValidationError:
            user = None
        code = OTPService._generate_code()
        with transaction.atomic():
            # Only the newest code for a target is usable.
            LoginCode.objects.filter(target_type=target_type, target=target, used_at__isnull=True).update(used_at=now, updated_at=now)
            login_code = LoginCode.objects.create(
                target_type=target_type,
                target=target,
                channel=channel,
                code_hash=OTPService._hash_code(code),
                expires_at=now + timezone.timedelta(minutes=OTPService.LIFETIME_MINUTES),
                max_attempts=OTPService.MAX_ATTEMPTS,
                user=user,
                requested_ip=OTPService._clean_ip(ip),
            )
        try:
            delivered = LoginCodeDelivery.send(channel=channel, target=target, code=code, user=user)
        except Exception:
            logger.exception("Could not send login code", extra={"login_code_id": str(login_code.id), "channel": channel})
            delivered = False
        AuditService.log_raw_action(
            actor=user,
            action_type="login_code_requested",
            target_model="LoginCode",
            target_id=str(login_code.id),
            metadata={"target_type": target_type, "channel": channel, "delivered": delivered, "existing_user": bool(user)},
        )
        return result

    # ---- verify --------------------------------------------------------------

    @staticmethod
    def _check_code(*, target_type: str, target: str, code: str) -> tuple[str, LoginCode | None]:
        """Check the code and record the attempt. Runs in its own transaction so the
        attempt counter is saved even though the caller then raises an error."""
        now = timezone.now()
        with transaction.atomic():
            login_code = (
                LoginCode.objects.select_for_update()
                .filter(target_type=target_type, target=target, used_at__isnull=True)
                .order_by("-created_at")
                .first()
            )
            if not login_code or login_code.expires_at <= now:
                return _VerifyOutcome.EXPIRED, login_code
            if login_code.attempts >= login_code.max_attempts:
                login_code.used_at = now
                login_code.save(update_fields=["used_at", "updated_at"])
                return _VerifyOutcome.LOCKED, login_code
            if not hmac.compare_digest(OTPService._hash_code(code), login_code.code_hash):
                login_code.attempts += 1
                fields = ["attempts", "updated_at"]
                if login_code.attempts >= login_code.max_attempts:
                    login_code.used_at = now
                    fields.append("used_at")
                login_code.save(update_fields=fields)
                return (_VerifyOutcome.LOCKED if login_code.used_at else _VerifyOutcome.INVALID), login_code
            login_code.used_at = now
            login_code.save(update_fields=["used_at", "updated_at"])
            return _VerifyOutcome.OK, login_code

    @staticmethod
    def verify_code(*, target_type: str, target: str, code: str) -> LoginCodeVerifyResult:
        login_code = OTPService.check_code_or_raise(target_type=target_type, target=target, code=code)
        return OTPService._resolve_user(target_type=target_type, target=target, login_code=login_code)

    @staticmethod
    def check_code_or_raise(*, target_type: str, target: str, code: str) -> LoginCode:
        """Check a code without signing anyone in. Raises the usual otp_* errors."""
        outcome, login_code = OTPService._check_code(target_type=target_type, target=target, code=code)
        if outcome != _VerifyOutcome.OK:
            AuditService.log_raw_action(
                actor=None,
                action_type="login_code_failed",
                target_model="LoginCode",
                target_id=str(login_code.id) if login_code else target,
                metadata={"target_type": target_type, "reason": outcome},
            )
        if outcome == _VerifyOutcome.EXPIRED:
            raise ValidationError({"code": "otp_expired", "detail": "This code has expired or was already used. Ask for a new code."})
        if outcome == _VerifyOutcome.LOCKED:
            raise ValidationError({"code": "otp_too_many_attempts", "detail": "Too many wrong tries. Ask for a new code."})
        if outcome == _VerifyOutcome.INVALID:
            remaining = max(login_code.max_attempts - login_code.attempts, 0)
            raise ValidationError({"code": "otp_invalid", "detail": "That code is not right.", "attempts_remaining": remaining})
        return login_code

    @staticmethod
    @transaction.atomic
    def _resolve_user(*, target_type: str, target: str, login_code: LoginCode) -> LoginCodeVerifyResult:
        is_phone = target_type == LoginCode.TargetType.PHONE
        auth_method = User.PrimaryAuthMethod.PHONE_CODE if is_phone else User.PrimaryAuthMethod.EMAIL_CODE
        user, created = OTPService.user_for_verified_target(target_type=target_type, target=target)
        if login_code.user_id != user.id:
            login_code.user = user
            login_code.save(update_fields=["user", "updated_at"])
        return LoginCodeVerifyResult(user=user, created=created, auth_method=auth_method)

    @staticmethod
    @transaction.atomic
    def user_for_verified_target(*, target_type: str, target: str, source: str = "otp_signup", first_name: str = "", last_name: str = "") -> tuple[User, bool]:
        """The account for a phone or email the person just proved they control.

        Creates an innovator account when none exists. Raises account_disabled for a
        disabled account.
        """
        from apps.accounts.security_services import AccountSecurityService
        from apps.accounts.services import UserOnboardingService
        from apps.core.constants import RoleType

        is_phone = target_type == LoginCode.TargetType.PHONE
        auth_method = User.PrimaryAuthMethod.PHONE_CODE if is_phone else User.PrimaryAuthMethod.EMAIL_CODE
        user = OTPService.find_user(target_type=target_type, target=target)
        created = False
        if user is None:
            user = User.objects.create_user(
                email=None if is_phone else target,
                password=None,
                phone_number=target if is_phone else "",
                first_name=first_name,
                last_name=last_name,
                email_verified=not is_phone,
                phone_verified=is_phone,
            )
            created = True
            UserOnboardingService.ensure_user_onboarding(
                user,
                source=source,
                default_role_codes=[RoleType.INNOVATOR],
                mark_email_verified=not is_phone,
                metadata={"method": auth_method},
            )
            AccountSecurityService.sync_identity_ownership(
                user=user,
                preferred_method=auth_method,
                actor=user,
                reason="otp_signup_primary_assignment",
            )
            AuditService.log_action(actor=user, action_type="otp_signup_success", target=user, metadata={"method": auth_method, "source": source})
        else:
            if not user.is_active:
                raise ValidationError({"code": "account_disabled", "detail": "This account is disabled."})
            # The person just proved they control this phone or inbox.
            if is_phone and not user.phone_verified:
                user.phone_verified = True
                user.save(update_fields=["phone_verified", "updated_at"])
            if not is_phone and not user.email_verified:
                user.email_verified = True
                user.save(update_fields=["email_verified", "updated_at"])
        return user, created

    @staticmethod
    def finalize_login(*, user: User, auth_method: str) -> dict:
        """Issue the same token pair as password login."""
        from apps.accounts.security_services import AccountSecurityService
        from apps.accounts.services import AuthTokenService, UserOnboardingService

        UserOnboardingService.ensure_user_onboarding(
            user,
            source="otp_login",
            default_role_codes=[],
            metadata={"method": auth_method},
        )
        AccountSecurityService.sync_identity_ownership(user=user, actor=user, reason="otp_login")
        AuditService.log_action(actor=user, action_type="otp_login_success", target=user, metadata={"provider": auth_method})
        return AuthTokenService.issue_tokens(user)

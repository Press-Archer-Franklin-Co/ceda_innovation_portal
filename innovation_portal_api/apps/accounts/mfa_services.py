from __future__ import annotations

import base64
import hashlib
import random
from io import BytesIO
from dataclasses import dataclass

import pyotp
import qrcode
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import MFAChallenge, User, UserMFAProfile
from apps.communications.email_notifications import EmailNotificationService


@dataclass
class MFAChallengePayload:
    id: str
    method: str
    expires_at: timezone.datetime
    email_hint: str | None = None


class MFAService:
    EMAIL_CODE_LENGTH = 6
    CHALLENGE_MINUTES = 10

    @staticmethod
    def _hash_code(code: str) -> str:
        return hashlib.sha256(code.encode("utf-8")).hexdigest()

    @staticmethod
    def _generate_email_code() -> str:
        upper = (10 ** MFAService.EMAIL_CODE_LENGTH) - 1
        return f"{random.randint(0, upper):0{MFAService.EMAIL_CODE_LENGTH}d}"

    @staticmethod
    def _mask_email(email: str) -> str:
        if "@" not in email:
            return email
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[:1] + "*"
        else:
            masked_local = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
        domain_parts = domain.split(".")
        if domain_parts:
            domain_parts[0] = domain_parts[0][0] + "***"
        return f"{masked_local}@{'.'.join(domain_parts)}"

    @staticmethod
    def ensure_profile(user: User) -> UserMFAProfile:
        profile, _ = UserMFAProfile.objects.get_or_create(user=user)
        return profile

    @staticmethod
    def is_enabled(user: User) -> bool:
        profile = getattr(user, "mfa_profile", None)
        return bool(profile and profile.is_enabled and profile.method)

    @staticmethod
    def issue_challenge(*, user: User, method: str, purpose: str, auth_method: str = "") -> MFAChallengePayload:
        expires_at = timezone.now() + timezone.timedelta(minutes=MFAService.CHALLENGE_MINUTES)
        code_hash = ""
        if method == UserMFAProfile.MFAMethod.EMAIL and not user.email:
            raise ValidationError({"code": "mfa_email_missing", "detail": "Add an email address to your account before using email codes."})
        if method == UserMFAProfile.MFAMethod.EMAIL:
            code = MFAService._generate_email_code()
            code_hash = MFAService._hash_code(code)
            EmailNotificationService.send_mfa_code_email(
                user=user,
                code=code,
                purpose=purpose,
            )
        challenge = MFAChallenge.objects.create(
            user=user,
            method=method,
            purpose=purpose,
            auth_method=auth_method,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        return MFAChallengePayload(
            id=str(challenge.id),
            method=method,
            expires_at=challenge.expires_at,
            email_hint=MFAService._mask_email(user.email) if method == UserMFAProfile.MFAMethod.EMAIL else None,
        )

    @staticmethod
    def verify_challenge(*, challenge_id: str, code: str, expected_purpose: str | None = None) -> MFAChallenge:
        challenge = MFAChallenge.objects.select_related("user").filter(
            id=challenge_id,
            used_at__isnull=True,
        ).first()
        if not challenge or challenge.expires_at <= timezone.now():
            raise ValidationError({"code": "mfa_code_expired", "detail": "Verification code expired. Please request a new one."})
        if expected_purpose and challenge.purpose != expected_purpose:
            raise ValidationError({"code": "mfa_code_invalid", "detail": "Verification code does not match this request."})
        profile = MFAService.ensure_profile(challenge.user)
        if challenge.method == UserMFAProfile.MFAMethod.EMAIL:
            if MFAService._hash_code(code) != challenge.code_hash:
                raise ValidationError({"code": "mfa_code_invalid", "detail": "Invalid verification code."})
        elif challenge.method == UserMFAProfile.MFAMethod.TOTP:
            secret = profile.totp_secret
            if not secret:
                raise ValidationError({"code": "mfa_unconfigured", "detail": "Authenticator app is not configured for this account."})
            if not pyotp.TOTP(secret).verify(code, valid_window=1):
                raise ValidationError({"code": "mfa_code_invalid", "detail": "Invalid verification code."})
        else:
            raise ValidationError({"code": "mfa_method_invalid", "detail": "Unsupported MFA method."})
        challenge.used_at = timezone.now()
        challenge.save(update_fields=["used_at", "updated_at"])
        return challenge

    @staticmethod
    def start_totp_setup(*, user: User) -> dict:
        profile = MFAService.ensure_profile(user)
        secret = pyotp.random_base32()
        profile.pending_totp_secret = secret
        profile.save(update_fields=["pending_totp_secret", "updated_at"])
        issuer = "CEDA Innovation Portal"
        label = user.email
        uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
        qr = qrcode.make(uri)
        buffer = BytesIO()
        qr.save(buffer, format="PNG")
        qr_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return {"secret": secret, "otpauth_uri": uri, "qr_png": f"data:image/png;base64,{qr_b64}"}

    @staticmethod
    def confirm_totp_setup(*, user: User, code: str) -> UserMFAProfile:
        profile = MFAService.ensure_profile(user)
        if not profile.pending_totp_secret:
            raise ValidationError({"detail": "No pending authenticator setup found."})
        if not pyotp.TOTP(profile.pending_totp_secret).verify(code, valid_window=1):
            raise ValidationError({"code": "mfa_code_invalid", "detail": "Invalid verification code."})
        profile.totp_secret = profile.pending_totp_secret
        profile.pending_totp_secret = ""
        profile.method = UserMFAProfile.MFAMethod.TOTP
        profile.is_enabled = True
        profile.save(update_fields=["totp_secret", "pending_totp_secret", "method", "is_enabled", "updated_at"])
        return profile

    @staticmethod
    def enable_email_otp(*, user: User) -> UserMFAProfile:
        profile = MFAService.ensure_profile(user)
        profile.method = UserMFAProfile.MFAMethod.EMAIL
        profile.is_enabled = True
        profile.pending_totp_secret = ""
        profile.save(update_fields=["method", "is_enabled", "pending_totp_secret", "updated_at"])
        return profile

    @staticmethod
    def disable_mfa(*, user: User) -> UserMFAProfile:
        profile = MFAService.ensure_profile(user)
        profile.is_enabled = False
        profile.method = ""
        profile.totp_secret = ""
        profile.pending_totp_secret = ""
        profile.save(update_fields=["is_enabled", "method", "totp_secret", "pending_totp_secret", "updated_at"])
        return profile

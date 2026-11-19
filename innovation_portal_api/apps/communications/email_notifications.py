import logging
from email.mime.image import MIMEImage
from functools import cache
from io import BytesIO
from pathlib import Path
import textwrap

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.mail.message import SafeMIMEMultipart
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from PIL import Image, ImageDraw, ImageFont



logger = logging.getLogger(__name__)


class InlineImageEmail(EmailMultiAlternatives):
    def __init__(self, *args, related_parts=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.related_parts = related_parts or []

    def _create_message(self, msg):
        encoding = self.encoding or settings.DEFAULT_CHARSET
        if not self.alternatives or not self.related_parts:
            return super()._create_message(msg)

        body_msg = msg
        alternatives_root = SafeMIMEMultipart(_subtype=self.alternative_subtype, encoding=encoding)
        if self.body:
            alternatives_root.attach(body_msg)

        for alternative in self.alternatives:
            alternative_part = self._create_mime_attachment(*alternative)
            if alternative[1] == "text/html":
                related_root = SafeMIMEMultipart(_subtype="related", encoding=encoding)
                related_root.attach(alternative_part)
                for part in self.related_parts:
                    related_root.attach(part)
                alternatives_root.attach(related_root)
            else:
                alternatives_root.attach(alternative_part)

        return self._create_attachments(alternatives_root)


class EmailNotificationService:
    HERO_CID = "ceda-innovation-hub-hero"
    LOGO_PATH = Path(__file__).resolve().parents[2] / "assets" / "email" / "ceda-innovation-hub-logo.png"
    FONT_HEAVY_PATH = Path(__file__).resolve().parents[2] / "assets" / "email" / "Poppins-ExtraBold.ttf"
    FONT_DEMIBOLD_PATH = Path(__file__).resolve().parents[2] / "assets" / "email" / "Poppins-SemiBold.ttf"

    @staticmethod
    def _load_font(path: Path, size: int):
        try:
            return ImageFont.truetype(str(path), size=size)
        except Exception:
            return ImageFont.load_default()

    HERO_SIZE = (1280, 620)

    @staticmethod
    def _build_hero_png_bytes(*, headline: str, intro: str):
        background = _hero_background()
        if background is None:
            return None
        image = background.copy()
        draw = ImageDraw.Draw(image)

        headline_font = _hero_font(str(EmailNotificationService.FONT_HEAVY_PATH), 96)
        intro_font = _hero_font(str(EmailNotificationService.FONT_DEMIBOLD_PATH), 30)

        headline_lines = textwrap.wrap(headline, width=22)[:2]
        headline_y = 205
        for line in headline_lines:
            draw.text((78, headline_y), line, font=headline_font, fill=(255, 255, 255, 255))
            headline_y += 100

        intro_lines = textwrap.wrap(intro, width=52)[:3]
        intro_y = headline_y + 10
        for line in intro_lines:
            draw.text((82, intro_y), line, font=intro_font, fill=(255, 255, 255, 210))
            intro_y += 44

        buffer = BytesIO()
        # Default zlib level: about 5x faster than optimize=True for a ~4% larger file.
        image.convert("RGB").save(buffer, format="PNG")
        return buffer.getvalue()

    @staticmethod
    def _build_hero_part(*, headline: str, intro: str):
        png_bytes = EmailNotificationService._build_hero_png_bytes(headline=headline, intro=intro)
        if not png_bytes:
            return None
        hero = MIMEImage(png_bytes, _subtype="png")
        hero.add_header("Content-ID", f"<{EmailNotificationService.HERO_CID}>")
        hero.add_header("Content-Disposition", "inline", filename="ceda-innovation-hub-hero.png")
        hero.add_header("Content-Location", "ceda-innovation-hub-hero.png")
        return hero

    @staticmethod
    def _base_context(
        *,
        preheader: str,
        headline: str,
        intro: str,
        cta_label: str = "",
        cta_value: str = "",
        cta_hint: str = "",
        summary_items: list[dict] | None = None,
        action_label: str = "Open Innovation Portal",
        action_url: str | None = None,
        fallback_label: str = "Open portal",
        fallback_url: str | None = None,
    ):
        portal_url = settings.PUBLIC_BASE_URL.rstrip("/")
        return {
            "portal_name": "CEDA Innovation Portal",
            "support_email": getattr(settings, "SYSTEM_EMAIL", "") or settings.DEFAULT_FROM_EMAIL,
            "portal_url": portal_url,
            "brand_url": portal_url,
            "hero_cid": EmailNotificationService.HERO_CID,
            "preheader": preheader,
            "headline": headline,
            "intro": intro,
            "cta_label": cta_label,
            "cta_value": cta_value,
            "cta_hint": cta_hint,
            "action_label": action_label,
            "action_url": action_url or portal_url,
            "fallback_label": fallback_label,
            "fallback_url": fallback_url or portal_url,
            "summary_items": summary_items or [],
        }

    @staticmethod
    def _send_via_smtp(*, to_email: str, subject: str, text_body: str, html_body: str, context: dict, cc: list[str] | None = None):
        related_parts = []
        hero_part = EmailNotificationService._build_hero_part(
            headline=context["headline"],
            intro=context["intro"],
        )
        if hero_part is not None:
            related_parts.append(hero_part)
        message = InlineImageEmail(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
            cc=cc or [],
            related_parts=related_parts,
        )
        message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)

    @staticmethod
    def _send(*, to_email: str, subject: str, template_name: str, context: dict, to_name: str = "", cc: list[str] | None = None):
        if not to_email:
            # Phone-only accounts have no email address; nothing to send.
            logger.info("Skipped email %r: recipient has no email address.", template_name)
            return
        html_body = render_to_string(f"emails/{template_name}.html", context)
        text_body = render_to_string(f"emails/{template_name}.txt", context)
        text_body = text_body.strip() or strip_tags(html_body)
        EmailNotificationService._send_via_smtp(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            context=context,
            cc=cc,
        )

    @staticmethod
    def send_confirmation_email(*, user, verification_token: str):
        if getattr(user, "email_verified", False):
            return False
        portal_url = settings.PUBLIC_BASE_URL.rstrip("/")
        verification_url = f"{portal_url}/verify-email?token={verification_token}"
        context = EmailNotificationService._base_context(
            preheader="Confirm your CEDA Innovation Portal account.",
            headline="Confirm your account",
            intro=f"Hello {user.full_name or user.email}, welcome to the CEDA Innovation Portal. Please confirm your email address to complete your account setup.",
            cta_label="",
            cta_value="",
            cta_hint="",
            action_label="Verify email",
            action_url=verification_url,
            fallback_label="Verify email",
            fallback_url=verification_url,
            summary_items=[
                {"label": "Email", "value": user.email},
                {"label": "Account status", "value": "Pending verification"},
            ],
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject="Confirm your CEDA Innovation Portal account",
            template_name="confirmation_email",
            context=context,
        )
        return True

    @staticmethod
    def send_admin_resend_verification_email(*, user, verification_token: str, sent_by=None, cc: list[str] | None = None):
        portal_url = settings.PUBLIC_BASE_URL.rstrip("/")
        verification_url = f"{portal_url}/verify-email?token={verification_token}"
        admin_name = (sent_by.full_name or sent_by.email) if sent_by else "CEDA Innovation Portal Support"
        context = EmailNotificationService._base_context(
            preheader="Your CEDA Innovation Portal verification link has been resent.",
            headline="Verify your account",
            intro=(
                f"Hello {user.full_name or user.email}, we noticed that your CEDA Innovation Portal "
                f"account has not been verified yet. As requested, your verification link has been resent "
                f"by our support team. Please click the button below to verify your email address and "
                f"complete your account setup."
            ),
            action_label="Verify email address",
            action_url=verification_url,
            fallback_label="Verify email address",
            fallback_url=verification_url,
            summary_items=[
                {"label": "Email", "value": user.email},
                {"label": "Sent by", "value": admin_name},
                {"label": "Account status", "value": "Pending verification"},
            ],
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject="Action required: Verify your CEDA Innovation Portal account",
            template_name="confirmation_email",
            context=context,
            cc=cc or [],
        )
        return True

    @staticmethod
    def send_generic_notification_email(
        *,
        user,
        subject: str,
        intro: str,
        headline: str | None = None,
        summary_items: list[dict] | None = None,
        action_label: str = "Open portal",
        action_url: str | None = None,
    ):
        context = EmailNotificationService._base_context(
            preheader=subject,
            headline=headline or subject,
            intro=intro,
            action_label=action_label,
            action_url=action_url,
            fallback_label="Open portal",
            fallback_url=action_url,
            summary_items=summary_items or [],
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject=subject,
            template_name="notification_generic",
            context=context,
        )

    @staticmethod
    def send_role_change_email(
        *,
        user,
        roles: list[str],
        actor=None,
        added_roles: list[str] | None = None,
        removed_roles: list[str] | None = None,
    ):
        role_labels = [r.replace("_", " ").title() for r in roles]
        summary_items = [
            {"label": "Updated roles", "value": ", ".join(role_labels) if role_labels else "—"},
        ]
        if added_roles:
            added_labels = [r.replace("_", " ").title() for r in added_roles]
            summary_items.append({"label": "Added", "value": ", ".join(added_labels)})
        if removed_roles:
            removed_labels = [r.replace("_", " ").title() for r in removed_roles]
            summary_items.append({"label": "Removed", "value": ", ".join(removed_labels)})
        if actor:
            summary_items.append({"label": "Updated by", "value": actor.full_name or actor.email})
        EmailNotificationService.send_generic_notification_email(
            user=user,
            subject="Your CEDA Innovation Portal roles were updated",
            headline="Roles updated",
            intro="Your account access roles were updated by an administrator. If you believe this was a mistake, please contact support.",
            summary_items=summary_items,
        )

    @staticmethod
    def send_mfa_code_email(*, user, code: str, purpose: str = "login"):
        purpose_label = "Sign-in" if purpose == "login" else "Account security"
        context = EmailNotificationService._base_context(
            preheader=f"{purpose_label} verification code for CEDA Innovation Portal.",
            headline="Your security code",
            intro=f"Hello {user.full_name or user.email}, use the code below to complete your {purpose_label.lower()} check.",
            cta_label="Verification code",
            cta_value=code,
            cta_hint="This code expires in 10 minutes.",
            action_label="Open portal",
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject="Your CEDA Innovation Portal security code",
            template_name="mfa_code_email",
            context=context,
        )

    @staticmethod
    def send_login_code_email(*, to_email: str, code: str):
        """One-time sign-in code for password-less login. The address may not have an account yet."""
        context = EmailNotificationService._base_context(
            preheader="Your sign-in code for CEDA Innovation Portal.",
            headline="Your sign-in code",
            intro="Use the code below to sign in to the CEDA Innovation Portal. If you did not ask for it, you can ignore this email.",
            cta_label="Sign-in code",
            cta_value=code,
            cta_hint="This code expires in 10 minutes. Do not share it with anyone.",
            action_label="Open portal",
        )
        EmailNotificationService._send(
            to_email=to_email,
            subject="Your CEDA Innovation Portal sign-in code",
            template_name="mfa_code_email",
            context=context,
        )

    @staticmethod
    def send_password_reset_email(*, user, reset_token: str):
        portal_url = settings.PUBLIC_BASE_URL.rstrip("/")
        reset_url = f"{portal_url}/reset-password?token={reset_token}"
        context = EmailNotificationService._base_context(
            preheader="Reset your CEDA Innovation Portal password.",
            headline="Password reset requested",
            intro=f"Hello {user.full_name or user.email}, a password reset was requested for your CEDA Innovation Portal account. Click the button below to choose a new password. This link expires in 24 hours.",
            cta_label="",
            cta_value="",
            cta_hint="",
            action_label="Reset my password",
            action_url=reset_url,
            fallback_label="Reset my password",
            fallback_url=reset_url,
            summary_items=[
                {"label": "Email", "value": user.email},
                {"label": "Link expires", "value": "24 hours"},
            ],
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject="Reset your CEDA Innovation Portal password",
            template_name="password_reset_email",
            context=context,
        )

    @staticmethod
    def send_password_changed_email(*, user):
        context = EmailNotificationService._base_context(
            preheader="Your CEDA Innovation Portal password was changed.",
            headline="Password changed successfully",
            intro=f"Hello {user.full_name or user.email}, this is a confirmation that the password for your CEDA Innovation Portal account has been updated.",
            cta_label="Account",
            cta_value=user.email,
            cta_hint="If you did not make this change, contact support immediately.",
            action_label="Review account",
            summary_items=[
                {"label": "Change status", "value": "Successful"},
                {"label": "Support", "value": getattr(settings, 'SYSTEM_EMAIL', '') or settings.DEFAULT_FROM_EMAIL},
            ],
        )
        EmailNotificationService._send(
            to_email=user.email,
            to_name=user.full_name or user.email,
            subject="Your CEDA Innovation Portal password was changed",
            template_name="password_changed_email",
            context=context,
        )

    @staticmethod
    def send_submission_received_email(*, submission):
        context = EmailNotificationService._base_context(
            preheader="Your submission has been received by the CEDA Innovation Portal.",
            headline="Submission received",
            intro=f"Hello {submission.innovator.full_name or submission.innovator.email}, your submission has been received and routed into the CEDA review workflow.",
            cta_label="Reference number",
            cta_value=submission.reference_number,
            cta_hint="Keep this reference number for future support or follow-up.",
            action_label="Open portal",
            summary_items=[
                {"label": "Submission title", "value": submission.title},
                {"label": "Programme", "value": submission.program.title},
                {"label": "Current status", "value": submission.current_status.replace('_', ' ').title()},
            ],
        )
        EmailNotificationService._send(
            to_email=submission.innovator.email,
            to_name=submission.innovator.full_name or submission.innovator.email,
            subject=f"Submission received: {submission.reference_number}",
            template_name="submission_received_email",
            context=context,
        )

    @staticmethod
    def send_test_email(*, to_email: str):
        context = EmailNotificationService._base_context(
            preheader="CEDA Innovation Portal email delivery test.",
            headline="Notification delivery test",
            intro="This is a live test email from the CEDA Innovation Portal notification service.",
            cta_label="Sender email",
            cta_value=settings.DEFAULT_FROM_EMAIL,
            cta_hint="If you received this message, outbound notification delivery is working.",
            action_label="Open portal",
            summary_items=[
                {"label": "System email", "value": getattr(settings, 'SYSTEM_EMAIL', '') or settings.DEFAULT_FROM_EMAIL},
                {"label": "Environment", "value": "Production container"},
            ],
        )
        EmailNotificationService._send(
            to_email=to_email,
            to_name=to_email,
            subject="CEDA Innovation Portal notification test",
            template_name="test_notification_email",
            context=context,
        )


# ---------------------------------------------------------------------------
# Hero picture background
#
# Everything in the email hero except the headline and intro text is the same
# for every email, so it is drawn once per process and cached. Each email copies
# it and draws only its own text.
# ---------------------------------------------------------------------------

_HERO_TOP = (46, 30, 24)
_HERO_MID = (90, 60, 50)
_HERO_BOTTOM = (107, 74, 62)
_HERO_GRADIENT_SCALE = 8  # gradient is computed at 1/8 size, then resized


@cache
def _hero_font(path: str, size: int):
    return EmailNotificationService._load_font(Path(path), size)


def _hero_gradient(width: int, height: int) -> Image.Image:
    """Diagonal three-colour gradient (top-left dark to bottom-right light).

    The colour depends on d = 0.7 * x/width + 0.3 * y/height, linear on each
    side of d = 0.55. Linear pieces survive bilinear resizing, so it is
    computed on a small grid and scaled up instead of colouring 800,000 pixels
    in Python.
    """
    small_w = max(2, width // _HERO_GRADIENT_SCALE)
    small_h = max(2, height // _HERO_GRADIENT_SCALE)
    data = []
    for sy in range(small_h):
        # Sample at the positions the small pixels map to in the full image.
        y = (sy + 0.5) * height / small_h - 0.5
        vertical_ratio = min(max(y / float(height - 1), 0.0), 1.0)
        for sx in range(small_w):
            x = (sx + 0.5) * width / small_w - 0.5
            horizontal_ratio = min(max(x / float(width - 1), 0.0), 1.0)
            diagonal_ratio = (horizontal_ratio * 0.70) + (vertical_ratio * 0.30)
            if diagonal_ratio < 0.55:
                mix = diagonal_ratio / 0.55
                low, high = _HERO_TOP, _HERO_MID
            else:
                mix = (diagonal_ratio - 0.55) / 0.45
                low, high = _HERO_MID, _HERO_BOTTOM
            data.append(tuple(int(low[i] + (high[i] - low[i]) * mix) for i in range(3)))
    small = Image.new("RGB", (small_w, small_h))
    small.putdata(data)
    return small.resize((width, height), Image.BILINEAR).convert("RGBA")


@cache
def _hero_background():
    """The hero picture without the per-email text, or None without the logo file."""
    if not EmailNotificationService.LOGO_PATH.exists():
        return None
    width, height = EmailNotificationService.HERO_SIZE
    image = _hero_gradient(width, height)
    draw = ImageDraw.Draw(image)

    for y in range(16, height, 26):
        for x in range(16, width, 26):
            draw.ellipse((x, y, x + 2, y + 2), fill=(148, 163, 184, 128))

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_center_x = int(width * 0.85)
    glow_center_y = int(height * 0.50)
    for radius, alpha in ((420, 10), (330, 17), (245, 24), (160, 33)):
        glow_draw.ellipse(
            (
                glow_center_x - radius,
                glow_center_y - radius,
                glow_center_x + radius,
                glow_center_y + radius,
            ),
            fill=(240, 100, 30, alpha),
        )
    image = Image.alpha_composite(image, glow)

    circuit = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    circuit_draw = ImageDraw.Draw(circuit)
    stroke = (255, 255, 255, 14)
    fill = (255, 255, 255, 14)
    outline = (255, 255, 255, 14)
    circuit_draw.line((973, 74, 973, 236), fill=stroke, width=2)
    circuit_draw.line((973, 236, 1126, 236), fill=stroke, width=2)
    circuit_draw.line((1126, 111, 1126, 384), fill=stroke, width=2)
    circuit_draw.line((1126, 384, 1203, 384), fill=stroke, width=2)
    circuit_draw.line((1203, 279, 1203, 483), fill=stroke, width=2)
    circuit_draw.ellipse((968, 69, 978, 79), fill=fill)
    circuit_draw.ellipse((966, 229, 980, 243), outline=outline, width=2)
    circuit_draw.ellipse((1122, 107, 1130, 115), fill=fill)
    circuit_draw.ellipse((1121, 231, 1131, 241), fill=fill)
    circuit_draw.ellipse((1119, 377, 1133, 391), outline=outline, width=2)
    circuit_draw.ellipse((1199, 275, 1207, 283), fill=fill)
    circuit_draw.ellipse((1198, 478, 1208, 488), fill=fill)
    circuit_draw.polygon(
        ((922, 136), (947, 111), (998, 111), (1024, 136), (998, 161), (947, 161)),
        outline=outline,
        width=2,
    )
    circuit_draw.polygon(
        ((1050, 446), (1076, 421), (1126, 421), (1152, 446), (1126, 471), (1076, 471)),
        outline=outline,
        width=2,
    )
    image = Image.alpha_composite(image, circuit)
    draw = ImageDraw.Draw(image)

    logo = Image.open(EmailNotificationService.LOGO_PATH).convert("RGBA").resize((92, 92))
    image.alpha_composite(logo, (74, 60))

    draw.line((196, 72, 196, 146), fill=(255, 255, 255, 70), width=2)

    wordmark_font = _hero_font(str(EmailNotificationService.FONT_HEAVY_PATH), 56)
    label_font = _hero_font(str(EmailNotificationService.FONT_DEMIBOLD_PATH), 24)
    draw.text((228, 70), "ceda", font=wordmark_font, fill=(255, 255, 255, 255))
    draw.text((228, 126), "Innovation Portal", font=label_font, fill=(255, 255, 255, 150))
    return image

"""R-51 (2.9): where a person is signed in, signing out one place, and deleting an account.

Each sign-in gets an AccountSession whose key travels in the refresh token as "sid" (rotation keeps it).
Ending a session refuses its next refresh, so it is signed out once its short access token runs out.
"""

from __future__ import annotations

import contextvars
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService

_request = contextvars.ContextVar("ceda_request", default=None)


class CurrentRequestMiddleware:
    """Keeps the request at hand for code that has none passed in (the sign-in token service)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _request.set(request)
        try:
            return self.get_response(request)
        finally:
            _request.reset(token)


def describe_device(user_agent: str) -> str:
    agent = user_agent or ""
    browser = next((name for key, name in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari")) if key in agent), "")
    system = next((name for key, name in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"), ("Mac OS X", "Mac"), ("Linux", "Linux")) if key in agent), "")
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "Unknown device"


def start(user) -> str:
    from apps.accounts.models import AccountSession

    request = _request.get()
    agent = request.META.get("HTTP_USER_AGENT", "") if request is not None else ""
    session = AccountSession.objects.create(user=user, key=uuid.uuid4(), device=describe_device(agent)[:120], last_seen_at=timezone.now())
    return str(session.key)


def check_refresh(token) -> None:
    """Called on refresh: refuses ended sessions and records when the session was last used."""
    from rest_framework_simplejwt.exceptions import InvalidToken

    from apps.accounts.models import AccountSession

    sid = token.get("sid")
    if not sid:
        return  # tokens from before sessions existed
    session = AccountSession.objects.filter(key=sid).first()
    if session is None or session.ended_at is not None:
        raise InvalidToken("This sign-in was ended. Please sign in again.")
    AccountSession.objects.filter(pk=session.pk).update(last_seen_at=timezone.now())


def current_key(request) -> str:
    auth = getattr(request, "auth", None)
    try:
        return str(auth.get("sid") or "") if auth is not None else ""
    except AttributeError:
        return ""


def listing(user, request) -> list[dict]:
    current = current_key(request)
    return [
        {
            "id": str(session.id),
            "device": session.device or "Unknown device",
            "place": None,
            "last_seen": (session.last_seen_at or session.created_at).isoformat(),
            "signed_in_at": session.created_at.isoformat(),
            "current": str(session.key) == current,
        }
        for session in user.account_sessions.filter(ended_at__isnull=True)
    ]


def end(user, session_id, *, actor) -> None:
    from apps.accounts.models import AccountSession

    session = AccountSession.objects.filter(user=user, id=session_id, ended_at__isnull=True).first()
    if session is None:
        raise ValidationError({"detail": "This sign-in is not active."})
    session.ended_at = timezone.now()
    session.save(update_fields=["ended_at", "updated_at"])
    AuditService.log_action(actor=actor, action_type="account_session_ended", target=user, metadata={"session_id": str(session.id), "device": session.device})


def end_all(user) -> None:
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    user.account_sessions.filter(ended_at__isnull=True).update(ended_at=timezone.now())
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@transaction.atomic
def delete_account(user) -> None:
    """Removes contact details and signs out everywhere. Ideas already sent stay with CEDA."""
    from apps.profiles.models import InnovatorProfile

    before = {"email_present": bool(user.email), "phone_present": bool(user.phone_number)}
    user.email = None
    user.phone_number = ""
    user.first_name = "Deleted"
    user.last_name = "account"
    user.email_verified = user.phone_verified = False
    user.is_active = False
    user.set_unusable_password()
    user.save()
    InnovatorProfile.objects.filter(user=user).update(national_id="", date_of_birth=None, bio="", portfolio_url="", linkedin_url="")
    if hasattr(user, "social_accounts"):
        user.social_accounts.all().delete()
    end_all(user)
    AuditService.log_action(actor=user, action_type="account_deleted", target=user, before_state=before, after_state={"is_active": False})

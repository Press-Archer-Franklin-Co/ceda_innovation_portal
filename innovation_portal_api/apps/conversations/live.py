"""C1: short-lived hints for the chat screens: who is typing, and whether any staff member is online.

Kept in Redis (shared by every web worker) with no database writes. Each value carries its own time,
so a hint is never older than its limit even if a key outlives it. If Redis cannot be reached the
hints fall back to the local cache, and the chat still works without them.
"""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

TYPING_SECONDS = 10
ONLINE_SECONDS = 90
PREFIX = "ceda:chat:"

_client = None


def _redis():
    global _client
    if _client is None:
        import redis

        _client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=0.5, socket_connect_timeout=0.5)
    return _client


def _set(key: str, value: dict, seconds: int) -> None:
    raw = json.dumps(value)
    try:
        _redis().set(PREFIX + key, raw, ex=seconds)
    except Exception:  # Redis down: the hint is lost on other workers, nothing else
        cache.set(PREFIX + key, raw, seconds)


def _get(key: str) -> dict | None:
    try:
        raw = _redis().get(PREFIX + key)
    except Exception:
        raw = cache.get(PREFIX + key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _fresh(value: dict | None, seconds: int, now=None) -> bool:
    at = parse_datetime(value.get("at") or "") if value else None
    return bool(at and ((now or timezone.now()) - at).total_seconds() <= seconds)


def set_typing(kind: str, object_id, side: str, name: str) -> None:
    """kind: idea | conversation. side: person | staff (who is typing)."""
    _set(f"typing:{kind}:{object_id}:{side}", {"name": name, "at": timezone.now().isoformat()}, TYPING_SECONDS)


def clear_typing(kind: str, object_id, side: str) -> None:
    """A sent message ends the typing hint at once instead of after 10 seconds."""
    key = PREFIX + f"typing:{kind}:{object_id}:{side}"
    try:
        _redis().delete(key)
    except Exception:
        cache.delete(key)


def typing(kind: str, object_id, side: str, now=None) -> dict | None:
    """{name} while the other side typed in the last 10 seconds, else None."""
    value = _get(f"typing:{kind}:{object_id}:{side}")
    return {"name": value.get("name") or ""} if _fresh(value, TYPING_SECONDS, now) else None


def mark_online(user) -> None:
    _set(f"online:{user.id}", {"at": timezone.now().isoformat()}, ONLINE_SECONDS)
    members = _get("online:all") or {}
    members = {key: at for key, at in members.items() if _fresh({"at": at}, ONLINE_SECONDS)}
    members[str(user.id)] = timezone.now().isoformat()
    _set("online:all", members, ONLINE_SECONDS)


def online_user_ids(now=None) -> set[str]:
    members = _get("online:all") or {}
    return {key for key, at in members.items() if _fresh({"at": at}, ONLINE_SECONDS, now)}


def staff_online(now=None) -> bool:
    return bool(online_user_ids(now))

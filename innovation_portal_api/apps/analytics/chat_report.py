"""Live chat report (hackathon criteria, section 9): how online chats went, with no contact details.

Definitions:
- answered: a staff member replied (first_response_at is set).
- not answered: no staff reply, and the chat is closed, was escalated, or has waited longer than the escalation time.
- outside hours: started when chat was closed, so the person got the away message. Past chats are judged against
  today's opening hours and holidays, because the portal does not keep older versions of them.
- first reply: from the start of the chat to the first staff reply. A chat started outside hours counts from the next
  opening time, so night chats do not distort the number. A reply before that opening counts as 0 minutes.
- open now: chats open at this moment, whenever they started (the channel filter still applies).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.analytics.dashboard import Filters, cached

GABORONE = ZoneInfo("Africa/Gaborone")
CHANNELS = ("web", "whatsapp", "ussd", "ai")
DEFAULT_DAYS = 30
MAX_DAYS = 366
LOOK_AHEAD_DAYS = 14
FAST_REPLY_SECONDS = 5 * 60


def _date(value, name: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValidationError({name: "Use a date like 2026-11-01."}) from None


def parse_filters(params) -> Filters:
    """from and to (Gaborone dates, default the last 30 days) and channel (web, whatsapp, ussd, ai)."""
    start, end = _date(params.get("from"), "from"), _date(params.get("to"), "to")
    today = timezone.now().astimezone(GABORONE).date()
    if end is None:
        end = max(today, start) if start else today
    if start is None:
        start = end - timedelta(days=DEFAULT_DAYS - 1)
    if end < start:
        raise ValidationError({"to": "The end date is before the start date."})
    if (end - start).days >= MAX_DAYS:
        raise ValidationError({"to": f"Choose a period of {MAX_DAYS} days or less."})
    channel = params.get("channel") or None
    if channel and channel not in CHANNELS:
        raise ValidationError({"channel": f"Use one of: {', '.join(CHANNELS)}."})
    return Filters(start, end, None, None, None, channel)


def _whole(value: float) -> int:
    return int(value + 0.5)


def _minutes(seconds: list[float]) -> int | None:
    return _whole(median(seconds) / 60) if seconds else None


def _one_decimal(values: list[int]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _clock(text: str) -> time:
    hours, minutes = str(text).split(":")
    return time(int(hours), int(minutes))


def next_opening(config, at: datetime) -> datetime | None:
    """The first opening time after ``at``, skipping holidays. None when nothing opens in the next two weeks."""
    from apps.conversations.services import DAYS

    local = at.astimezone(GABORONE)
    holidays = set(config.holidays or [])
    for offset in range(LOOK_AHEAD_DAYS + 1):
        day = local.date() + timedelta(days=offset)
        if day.isoformat() in holidays:
            continue
        opens = []
        for window in (config.hours or {}).get(DAYS[day.weekday()], []):
            try:
                opens.append(datetime.combine(day, _clock(window["opens"]), GABORONE))
            except (KeyError, ValueError, TypeError, AttributeError):
                continue
        upcoming = sorted(moment for moment in opens if moment > local)
        if upcoming:
            return upcoming[0]
    return None


def _compute(filters: Filters) -> dict:
    from apps.accounts.models import User
    from apps.conversations.models import Conversation, LiveChatSettings
    from apps.conversations.services import OPEN, is_open

    config = LiveChatSettings.load()
    now = timezone.now()
    wait_limit = timedelta(minutes=config.escalate_after_minutes) if config.escalate_after_minutes else None
    start = datetime.combine(filters.start, time.min, GABORONE)
    end = datetime.combine(filters.end + timedelta(days=1), time.min, GABORONE)
    scope = Conversation.objects.order_by()
    if filters.channel:
        scope = scope.filter(channel=filters.channel)
    # Only the columns the numbers need: no contact field is ever read.
    rows = list(
        scope.filter(created_at__gte=start, created_at__lt=end).values_list(
            "channel", "status", "assignee_id", "created_at", "first_response_at", "escalated_at", "closed_at", "satisfaction", named=True
        )
    )
    open_by_agent = Counter(scope.filter(status__in=OPEN, assignee__isnull=False).values_list("assignee_id", flat=True))
    open_now = scope.filter(status__in=OPEN).count()

    channels = [filters.channel] if filters.channel else list(CHANNELS)
    by_channel = {name: {"channel": name, "started": 0, "answered": 0} for name in channels}
    days = {filters.start + timedelta(days=n): {"started": 0, "answered": 0} for n in range((filters.end - filters.start).days + 1)}
    busiest: Counter = Counter()
    replies: list[float] = []
    lengths: list[float] = []
    scores: list[int] = []
    agents: dict = defaultdict(lambda: {"handled": 0, "replies": [], "scores": []})
    totals = Counter()

    with timezone.override(GABORONE):  # is_open reads the clock in the active time zone
        for row in rows:
            local = row.created_at.astimezone(GABORONE)
            answered = row.first_response_at is not None
            closed = row.status == Conversation.Status.CLOSED
            outside = not is_open(config, row.created_at)
            totals["started"] += 1
            totals["answered"] += answered
            totals["outside_hours"] += outside
            totals["escalated"] += row.escalated_at is not None
            totals["closed"] += closed
            if not answered and (closed or row.escalated_at is not None or (wait_limit is not None and now - row.created_at > wait_limit)):
                totals["not_answered"] += 1
            if row.channel in by_channel:
                by_channel[row.channel]["started"] += 1
                by_channel[row.channel]["answered"] += answered
            days[local.date()]["started"] += 1
            days[local.date()]["answered"] += answered
            busiest[(local.weekday(), local.hour)] += 1
            score = row.satisfaction if row.satisfaction in (1, 2, 3, 4, 5) else None
            if score:
                scores.append(score)
            if closed and row.closed_at:
                lengths.append(max((row.closed_at - row.created_at).total_seconds(), 0))
            reply = None
            if answered:
                # Night chats count from the next opening, so they do not distort the number.
                counted_from = (next_opening(config, row.created_at) or row.created_at) if outside else row.created_at
                reply = max((row.first_response_at - counted_from).total_seconds(), 0)
                replies.append(reply)
            if row.assignee_id:
                agent = agents[row.assignee_id]
                agent["handled"] += 1
                if reply is not None:
                    agent["replies"].append(reply)
                if score:
                    agent["scores"].append(score)

    names = {person.pk: person.full_name for person in User.objects.filter(pk__in=agents).only("first_name", "last_name")}
    agent_rows = [
        {
            "id": str(pk),
            "name": names.get(pk, ""),
            "handled": item["handled"],
            "median_first_reply_minutes": _minutes(item["replies"]),
            "average_satisfaction": _one_decimal(item["scores"]),
            "open_now": open_by_agent.get(pk, 0),
        }
        for pk, item in agents.items()
    ]
    agent_rows.sort(key=lambda item: (-item["handled"], item["name"].casefold(), item["id"]))
    by_score = Counter(scores)
    return {
        "totals": {
            "started": totals["started"],
            "answered": totals["answered"],
            "not_answered": totals["not_answered"],
            "outside_hours": totals["outside_hours"],
            "escalated": totals["escalated"],
            "closed": totals["closed"],
            "open_now": open_now,
        },
        "first_reply_minutes": {
            "median": _minutes(replies),
            "average": _whole(sum(replies) / len(replies) / 60) if replies else None,
            "within_5_min_pct": _whole(sum(1 for value in replies if value <= FAST_REPLY_SECONDS) * 100 / len(replies)) if replies else None,
        },
        "chat_length_minutes": {"median": _minutes(lengths)},
        "satisfaction": {"average": _one_decimal(scores), "rated": len(scores), "by_score": {str(n): by_score.get(n, 0) for n in range(1, 6)}},
        "by_channel": list(by_channel.values()),
        "per_day": [{"date": day.isoformat(), **values} for day, values in days.items()],
        "busiest_hours": [{"weekday": weekday, "hour": hour, "started": count} for (weekday, hour), count in sorted(busiest.items())],
        "agents": agent_rows,
    }


def chat_report(filters: Filters, user=None) -> dict:
    """The whole report. Works while the live_chat switch is off, so past chats can still be reported."""
    from apps.platform_config.flags import is_enabled

    data = cached("chat", filters, lambda: _compute(filters))
    return {**data, "live_chat_on": is_enabled("live_chat"), "filters": {"from": filters.start.isoformat(), "to": filters.end.isoformat(), "channel": filters.channel}}

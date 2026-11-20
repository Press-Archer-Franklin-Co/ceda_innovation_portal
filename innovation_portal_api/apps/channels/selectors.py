"""C2 reads: journeys, connections, the session log and the activity report."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.channels.models import ChannelConnection, Journey, JourneySession
from apps.channels.services import SessionService

REPORT_MAX_DAYS = 180


class JourneySelector:
    @staticmethod
    def all():
        return Journey.objects.annotate(node_count=Count("nodes", distinct=True), connection_count=Count("connections", distinct=True)).order_by("name")


class ChannelConnectionSelector:
    @staticmethod
    def all(kind: str | None = None):
        from apps.platform_config.models import IntegrationConnection

        # Every USSD or WhatsApp integration has its channel row (made by a signal); make
        # sure of it for rows saved before this app existed.
        missing = IntegrationConnection.objects.filter(kind__in=IntegrationConnection.MULTI_ACTIVE_KINDS, channel__isnull=True)
        for connection in missing:
            ChannelConnection.objects.get_or_create(connection=connection)
        queryset = ChannelConnection.objects.select_related("connection", "journey").order_by("connection__kind", "connection__name")
        if kind:
            queryset = queryset.filter(connection__kind=kind)
        return queryset


class SessionSelector:
    @staticmethod
    def filtered(params) -> "tuple":
        queryset = JourneySession.objects.select_related("journey", "connection__connection", "version")
        if params.get("include_simulations") not in ("1", "true", "yes"):
            queryset = queryset.filter(is_simulation=False)
        for name in ("channel", "status"):
            if params.get(name):
                queryset = queryset.filter(**{name: params[name]})
        if params.get("journey"):
            queryset = queryset.filter(journey_id=params["journey"])
        if params.get("connection"):
            queryset = queryset.filter(connection_id=params["connection"])
        start = parse_date(params.get("from") or "") if params.get("from") else None
        end = parse_date(params.get("to") or "") if params.get("to") else None
        if start:
            queryset = queryset.filter(started_at__date__gte=start)
        if end:
            queryset = queryset.filter(started_at__date__lte=end)
        return queryset.order_by("-started_at")

    @staticmethod
    def effective_status(session: JourneySession) -> str:
        """An active session nobody answered within its timeout counts as left early."""
        if session.status != JourneySession.Status.ACTIVE:
            return session.status
        limit = SessionService.timeout_seconds(session.channel, session.connection, session.is_simulation)
        if session.last_activity_at < timezone.now() - timedelta(seconds=limit):
            return JourneySession.Status.ABANDONED
        return session.status


class ActivityReportSelector:
    @staticmethod
    def report(params) -> dict:
        today = timezone.localdate()
        start = parse_date(params.get("from") or "") or (today - timedelta(days=29))
        end = parse_date(params.get("to") or "") or today
        if (end - start).days > REPORT_MAX_DAYS:
            start = end - timedelta(days=REPORT_MAX_DAYS)
        queryset = SessionSelector.filtered({**{k: params.get(k) for k in ("channel", "journey", "connection", "include_simulations")}, "from": start.isoformat(), "to": end.isoformat()})

        per_day_rows = queryset.annotate(day=TruncDate("started_at")).values("day").annotate(sessions=Count("id"), ideas=Count("draft", distinct=True), handovers=Count("id", filter=Q(status=JourneySession.Status.HANDED_OVER)))
        by_day = {row["day"]: row for row in per_day_rows}
        per_day = []
        cursor = start
        while cursor <= end:
            row = by_day.get(cursor) or {}
            per_day.append({"date": cursor.isoformat(), "sessions": row.get("sessions", 0), "ideas_started": row.get("ideas", 0), "handovers": row.get("handovers", 0)})
            cursor += timedelta(days=1)

        # Where people stop: the last screen of sessions that were left or timed out,
        # plus sessions still marked active whose timeout has passed.
        stale_cutoff_ussd = timezone.now() - timedelta(seconds=SessionService.timeout_seconds("ussd", None, False))
        stale_cutoff_whatsapp = timezone.now() - timedelta(seconds=SessionService.timeout_seconds("whatsapp", None, False))
        dropped = queryset.filter(
            Q(status__in=[JourneySession.Status.ABANDONED, JourneySession.Status.TIMED_OUT])
            | Q(status=JourneySession.Status.ACTIVE, channel="ussd", last_activity_at__lt=stale_cutoff_ussd)
            | Q(status=JourneySession.Status.ACTIVE, channel="whatsapp", last_activity_at__lt=stale_cutoff_whatsapp)
        )
        drop_rows = dropped.exclude(current_node="").values("journey_id", "journey__name", "current_node").annotate(sessions=Count("id")).order_by("-sessions")[:20]
        node_titles = {}
        for row in drop_rows:
            journey_id = row["journey_id"]
            if journey_id not in node_titles:
                journey = Journey.objects.filter(id=journey_id).first()
                version = journey.latest_version if journey else None
                graph_nodes = (version.graph.get("nodes") if version else {}) or {}
                node_titles[journey_id] = {key: (node.get("title") or key) for key, node in graph_nodes.items()}
        drop_off = [
            {
                "journey_id": str(row["journey_id"]),
                "journey": row["journey__name"],
                "node_key": row["current_node"],
                "node_title": node_titles.get(row["journey_id"], {}).get(row["current_node"], row["current_node"]),
                "sessions": row["sessions"],
            }
            for row in drop_rows
        ]
        totals = queryset.aggregate(
            sessions=Count("id"),
            completed=Count("id", filter=Q(status=JourneySession.Status.COMPLETED)),
            handovers=Count("id", filter=Q(status=JourneySession.Status.HANDED_OVER)),
            ideas_started=Count("draft", distinct=True),
        )
        totals["dropped"] = dropped.count()
        return {"from": start.isoformat(), "to": end.isoformat(), "totals": totals, "per_day": per_day, "drop_off": drop_off}

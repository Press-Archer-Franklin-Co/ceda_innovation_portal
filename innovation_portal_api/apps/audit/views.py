import csv
import uuid
from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, filters
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView

from apps.audit import presentation

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.core.permissions import HasCapability


class AuditPagination(PageNumberPagination):
    page_size            = 25
    page_size_query_param = "page_size"
    max_page_size        = 100

    def get_paginated_response(self, data):
        from rest_framework.response import Response
        return Response({
            "count":    self.page.paginator.count,
            "total_pages": self.page.paginator.num_pages,
            "page":     self.page.number,
            "page_size": self.get_page_size(self.request),
            "next":     self.get_next_link(),
            "previous": self.get_previous_link(),
            "results":  data,
        })


AREA_VALUES = [*presentation.AREAS, "other"]
LIST_PARAMETERS = [
    OpenApiParameter("search", OpenApiTypes.STR, description="Item name or reference, action, or person."),
    OpenApiParameter("actor", OpenApiTypes.UUID, description="Only this person's changes (Everyone when left out)."),
    OpenApiParameter("area", OpenApiTypes.STR, enum=AREA_VALUES),
    OpenApiParameter("days", OpenApiTypes.INT, description="Last N days (7, 30, 90)."),
    OpenApiParameter("date_from", OpenApiTypes.DATE),
    OpenApiParameter("date_to", OpenApiTypes.DATE, description="Up to and including this day."),
    OpenApiParameter("category", OpenApiTypes.STR, description="Older filter, kept for the old screens."),
]


def filter_logs(qs, params):
    """U9 (3.29): person, area and date filters. Bad values answer 400."""
    actor = params.get("actor")
    if actor:
        try:
            qs = qs.filter(actor_id=uuid.UUID(str(actor)))
        except ValueError:
            raise ValidationError({"actor": "Use a person's id."}) from None
    area = params.get("area")
    if area:
        query = presentation.area_q(area)
        if query is None:
            raise ValidationError({"area": f"Use one of: {', '.join(AREA_VALUES)}."})
        qs = qs.filter(query)
    days = params.get("days")
    if days:
        try:
            qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=max(1, int(days))))
        except ValueError:
            raise ValidationError({"days": "Use a whole number of days."}) from None
    for name, lookup in (("date_from", "created_at__date__gte"), ("date_to", "created_at__date__lte")):
        if params.get(name):
            day = parse_date(params[name])
            if day is None:
                raise ValidationError({name: "Use a date like 2026-11-22."})
            qs = qs.filter(**{lookup: day})
    return qs


@extend_schema_view(
    get=extend_schema(
        tags=["Audit"],
        summary="Audit log (3.29)",
        description="Read-only. Each entry: who (actor_name), action_label, area and area_label, item, summary (item plus the first change), "
        "changes [{field, before, after}] for the expandable row, before_state and after_state, ip_address (masked, 102.65.x.x) and device. "
        "Keys and passwords are never stored in the clear.",
        parameters=LIST_PARAMETERS,
    )
)
class AuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["action_type", "target_model", "target_id", "item_label", "actor__first_name", "actor__last_name", "actor__email"]
    ordering_fields    = ["created_at", "action_type", "target_model"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        qs = filter_logs(AuditLog.objects.select_related("actor").order_by("-created_at"), self.request.query_params)
        category = self.request.query_params.get("category")
        if category == "submissions":
            qs = qs.filter(target_model="Submission")
        elif category == "assignments":
            qs = qs.filter(action_type__startswith="assignment_")
        elif category == "evaluations":
            qs = qs.filter(action_type__in=[
                "score_draft_saved", "score_submitted", "score_locked",
                "score_moderated", "final_decision_recorded", "program_shortlist_generated",
            ])
        elif category == "content":
            qs = qs.filter(target_model__in=["NewsArticle", "HackathonPage", "WinnerSpotlight", "LeadershipCard", "FAQ"])
        elif category == "users":
            qs = qs.filter(target_model__in=["User", "Profile"])
        elif category == "programs":
            qs = qs.filter(target_model="Program")
        return qs


class SubmissionAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            target_model="Submission", target_id=str(self.kwargs["submission_id"])
        ).order_by("-created_at")


class AssignmentAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__startswith="assignment_"
        ).order_by("-created_at")


class EvaluationAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__in=[
                "score_draft_saved", "score_submitted", "score_locked",
                "score_moderated", "final_decision_recorded", "program_shortlist_generated",
            ]
        ).order_by("-created_at")


class WorkflowAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__startswith="workflow_"
        ).order_by("-created_at")


class NotificationAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [HasCapability.of("audit.view")]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__in=[
                "communication_sent", "notification_delivery_sent",
                "notification_delivery_failed", "notification_delivery_retried",
            ]
        ).order_by("-created_at")


EXPORT_LIMIT = 10000


def _cell(value) -> str:
    """Stops spreadsheet programs from running a cell as a formula."""
    text = str(value or "")
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


class AuditLogExportView(APIView):
    """U9 (3.29): Export CSV of the filtered list (same filters and search as the list)."""

    permission_classes = [HasCapability.of("audit.view")]

    @extend_schema(tags=["Audit"], summary="Export the filtered audit log as CSV (3.29)", parameters=LIST_PARAMETERS, responses={(200, "text/csv"): OpenApiTypes.STR})
    def get(self, request):
        view = AuditLogListView()
        view.request, view.format_kwarg, view.kwargs = request, None, {}
        qs = filters.SearchFilter().filter_queryset(request, view.get_queryset(), view)[:EXPORT_LIMIT]
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="audit-log-{timezone.localdate():%Y-%m-%d}.csv"'
        writer = csv.writer(response)
        writer.writerow(["When", "Who", "Email", "Action", "Area", "Item", "Changes", "Address", "Device", "Action code", "Item type", "Item id"])
        for row in qs:
            name = AuditLogSerializer().get_actor_name(row)
            changes = "; ".join(f"{item['field']}: {item['before']} -> {item['after']}" for item in presentation.changes(row))
            writer.writerow([_cell(value) for value in [
                timezone.localtime(row.created_at).strftime("%Y-%m-%d %H:%M"),
                name,
                row.actor.email if row.actor else "",
                presentation.action_label(row.action_type),
                presentation.AREAS.get(presentation.area_of(row), {}).get("label", "Other"),
                presentation.item_text(row),
                changes,
                row.ip_address,
                row.device,
                row.action_type,
                row.target_model,
                row.target_id,
            ]])
        return response

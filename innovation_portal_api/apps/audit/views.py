from rest_framework import generics, filters
from rest_framework.pagination import PageNumberPagination

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.core.permissions import IsOfficerAdminOrManagementReadOnly


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


class AuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    pagination_class   = AuditPagination
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["action_type", "target_model", "actor__first_name", "actor__last_name", "actor__email"]
    ordering_fields    = ["created_at", "action_type", "target_model"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor").order_by("-created_at")
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
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            target_model="Submission", target_id=str(self.kwargs["submission_id"])
        ).order_by("-created_at")


class AssignmentAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__startswith="assignment_"
        ).order_by("-created_at")


class EvaluationAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
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
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__startswith="workflow_"
        ).order_by("-created_at")


class NotificationAuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    pagination_class   = AuditPagination

    def get_queryset(self):
        return AuditLog.objects.select_related("actor").filter(
            action_type__in=[
                "communication_sent", "notification_delivery_sent",
                "notification_delivery_failed", "notification_delivery_retried",
            ]
        ).order_by("-created_at")

"""Saved views (B5): named filter sets on the review queue. Owners see their own plus shared ones."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from apps.assignments.models import SavedView
from apps.core.api import api_success
from apps.core.permissions import IsStaffWorker

ALLOWED_FILTERS = {
    "program", "sector", "overdue", "channel", "stage", "role", "mine", "unassigned", "assigned", "completed",
    # R-42: the staff submissions list (scope "submissions").
    "view", "district", "status", "submitted_from", "submitted_to", "search", "ordering",
}


class SavedViewSerializer(serializers.ModelSerializer):
    is_mine = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = SavedView
        fields = ("id", "name", "scope", "filters", "is_shared", "is_mine", "owner_name", "created_at", "updated_at")
        read_only_fields = ("id", "is_mine", "owner_name", "created_at", "updated_at")

    def get_is_mine(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and obj.owner_id == request.user.id)

    def get_owner_name(self, obj) -> str:
        return obj.owner.full_name or obj.owner.email

    def validate_filters(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Filters must be an object.")
        unknown = sorted(set(value) - ALLOWED_FILTERS)
        if unknown:
            raise serializers.ValidationError(f"Unknown filters: {', '.join(unknown)}. Use: {', '.join(sorted(ALLOWED_FILTERS))}.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        name = attrs.get("name")
        scope = attrs.get("scope", SavedView.Scope.REVIEW_QUEUE)
        if name and SavedView.objects.filter(owner=request.user, scope=scope, name=name).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError({"name": "You already have a view with this name."})
        return attrs


class SavedViewListCreateView(APIView):
    permission_classes = [IsStaffWorker]

    @extend_schema(tags=["Saved views"], summary="My saved views and shared ones", responses=SavedViewSerializer(many=True))
    def get(self, request):
        scope = request.query_params.get("scope") or SavedView.Scope.REVIEW_QUEUE
        views = SavedView.objects.filter(scope=scope).filter(Q(owner=request.user) | Q(is_shared=True)).select_related("owner")
        return api_success(data=SavedViewSerializer(views, many=True, context={"request": request}).data)

    @extend_schema(tags=["Saved views"], summary="Save a view", request=SavedViewSerializer, responses={201: SavedViewSerializer})
    def post(self, request):
        serializer = SavedViewSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        view = serializer.save(owner=request.user)
        return api_success(data=SavedViewSerializer(view, context={"request": request}).data, status_code=status.HTTP_201_CREATED)


class SavedViewDetailView(APIView):
    permission_classes = [IsStaffWorker]

    def _own(self, request, view_id):
        view = get_object_or_404(SavedView.objects.filter(Q(owner=request.user) | Q(is_shared=True)), id=view_id)
        if view.owner_id != request.user.id:
            raise PermissionDenied("Only the person who saved this view can change it.")
        return view

    @extend_schema(tags=["Saved views"], summary="Change a saved view", request=SavedViewSerializer, responses=SavedViewSerializer)
    def patch(self, request, view_id):
        view = self._own(request, view_id)
        serializer = SavedViewSerializer(view, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return api_success(data=serializer.data)

    @extend_schema(tags=["Saved views"], summary="Delete a saved view", responses={200: None})
    def delete(self, request, view_id):
        self._own(request, view_id).delete()
        return api_success(data=None, message="View deleted.")

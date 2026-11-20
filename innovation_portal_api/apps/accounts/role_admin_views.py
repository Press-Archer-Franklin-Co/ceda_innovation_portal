"""S2 admin endpoints: roles, the capability matrix, and the website approval flow. All need settings.manage."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.accounts.role_admin import RoleAdminService, catalogue_payload, matrix_payload, role_payload
from apps.core.api import api_success
from apps.core.permissions import HasCapability

TAGS = ["Roles and permissions"]
ADMIN = [HasCapability.of("settings.manage")]


class RoleWriteSerializer(serializers.Serializer):
    name = serializers.JSONField(required=False, help_text='{"en": "...", "tn": "..."} or a plain English string.')
    description = serializers.JSONField(required=False, help_text='{"en": "...", "tn": "..."} or a plain English string.')
    code = serializers.SlugField(required=False, max_length=40, help_text="Optional; made from the name when left out.")
    is_active = serializers.BooleanField(required=False, help_text="False retires a custom role.")


class CapabilitiesWriteSerializer(serializers.Serializer):
    capabilities = serializers.ListField(child=serializers.CharField(max_length=60), allow_empty=True)


class CapabilityCatalogueView(APIView):
    permission_classes = ADMIN

    @extend_schema(tags=TAGS, summary="Every capability, grouped, with labels and locks", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=catalogue_payload())


class RoleListCreateView(APIView):
    permission_classes = ADMIN

    @extend_schema(tags=TAGS, summary="All roles with people counts and capabilities", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=RoleAdminService.list_roles())

    @extend_schema(tags=TAGS, summary="Create a custom role", request=RoleWriteSerializer, responses={201: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = RoleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = RoleAdminService.create(serializer.validated_data, actor=request.user)
        return api_success(data=role_payload(role), message="Role created.", status_code=status.HTTP_201_CREATED)


class RoleDetailView(APIView):
    permission_classes = ADMIN

    @extend_schema(tags=TAGS, summary="Rename, describe or retire a role (built-in roles: description only)", request=RoleWriteSerializer, responses=OpenApiTypes.OBJECT)
    def patch(self, request, role_id):
        role = get_object_or_404(Role, id=role_id)
        serializer = RoleWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        role = RoleAdminService.update(role, serializer.validated_data, actor=request.user)
        return api_success(data=role_payload(role))

    @extend_schema(tags=TAGS, summary="Delete a custom role nobody holds; retire it if people hold it", responses=OpenApiTypes.OBJECT)
    def delete(self, request, role_id):
        role = get_object_or_404(Role, id=role_id)
        outcome = RoleAdminService.delete(role, actor=request.user)
        return api_success(data={"result": outcome}, message="Role deleted." if outcome == "deleted" else "Role retired: people still hold it.")


class RoleCapabilitiesView(APIView):
    permission_classes = ADMIN

    @extend_schema(tags=TAGS, summary="One role's row of the matrix (held, locked, lock reason)", responses=OpenApiTypes.OBJECT)
    def get(self, request, role_id):
        return api_success(data=matrix_payload(get_object_or_404(Role, id=role_id)))

    @extend_schema(
        tags=TAGS,
        summary="Set one role's capabilities",
        description="The whole list for this role. Locked boxes cannot change (users.manage and settings.manage stay with "
        "Administrator; innovators get no staff capabilities); the error lists them.",
        request=CapabilitiesWriteSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, role_id):
        role = get_object_or_404(Role, id=role_id)
        serializer = CapabilitiesWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        RoleAdminService.set_capabilities(role, serializer.validated_data["capabilities"], actor=request.user)
        return api_success(data=matrix_payload(role), message="Permissions saved.")


class ContentApprovalFlowView(APIView):
    permission_classes = ADMIN

    @extend_schema(tags=TAGS, summary="The website approval flow", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.content.approval_flow_admin import flow_payload

        return api_success(data=flow_payload())

    @extend_schema(
        tags=TAGS,
        summary="Save the website approval flow",
        description='{"approvers_can_approve_own_work": true, "steps": [{"id"?, "name", "approver": {"capability": "content.approve"} '
        'or {"role": "setswana_reviewer"}, "approvals_needed": 1, "language": "all"|"en"|"tn"}]} in order.',
        request=OpenApiTypes.OBJECT,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request):
        from apps.content.approval_flow_admin import save_flow

        return api_success(data=save_flow(request.data, actor=request.user), message="Approval steps saved.")

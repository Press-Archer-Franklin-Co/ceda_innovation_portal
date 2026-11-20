from django.urls import path

from apps.accounts.role_admin_views import (
    CapabilityCatalogueView,
    ContentApprovalFlowView,
    RoleCapabilitiesView,
    RoleDetailView,
    RoleListCreateView,
)

urlpatterns = [
    path("roles/", RoleListCreateView.as_view(), name="admin-roles"),
    path("roles/<uuid:role_id>/", RoleDetailView.as_view(), name="admin-role-detail"),
    path("roles/<uuid:role_id>/capabilities/", RoleCapabilitiesView.as_view(), name="admin-role-capabilities"),
    path("capabilities/", CapabilityCatalogueView.as_view(), name="admin-capabilities"),
    path("approval-flows/content/", ContentApprovalFlowView.as_view(), name="admin-approval-flow-content"),
]

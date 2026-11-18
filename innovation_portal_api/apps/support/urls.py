from django.urls import path

from apps.support.views import (
    FAQAdminDetailView,
    FAQAdminListCreateView,
    FAQReorderView,
    InternalTaskListCreateView,
    MySupportRequestListView,
    PublicFAQListView,
    PublicGuidelineListView,
    SupportRequestAdminListView,
    SupportRequestCreateView,
)

urlpatterns = [
    path("faqs/", PublicFAQListView.as_view(), name="public-faqs"),
    path("guidelines/", PublicGuidelineListView.as_view(), name="public-guidelines"),
    path("requests/", SupportRequestCreateView.as_view(), name="support-request-create"),
    path("my-requests/", MySupportRequestListView.as_view(), name="my-support-requests"),

    path("admin/faqs/", FAQAdminListCreateView.as_view(), name="faq-admin-list-create"),
    path("admin/faqs/reorder/", FAQReorderView.as_view(), name="faq-admin-reorder"),
    path("admin/faqs/<uuid:pk>/", FAQAdminDetailView.as_view(), name="faq-admin-detail"),
    path("admin/requests/", SupportRequestAdminListView.as_view(), name="support-request-admin-list"),
    path("tasks/", InternalTaskListCreateView.as_view(), name="internal-task-list-create"),
]

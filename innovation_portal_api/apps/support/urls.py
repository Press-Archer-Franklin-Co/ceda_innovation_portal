from django.urls import path

from apps.support.views import (
    FAQAdminDetailView,
    FAQGroupDetailView,
    FAQGroupListCreateView,
    FAQGroupReorderView,
    UnansweredQuestionDetailView,
    UnansweredQuestionListView,
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
    path("admin/faqs/unanswered/", UnansweredQuestionListView.as_view(), name="faq-admin-unanswered"),
    path("admin/faqs/unanswered/<uuid:pk>/", UnansweredQuestionDetailView.as_view(), name="faq-admin-unanswered-detail"),
    path("admin/faq-groups/", FAQGroupListCreateView.as_view(), name="faq-group-list-create"),
    path("admin/faq-groups/reorder/", FAQGroupReorderView.as_view(), name="faq-group-reorder"),
    path("admin/faq-groups/<uuid:pk>/", FAQGroupDetailView.as_view(), name="faq-group-detail"),
    path("admin/faqs/<uuid:pk>/", FAQAdminDetailView.as_view(), name="faq-admin-detail"),
    path("admin/requests/", SupportRequestAdminListView.as_view(), name="support-request-admin-list"),
    path("tasks/", InternalTaskListCreateView.as_view(), name="internal-task-list-create"),
]

from django.urls import path

from apps.assistant import views

urlpatterns = [
    path("status/", views.StatusView.as_view(), name="assistant-status"),
    path("draft-check/", views.DraftCheckView.as_view(), name="assistant-draft-check"),
    path("help/", views.HelpView.as_view(), name="assistant-help"),
    path("introductions/", views.MyIntroductionsView.as_view(), name="assistant-my-introductions"),
    path("introductions/<uuid:pk>/answer/", views.AnswerIntroductionView.as_view(), name="assistant-introduction-answer"),
    path("submissions/<uuid:pk>/hints/", views.HintsView.as_view(), name="assistant-hints"),
    path("submissions/<uuid:pk>/related/", views.RelatedView.as_view(), name="assistant-related"),
    path("submissions/<uuid:pk>/introductions/", views.SuggestIntroductionView.as_view(), name="assistant-suggest-introduction"),
    path("admin/overview/", views.OverviewView.as_view(), name="assistant-admin-overview"),
    path("admin/settings/", views.SettingsView.as_view(), name="assistant-admin-settings"),
    path("admin/usage/", views.UsageView.as_view(), name="assistant-admin-usage"),
    path("admin/try/", views.TryItView.as_view(), name="assistant-admin-try"),
    path("admin/knowledge/", views.KnowledgeListView.as_view(), name="assistant-knowledge"),
    path("admin/knowledge/reorder/", views.KnowledgeReorderView.as_view(), name="assistant-knowledge-reorder"),
    path("admin/knowledge/<uuid:pk>/", views.KnowledgeDetailView.as_view(), name="assistant-knowledge-detail"),
    path("admin/manual-pages/", views.ManualPageListView.as_view(), name="assistant-manual-pages"),
    path("admin/manual-pages/reorder/", views.ManualPageReorderView.as_view(), name="assistant-manual-pages-reorder"),
    path("admin/manual-pages/<uuid:pk>/", views.ManualPageDetailView.as_view(), name="assistant-manual-page-detail"),
    path("admin/manual-pages/<uuid:pk>/screenshots/", views.ScreenshotUploadView.as_view(), name="assistant-screenshot-upload"),
    path("admin/screenshots/<uuid:pk>/", views.ScreenshotDetailView.as_view(), name="assistant-screenshot-detail"),
]

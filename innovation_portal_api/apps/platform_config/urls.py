from django.urls import path

from apps.platform_config import views

urlpatterns = [
    path("features/", views.FeatureFlagListView.as_view(), name="platform-features"),
    path("features/<slug:key>/", views.FeatureFlagDetailView.as_view(), name="platform-feature-detail"),
    path("public-config/", views.PublicConfigView.as_view(), name="platform-public-config"),
    path("providers/", views.ProviderListView.as_view(), name="platform-providers"),
    path("integrations/", views.IntegrationListCreateView.as_view(), name="platform-integrations"),
    path("integrations/runtime/", views.IntegrationRuntimeView.as_view(), name="platform-integrations-runtime"),
    path("integrations/<uuid:pk>/", views.IntegrationDetailView.as_view(), name="platform-integration-detail"),
    path("integrations/<uuid:pk>/test/", views.IntegrationTestView.as_view(), name="platform-integration-test"),
    path("integrations/<uuid:pk>/activate/", views.IntegrationActivateView.as_view(), name="platform-integration-activate"),
    path("integrations/<uuid:pk>/deactivate/", views.IntegrationDeactivateView.as_view(), name="platform-integration-deactivate"),
    path("integrations/<uuid:pk>/history/", views.IntegrationHistoryView.as_view(), name="platform-integration-history"),
    path("integrations/<uuid:pk>/sso-trial/start/", views.SSOTrialStartView.as_view(), name="platform-sso-trial-start"),
    path("integrations/<uuid:pk>/sms-status/", views.SMSStatusWebhookView.as_view(), name="platform-sms-status"),
    path("sso-trial/complete/", views.SSOTrialCompleteView.as_view(), name="platform-sso-trial-complete"),
]

from django.urls import path

from apps.channels import views

urlpatterns = [
    path("status/", views.ChannelStatusView.as_view(), name="channels-status"),
    path("public/", views.PublicChannelsView.as_view(), name="channels-public"),
    path("node-types/", views.NodeTypesView.as_view(), name="channels-node-types"),
    path("providers/", views.ProvidersView.as_view(), name="channels-providers"),
    path("journeys/", views.JourneyListCreateView.as_view(), name="channels-journeys"),
    path("journeys/<uuid:pk>/", views.JourneyDetailView.as_view(), name="channels-journey-detail"),
    path("journeys/<uuid:pk>/nodes/", views.JourneyNodesView.as_view(), name="channels-journey-nodes"),
    path("journeys/<uuid:pk>/nodes/<slug:key>/", views.JourneyNodeDetailView.as_view(), name="channels-journey-node-detail"),
    path("journeys/<uuid:pk>/validate/", views.JourneyValidateView.as_view(), name="channels-journey-validate"),
    path("journeys/<uuid:pk>/publish/", views.JourneyPublishView.as_view(), name="channels-journey-publish"),
    path("journeys/<uuid:pk>/versions/", views.JourneyVersionsView.as_view(), name="channels-journey-versions"),
    path("connections/", views.ChannelConnectionListCreateView.as_view(), name="channels-connections"),
    path("connections/<uuid:pk>/", views.ChannelConnectionDetailView.as_view(), name="channels-connection-detail"),
    path("connections/<uuid:pk>/test/", views.ChannelConnectionTestView.as_view(), name="channels-connection-test"),
    path("connections/<uuid:pk>/activate/", views.ChannelConnectionActivateView.as_view(), name="channels-connection-activate"),
    path("connections/<uuid:pk>/deactivate/", views.ChannelConnectionDeactivateView.as_view(), name="channels-connection-deactivate"),
    path("connections/<uuid:pk>/rotate-webhook/", views.ChannelConnectionRotateView.as_view(), name="channels-connection-rotate"),
    path("sessions/", views.SessionListView.as_view(), name="channels-sessions"),
    path("sessions/<uuid:pk>/", views.SessionDetailView.as_view(), name="channels-session-detail"),
    path("report/", views.ActivityReportView.as_view(), name="channels-report"),
    path("simulate/", views.SimulateView.as_view(), name="channels-simulate"),
    path("ussd/<str:token>/", views.USSDWebhookView.as_view(), name="channels-ussd-webhook"),
    path("whatsapp/<str:token>/", views.WhatsAppWebhookView.as_view(), name="channels-whatsapp-webhook"),
]

from django.urls import path

from apps.conversations.views import HelpChatActionView, HelpChatMineView, HelpChatStartView, HelpChatStatusView, HelpChatView

urlpatterns = [
    path("", HelpChatStartView.as_view(), name="help-chat-start"),
    path("status/", HelpChatStatusView.as_view(), name="help-chat-status"),
    path("mine/", HelpChatMineView.as_view(), name="help-chat-mine"),
    path("<uuid:pk>/", HelpChatView.as_view(), name="help-chat"),
    path("<uuid:pk>/<slug:action>/", HelpChatActionView.as_view(), name="help-chat-action"),
]

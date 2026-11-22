from django.urls import path

from apps.conversations.views import ConversationActionView, ConversationView, InboxPeopleView, InboxUnreadView, InboxView

urlpatterns = [
    path("", InboxView.as_view(), name="inbox"),
    path("unread/", InboxUnreadView.as_view(), name="inbox-unread"),
    path("people/", InboxPeopleView.as_view(), name="inbox-people"),
    path("conversations/<uuid:pk>/", ConversationView.as_view(), name="inbox-conversation"),
    path("conversations/<uuid:pk>/<slug:action>/", ConversationActionView.as_view(), name="inbox-conversation-action"),
]

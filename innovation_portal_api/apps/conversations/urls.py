from django.urls import path

from apps.conversations.views import ConversationActionView, ConversationView, InboxPeopleView, InboxSavedRepliesView, InboxUnreadView, InboxView

urlpatterns = [
    path("", InboxView.as_view(), name="inbox"),
    path("unread/", InboxUnreadView.as_view(), name="inbox-unread"),
    path("people/", InboxPeopleView.as_view(), name="inbox-people"),
    path("saved-replies/", InboxSavedRepliesView.as_view(), name="inbox-saved-replies"),
    path("conversations/<uuid:pk>/", ConversationView.as_view(), name="inbox-conversation"),
    path("conversations/<uuid:pk>/<slug:action>/", ConversationActionView.as_view(), name="inbox-conversation-action"),
]

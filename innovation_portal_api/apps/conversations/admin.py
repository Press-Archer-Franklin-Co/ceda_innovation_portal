from django.contrib import admin

from apps.conversations.models import Conversation, ConversationMessage, LiveChatSettings

admin.site.register(Conversation)
admin.site.register(ConversationMessage)
admin.site.register(LiveChatSettings)

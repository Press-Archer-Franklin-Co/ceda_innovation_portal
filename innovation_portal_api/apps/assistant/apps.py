from django.apps import AppConfig


class AssistantConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assistant"
    verbose_name = "AI helper"

    def ready(self):
        from django.db.models.signals import post_save

        from apps.submissions.models import Submission

        post_save.connect(_submission_saved, sender=Submission, dispatch_uid="assistant_idea_profile")

        from django.db.models.signals import post_delete

        from apps.assistant.models import KnowledgeDocument, KnowledgeEntry, ManualPage, ManualScreenshot

        for model in (KnowledgeEntry, ManualPage, ManualScreenshot, KnowledgeDocument):
            post_save.connect(_knowledge_changed, sender=model, dispatch_uid=f"assistant_guide_cache_save_{model.__name__}")
            post_delete.connect(_knowledge_changed, sender=model, dispatch_uid=f"assistant_guide_cache_delete_{model.__name__}")


def _submission_saved(sender, instance, created, raw=False, **kwargs):
    """A sent idea gets (or refreshes) its idea profile in the background (A5). Drafts never do."""
    if raw or instance.current_status == "draft":
        return
    from apps.assistant.profiles import queue_profile

    queue_profile(instance.pk)


def _knowledge_changed(sender, **kwargs):
    """Manual pages or knowledge changed: cached guide answers must not be reused (B1)."""
    from apps.assistant.guide import bump_knowledge_version

    bump_knowledge_version()

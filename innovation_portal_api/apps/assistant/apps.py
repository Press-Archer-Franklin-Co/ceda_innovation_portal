from django.apps import AppConfig


class AssistantConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.assistant"
    verbose_name = "AI helper"

    def ready(self):
        from django.db.models.signals import post_save

        from apps.submissions.models import Submission

        post_save.connect(_submission_saved, sender=Submission, dispatch_uid="assistant_idea_profile")


def _submission_saved(sender, instance, created, raw=False, **kwargs):
    """A sent idea gets (or refreshes) its idea profile in the background (A5). Drafts never do."""
    if raw or instance.current_status == "draft":
        return
    from apps.assistant.profiles import queue_profile

    queue_profile(instance.pk)

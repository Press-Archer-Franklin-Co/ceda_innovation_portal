from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class FAQGroup(UUIDModel, TimeStampedModel):
    """B6 part 2: a heading that FAQs sit under. English in name, Setswana in translations."""

    name = models.CharField(max_length=160)
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"name": "..."}}')
    ordering = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("ordering", "name")

    def __str__(self):
        return self.name


class FAQ(UUIDModel, TimeStampedModel):
    PLACEMENTS = ("help", "home", "program", "whatsapp_bot")

    question = models.CharField(max_length=255)
    answer = models.TextField()
    ordering = models.PositiveIntegerField(default=1)
    is_public = models.BooleanField(default=True)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, null=True, blank=True, related_name="faqs", help_text="Shown on this challenge's page.")
    group = models.ForeignKey(FAQGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name="faqs")
    placements = models.JSONField(default=list, blank=True, help_text='Where it shows: help, home, program, whatsapp_bot.')
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"question": "...", "answer": "..."}}')

    class Meta:
        ordering = ("ordering", "question")


class Guideline(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    content = models.TextField()
    document_url = models.URLField(blank=True)
    audience = models.CharField(max_length=120, blank=True)
    is_public = models.BooleanField(default=True)


class SupportRequest(UUIDModel, TimeStampedModel):
    request_type = models.CharField(max_length=50, default="technical_support")
    subject = models.CharField(max_length=255)
    description = models.TextField()
    email = models.EmailField()
    phone_number = models.CharField(max_length=30, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="support_requests")
    submission = models.ForeignKey("submissions.Submission", on_delete=models.SET_NULL, null=True, blank=True, related_name="support_requests")
    status = models.CharField(max_length=50, default="open")
    resolution_notes = models.TextField(blank=True)


class InternalTask(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default="open")


class EscalationRecord(UUIDModel, TimeStampedModel):
    task = models.ForeignKey(InternalTask, on_delete=models.CASCADE, related_name="escalations")
    reason = models.TextField()
    escalated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)


class UnansweredQuestion(UUIDModel, TimeStampedModel):
    """Searches and chat questions that found nothing, so staff can write the missing FAQ."""

    class Source(models.TextChoices):
        SEARCH = "search", "Site search"
        CHAT = "chat", "Chat"

    text = models.CharField(max_length=255, db_index=True, help_text="Lower-cased and trimmed.")
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.SEARCH)
    count = models.PositiveIntegerField(default=1)
    last_asked_at = models.DateTimeField(auto_now=True, db_index=True)
    resolved_by_faq = models.ForeignKey(FAQ, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("-count", "-last_asked_at")
        constraints = [models.UniqueConstraint(fields=["text", "source"], name="uq_unanswered_text_source")]


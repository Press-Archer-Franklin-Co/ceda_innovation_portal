"""B6 part 2 services: stories with consent, subscriptions, post blasts, site search."""

from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.content.models import ContentItem, Story, Subscriber
from apps.core.i18n import get_text

GROUP_LIMIT = 4


def _iso(value):
    return value.isoformat() if value else None


def text_in(obj, attr, lang):
    english = getattr(obj, attr, "") or ""
    tn = ((obj.translations or {}).get("tn") or {}).get(attr, "")
    return tn if lang == "tn" and isinstance(tn, str) and tn.strip() else english


# --- Stories ------------------------------------------------------------------------------


class StoryService:
    @staticmethod
    def check_featured(story: Story) -> None:
        if not story.is_featured:
            return
        others = Story.objects.filter(is_featured=True).exclude(pk=story.pk).count()
        if others >= Story.MAX_FEATURED:
            raise ValidationError({"is_featured": f"Only {Story.MAX_FEATURED} stories can be featured. Unstar one first."})

    @staticmethod
    def check_publishable(story: Story) -> None:
        if story.user_id and story.consent_status != Story.Consent.GIVEN:
            raise ValidationError({"consent": "This story is about a person on the portal. Ask for their consent and wait for it before publishing."})

    @classmethod
    @transaction.atomic
    def save(cls, story: Story, *, actor) -> Story:
        if story.user_id and story.consent_status == Story.Consent.NOT_NEEDED:
            story.consent_status = Story.Consent.NOT_ASKED
        if not story.user_id and story.consent_status in (Story.Consent.NOT_ASKED,):
            story.consent_status = Story.Consent.NOT_NEEDED
        cls.check_featured(story)
        if story.status == Story.Status.PUBLISHED:
            cls.check_publishable(story)
            story.published_at = story.published_at or timezone.now()
        story.save()
        from apps.content.services import clear_home_cache

        clear_home_cache()
        AuditService.log_action(actor=actor, action_type="story_saved", target=story, after_state={"status": story.status, "featured": story.is_featured})
        return story

    @staticmethod
    @transaction.atomic
    def request_consent(story: Story, *, actor) -> Story:
        from apps.communications.messaging import _link
        from apps.notifications.services import NotificationService

        if not story.user_id:
            raise ValidationError({"detail": "This story is not linked to a person on the portal, so no consent is needed."})
        if story.consent_status == Story.Consent.GIVEN:
            raise ValidationError({"detail": "Consent was already given."})
        story.consent_status = Story.Consent.REQUESTED
        story.consent_requested_at = timezone.now()
        story.save(update_fields=["consent_status", "consent_requested_at", "updated_at"])
        note = NotificationService.notify(
            user=story.user,
            notification_type="story_consent",
            title="May we share your story?",
            message=f'CEDA would like to share a story about "{story.business or story.person_name}" on the portal. Please say yes or no.',
        )
        _link(note, "consent", story.id)
        AuditService.log_action(actor=actor, action_type="story_consent_requested", target=story)
        return story

    @staticmethod
    @transaction.atomic
    def record_consent(story: Story, *, user, agree: bool) -> Story:
        if story.user_id != user.id:
            raise ValidationError({"detail": "Not found."})
        story.consent_status = Story.Consent.GIVEN if agree else Story.Consent.DECLINED
        story.consent_decided_at = timezone.now()
        if not agree and story.status == Story.Status.PUBLISHED:
            story.status = Story.Status.ARCHIVED
        story.save(update_fields=["consent_status", "consent_decided_at", "status", "updated_at"])
        AuditService.log_action(actor=user, action_type="story_consent_given" if agree else "story_consent_declined", target=story)
        return story

    @staticmethod
    def card(story: Story, lang: str, request=None) -> dict:
        from apps.content.services import media_payload

        return {
            "id": str(story.id),
            "person_name": story.person_name,
            "business": text_in(story, "business", lang),
            "place": text_in(story, "place", lang),
            "sector": {"id": str(story.sector_id), "slug": story.sector.slug, "name": get_text(story.sector.name, lang)} if story.sector_id else None,
            "quote": text_in(story, "quote", lang),
            "stats": [{"value": item.get("value", ""), "label": _pick(item.get("label"), lang)} for item in story.stats or [] if isinstance(item, dict)],
            "cover": media_payload(story.cover, request) if story.cover_id else None,
            "program": {"id": str(story.program_id), "title": story.program.title, "slug": story.program.slug} if story.program_id else None,
            "is_featured": story.is_featured,
            "published_at": _iso(story.published_at),
        }

    @staticmethod
    def public_queryset():
        return Story.objects.filter(status=Story.Status.PUBLISHED).filter(Q(user__isnull=True) | Q(consent_status=Story.Consent.GIVEN)).select_related("sector", "program", "cover")


def _pick(value, lang):
    if isinstance(value, dict):
        text = value.get(lang) or ""
        return text if text.strip() else value.get("en", "")
    return value or ""


# --- Subscriptions ------------------------------------------------------------------------------


class SubscriptionService:
    @staticmethod
    @transaction.atomic
    def subscribe(*, email: str = "", phone: str = "", topics=None, language: str = "en") -> Subscriber:
        email = (email or "").strip().lower()
        if not email and not phone:
            raise ValidationError({"detail": "Give an email address or a WhatsApp number."})
        topics = [topic for topic in (topics or Subscriber.TOPICS) if topic in Subscriber.TOPICS] or list(Subscriber.TOPICS)
        subscriber = Subscriber.objects.filter(email=email).first() if email else Subscriber.objects.filter(phone=phone, email="").first()
        if subscriber is None:
            subscriber = Subscriber.objects.create(email=email, phone=phone, topics=topics, language=language)
        else:
            subscriber.topics, subscriber.language, subscriber.unsubscribed_at = topics, language, None
            if phone:
                subscriber.phone = phone
            subscriber.save()
        if email and not subscriber.confirmed_at:
            base = getattr(settings, "PUBLIC_BASE_URL", "").rstrip("/")
            send_mail(
                "Please confirm your CEDA updates",
                f"Confirm that you want CEDA Innovation news by opening this link: {base}/subscribe/confirm/{subscriber.confirm_token}\n"
                f"If this was not you, ignore this email.",
                getattr(settings, "DEFAULT_FROM_EMAIL", None),
                [email],
                fail_silently=True,
            )
        return subscriber

    @staticmethod
    def confirm(token) -> Subscriber | None:
        subscriber = Subscriber.objects.filter(confirm_token=token).first()
        if subscriber and not subscriber.confirmed_at:
            subscriber.confirmed_at = timezone.now()
            subscriber.save(update_fields=["confirmed_at", "updated_at"])
        return subscriber

    @staticmethod
    def unsubscribe(token) -> Subscriber | None:
        subscriber = Subscriber.objects.filter(unsubscribe_token=token).first()
        if subscriber and not subscriber.unsubscribed_at:
            subscriber.unsubscribed_at = timezone.now()
            subscriber.save(update_fields=["unsubscribed_at", "updated_at"])
        return subscriber

    @staticmethod
    def counts() -> dict:
        live = Subscriber.objects.filter(unsubscribed_at__isnull=True)
        return {
            "email": live.exclude(email="").filter(confirmed_at__isnull=False).count(),
            "email_unconfirmed": live.exclude(email="").filter(confirmed_at__isnull=True).count(),
            "whatsapp": live.exclude(phone="").count(),
        }

    @staticmethod
    def blast(post: ContentItem, *, actor):
        from apps.content.models import PostBlast

        if post.status != "published":
            raise ValidationError({"detail": "Publish the post before sending it to subscribers."})
        blast = PostBlast.objects.create(
            post=post,
            requested_by=actor,
            whatsapp_pending=Subscriber.objects.filter(unsubscribed_at__isnull=True).exclude(phone="").count(),
        )
        transaction.on_commit(lambda: SubscriptionService._queue_blast(blast.id))
        AuditService.log_action(actor=actor, action_type="post_blast_queued", target=post, metadata={"blast_id": str(blast.id)})
        return blast

    @staticmethod
    def _queue_blast(blast_id):
        """Send in the background; without a broker (or with eager tasks) send right away."""
        from apps.content.tasks import send_post_blast

        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            return SubscriptionService.send_blast(blast_id)
        try:
            send_post_blast.delay(str(blast_id))
        except Exception:
            SubscriptionService.send_blast(blast_id)

    @staticmethod
    def send_blast(blast_id) -> int:
        from apps.content.models import PostBlast

        blast = PostBlast.objects.select_related("post").get(id=blast_id)
        if blast.sent_at:
            return blast.email_count
        post = blast.post
        base = getattr(settings, "PUBLIC_BASE_URL", "").rstrip("/")
        sent = 0
        for subscriber in Subscriber.objects.filter(unsubscribed_at__isnull=True, confirmed_at__isnull=False).exclude(email=""):
            lang = subscriber.language if subscriber.language in ("en", "tn") else "en"
            body = (
                f"{text_in(post, 'excerpt', lang)}\n\nRead more: {base}/news/{post.slug}\n\n"
                f"Stop these emails: {base}/unsubscribe/{subscriber.unsubscribe_token}"
            )
            sent += send_mail(text_in(post, "title", lang), body, getattr(settings, "DEFAULT_FROM_EMAIL", None), [subscriber.email], fail_silently=True)
        PostBlast.objects.filter(pk=blast.pk).update(email_count=sent, sent_at=timezone.now())
        return sent


# --- Site search (1.3) ------------------------------------------------------------------------


def _ranked(queryset, fields, query):
    # Filter on the text match itself: ts_rank is above 0 (about 1e-20) even when nothing matches.
    vector = SearchVector(*fields)
    return queryset.annotate(document=vector, rank=SearchRank(vector, query)).filter(document=query).order_by("-rank")


def site_search(q: str, *, lang: str = "en", log_empty: bool = True) -> dict:
    """Published challenges, stories, posts and help, grouped, at most 4 each, plus a total."""
    from apps.programs.challenge_public import challenge_status, public_queryset
    from apps.support.models import FAQ, Guideline, UnansweredQuestion

    q = (q or "").strip()
    if len(q) < 2:
        return {"q": q, "total": 0, "groups": {"challenges": [], "stories": [], "posts": [], "help": []}}
    query = SearchQuery(q, search_type="websearch")

    def matched(queryset, fields, contains_fields):
        found = list(_ranked(queryset, fields, query)[:GROUP_LIMIT])
        if found:
            return found
        # Short words and Setswana text are not stemmed well; fall back to a plain contains match.
        contains = Q()
        for field in contains_fields:
            contains |= Q(**{f"{field}__icontains": q})
        return list(queryset.filter(contains)[:GROUP_LIMIT])

    now = timezone.now()
    challenges = matched(public_queryset(), ["title", "summary", "description"], ["title", "summary", "description", "translations"])
    stories = matched(StoryService.public_queryset(), ["person_name", "business", "quote", "place"], ["person_name", "business", "quote", "translations"])
    from apps.content.services import PostService

    posts = matched(PostService.public_queryset(), ["title", "excerpt", "body"], ["title", "excerpt", "body", "translations"])
    faqs = matched(FAQ.objects.filter(is_public=True), ["question", "answer"], ["question", "answer", "translations"])
    guides = matched(Guideline.objects.filter(is_public=True), ["title", "content"], ["title", "content"])

    groups = {
        "challenges": [
            {"kind": "challenge", "title": item.title, "slug": item.slug, "status": challenge_status(item, now), "days_left": max(0, (item.submission_closes_at - now).days) if item.submission_closes_at and item.submission_closes_at > now else 0}
            for item in challenges
        ],
        "stories": [
            {"kind": "story", "title": item.business or item.person_name, "id": str(item.id), "person_name": item.person_name, "sector": get_text(item.sector.name, lang) if item.sector_id else None}
            for item in stories
        ],
        "posts": [
            {"kind": "post", "title": text_in(item, "title", lang), "slug": item.slug, "type": item.type, "published_at": _iso(item.published_at)}
            for item in posts
        ],
        "help": (
            [{"kind": "faq", "title": text_in(item, "question", lang), "id": str(item.id), "help_kind": "faq"} for item in faqs]
            + [{"kind": "guideline", "title": item.title, "id": str(item.id), "url": item.document_url or None, "help_kind": "guideline"} for item in guides]
        )[:GROUP_LIMIT],
    }
    total = sum(len(items) for items in groups.values())
    if total == 0 and log_empty:
        text = " ".join(q.lower().split())[:255]
        updated = UnansweredQuestion.objects.filter(text=text, source=UnansweredQuestion.Source.SEARCH).update(count=F("count") + 1, last_asked_at=timezone.now())
        if not updated:
            UnansweredQuestion.objects.create(text=text, source=UnansweredQuestion.Source.SEARCH)
    return {"q": q, "total": total, "groups": groups}

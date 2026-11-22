"""AI helper writes that do not call the AI: introductions, guidance, the user manual and settings.

The AI-calling features are in features.py; every call goes through gateway.py.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.assistant.models import AssistantSettings, Introduction, KnowledgeEntry, ManualPage, ManualScreenshot
from apps.audit.services import AuditService


# -- introductions -------------------------------------------------------------------------------

INTRO_TEXT = {
    "title": "Would you like to meet another innovator?",
    "body": (
        "A CEDA officer thinks your idea \"{mine}\" could work well with another innovator's idea. {reason} "
        "Do you agree to be introduced? We share your name and contact details only if you both say yes."
    ),
}


class IntroductionService:
    @staticmethod
    @transaction.atomic
    def suggest(*, actor, submission, other, kind: str, reason: str) -> Introduction:
        if other.pk == submission.pk:
            raise ValidationError({"other_submission": ["Choose a different idea."]})
        if not submission.innovator_id or not other.innovator_id:
            raise ValidationError({"other_submission": ["Both ideas need an innovator with an account, so they can answer."]})
        if submission.innovator_id == other.innovator_id:
            raise ValidationError({"other_submission": ["Both ideas belong to the same innovator."]})
        pair = {submission.pk, other.pk}
        open_ones = Introduction.objects.filter(status__in=[Introduction.Status.WAITING, Introduction.Status.AGREED])
        if open_ones.filter(first_submission__in=pair, second_submission__in=pair).exists():
            raise ValidationError({"other_submission": ["These two ideas already have an introduction."]})
        intro = Introduction.objects.create(
            first_submission=submission, second_submission=other, kind=kind, reason=reason.strip(), suggested_by=actor
        )
        for mine in (submission, other):
            IntroductionService._notify(mine.innovator, INTRO_TEXT["title"], INTRO_TEXT["body"].format(mine=mine.title, reason=intro.reason).strip(), intro)
        AuditService.log_action(
            actor=actor, action_type="introduction_suggested", target=intro,
            metadata={"first_submission": str(submission.pk), "second_submission": str(other.pk), "kind": kind},
        )
        return intro

    @staticmethod
    def _notify(user, title: str, body: str, intro: Introduction) -> None:
        from apps.notifications.services import NotificationService

        notification = NotificationService.notify(user=user, notification_type="introduction", title=title, message=body, send_email=True)
        if notification is not None:
            type(notification).objects.filter(pk=notification.pk).update(link_type="introduction", link_id=str(intro.pk))

    @staticmethod
    def side(intro: Introduction, user) -> str:
        if intro.first_submission.innovator_id == user.pk:
            return "first"
        if intro.second_submission.innovator_id == user.pk:
            return "second"
        return ""

    @staticmethod
    @transaction.atomic
    def answer(*, intro: Introduction, user, agree: bool) -> Introduction:
        intro = Introduction.objects.select_for_update(of=("self",)).select_related("first_submission__innovator", "second_submission__innovator").get(pk=intro.pk)
        side = IntroductionService.side(intro, user)
        if not side:
            raise NotFound()
        if intro.status != Introduction.Status.WAITING:
            raise ValidationError({"code": "already_decided", "detail": "This introduction is already decided."})
        setattr(intro, f"{side}_answer", Introduction.Answer.YES if agree else Introduction.Answer.NO)
        setattr(intro, f"{side}_answered_at", timezone.now())
        if not agree:
            intro.status = Introduction.Status.DECLINED
        elif intro.first_answer == Introduction.Answer.YES and intro.second_answer == Introduction.Answer.YES:
            intro.status = Introduction.Status.AGREED
        intro.save()
        AuditService.log_action(actor=user, action_type="introduction_answered", target=intro, metadata={"side": side, "agree": agree, "status": intro.status})
        if intro.status == Introduction.Status.AGREED:
            first, second = intro.first_submission, intro.second_submission
            for mine, theirs in ((first, second), (second, first)):
                person = theirs.innovator
                contact = ", ".join(part for part in (person.email or "", getattr(person, "phone_number", "") or "") if part)
                IntroductionService._notify(
                    mine.innovator,
                    "You both agreed to meet",
                    f"{person.full_name or 'The other innovator'} ({theirs.title}) agreed too. You can contact them: {contact or 'through CEDA'}.",
                    intro,
                )
        if intro.status != Introduction.Status.WAITING and intro.suggested_by_id:
            IntroductionService._notify(
                intro.suggested_by,
                "Introduction answered",
                "Both innovators agreed to be introduced." if intro.status == Introduction.Status.AGREED else "One innovator declined the introduction.",
                intro,
            )
        return intro


def introduction_for_innovator(intro: Introduction, user) -> dict:
    """What one innovator may see: their own idea, the reason, and the other person only after both said yes."""
    side = IntroductionService.side(intro, user)
    mine = intro.first_submission if side == "first" else intro.second_submission
    theirs = intro.second_submission if side == "first" else intro.first_submission
    data = {
        "id": str(intro.pk),
        "status": intro.status,
        "kind": intro.kind,
        "reason": intro.reason,
        "my_answer": getattr(intro, f"{side}_answer"),
        "my_idea": {"id": str(mine.pk), "title": mine.title},
        "other": None,
        "created_at": intro.created_at.isoformat(),
    }
    if intro.status == Introduction.Status.AGREED:
        person = theirs.innovator
        data["other"] = {"name": person.full_name, "email": person.email or "", "phone": getattr(person, "phone_number", "") or "", "idea_title": theirs.title}
    return data


# -- admin: knowledge, manual, settings ------------------------------------------------------------


def _snapshot(obj, fields) -> dict:
    return {name: str(getattr(obj, name)) for name in fields}


KNOWLEDGE_FIELDS = ("title", "audience", "language", "text", "is_active", "ordering")
PAGE_FIELDS = ("title", "audience", "language", "text", "portal_path", "is_active", "ordering")


class KnowledgeService:
    @staticmethod
    def save(*, actor, instance: KnowledgeEntry | None, data: dict) -> KnowledgeEntry:
        before = _snapshot(instance, KNOWLEDGE_FIELDS) if instance else {}
        instance = instance or KnowledgeEntry()
        for key, value in data.items():
            setattr(instance, key, value)
        instance.updated_by = actor
        instance.save()
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_saved", target=instance, before_state=before, after_state=_snapshot(instance, KNOWLEDGE_FIELDS))
        return instance

    @staticmethod
    def delete(*, actor, instance: KnowledgeEntry) -> None:
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_deleted", target=instance, before_state=_snapshot(instance, KNOWLEDGE_FIELDS))
        instance.delete()

    @staticmethod
    @transaction.atomic
    def reorder(*, actor, model, ids: list[str]) -> None:
        for index, pk in enumerate(ids):
            model.objects.filter(pk=pk).update(ordering=index)
        AuditService.log_raw_action(actor=actor, action_type=f"assistant_{model.__name__.lower()}_reordered", target_model=model.__name__, target_id="", metadata={"ids": [str(pk) for pk in ids]})


class ManualService:
    @staticmethod
    def save(*, actor, instance: ManualPage | None, data: dict) -> ManualPage:
        before = _snapshot(instance, PAGE_FIELDS) if instance else {}
        instance = instance or ManualPage()
        for key, value in data.items():
            setattr(instance, key, value)
        instance.updated_by = actor
        instance.save()
        AuditService.log_action(actor=actor, action_type="assistant_manual_saved", target=instance, before_state=before, after_state=_snapshot(instance, PAGE_FIELDS))
        return instance

    @staticmethod
    def delete(*, actor, instance: ManualPage) -> None:
        AuditService.log_action(actor=actor, action_type="assistant_manual_deleted", target=instance, before_state=_snapshot(instance, PAGE_FIELDS))
        instance.delete()

    @staticmethod
    @transaction.atomic
    def add_screenshot(*, actor, page: ManualPage, upload, caption: dict, ordering: int | None = None) -> ManualScreenshot:
        from apps.media_library.models import MediaAsset
        from apps.media_library.services import MediaService

        asset = MediaService.create_asset(actor=actor, upload=upload, expected_kind=MediaAsset.Kind.IMAGE, alt_text={"en": caption.get("en", ""), "tn": caption.get("tn", "")})
        shot = ManualScreenshot.objects.create(page=page, asset=asset, caption=caption, ordering=ordering if ordering is not None else page.screenshots.count())
        AuditService.log_action(actor=actor, action_type="assistant_screenshot_added", target=shot, metadata={"page": str(page.pk), "asset": str(asset.pk)})
        return shot

    @staticmethod
    def update_screenshot(*, actor, shot: ManualScreenshot, caption: dict | None, ordering: int | None) -> ManualScreenshot:
        before = {"caption": shot.caption, "ordering": shot.ordering}
        if caption is not None:
            shot.caption = caption
        if ordering is not None:
            shot.ordering = ordering
        shot.save()
        AuditService.log_action(actor=actor, action_type="assistant_screenshot_updated", target=shot, before_state=before, after_state={"caption": shot.caption, "ordering": shot.ordering})
        return shot

    @staticmethod
    def delete_screenshot(*, actor, shot: ManualScreenshot) -> None:
        AuditService.log_action(actor=actor, action_type="assistant_screenshot_deleted", target=shot, before_state={"page": str(shot.page_id), "asset": str(shot.asset_id)})
        shot.delete()


SETTINGS_FIELDS = ("keys_in_use", "routes", "features", "monthly_limit_usd", "send_names", "guests_can_use_guide")


class AssistantSettingsService:
    @staticmethod
    @transaction.atomic
    def update(*, actor, data: dict) -> AssistantSettings:
        """3.34b: keys in use, the service for each feature, feature switches, the limit and privacy switches.

        These never touch a key. Keys are added and tested in Platform settings > Integrations.
        The ai_helper switch (helper_on) is the platform feature flag.
        """
        from apps.platform_config.models import IntegrationConnection
        from apps.platform_config.services import FeatureFlagService

        if "helper_on" in data:
            FeatureFlagService.set_enabled(key="ai_helper", enabled=bool(data.pop("helper_on")), actor=actor)
        row = AssistantSettings.load()
        row = AssistantSettings.objects.select_for_update().get(pk=row.pk)
        before = {key: getattr(row, key) for key in SETTINGS_FIELDS if key in data}
        if "routes" in data:
            routes = dict(row.routes or {})
            for feature, route in (data["routes"] or {}).items():
                if not route:
                    routes.pop(feature, None)
                    continue
                connection_id = route.get("connection")
                if connection_id and not IntegrationConnection.objects.filter(pk=connection_id, kind="ai").exists():
                    raise ValidationError({"routes": [f"{feature}: that service is not set up."]})
                routes[feature] = {key: str(route[key]) for key in ("provider", "connection", "model") if route.get(key)}
            data["routes"] = routes
        if "features" in data:
            data["features"] = {**(row.features or {}), **{str(k): bool(v) for k, v in data["features"].items()}}
        for key in SETTINGS_FIELDS:
            if key in data:
                setattr(row, key, data[key])
        row.updated_by = actor
        row.save()
        from django.core.cache import cache

        cache.delete("assistant:public-features")
        AuditService.log_raw_action(
            actor=actor,
            action_type="assistant_settings_updated",
            target_model="AssistantSettings",
            target_id=str(row.pk),
            before_state={key: str(value) for key, value in before.items()},
            after_state={key: str(getattr(row, key)) for key in before},
        )
        return row

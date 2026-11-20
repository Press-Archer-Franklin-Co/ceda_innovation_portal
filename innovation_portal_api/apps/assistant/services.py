"""AI helper features (C3). Writes and calls; reads are in selectors.py.

Each feature returns plain dicts for the views, or raises AssistantUnavailable so the screen hides
the helper. Access is checked before anything is sent: the views pass only objects the person
may see, and the shortlist for related ideas is built from SubmissionSelector.for_user.
"""

from __future__ import annotations

import hashlib
import json

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.assistant import prompts
from apps.assistant.client import AssistantClient, AssistantUnavailable
from apps.assistant.handoff import open_handoff
from apps.assistant.models import (
    Audience,
    CachedAnswer,
    Feature,
    Introduction,
    KnowledgeEntry,
    ManualPage,
    ManualScreenshot,
)
from apps.assistant.privacy import safe_fields, safe_submission_answers
from apps.audit.services import AuditService
from apps.core.i18n import get_text

SUGGESTION_LABEL = {"en": "Suggestion from the AI helper", "tn": "Kakantsho go tswa mo mothusing wa AI"}
SUGGESTIONS_ONLY = {"en": "Suggestions only. You decide what to change.", "tn": "Dikakantsho fela. O swetsa ka bowena se o se fetolang."}
CONFIG_KEYS = ("feature_draft_check", "feature_hints", "feature_related", "feature_help", "feature_web_chat", "allow_guests_help", "monthly_limit_usd", "timeout_seconds")


def _lang(value: str | None) -> str:
    return "tn" if value == "tn" else "en"


def _fingerprint(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


def _strings(items, limit: int) -> list[str]:
    return [str(item).strip() for item in (items or []) if str(item).strip()][:limit]


# -- innovator guidance --------------------------------------------------------------------------


def form_schema_for(program) -> dict:
    """The published form the innovator answers (latest version), or the live form."""
    from apps.programs.form_schema import build_form_schema

    form = getattr(program, "form", None)
    if form is None:
        return {"steps": [], "loose_fields": []}
    version = form.versions.order_by("-number").first() if hasattr(form, "versions") else None
    return version.schema if version and version.schema else build_form_schema(form, include_inactive=False)


def _step(schema: dict, code: str) -> dict | None:
    return next((step for step in schema.get("steps") or [] if step.get("code") == code and step.get("is_active", True)), None)


def _step_fields(step: dict) -> list[dict]:
    return [field for row in step.get("rows") or [] for field in row.get("fields") or []]


def draft_content(*, draft, step_code: str, answers: dict | None, language: str) -> tuple[str, set[str], dict]:
    """The text sent for a draft check, the field keys on the step, and the step."""
    schema = form_schema_for(draft.program)
    step = _step(schema, step_code)
    if step is None:
        raise ValidationError({"step": ["This form has no step with that code."]})
    values = {**(draft.draft_data or {}), **(answers or {})}
    fields = safe_fields(_step_fields(step), values, language=language)
    title = get_text(step.get("title"), language) if isinstance(step.get("title"), dict) else str(step.get("title") or step_code)
    tips = [get_text(tip, language) if isinstance(tip, dict) else str(tip) for tip in step.get("tips") or []]
    lines = [f"Idea title: {draft.title}", f"Form step: {title}"]
    if tips:
        lines.append("Tips shown on this step: " + " | ".join(tip for tip in tips if tip))
    for field in fields:
        need = "required" if field["required"] else "optional"
        lines.append(f"\n[{field['key']}] {field['label']} ({need})" + (f"\nHelp text: {field['help']}" if field["help"] else ""))
        lines.append(f"Answer: {field['answer'] or '(empty)'}")
    return "\n".join(lines), {field["key"] for field in fields}, step


def check_draft(*, draft, step_code: str, answers: dict | None, language: str, user, extra_guidance: str = "", feature: str = Feature.DRAFT_CHECK) -> dict:
    language = _lang(language)
    content, keys, _ = draft_content(draft=draft, step_code=step_code, answers=answers, language=language)
    answer = AssistantClient.ask(
        feature=feature,
        user=user,
        audience=Audience.INNOVATORS,
        language=language,
        instructions=prompts.DRAFT_CHECK_INSTRUCTIONS,
        content=content,
        schema=prompts.DRAFT_CHECK_SCHEMA,
        extra_guidance=extra_guidance,
        target=f"draft:{draft.pk}",
    )
    return shape_draft_check(answer.data, keys=keys, language=language)


def shape_draft_check(data: dict, *, keys: set[str] | None, language: str) -> dict:
    def known(key):
        return key if key and (keys is None or key in keys) else ""

    return {
        "clear": _strings(data.get("clear"), 3),
        "unclear": [
            {"field_key": known(item.get("field_key")), "quote": str(item.get("quote") or ""), "suggestion": str(item.get("suggestion") or "")}
            for item in (data.get("unclear") or [])[:5]
            if isinstance(item, dict) and item.get("suggestion")
        ],
        "missing": [
            {"field_key": known(item.get("field_key")), "what": str(item.get("what") or "")}
            for item in (data.get("missing") or [])[:5]
            if isinstance(item, dict) and item.get("what")
        ],
        "officer_questions": _strings(data.get("officer_questions"), 3),
        "note": SUGGESTIONS_ONLY[language],
    }


# -- officer hints -------------------------------------------------------------------------------


def submission_content(submission) -> str:
    lines = [f"Title: {submission.title}"]
    if submission.sector_id:
        lines.append(f"Sector: {get_text(submission.sector.name, 'en')}")
    if submission.district_id:
        lines.append(f"District: {get_text(submission.district.name, 'en')}")
    for row in safe_submission_answers(submission):
        lines.append(f"{row['label']}: {row['answer']}")
    return "\n".join(lines)


def submission_hints(*, submission, user, language: str, refresh: bool = False) -> dict:
    language = _lang(language)
    content = submission_content(submission)
    runtime = AssistantClient.runtime()
    fingerprint = _fingerprint("hints", content, runtime.model if runtime else "")
    cached = CachedAnswer.objects.filter(feature=Feature.HINTS, submission=submission, language=language).first()
    if cached and cached.fingerprint == fingerprint and not refresh:
        reason = AssistantClient.unavailable_reason(Feature.HINTS, runtime)
        if reason:
            raise AssistantUnavailable(reason)
        AuditService.log_raw_action(actor=user, action_type="assistant_hints_viewed", target_model="Submission", target_id=str(submission.pk), metadata={"cached": True})
        return {**cached.data, "cached": True, "generated_at": cached.updated_at.isoformat()}
    answer = AssistantClient.ask(
        feature=Feature.HINTS,
        user=user,
        audience=Audience.OFFICERS,
        language=language,
        instructions=prompts.HINTS_INSTRUCTIONS,
        content=content,
        schema=prompts.HINTS_SCHEMA,
        target=f"submission:{submission.pk}",
    )
    data = shape_hints(answer.data, language)
    CachedAnswer.objects.update_or_create(
        feature=Feature.HINTS, submission=submission, language=language, defaults={"fingerprint": fingerprint, "model": answer.model, "data": data}
    )
    return {**data, "cached": False, "generated_at": timezone.now().isoformat()}


def shape_hints(data: dict, language: str) -> dict:
    return {
        "label": SUGGESTION_LABEL[language],
        "summary": _strings(data.get("summary"), 5),
        "strengths": _strings(data.get("strengths"), 4),
        "points_to_check": _strings(data.get("points_to_check"), 5),
        "next_step": str(data.get("next_step") or "").strip(),
    }


# -- related ideas -------------------------------------------------------------------------------


def related_ideas(*, submission, user, language: str, refresh: bool = False) -> dict:
    from apps.assistant.selectors import related_shortlist

    language = _lang(language)
    reason = AssistantClient.unavailable_reason(Feature.RELATED)
    if reason:
        raise AssistantUnavailable(reason)
    shortlist = related_shortlist(submission=submission, user=user)
    by_id = {str(item.pk): item for item in shortlist}
    if not shortlist:
        return {"label": SUGGESTION_LABEL[language], "similar": [], "complementary": [], "cached": False}
    main = submission_content(submission)
    others = "\n\n".join(f"### Idea {item.pk}\n{submission_content(item)[:1500]}" for item in shortlist)
    fingerprint = _fingerprint("related", main, sorted((str(item.pk), item.updated_at.isoformat()) for item in shortlist))
    cached = CachedAnswer.objects.filter(feature=Feature.RELATED, submission=submission, language=language).first()
    if cached and cached.fingerprint == fingerprint and not refresh:
        data = cached.data
    else:
        answer = AssistantClient.ask(
            feature=Feature.RELATED,
            user=user,
            audience=Audience.OFFICERS,
            language=language,
            instructions=prompts.RELATED_INSTRUCTIONS,
            content=f"## Main idea\n{main}\n\n## Shortlist\n{others}",
            schema=prompts.RELATED_SCHEMA,
            target=f"submission:{submission.pk}",
        )
        # Keep only ids from the shortlist: the answer is never trusted to name other ideas.
        data = {
            "items": [
                {"id": str(item.get("id")), "relation": item.get("relation"), "why": str(item.get("why") or "").strip()}
                for item in answer.data.get("items") or []
                if isinstance(item, dict) and str(item.get("id")) in by_id and item.get("relation") in ("similar", "complementary")
            ]
        }
        CachedAnswer.objects.update_or_create(
            feature=Feature.RELATED, submission=submission, language=language, defaults={"fingerprint": fingerprint, "model": answer.model, "data": data}
        )
    # The cached ids are filtered again against what this officer may see now.
    result = {"label": SUGGESTION_LABEL[language], "similar": [], "complementary": [], "cached": bool(cached and cached.fingerprint == fingerprint and not refresh)}
    for item in data.get("items") or []:
        other = by_id.get(item["id"])
        if other is None:
            continue
        result[item["relation"]].append({**idea_card(other, language), "why": item["why"]})
    return result


def idea_card(submission, language: str) -> dict:
    return {
        "id": str(submission.pk),
        "reference_number": submission.reference_number,
        "title": submission.title,
        "status": submission.current_status,
        "sector": get_text(submission.sector.name, language) if submission.sector_id else "",
        "district": get_text(submission.district.name, language) if submission.district_id else "",
        "has_account": bool(submission.innovator_id),
    }


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


# -- help ----------------------------------------------------------------------------------------


def _contact(user, contact: dict | None) -> dict:
    if user is not None and getattr(user, "is_authenticated", False):
        return {"user_id": str(user.pk), "email": user.email or "", "name": user.full_name}
    contact = contact or {}
    return {key: str(contact.get(key) or "")[:200] for key in ("name", "phone", "email") if contact.get(key)}


def hand_over(*, user, question: str, language: str, contact: dict | None = None, answer: str = "", reason: str = "asked_for_person", channel: str = "ai") -> dict:
    now = timezone.now().isoformat()
    transcript = [{"from": "person", "text": question, "at": now}]
    if answer:
        transcript.append({"from": "bot", "text": answer, "at": now})
    conversation = open_handoff(
        channel=channel,
        contact=_contact(user, contact),
        subject=(question or "Help request")[:120],
        transcript=transcript,
        language=_lang(language),
        reason=reason,
    )
    return {"handed_over": True, "conversation_id": str(getattr(conversation, "pk", "") or "") or None}


def ask_help(*, user, question: str, language: str, page_path: str = "", contact: dict | None = None, extra_guidance: str = "", feature: str = Feature.HELP) -> dict:
    language = _lang(language)
    from apps.core.capabilities import user_has

    signed_in = user is not None and getattr(user, "is_authenticated", False)
    audience = Audience.OFFICERS if signed_in and user_has(user, "assistant.hints") else Audience.INNOVATORS
    content = f"Question: {question.strip()}" + (f"\nThe person is on the portal page: {page_path}" if page_path else "")
    instructions = prompts.WEB_CHAT_INSTRUCTIONS if feature == Feature.WEB_CHAT else prompts.HELP_INSTRUCTIONS
    answer = AssistantClient.ask(
        feature=feature,
        user=user,
        audience=audience,
        language=language,
        instructions=instructions,
        content=content,
        schema=prompts.HELP_SCHEMA,
        effort="low",
        extra_guidance=extra_guidance,
    )
    data = answer.data
    pages = list(ManualPage.objects.filter(is_active=True, pk__in=[pid for pid in _strings(data.get("page_ids"), 5) if _is_uuid(pid)]))
    shots = list(
        ManualScreenshot.objects.select_related("asset", "page")
        .filter(page__is_active=True, pk__in=[sid for sid in _strings(data.get("screenshot_ids"), 2) if _is_uuid(sid)])
    )
    result = {
        "answer": str(data.get("answer") or "").strip(),
        "pages": [{"id": str(page.pk), "title": page.title, "portal_path": page.portal_path} for page in pages],
        "screenshots": [screenshot_dict(shot, language) for shot in shots],
        "handed_over": False,
        "conversation_id": None,
    }
    if (not data.get("confident", False) or data.get("wants_person", False)) and feature != Feature.TRY_IT:
        result.update(hand_over(user=user, question=question, language=language, contact=contact, answer=result["answer"], reason="not_sure" if not data.get("confident", False) else "asked_for_person"))
    return result


def first_chat_answer(*, text: str, language: str = "en", user=None) -> dict | None:
    """For C1's website help chat: the helper's first answer, or None when it cannot answer.

    Never raises and never hands over by itself (the chat is already in the staff inbox).
    """
    try:
        language = _lang(language)
        answer = AssistantClient.ask(
            feature=Feature.WEB_CHAT, user=user, audience=Audience.EVERYONE, language=language,
            instructions=prompts.WEB_CHAT_INSTRUCTIONS, content=f"Question: {text.strip()}", schema=prompts.HELP_SCHEMA, effort="low",
        )
    except AssistantUnavailable:
        return None
    except Exception:
        return None
    data = answer.data
    if not data.get("confident", False) or data.get("wants_person", False):
        return None
    return {"text": str(data.get("answer") or "").strip(), "screenshot_ids": _strings(data.get("screenshot_ids"), 2)}


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True


def screenshot_dict(shot: ManualScreenshot, language: str, request=None) -> dict:
    url = shot.asset.file.url if shot.asset.file else ""
    return {
        "id": str(shot.pk),
        "url": request.build_absolute_uri(url) if request and url else url,
        "caption": (shot.caption or {}).get(language) or (shot.caption or {}).get("en") or "",
        "width": shot.asset.width,
        "height": shot.asset.height,
        "page_id": str(shot.page_id),
    }


# -- try it --------------------------------------------------------------------------------------


def try_it(*, user, feature: str, text: str, language: str, guidance: str = "") -> dict:
    """Run a feature on sample text with optional unsaved guidance. Nothing is cached or sent to innovators."""
    language = _lang(language)
    if feature == Feature.HELP:
        return ask_help(user=user, question=text, language=language, extra_guidance=guidance, feature=Feature.TRY_IT)
    if feature == Feature.DRAFT_CHECK:
        content = f"Form step: Your idea\n\n[idea] Describe your idea (required)\nAnswer: {text.strip()}"
        answer = AssistantClient.ask(
            feature=Feature.TRY_IT, user=user, audience=Audience.INNOVATORS, language=language,
            instructions=prompts.DRAFT_CHECK_INSTRUCTIONS, content=content, schema=prompts.DRAFT_CHECK_SCHEMA, extra_guidance=guidance,
        )
        return shape_draft_check(answer.data, keys=None, language=language)
    if feature == Feature.HINTS:
        answer = AssistantClient.ask(
            feature=Feature.TRY_IT, user=user, audience=Audience.OFFICERS, language=language,
            instructions=prompts.HINTS_INSTRUCTIONS, content=text.strip(), schema=prompts.HINTS_SCHEMA, extra_guidance=guidance,
        )
        return shape_hints(answer.data, language)
    raise ValidationError({"feature": ["Choose draft_check, hints or help."]})


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


class AssistantSettingsService:
    @staticmethod
    @transaction.atomic
    def update(*, actor, data: dict) -> None:
        """Switches and limits on the AI connection, and the ai_helper switch.

        These do not change how the server reaches Claude, so the connection stays active (key
        and model changes go through Platform settings > Integrations and need a new test).
        """
        from apps.platform_config.models import IntegrationConnection
        from apps.platform_config.selectors import IntegrationRuntimeSelector
        from apps.platform_config.services import FeatureFlagService

        if "helper_on" in data:
            FeatureFlagService.set_enabled(key="ai_helper", enabled=bool(data.pop("helper_on")), actor=actor)
        changes = {key: data[key] for key in CONFIG_KEYS if key in data}
        if not changes:
            return
        connection = (
            IntegrationConnection.objects.select_for_update().filter(kind="ai").order_by("-is_active", "-updated_at").first()
        )
        if connection is None:
            raise ValidationError({"code": "no_connection", "detail": "Add the Claude connection in Platform settings first."})
        before = {key: (connection.config or {}).get(key) for key in changes}
        connection.config = {**(connection.config or {}), **changes}
        connection.updated_by = actor
        connection.save(update_fields=["config", "updated_by", "updated_at"])
        IntegrationRuntimeSelector.clear_cache("ai")
        AuditService.log_action(actor=actor, action_type="assistant_settings_updated", target=connection, before_state=before, after_state=changes)

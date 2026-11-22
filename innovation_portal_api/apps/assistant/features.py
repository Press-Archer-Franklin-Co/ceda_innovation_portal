"""AI Copilot features (A2 to A6). Each one goes through gateway.ask and the knowledge base.

Every function returns plain dicts for the views, or raises AssistantUnavailable so the screen hides
the helper. Access is decided before anything is sent: the views pass only objects the person may
see, and similar ideas are shortlisted only from SubmissionSelector.for_user.
"""

from __future__ import annotations

import hashlib
import json
import re

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assistant import gateway, knowledge, prompts
from apps.assistant import language as lang_mod
from apps.assistant.handoff import open_handoff
from apps.assistant.models import AssistantSettings, Audience, CachedAnswer, Feature, ManualPage, ManualScreenshot
from apps.assistant.privacy import safe_fields, safe_submission_answers
from apps.assistant.providers import AssistantUnavailable
from apps.audit.services import AuditService
from apps.core.i18n import get_text

MAX_FILE_CHARS = 8_000
MAX_FILES = 6
# A score, mark or rating in an answer. Officers decide; an answer that scores is never shown.
SCORE_PATTERN = re.compile(
    r"\b(score[sd]?|scoring|rating|rated|marks?|grade[sd]?)\b|\b\d+(\.\d+)?\s*(/|out of)\s*(5|10|20|25|50|100)\b|\b(approve|reject)(d|s)?\b",
    re.IGNORECASE,
)


def _fingerprint(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


def _strings(items, limit: int) -> list[str]:
    return [str(item).strip() for item in (items or []) if str(item).strip()][:limit]


def _page(value) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def audience_for(user) -> str:
    from apps.core.capabilities import user_has

    if user is None or not getattr(user, "is_authenticated", False):
        return Audience.EVERYONE
    return Audience.OFFICERS if user_has(user, "assistant.hints") else Audience.INNOVATORS


def contains_score(data) -> bool:
    return bool(SCORE_PATTERN.search(json.dumps(data, ensure_ascii=False)))


# -- files -------------------------------------------------------------------------------------------


def files_text(documents) -> str:
    """The text of each file with page markers, cut to a fair share each. Files without text are listed."""
    from apps.assistant.document_review import file_content

    parts = []
    for document in list(documents)[:MAX_FILES]:
        text, _ = file_content(document)
        header = f"### File {document.pk}: {document.original_filename}"
        parts.append(f"{header}\n{text[:MAX_FILE_CHARS]}" if text else f"{header}\n(no readable text)")
    return "\n\n".join(parts)


def draft_documents(draft):
    return draft.documents.filter(is_active=True, is_current=True).exclude(file="").order_by("created_at")


def submission_documents(submission):
    return submission.documents.filter(is_active=True, is_current=True).exclude(file="").order_by("created_at")


# -- 2.13 idea coach ---------------------------------------------------------------------------------


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


def draft_content(*, draft, step_code: str, answers: dict | None, language: str) -> tuple[str, set[str]]:
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
    return "\n".join(lines), {field["key"] for field in fields}


def check_draft(*, draft, step_code: str, answers: dict | None, requested_language: str | None, user, extra_guidance: str = "", feature: str = Feature.DRAFT_CHECK) -> dict:
    content, keys = draft_content(draft=draft, step_code=step_code, answers=answers, language=requested_language or "en")
    language = lang_mod.resolve(user=user, requested=requested_language, text=content)
    documents = list(draft_documents(draft))
    if documents:
        content += "\n\n## Uploaded files\n" + files_text(documents)
    found = knowledge.build(audience=Audience.INNOVATORS, language=language, question=content, include_manual=False, extra_guidance=extra_guidance)
    result = gateway.ask(
        feature,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(prompts.DRAFT_CHECK_INSTRUCTIONS, language)],
        messages=[{"role": "user", "content": content}],
        json_schema=prompts.DRAFT_CHECK_SCHEMA,
        language=language,
        target=f"draft:{draft.pk}",
    )
    return shape_draft_check(result.data or {}, keys=keys, documents=documents, language=language, sources=found.sources)


def shape_draft_check(data: dict, *, keys: set[str] | None, documents, language: str, sources=()) -> dict:
    by_id = {str(document.pk): document for document in documents}

    def known(key):
        return key if key and (keys is None or key in keys) else ""

    def doc(value):
        return str(value) if str(value or "") in by_id else ""

    items = []
    for item in (data.get("items") or [])[:5]:
        if not isinstance(item, dict) or not str(item.get("topic") or "").strip():
            continue
        document_id = doc(item.get("document_id"))
        items.append(
            {
                "topic": str(item["topic"]).strip(),
                "status": item.get("status") if item.get("status") in ("clear", "add_more", "missing") else "add_more",
                "suggestion": str(item.get("suggestion") or "").strip(),
                "field_key": known(item.get("field_key")),
                "document_id": document_id,
                "document_name": by_id[document_id].original_filename if document_id else "",
                "page": _page(item.get("page")) if document_id else None,
            }
        )
    files = []
    for item in data.get("files") or []:
        document_id = doc(item.get("document_id")) if isinstance(item, dict) else ""
        if not document_id:
            continue
        files.append(
            {
                "document_id": document_id,
                "name": by_id[document_id].original_filename,
                "covers": str(item.get("covers") or "").strip(),
                "key_points": [{"text": str(point.get("text") or "").strip(), "page": _page(point.get("page"))} for point in (item.get("key_points") or [])[:4] if isinstance(point, dict) and point.get("text")],
                "missing": _strings(item.get("missing"), 4),
            }
        )
    clear = sum(1 for item in items if item["status"] == "clear")
    return {
        "language": language,
        "overall": data.get("overall") if data.get("overall") in ("ready", "almost", "needs_work") else ("ready" if items and clear == len(items) else "almost"),
        "ready_count": clear,
        "total_count": len(items),
        "items": items,
        "unclear": [
            {"field_key": known(item.get("field_key")), "quote": str(item.get("quote") or ""), "suggestion": str(item.get("suggestion") or "")}
            for item in (data.get("unclear") or [])[:5]
            if isinstance(item, dict) and item.get("suggestion")
        ],
        "officer_questions": _strings(data.get("officer_questions"), 3),
        "files": files,
        "sources": list(sources),
        "note": prompts.SUGGESTIONS_ONLY[language],
        "label": prompts.SUGGESTION_LABEL[language],
    }


# -- 3.3b officer and judge summary ------------------------------------------------------------------


def submission_content(submission, *, send_names: bool = False) -> str:
    lines = [f"Title: {submission.title}"]
    if send_names and submission.innovator_id and getattr(submission.innovator, "full_name", ""):
        lines.append(f"Innovator: {submission.innovator.full_name}")
    if submission.sector_id:
        lines.append(f"Sector: {get_text(submission.sector.name, 'en')}")
    if submission.district_id:
        lines.append(f"District: {get_text(submission.district.name, 'en')}")
    for row in safe_submission_answers(submission):
        lines.append(f"{row['label']}: {row['answer']}")
    return "\n".join(lines)


def criteria_text(submission) -> str:
    criteria = getattr(submission.program, "marking_criteria", None)
    if criteria is None:
        return ""
    items = criteria.items.order_by("ordering", "name")
    return "\n".join(f"- {item.name}: {item.description.strip()}" if item.description else f"- {item.name}" for item in items)


def submission_hints(*, submission, user, requested_language: str | None, refresh: bool = False) -> dict:
    assistant_settings = AssistantSettings.load()
    content = submission_content(submission, send_names=assistant_settings.send_names)
    language = lang_mod.resolve(user=user, requested=requested_language, text=content)
    documents = list(submission_documents(submission))
    criteria = criteria_text(submission)
    file_versions = [(str(document.pk), document.version_number, document.sha256) for document in documents]
    fingerprint = _fingerprint("hints-v2", content, file_versions, criteria)
    cached = CachedAnswer.objects.filter(feature=Feature.HINTS, submission=submission, language=language).first()
    if cached and cached.fingerprint == fingerprint and not refresh:
        reason = gateway.unavailable_reason(Feature.HINTS, assistant_settings)
        if reason:
            raise AssistantUnavailable(reason)
        AuditService.log_raw_action(actor=user, action_type="assistant_hints_viewed", target_model="Submission", target_id=str(submission.pk), metadata={"cached": True})
        return {**cached.data, "cached": True, "generated_at": cached.updated_at.isoformat()}
    message = content
    if documents:
        message += "\n\n## Files\n" + files_text(documents)
    message += "\n\n## Marking criteria for this challenge\n" + (criteria or "(none set)")
    found = knowledge.build(audience=Audience.OFFICERS, language=language, question=content, include_manual=False)
    criteria_docs = knowledge.build(audience=Audience.OFFICERS, language=language, question=content, include_manual=False, kinds=["evaluation_criteria"])
    system_parts = found.parts(prompts.BASE_PROMPT) + [prompts.part(prompts.HINTS_INSTRUCTIONS, language)]
    if criteria_docs.question_part:
        system_parts.append(knowledge.SystemPart(criteria_docs.question_part))
    result = gateway.ask(
        Feature.HINTS,
        user=user,
        system_parts=system_parts,
        messages=[{"role": "user", "content": message}],
        json_schema=prompts.HINTS_SCHEMA,
        language=language,
        target=f"submission:{submission.pk}",
    )
    if contains_score(result.data or {}):
        gateway.mark(result.usage, "scored", "The answer contained a score or a decision, so it was not shown.")
        raise AssistantUnavailable("bad_output", "The answer contained a score or a decision, so it was not shown.")
    data = shape_hints(result.data or {}, language, sources=found.sources)
    CachedAnswer.objects.update_or_create(
        feature=Feature.HINTS, submission=submission, language=language, defaults={"fingerprint": fingerprint, "model": result.model, "data": data}
    )
    return {**data, "cached": False, "generated_at": timezone.now().isoformat()}


def shape_hints(data: dict, language: str, sources=()) -> dict:
    return {
        "label": prompts.SUGGESTION_LABEL[language],
        "language": language,
        "source_language": data.get("source_language") if data.get("source_language") in ("en", "tn") else "",
        "summary": str(data.get("summary") or "").strip(),
        "from_files": [
            {"file": str(item.get("file") or "").strip(), "page": _page(item.get("page")), "fact": str(item.get("fact") or "").strip()}
            for item in (data.get("from_files") or [])[:5]
            if isinstance(item, dict) and str(item.get("fact") or "").strip()
        ],
        "not_in_files": _strings(data.get("not_in_files"), 4),
        "criteria_points": [
            {"criterion": str(item.get("criterion") or "").strip(), "point": str(item.get("point") or "").strip()}
            for item in (data.get("criteria_points") or [])[:8]
            if isinstance(item, dict) and str(item.get("point") or "").strip()
        ],
        "points_to_check": _strings(data.get("points_to_check"), 5),
        "next_step": str(data.get("next_step") or "").strip(),
        "sources": list(sources),
    }


# -- A5 similar ideas, officers only -----------------------------------------------------------------


def related_ideas(*, submission, user, requested_language: str | None, refresh: bool = False) -> dict:
    from apps.assistant.profiles import build_profile, idea_text
    from apps.assistant.selectors import related_shortlist

    language = lang_mod.resolve(user=user, requested=requested_language)
    reason = gateway.unavailable_reason(Feature.RELATED)
    if reason:
        raise AssistantUnavailable(reason)
    main_profile = build_profile(submission)
    shortlist = related_shortlist(submission=submission, user=user, profile=main_profile)
    by_id = {str(item.pk): item for item in shortlist}
    label = prompts.SUGGESTION_LABEL[language]
    if not shortlist:
        return {"label": label, "language": language, "similar": [], "complementary": [], "cached": False}

    def describe(item):
        profile = getattr(item, "idea_profile", None)
        extra = ""
        if profile is not None and profile.summary_en:
            extra = f"\nSummary: {profile.summary_en}\nNeeds: {', '.join(profile.inputs)}\nMakes: {', '.join(profile.outputs)}\nServes: {', '.join(profile.serves)}"
        return f"{idea_text(item)[:1500]}{extra}"

    main = describe(submission)
    others = "\n\n".join(f"### Idea {item.pk}\n{describe(item)}" for item in shortlist)
    fingerprint = _fingerprint("related-v2", main, sorted((str(item.pk), item.updated_at.isoformat()) for item in shortlist))
    cached = CachedAnswer.objects.filter(feature=Feature.RELATED, submission=submission, language=language).first()
    from_cache = bool(cached and cached.fingerprint == fingerprint and not refresh)
    if from_cache:
        data = cached.data
    else:
        result = gateway.ask(
            Feature.RELATED,
            user=user,
            system_parts=[knowledge.SystemPart(prompts.BASE_PROMPT, cache=True), prompts.part(prompts.RELATED_INSTRUCTIONS, language)],
            messages=[{"role": "user", "content": f"## Main idea\n{main}\n\n## Shortlist\n{others}"}],
            json_schema=prompts.RELATED_SCHEMA,
            language=language,
            target=f"submission:{submission.pk}",
        )
        # Keep only ids from the shortlist: the answer is never trusted to name other ideas.
        data = {
            "items": [
                {"id": str(item.get("id")), "relation": item.get("relation"), "why": str(item.get("why") or "").strip()}
                for item in (result.data or {}).get("items") or []
                if isinstance(item, dict) and str(item.get("id")) in by_id and item.get("relation") in ("similar", "complementary")
            ]
        }
        CachedAnswer.objects.update_or_create(
            feature=Feature.RELATED, submission=submission, language=language, defaults={"fingerprint": fingerprint, "model": result.model, "data": data}
        )
    # The ids are checked again against what this officer may see now.
    answer = {"label": label, "language": language, "similar": [], "complementary": [], "cached": from_cache}
    for item in data.get("items") or []:
        other = by_id.get(item["id"])
        if other is not None:
            answer[item["relation"]].append({**idea_card(other, language), "why": item["why"]})
    return answer


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


# -- help with the portal ----------------------------------------------------------------------------


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
        channel=channel, contact=_contact(user, contact), subject=(question or "Help request")[:120], transcript=transcript, language=language, reason=reason
    )
    return {"handed_over": True, "conversation_id": str(getattr(conversation, "pk", "") or "") or None}


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
    except ValueError:
        return False
    return True


def screenshot_dict(shot: ManualScreenshot, language: str) -> dict:
    return {
        "id": str(shot.pk),
        "url": shot.asset.file.url if shot.asset.file else "",
        "caption": (shot.caption or {}).get(language) or (shot.caption or {}).get("en") or "",
        "width": shot.asset.width,
        "height": shot.asset.height,
        "page_id": str(shot.page_id),
    }


def ask_help(*, user, question: str, requested_language: str | None, page_path: str = "", contact: dict | None = None, extra_guidance: str = "", feature: str = Feature.HELP) -> dict:
    language = lang_mod.resolve(user=user, requested=requested_language, text=question)
    content = f"Question: {question.strip()}" + (f"\nThe portal page they are on: {page_path}" if page_path else "")
    found = knowledge.build(audience=audience_for(user), language=language, question=question, extra_guidance=extra_guidance)
    instructions = prompts.WEB_CHAT_INSTRUCTIONS if feature == Feature.WEB_CHAT else prompts.HELP_INSTRUCTIONS
    result = gateway.ask(
        feature,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(instructions, language)],
        messages=[{"role": "user", "content": content}],
        json_schema=prompts.HELP_SCHEMA,
        language=language,
        effort="low",
    )
    data = result.data or {}
    allowed_pages = {source["id"] for source in found.sources if source["type"] == "manual_page"}
    pages = list(ManualPage.objects.filter(is_active=True, pk__in=[pid for pid in _strings(data.get("page_ids"), 5) if _is_uuid(pid) and pid in allowed_pages]))
    shots = list(
        ManualScreenshot.objects.select_related("asset")
        .filter(page__in=pages or ManualPage.objects.filter(pk__in=allowed_pages), pk__in=[sid for sid in _strings(data.get("screenshot_ids"), 2) if _is_uuid(sid)])
    )
    answer = {
        "language": language,
        "answer": str(data.get("answer") or "").strip(),
        "pages": [{"id": str(page.pk), "title": page.title, "portal_path": page.portal_path} for page in pages],
        "screenshots": [screenshot_dict(shot, language) for shot in shots],
        "sources": found.sources,
        "handed_over": False,
        "conversation_id": None,
    }
    if (not data.get("confident", False) or data.get("wants_person", False)) and feature != Feature.TRY_IT:
        answer.update(hand_over(user=user, question=question, language=language, contact=contact, answer=answer["answer"], reason="not_sure" if not data.get("confident", False) else "asked_for_person"))
    return answer


def first_chat_answer(*, text: str, language: str = "en", user=None) -> dict | None:
    """For C1's website help chat: the helper's first answer, or None when it cannot answer. Never raises."""
    try:
        answer = ask_help(user=user, question=text, requested_language=language, feature=Feature.WEB_CHAT)
    except Exception:
        return None
    if answer.get("handed_over") or not answer.get("answer"):
        return None
    return {"text": answer["answer"], "screenshot_ids": [shot["id"] for shot in answer["screenshots"]], "language": answer["language"]}


# -- Try it (3.34) -----------------------------------------------------------------------------------


def try_it(*, user, feature: str, text: str, language: str, guidance: str = "") -> dict:
    """Run a feature on sample text with optional unsaved guidance. Nothing is cached or sent to innovators."""
    language = lang_mod.resolve(requested=language, text=text)
    if feature == Feature.HELP:
        return ask_help(user=user, question=text, requested_language=language, extra_guidance=guidance, feature=Feature.TRY_IT)
    if feature == Feature.DRAFT_CHECK:
        audience, instructions, schema = Audience.INNOVATORS, prompts.DRAFT_CHECK_INSTRUCTIONS, prompts.DRAFT_CHECK_SCHEMA
        content = f"Form step: Your idea\n\n[idea] Describe your idea (required)\nAnswer: {text.strip()}"
    elif feature == Feature.HINTS:
        audience, instructions, schema = Audience.OFFICERS, prompts.HINTS_INSTRUCTIONS, prompts.HINTS_SCHEMA
        content = text.strip()
    else:
        raise ValidationError({"feature": ["Choose draft_check, hints or help."]})
    found = knowledge.build(audience=audience, language=language, question=text, include_manual=False, extra_guidance=guidance)
    result = gateway.ask(
        Feature.TRY_IT,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(instructions, language)],
        messages=[{"role": "user", "content": content}],
        json_schema=schema,
        language=language,
    )
    if feature == Feature.HINTS:
        if contains_score(result.data or {}):
            raise AssistantUnavailable("bad_output", "The answer contained a score or a decision, so it was not shown.")
        return shape_hints(result.data or {}, language, sources=found.sources)
    return shape_draft_check(result.data or {}, keys=None, documents=[], language=language, sources=found.sources)

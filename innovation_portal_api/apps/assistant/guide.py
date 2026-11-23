"""The "Need help?" guide (Copilot B1, frames 2.14 and 3.40).

The overlay sends what the page shows (route, title, the buttons and fields on it, the menu). The
server adds who the person is (role and capabilities, never from the browser) and the manual pages
and knowledge for that route and audience, and answers with at most 6 steps. Every step can point
only at a target or a route the page sent, so the guide can never point at something the person
cannot use. The guide only guides: it never clicks, submits or changes anything.
"""

from __future__ import annotations

import hashlib
import json

from django.core.cache import cache

from apps.assistant import gateway, knowledge, prompts
from apps.assistant import language as lang_mod
from apps.assistant.features import audience_for
from apps.assistant.models import Feature
from apps.assistant.providers import AssistantUnavailable

MAX_STEPS = 6
CACHE_SECONDS = 24 * 3600
VERSION_KEY = "assistant:knowledge-version"

GUIDE_INSTRUCTIONS = """Task: the person pressed "Need help?" on a page of the CEDA Innovation Portal. Walk them through what they asked, step by step, on this page.

You get: who the person is and what they may do, the page they are on, the buttons, fields, tabs, links and menu entries on the page (each with an id), and the user manual and knowledge for this page.
Return:
- answer: one or two short sentences.
- steps: at most 6, in order. Each step: id ("s1", "s2"...), text (one short instruction naming the button or field as the page shows it),
  target_id (the id of the element to highlight, only from the list you were given, or ""), route (a menu path to open, only from the menu you were given, or ""),
  done_when: how the screen knows the step is done: type "click" (target_id), "route" (route), "input" (target_id) or "none".
- source_ids: ids of the manual pages or documents you used.
- handoff_suggested: true when the question is unclear, the page cannot do what they ask, or they ask for a person.
Rules: only point at what is on the page or in the menu. Never tell the person to do something their role cannot do. You only guide: never claim to click, send or change anything yourself.
""" + prompts.OWN_IDEA_ONLY

GUIDE_SCHEMA = prompts._obj(
    {
        "language": prompts.LANGUAGE,
        "answer": prompts.TEXT,
        "steps": prompts._list(
            prompts._obj(
                {
                    "id": prompts.TEXT,
                    "text": prompts.TEXT,
                    "target_id": prompts.TEXT,
                    "route": prompts.TEXT,
                    "done_when": prompts._obj({"type": {"type": "string", "enum": ["click", "route", "input", "none"]}, "target_id": prompts.TEXT, "route": prompts.TEXT}),
                }
            )
        ),
        "source_ids": prompts._list(prompts.TEXT),
        "handoff_suggested": {"type": "boolean"},
    }
)

PERSON_WORDS = ("talk to a person", "real person", "speak to someone", "call me", "bua le motho", "motho wa nnete")


def bump_knowledge_version() -> None:
    """Called when manual pages or knowledge change, so cached guide answers are not reused."""
    try:
        cache.incr(VERSION_KEY)
    except ValueError:
        cache.set(VERSION_KEY, 2, None)


def _knowledge_version() -> int:
    return cache.get(VERSION_KEY) or 1


def who(user) -> tuple[str, list[str], str]:
    """(description for the prompt, capability keys, cache key part). Decided on the server only."""
    from apps.core.capabilities import CATALOGUE, capabilities_for

    if user is None or not getattr(user, "is_authenticated", False):
        return "A visitor who is not signed in. They can browse, read help and start an idea as a guest.", [], "guest"
    roles = sorted(user.roles.filter(user_roles__is_active=True, is_active=True).values_list("name", flat=True))
    caps = capabilities_for(user)
    can = "; ".join(CATALOGUE[key]["label"] for key in caps if key in CATALOGUE)
    role_text = ", ".join(roles) or "Innovator"
    description = f"Signed in. Role: {role_text}." + (f" They may: {can}." if can else " They have no staff permissions.")
    return description, caps, "roles:" + ",".join(roles) + "|caps:" + ",".join(caps)


def _clean_targets(items, *, limit: int = 120) -> list[dict]:
    out = []
    for item in (items or [])[:limit]:
        if not isinstance(item, dict) or not str(item.get("id") or "").strip():
            continue
        out.append({"id": str(item["id"])[:120], "label": str(item.get("label") or "")[:160], "kind": str(item.get("kind") or "")[:20]})
    return out


def _clean_menu(items, *, limit: int = 120) -> list[dict]:
    out = []
    for item in (items or [])[:limit]:
        if isinstance(item, dict) and str(item.get("path") or "").startswith("/"):
            out.append({"path": str(item["path"])[:200], "label": str(item.get("label") or "")[:160]})
    return out


def _manual_for_route(route: str) -> str:
    """Manual pages written for this exact page come first in the question."""
    from apps.assistant.models import ManualPage

    pages = [page for page in ManualPage.objects.filter(is_active=True).exclude(portal_path="") if route.startswith(page.portal_path.rstrip("/") or "/")]
    return "\n\n".join(f"### Page {page.id}: {page.title}\n{page.text.strip()}" for page in pages[:5])


def answer(*, user, payload: dict) -> dict:
    """The guide's answer. Raises AssistantUnavailable (the view turns that into handoff_suggested)."""
    route = str(payload.get("route") or "")[:200]
    question = " ".join(str(payload.get("question") or "").split())[:500]
    targets = _clean_targets(payload.get("targets"))
    menu = _clean_menu(payload.get("menu"))
    done = {str(item) for item in (payload.get("done_step_ids") or [])[:20]}
    language = lang_mod.resolve(user=user, requested=payload.get("language"), text=question)
    if any(words in question.lower() for words in PERSON_WORDS):
        return {"language": language, "answer": "", "steps": [], "sources": [], "handoff_suggested": True, "cached": False}

    description, _caps, who_key = who(user)
    key = "assistant:guide:" + hashlib.sha256(
        json.dumps([_knowledge_version(), payload.get("app"), route, who_key, language, question.lower(), [t["id"] for t in targets], [m["path"] for m in menu]], sort_keys=True).encode()
    ).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return _with_done({**cached, "cached": True}, done)

    reason = gateway.unavailable_reason(Feature.GUIDE)
    if reason:
        raise AssistantUnavailable(reason)
    found = knowledge.build(audience=audience_for(user), language=language, question=question)
    page = (
        f"App: {'staff console' if payload.get('app') == 'staff' else 'public website'}\nPage: {str(payload.get('page_title') or '')[:160]} ({route})\n"
        f"Who: {description}\n\nOn this page (id: label, kind):\n" + "\n".join(f"- {t['id']}: {t['label']} ({t['kind']})" for t in targets)
        + "\n\nMenu (path: label):\n" + "\n".join(f"- {m['path']}: {m['label']}" for m in menu)
    )
    page_manual = _manual_for_route(route)
    if page_manual:
        page += f"\n\nManual pages for this page:\n{page_manual}"
    result = gateway.ask(
        Feature.GUIDE,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(GUIDE_INSTRUCTIONS, language)],
        messages=[{"role": "user", "content": f"{page}\n\nQuestion: {question or 'What can I do on this page?'}"}],
        json_schema=GUIDE_SCHEMA,
        language=language,
        effort="low",
        max_tokens=4000,
        target=f"guide:{route}",
    )
    data = shape(result.data or {}, targets=targets, menu=menu, route=route, language=language, sources=found.sources)
    cache.set(key, data, CACHE_SECONDS)
    return _with_done({**data, "cached": False}, done)


def shape(data: dict, *, targets, menu, route: str, language: str, sources) -> dict:
    """Drop anything that points outside what the page sent."""
    target_ids = {t["id"] for t in targets}
    routes = {m["path"] for m in menu} | ({route} if route else set())
    steps = []
    for index, step in enumerate((data.get("steps") or [])[:MAX_STEPS], start=1):
        if not isinstance(step, dict) or not str(step.get("text") or "").strip():
            continue
        target_id = str(step.get("target_id") or "")
        step_route = str(step.get("route") or "")
        done_when = step.get("done_when") if isinstance(step.get("done_when"), dict) else {}
        done_target = str(done_when.get("target_id") or "")
        done_route = str(done_when.get("route") or "")
        done_type = done_when.get("type") if done_when.get("type") in ("click", "route", "input", "none") else "none"
        done_target = done_target if done_target in target_ids else None
        done_route = done_route if done_route in routes else None
        if (done_type in ("click", "input") and not done_target) or (done_type == "route" and not done_route):
            done_type, done_target, done_route = "none", None, None
        steps.append(
            {
                "id": f"s{index}",
                "text": str(step["text"]).strip(),
                "target_id": target_id if target_id in target_ids else None,
                "route": step_route if step_route in routes else None,
                "done_when": {"type": done_type, "target_id": done_target, "route": done_route},
            }
        )
    by_id = {source["id"]: source for source in sources}
    used = [by_id[sid] for sid in (data.get("source_ids") or []) if sid in by_id]
    return {
        "language": language,
        "answer": str(data.get("answer") or "").strip(),
        "steps": steps,
        "sources": [{"type": item["type"], "id": item["id"], "title": item["title"]} for item in used],
        "handoff_suggested": bool(data.get("handoff_suggested")) or not steps,
    }


def _with_done(data: dict, done: set[str]) -> dict:
    data["steps"] = [{**step, "done": step["id"] in done} for step in data.get("steps") or []]
    return data

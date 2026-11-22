"""Node types and the checks run before a journey is published.

``NODE_TYPES`` is what the builder's palette shows. ``check_graph`` returns problems as
``{"node": key, "level": "error" | "warning", "code": ..., "message": ...}`` so the console
can show each problem on its node. Publishing is refused while any error remains.
"""

from __future__ import annotations

from apps.channels.actions import LOOKUPS, pick
from apps.channels.engine import LANGUAGES, USSD_SCREEN_LIMIT, DEFAULT_TEXT
from apps.channels.node_schema import DESCRIPTIONS_TN, NODE_SETTINGS

MAX_USSD_OPTIONS = 8
MAX_WHATSAPP_ROWS = 10

NODE_TYPES = (
    {"type": "menu", "label": "Menu", "label_tn": "Lenane", "description": "Numbered options on USSD; buttons (up to 3) or a list (up to 10) on WhatsApp."},
    {"type": "message", "label": "Message", "label_tn": "Molaetsa", "description": "Shows text, then continues or ends."},
    {"type": "question", "label": "Question", "label_tn": "Potso", "description": "Asks for text, a number, a date, yes or no, or a choice, and saves the answer."},
    {"type": "save_draft", "label": "Save to an idea draft", "label_tn": "Boloka kakanyo", "description": "Saves answers into an idea draft the person can finish on the website."},
    {"type": "lookup", "label": "Look up", "label_tn": "Batla", "description": "Open challenges, my idea's status, upcoming events or an FAQ answer.", "lookups": [{"value": k, "label": v} for k, v in LOOKUPS]},
    {"type": "condition", "label": "Condition", "label_tn": "Seemo", "description": "Goes one way or another depending on an answer, or on whether the number belongs to a registered person."},
    {"type": "subscribe", "label": "Subscribe", "label_tn": "Ikwadise", "description": "Signs the number up for updates."},
    {"type": "language", "label": "Language", "label_tn": "Puo", "description": "English or Setswana for the rest of the session."},
    {"type": "handoff", "label": "Talk to a person", "label_tn": "Bua le motho", "description": "WhatsApp: the chat goes to the staff Inbox. USSD: takes a short note and asks for a call-back."},
    {"type": "end", "label": "End", "label_tn": "Bokhutlo", "description": "Says goodbye and ends the session."},
)
# Each type also carries what the builders draw: its text label, ports and settings (node_schema.py).
NODE_TYPES = tuple(
    {**item, "description_tn": DESCRIPTIONS_TN.get(item["type"], ""), **NODE_SETTINGS[item["type"]]} for item in NODE_TYPES
)
TYPE_KEYS = {item["type"] for item in NODE_TYPES}
SCREEN_TYPES = {"menu", "question", "language", "handoff", "end", "message"}


def edges(node: dict) -> list[str]:
    """Every node key this node can go to."""
    settings = node.get("settings") or {}
    found = [node.get("next") or ""]
    if node.get("type") == "menu":
        found += [option.get("next") or "" for option in settings.get("options") or []]
    if node.get("type") == "condition":
        found += [settings.get("true_next") or "", settings.get("false_next") or ""]
    if node.get("type") == "save_draft":
        found.append(settings.get("error_next") or "")
    return [key for key in found if key]


def is_terminal(node: dict) -> bool:
    kind = node.get("type")
    if kind in ("end", "handoff"):
        return True
    if kind == "message" and ((node.get("settings") or {}).get("end") or not node.get("next")):
        return True
    return False


def _screen_text(node: dict, lang: str) -> str:
    """The longest USSD screen this node can show in one language (without earlier steps)."""
    settings = node.get("settings") or {}
    body = pick(node.get("text"), lang)
    choices: list[str] = []
    if node.get("type") == "menu":
        choices = [pick(o.get("label"), lang) for o in settings.get("options") or []]
    elif node.get("type") == "language":
        body = body or pick(DEFAULT_TEXT["language_prompt"], lang)
        choices = [label for _, label in LANGUAGES]
    elif node.get("type") == "question" and settings.get("answer_type") == "choice":
        choices = [pick(o.get("label"), lang) for o in settings.get("choices") or []]
    elif node.get("type") == "question" and settings.get("answer_type") == "yes_no":
        choices = [pick(DEFAULT_TEXT["yes"], lang), pick(DEFAULT_TEXT["no"], lang)]
    lines = [body] + [f"{i}. {c}" for i, c in enumerate(choices, start=1)]
    return "\n".join(line for line in lines if line)


def check_graph(graph: dict, channel: str) -> list[dict]:
    problems: list[dict] = []
    nodes: dict = graph.get("nodes") or {}

    def add(node_key: str, level: str, code: str, message: str):
        problems.append({"node": node_key, "level": level, "code": code, "message": message})

    start = graph.get("start") or ""
    if not nodes:
        add("", "error", "empty", "Add at least one step.")
        return problems
    if start not in nodes:
        add("", "error", "no_start", "Choose which step the journey starts with.")

    on_ussd = channel in ("ussd", "both")
    on_whatsapp = channel in ("whatsapp", "both")
    for key, node in nodes.items():
        kind = node.get("type")
        name = node.get("title") or key
        settings = node.get("settings") or {}
        if kind not in TYPE_KEYS:
            add(key, "error", "unknown_type", f"{name}: unknown step type.")
            continue
        for target in edges(node):
            if target not in nodes:
                add(key, "error", "broken_link", f"{name}: points to a step that no longer exists.")
        needs_text = kind in ("menu", "question", "message", "end")
        if needs_text and not pick(node.get("text"), "en"):
            add(key, "error", "missing_text", f"{name}: add the English text.")
        if needs_text and pick(node.get("text"), "en") and not (node.get("text") or {}).get("tn"):
            add(key, "warning", "missing_setswana", f"{name}: the Setswana text is missing, so English will be shown.")
        if kind == "menu":
            options = settings.get("options") or []
            if not options:
                add(key, "error", "no_options", f"{name}: add at least one option.")
            if on_ussd and len(options) > MAX_USSD_OPTIONS:
                add(key, "error", "too_many_options", f"{name}: USSD menus can have at most {MAX_USSD_OPTIONS} options ({len(options)} now).")
            if on_whatsapp and len(options) > MAX_WHATSAPP_ROWS:
                add(key, "error", "too_many_rows", f"{name}: WhatsApp lists can have at most {MAX_WHATSAPP_ROWS} rows.")
            for index, option in enumerate(options, start=1):
                if not pick(option.get("label"), "en"):
                    add(key, "error", "missing_text", f"{name}: option {index} has no English label.")
                elif not (option.get("label") or {}).get("tn"):
                    add(key, "warning", "missing_setswana", f"{name}: option {index} has no Setswana label.")
                if not (option.get("next") or node.get("next")):
                    add(key, "error", "option_goes_nowhere", f"{name}: option {index} does not lead anywhere.")
        if kind == "question":
            if not settings.get("variable"):
                add(key, "error", "no_variable", f"{name}: name the answer so later steps can use it.")
            if settings.get("answer_type") == "choice" and not settings.get("choices"):
                add(key, "error", "no_options", f"{name}: add the choices.")
            if not node.get("next"):
                add(key, "error", "goes_nowhere", f"{name}: choose what happens after the answer.")
        if kind == "condition":
            if not (settings.get("true_next") or node.get("next")) or not (settings.get("false_next") or node.get("next")):
                add(key, "error", "goes_nowhere", f"{name}: choose where both answers go.")
            if (settings.get("check") or "variable") == "variable" and not settings.get("variable"):
                add(key, "error", "no_variable", f"{name}: choose the answer to check.")
        if kind == "lookup" and settings.get("lookup") not in {k for k, _ in LOOKUPS}:
            add(key, "error", "no_lookup", f"{name}: choose what to look up.")
        if kind in ("save_draft", "lookup", "subscribe", "language") and not node.get("next"):
            add(key, "error", "goes_nowhere", f"{name}: choose what happens next.")
        if on_ussd and kind in SCREEN_TYPES:
            for lang in ("en", "tn"):
                length = len(_screen_text(node, lang))
                if length > USSD_SCREEN_LIMIT:
                    language = "English" if lang == "en" else "Setswana"
                    add(key, "error", "screen_too_long", f"{name}: the {language} USSD screen has {length} characters; the limit is {USSD_SCREEN_LIMIT}.")

    # Reachable from the start.
    reachable: set[str] = set()
    stack = [start] if start in nodes else []
    while stack:
        key = stack.pop()
        if key in reachable or key not in nodes:
            continue
        reachable.add(key)
        stack.extend(edges(nodes[key]))
    for key, node in nodes.items():
        if key not in reachable and start in nodes:
            add(key, "error", "unreachable", f"{node.get('title') or key}: nobody can reach this step.")

    # Loops with no way out: a reachable step from which no ending can be reached.
    can_finish: set[str] = {key for key, node in nodes.items() if is_terminal(node)}
    changed = True
    while changed:
        changed = False
        for key, node in nodes.items():
            if key not in can_finish and any(target in can_finish for target in edges(node)):
                can_finish.add(key)
                changed = True
    for key in sorted(reachable - can_finish):
        add(key, "error", "no_way_out", f"{nodes[key].get('title') or key}: this step is in a loop with no way to finish.")
    return problems


def errors_only(problems: list[dict]) -> list[dict]:
    return [p for p in problems if p["level"] == "error"]

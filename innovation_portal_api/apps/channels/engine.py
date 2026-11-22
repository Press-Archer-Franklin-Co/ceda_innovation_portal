"""The journey engine: one engine for USSD, WhatsApp and the phone simulator.

A journey is a graph of nodes (see ``nodes.py``). The engine walks it:

- *Screens* wait for the person: menu, question, language, a hand-over note on USSD, end.
- *Steps* run straight through and add their text to the next screen: message (unless it
  ends the session), save to an idea draft, look up, condition, subscribe.

``JourneyRunner`` works on a plain ``state`` dict and returns a ``Screen``. Storing the
state, timeouts and the step log is ``SessionService``'s job (``services.py``), so the
runner is easy to test on its own.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

from django.utils import timezone

from apps.channels import actions
from apps.channels.actions import pick

logger = logging.getLogger(__name__)

USSD_SCREEN_LIMIT = 160  # Figma 3.31: each USSD screen holds up to 160 characters
MAX_AUTO_STEPS = 30
TRANSCRIPT_KEEP = 40

YES_WORDS = {"1", "yes", "y", "ee", "eee"}
NO_WORDS = {"2", "no", "n", "nnyaa", "nyaa"}

DEFAULT_TEXT = {
    "invalid_choice": {"en": "Please choose one of the numbers.", "tn": "Tsweetswee tlhopha nngwe ya dinomoro."},  # TODO tn-review
    "invalid_number": {"en": "Please enter a number.", "tn": "Tsweetswee tsenya nomoro."},  # TODO tn-review
    "invalid_date": {"en": "Please enter a date like 25/12/2026.", "tn": "Tsweetswee tsenya letlha jaaka 25/12/2026."},  # TODO tn-review
    "invalid_text": {"en": "Please type an answer.", "tn": "Tsweetswee kwala karabo."},  # TODO tn-review
    "too_long": {"en": "That answer is too long. Please make it shorter.", "tn": "Karabo eo e telele thata. Tsweetswee e khutshwafatse."},  # TODO tn-review
    "yes": {"en": "Yes", "tn": "Ee"},
    "no": {"en": "No", "tn": "Nnyaa"},
    "language_prompt": {"en": "Choose a language", "tn": "Tlhopha puo"},
    "handoff_note": {"en": "Tell us in a few words what you need. We will call you back.", "tn": "Re bolelele ka mafoko a mmalwa se o se tlhokang. Re tla go leletsa."},  # TODO tn-review
    "handoff_done_ussd": {"en": "Thank you. A CEDA officer will call you back.", "tn": "Re a leboga. Motlhankedi wa CEDA o tla go leletsa."},  # TODO tn-review
    "handoff_done_whatsapp": {"en": "Thank you. A CEDA officer will reply here soon.", "tn": "Re a leboga. Motlhankedi wa CEDA o tla go araba fano ka bonako."},  # TODO tn-review
    "goodbye": {"en": "Thank you for using CEDA Innovation.", "tn": "Re a leboga go dirisa CEDA Innovation."},  # TODO tn-review
    "broken": {"en": "Sorry, something went wrong. Please try again later.", "tn": "Maitshwarelo, sengwe se senyegile. Tsweetswee leka gape moragonyana."},  # TODO tn-review
    "list_button": {"en": "Choose", "tn": "Tlhopha"},
}

LANGUAGES = (("en", "English"), ("tn", "Setswana"))


@dataclass
class Choice:
    id: str
    title: str


@dataclass
class Screen:
    text: str
    end: bool
    node_key: str = ""
    node_type: str = ""
    choices: list[Choice] = field(default_factory=list)
    expects: str = "none"  # choice, text, none
    outcome: str = ""  # completed, handed_over (set when the session ends)
    node_title: str = ""  # the name staff gave the step (builder and simulator only)

    def ussd_text(self) -> str:
        body = self.text
        if self.choices:
            body = (body + "\n" if body else "") + "\n".join(f"{c.id}. {c.title}" for c in self.choices)
        return body[:USSD_SCREEN_LIMIT]

    def as_dict(self, channel: str) -> dict:
        data = {
            "text": self.text,
            "end": self.end,
            "node_key": self.node_key,
            "node_type": self.node_type,
            "node_title": self.node_title,
            "choices": [{"id": c.id, "title": c.title} for c in self.choices],
            "expects": self.expects,
        }
        if channel == "ussd":
            data["ussd_text"] = self.ussd_text()
            data["characters"] = len(self.ussd_text())
        else:
            data["whatsapp_layout"] = whatsapp_layout(len(self.choices))
        return data


class _DryRun(Exception):
    pass


def whatsapp_layout(count: int) -> str:
    """Buttons for up to 3 choices, a list for up to 10, numbered text beyond that."""
    if count == 0:
        return "text"
    if count <= 3:
        return "buttons"
    if count <= 10:
        return "list"
    return "numbered"


def fill(template: str, variables: dict) -> str:
    """Replace {name} with a saved answer. Unknown names stay as typed."""
    if not template:
        return ""

    def replace(match):
        key = match.group(1)
        return str(variables[key]) if key in variables and variables[key] is not None else match.group(0)

    return re.sub(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", replace, template)


class JourneyRunner:
    """Walk a journey graph for one person.

    ``context`` carries what the runner needs from outside: ``channel`` (ussd, whatsapp),
    ``phone``, ``user`` (or None), ``session_id``, ``simulation`` and ``connection`` (or None).
    """

    def __init__(self, graph: dict, state: dict, **context):
        self.graph = graph or {}
        self.nodes: dict = self.graph.get("nodes") or {}
        self.state = state
        self.channel = context.get("channel", "ussd")
        self.phone = context.get("phone", "")
        self.user = context.get("user")
        self.session_id = str(context.get("session_id", ""))
        self.simulation = bool(context.get("simulation", False))
        self.dry_run = bool(context.get("dry_run", False))  # preview only: no drafts, subscriptions or hand-overs
        self.state.setdefault("vars", {})
        self.state.setdefault("lang", self.graph.get("default_language") or "en")
        self.state.setdefault("transcript", [])
        self.state.setdefault("visited", [])
        self.logged_steps: list[tuple] = []  # (node key, node type, input or hidden[, attachment count])
        self.effects: dict = {}
        self.media: list = []  # this message's files: dicts with content_type, size and fetch (or a pretend file)
        # fetch(item, max_bytes) -> MediaResult; None for a channel that cannot carry files.
        self.fetch_media = context.get("fetch_media")
        self.message_id = context.get("message_id", "")

    # -- helpers ----------------------------------------------------------------

    @property
    def lang(self) -> str:
        return self.state.get("lang") or "en"

    def t(self, value) -> str:
        return fill(pick(value, self.lang), self.state["vars"])

    def default(self, key: str) -> str:
        return pick(DEFAULT_TEXT[key], self.lang)

    def _say(self, who: str, text: str) -> None:
        self.state["transcript"].append({"from": who, "text": text, "at": timezone.now().isoformat()})
        del self.state["transcript"][:-TRANSCRIPT_KEEP]

    def _node(self, key: str) -> dict | None:
        return self.nodes.get(key) if key else None

    # -- public -----------------------------------------------------------------

    def start(self) -> Screen:
        self.state["node"] = ""
        return self._advance(self.graph.get("start") or "", prefix=[])

    def current_type(self) -> str:
        node = self._node(self.state.get("node") or "")
        return node["type"] if node else ""

    def repeat(self, prefix: list[str] | None = None) -> Screen:
        """Show the current screen again (with a note before it)."""
        node = self._node(self.state.get("node") or "")
        return self._show(node, prefix or []) if node else self.start()

    def answer(self, text: str, media: list | None = None) -> Screen:
        self.media = list(media or [])
        key = self.state.get("node") or ""
        node = self._node(key)
        if node is None:
            return self.start()
        text = (text or "").strip()
        handler = getattr(self, f"_answer_{node['type']}", None)
        if handler is None:
            return self.start()
        return handler(node, text)

    # -- walking ----------------------------------------------------------------

    def _advance(self, key: str, prefix: list[str]) -> Screen:
        for _ in range(MAX_AUTO_STEPS):
            node = self._node(key)
            if node is None:
                return self._finish(prefix, outcome="completed", node_key=key)
            self.state["visited"] = (self.state.get("visited") or [])[-50:] + [key]
            kind = node["type"]
            if kind == "message":
                text = self.t(node.get("text"))
                if (node.get("settings") or {}).get("end") or not node.get("next"):
                    return self._finish(prefix + [text], outcome="completed", node_key=key, node_type=kind)
                prefix = prefix + [text]
                self.logged_steps.append((key, kind, ""))
                key = node.get("next") or ""
                continue
            if kind in ("save_draft", "lookup", "condition", "subscribe"):
                key, extra = getattr(self, f"_run_{kind}")(node)
                self.logged_steps.append((node["key"], kind, ""))
                prefix = prefix + ([extra] if extra else [])
                continue
            if kind == "file" and self.channel == "ussd":
                key = node.get("next") or ""  # USSD cannot carry files
                continue
            if kind == "submit":
                if (node.get("settings") or {}).get("require_consent", True) and not self.state.get("consented", {}).get(key):
                    return self._show(node, prefix)
                return self._do_submit(node, prefix)
            if kind == "end":
                return self._finish(prefix + [self.t(node.get("text")) or self.default("goodbye")], outcome="completed", node_key=key, node_type=kind)
            if kind == "handoff" and self.channel == "whatsapp":
                return self._handoff(node, note="", prefix=prefix)
            return self._show(node, prefix)
        return self._finish(prefix + [self.default("broken")], outcome="completed", node_key=key)

    def _show(self, node: dict, prefix: list[str], error: str = "") -> Screen:
        kind = node["type"]
        settings = node.get("settings") or {}
        self.state["node"] = node["key"]
        choices: list[Choice] = []
        expects = "text"
        body = self.t(node.get("text"))
        if kind == "menu":
            choices = [Choice(str(i), self.t(option.get("label"))) for i, option in enumerate(settings.get("options") or [], start=1)]
            expects = "choice"
        elif kind == "language":
            body = body or self.default("language_prompt")
            choices = [Choice(str(i), label) for i, (_, label) in enumerate(LANGUAGES, start=1)]
            expects = "choice"
        elif kind == "question":
            answer_type = settings.get("answer_type") or "text"
            if answer_type == "yes_no":
                choices = [Choice("1", self.default("yes")), Choice("2", self.default("no"))]
                expects = "choice"
            elif answer_type == "choice":
                choices = [Choice(str(i), self.t(option.get("label"))) for i, option in enumerate(settings.get("choices") or [], start=1)]
                expects = "choice"
        elif kind == "file":
            expects = "file"
        elif kind == "submit":
            body = self.t(settings.get("consent_text")) or body
            choices = [Choice("1", self.default("yes")), Choice("2", self.default("no"))]
            expects = "choice"
        elif kind == "handoff":
            body = body or self.default("handoff_note")
        text = "\n".join(part for part in [*prefix, error, body] if part)
        screen = Screen(text=text, end=False, node_key=node["key"], node_type=kind, choices=choices, expects=expects, node_title=node.get("title") or "")
        self._say("bot", screen.ussd_text() if self.channel == "ussd" else text)
        return screen

    def _finish(self, parts: list[str], *, outcome: str, node_key: str = "", node_type: str = "end") -> Screen:
        text = "\n".join(p for p in parts if p) or self.default("goodbye")
        self.state["node"] = ""
        self.state["ended"] = outcome
        self.logged_steps.append((node_key, node_type, ""))
        self._say("bot", text)
        title = (self._node(node_key) or {}).get("title") or ""
        return Screen(text=text, end=True, node_key=node_key, node_type=node_type, outcome=outcome, node_title=title)

    def _record_answer(self, node: dict, text: str) -> None:
        hidden = bool((node.get("settings") or {}).get("sensitive"))
        self.logged_steps.append((node["key"], node["type"], "[hidden]" if hidden else text[:300]))
        self._say("person", "[hidden]" if hidden else text)

    def _choose(self, text: str, count: int, titles: list[str]) -> int | None:
        """1-based index of the chosen option from a number, a button id or the title."""
        if text.isdigit() and 1 <= int(text) <= count:
            return int(text)
        lowered = text.lower()
        for index, title in enumerate(titles, start=1):
            if title and title.lower() == lowered:
                return index
        return None

    # -- answers to screens -----------------------------------------------------

    def _answer_menu(self, node: dict, text: str) -> Screen:
        options = (node.get("settings") or {}).get("options") or []
        index = self._choose(text, len(options), [self.t(o.get("label")) for o in options])
        if index is None:
            return self._show(node, [], error=self.default("invalid_choice"))
        self._record_answer(node, text)
        option = options[index - 1]
        variable = (node.get("settings") or {}).get("variable")
        if variable:
            self.state["vars"][variable] = option.get("value") or pick(option.get("label"), "en")
        return self._advance(option.get("next") or node.get("next") or "", prefix=[])

    def _answer_language(self, node: dict, text: str) -> Screen:
        index = self._choose(text, len(LANGUAGES), [label for _, label in LANGUAGES])
        if index is None:
            return self._show(node, [], error=self.default("invalid_choice"))
        self._record_answer(node, text)
        self.state["lang"] = LANGUAGES[index - 1][0]
        self.effects["language"] = self.state["lang"]
        return self._advance(node.get("next") or "", prefix=[])

    def _answer_question(self, node: dict, text: str) -> Screen:
        settings = node.get("settings") or {}
        value, error = self._check_answer(settings, text)
        if error:
            custom = self.t(settings.get("error_text")) if settings.get("error_text") else ""
            return self._show(node, [], error=custom or error)
        self._record_answer(node, text)
        if settings.get("variable"):
            self.state["vars"][settings["variable"]] = value
        if settings.get("sensitive"):
            self.state.setdefault("sensitive_vars", [])
            if settings.get("variable") and settings["variable"] not in self.state["sensitive_vars"]:
                self.state["sensitive_vars"].append(settings["variable"])
        return self._advance(node.get("next") or "", prefix=[])

    def _check_answer(self, settings: dict, text: str):
        answer_type = settings.get("answer_type") or "text"
        if answer_type == "number":
            try:
                number = float(text.replace(",", ""))
            except ValueError:
                return None, self.default("invalid_number")
            if settings.get("min") not in (None, "") and number < float(settings["min"]):
                return None, self.default("invalid_number")
            if settings.get("max") not in (None, "") and number > float(settings["max"]):
                return None, self.default("invalid_number")
            return (int(number) if number.is_integer() else number), ""
        if answer_type == "date":
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y"):
                try:
                    return datetime.strptime(text, fmt).date().isoformat(), ""
                except ValueError:
                    continue
            return None, self.default("invalid_date")
        if answer_type == "yes_no":
            lowered = text.lower()
            if lowered in YES_WORDS or lowered == self.default("yes").lower():
                return True, ""
            if lowered in NO_WORDS or lowered == self.default("no").lower():
                return False, ""
            return None, self.default("invalid_choice")
        if answer_type == "choice":
            options = settings.get("choices") or []
            index = self._choose(text, len(options), [self.t(o.get("label")) for o in options])
            if index is None:
                return None, self.default("invalid_choice")
            option = options[index - 1]
            return option.get("value") or pick(option.get("label"), "en"), ""
        if not text:
            return None, self.default("invalid_text")
        max_length = int(settings.get("max_length") or 160)
        if len(text) > max_length:
            return None, self.default("too_long")
        return text, ""

    def _answer_handoff(self, node: dict, text: str) -> Screen:
        if not text:
            return self._show(node, [], error=self.default("invalid_text"))
        self._record_answer(node, text)
        return self._handoff(node, note=text, prefix=[])

    # -- files and sending the idea (prompt 10) ---------------------------------

    def _words(self, value) -> set[str]:
        words = set()
        for lang in ("en", "tn"):
            words |= {w.strip().lower() for w in pick(value, lang).split(",") if w.strip()}
        return words

    def _answer_file(self, node: dict, text: str) -> Screen:
        from apps.channels.actions import extension_for, save_file

        settings = node.get("settings") or {}
        counts = self.state.setdefault("file_counts", {})
        count = counts.get(node["key"], 0)
        max_files = int(settings.get("max_files") or 3)
        max_mb = float(settings.get("max_mb") or 10)
        allowed = {str(x).lower().lstrip(".") for x in (settings.get("allowed_types") or [])}
        required = bool(settings.get("required"))
        lowered = text.strip().lower()
        if self.media:
            notes = []
            for item in self.media:
                if count >= max_files:
                    break
                extension = extension_for(item.get("content_type", "")).lstrip(".")
                if not extension or (allowed and extension not in allowed and not (extension == "jpg" and "jpeg" in allowed)):
                    notes.append(self.t(settings.get("wrong_type_text")) or self.default("broken"))
                    continue
                max_bytes = int(max_mb * 1024 * 1024)
                if item.get("pretend"):
                    if int(item.get("size") or 0) > max_bytes:
                        notes.append(self.t(settings.get("too_big_text")) or self.default("broken"))
                        continue
                else:
                    fetched = item["fetch"](max_bytes) if item.get("fetch") else None
                    if fetched is None or not fetched.ok:
                        key = "too_big_text" if getattr(fetched, "too_big", False) else "failed_text"
                        notes.append(self.t(settings.get(key)) or self.default("broken"))
                        continue
                    document, error = save_file(
                        draft_id=self.state.get("draft_id") or "", field_key=settings.get("field_key") or "", content=fetched.content,
                        content_type=fetched.content_type or item.get("content_type", ""), user=self.user, phone=self.phone, message_id=self.message_id,
                    )
                    if document is None:
                        notes.append(self.t(settings.get("wrong_type_text" if error == "wrong_type" else "failed_text")) or self.default("broken"))
                        continue
                count += 1
                notes.append(self.t(settings.get("received_text")))
            counts[node["key"]] = count
            self.logged_steps.append((node["key"], "file", lowered[:300], len(self.media)))
            self._say("person", f"[{len(self.media)} file(s)]")
            if count >= max_files:
                return self._advance(node.get("next") or "", prefix=[n for n in notes[-1:] if n])
            return self._show(node, [], error="\n".join(dict.fromkeys(n for n in notes if n)))
        if lowered and (lowered in self._words(settings.get("skip_words")) or lowered in self._words(settings.get("done_words"))):
            if required and count == 0:
                return self._show(node, [], error=self.t(settings.get("needed_text")))
            self._record_answer(node, text)
            return self._advance(node.get("next") or "", prefix=[])
        return self._show(node, [], error=self.t(settings.get("needed_text")))

    def _answer_submit(self, node: dict, text: str) -> Screen:
        settings = node.get("settings") or {}
        lowered = text.strip().lower()
        if lowered in YES_WORDS or lowered == self.default("yes").lower():
            self._record_answer(node, text)
            self.state.setdefault("consented", {})[node["key"]] = True
            return self._do_submit(node, [])
        if lowered in NO_WORDS or lowered == self.default("no").lower():
            self._record_answer(node, text)
            declined = self.t(settings.get("declined_text"))
            if settings.get("error_next"):
                return self._advance(settings["error_next"], prefix=[declined] if declined else [])
            return self._finish([declined], outcome="completed", node_key=node["key"], node_type="submit")
        return self._show(node, [], error=self.default("invalid_choice"))

    def _do_submit(self, node: dict, prefix: list[str]) -> Screen:
        from apps.channels import actions

        settings = node.get("settings") or {}
        name = str(self.state["vars"].get(settings.get("name_variable") or "name") or self.state["vars"].get("profile_name") or "")
        if self.dry_run or not self.state.get("draft_id"):
            reference, error = ("", "failed") if not self.dry_run else ("TEST", "")
        else:
            reference, error = actions.submit_draft(
                draft_id=self.state["draft_id"], user=self.user, name=name, consent=bool(self.state.get("consented", {}).get(node["key"])),
                phone=self.phone, channel=self.channel, simulation=self.simulation,
            )
        self.logged_steps.append((node["key"], "submit", ""))
        if not error:
            self.state["vars"]["reference"] = reference
            self.effects["submitted"] = reference
            text = self.t(settings.get("success_text"))
            if settings.get("success_next"):
                return self._advance(settings["success_next"], prefix=prefix + ([text] if text else []))
            return self._finish(prefix + [text], outcome="completed", node_key=node["key"], node_type="submit")
        text = self.t(settings.get("closed_text" if error == "closed" else "error_text")) or self.default("broken")
        if settings.get("error_next"):
            return self._advance(settings["error_next"], prefix=prefix + [text])
        return self._finish(prefix + [text], outcome="completed", node_key=node["key"], node_type="submit")

    def _answer_end(self, node: dict, text: str) -> Screen:
        return self.start()

    # -- steps ------------------------------------------------------------------

    def _run_save_draft(self, node: dict):
        settings = node.get("settings") or {}
        if self.dry_run:
            self.state["vars"]["draft_reference"] = "IDEA-PREVIEW"
            return node.get("next") or "", self.t(node.get("text"))
        visible_vars = dict(self.state["vars"])
        draft, user, error = actions.save_draft(
            settings=settings,
            variables=visible_vars,
            phone=self.phone,
            user=self.user,
            channel=self.channel,
            session_id=self.session_id,
            draft_id=self.state.get("draft_id"),
            simulation=self.simulation,
        )
        if draft is None:
            return (settings.get("error_next") or node.get("next") or ""), pick(actions.SAVE_FAILED, self.lang)
        self.user = user
        self.state["draft_id"] = str(draft.id)
        self.state["vars"]["draft_reference"] = draft.reference_number
        self.effects["draft_id"] = str(draft.id)
        self.effects["user_id"] = str(user.id) if user else ""
        return node.get("next") or "", self.t(node.get("text"))

    def _run_lookup(self, node: dict):
        settings = node.get("settings") or {}
        result = actions.lookup(settings=settings, variables=self.state["vars"], phone=self.phone, user=self.user, lang=self.lang, channel=self.channel)
        if settings.get("save_as"):
            self.state["vars"][settings["save_as"]] = result
        header = self.t(node.get("text"))
        return node.get("next") or "", "\n".join(p for p in (header, result) if p)

    def _run_subscribe(self, node: dict):
        ok = self.dry_run or actions.subscribe(settings=node.get("settings") or {}, phone=self.phone, lang=self.lang)
        self.effects["subscribed"] = ok
        return node.get("next") or "", self.t(node.get("text")) if ok else pick(actions.SUBSCRIBE_FAILED, self.lang)

    def _run_condition(self, node: dict):
        settings = node.get("settings") or {}
        result = self._evaluate(settings)
        target = settings.get("true_next") if result else settings.get("false_next")
        return (target or node.get("next") or ""), ""

    def _evaluate(self, settings: dict) -> bool:
        if (settings.get("check") or "variable") == "registered":
            return self.user is not None
        value = self.state["vars"].get(settings.get("variable") or "")
        operator = settings.get("operator") or "equals"
        expected = settings.get("value")
        if operator == "is_set":
            return value not in (None, "", False)
        if operator == "not_set":
            return value in (None, "", False)
        if operator in ("gt", "lt"):
            try:
                left, right = float(value), float(expected)
            except (TypeError, ValueError):
                return False
            return left > right if operator == "gt" else left < right
        if operator == "contains":
            return str(expected or "").lower() in str(value or "").lower()
        equal = str(value).lower() == str(expected).lower() if value is not None else expected in (None, "")
        return equal if operator == "equals" else not equal

    def _handoff(self, node: dict, *, note: str, prefix: list[str]) -> Screen:
        from apps.channels.handoff import open_handoff

        settings = node.get("settings") or {}
        contact = {"phone": self.phone}
        if self.user is not None:
            contact.update({"user_id": str(self.user.id), "email": self.user.email or "", "name": self.user.get_full_name() if hasattr(self.user, "get_full_name") else ""})
        subject = self.t(settings.get("subject")) or ("Call-back request from USSD" if self.channel == "ussd" else "WhatsApp chat")
        transcript = list(self.state["transcript"])
        try:
            if self.dry_run:
                raise _DryRun()
            conversation = open_handoff(
                channel=self.channel,
                contact=contact,
                subject=subject[:200],
                transcript=transcript,
                language=self.lang,
                reason=note[:500],
            )
            self.effects["conversation_id"] = str(getattr(conversation, "id", "") or "")
        except _DryRun:
            pass
        except Exception:  # hand-over never breaks the screen
            logger.exception("open_handoff failed for %s", self.channel)
        done = self.t(settings.get("done_text")) or self.default("handoff_done_ussd" if self.channel == "ussd" else "handoff_done_whatsapp")
        # On WhatsApp the chat goes straight to staff, so the note prompt (USSD only) is not shown.
        return self._finish(prefix + [done], outcome="handed_over", node_key=node["key"], node_type="handoff")


def build_graph_from_nodes(journey) -> dict:
    nodes = {node.key: node.as_graph_node() for node in journey.nodes.all()}
    return {"start": journey.start_key, "default_language": journey.default_language, "channel": journey.channel, "nodes": nodes}


def preview_first_screen(connection) -> tuple[str, bool] | None:
    """The first USSD screen a connection's journey shows. No session, no side effects
    beyond steps that run before the first screen (normally none)."""
    channel_connection = getattr(connection, "channel", None)
    journey = getattr(channel_connection, "journey", None)
    if journey is None:
        return None
    version = journey.latest_version
    graph = version.graph if version else build_graph_from_nodes(journey)
    runner = JourneyRunner(graph, {}, channel="ussd", phone="", user=None, session_id="preview", simulation=True, dry_run=True)
    screen = runner.start()
    return screen.ussd_text(), screen.end


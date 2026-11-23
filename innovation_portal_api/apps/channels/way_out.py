"""A way out of every question and file step (prompt 33).

Words are matched ignoring case, spaces, punctuation and emoji. On a step that has the way out
turned on, the person can go to the main menu, save and stop, or cancel. A greeting in the middle
of a journey is not an answer: the person is asked whether to carry on. On WhatsApp with buttons
these are buttons; on USSD or with buttons off the text adds "0. Main menu".

Staff change the words on the connection and turn the way out off per step (``way_out``).
"""

from __future__ import annotations

import re
import unicodedata

from apps.channels.actions import pick

MENU, STOP, SKIP = "__menu", "__stop", "__skip"
WAY_OUT_TYPES = {"question", "file", "form_questions", "submit"}
BUTTON_TYPES = {"question", "file", "form_questions"}
MAX_ROWS = 10

DEFAULT_WORDS = {
    "menu_words": ["menu", "home", "main menu", "start", "gae"],
    "cancel_words": ["cancel", "stop", "emisa"],
    "greeting_words": ["hi", "hey", "hello", "dumela"],
}
STOP_WORDS = {"save and stop", "boloka o emise"}  # the button's own title, if typed

# TODO tn-review: every Setswana text below.
WAY_OUT_TEXT = {
    "main_menu": {"en": "Main menu", "tn": "Lenane le legolo"},
    "save_stop": {"en": "Save and stop", "tn": "Boloka o emise"},
    "skip": {"en": "Skip", "tn": "Tlola"},
    "carry_on": {"en": "Carry on", "tn": "Tswelela"},
    "zero": {"en": "0. Main menu", "tn": "0. Lenane le legolo"},
    "saved": {"en": "Saved. Choose Check my idea any time to carry on.", "tn": "E bolokilwe. Tlhopha Tlhola kakanyo ya me nako nngwe le nngwe go tswelela."},
    "nothing_saved": {"en": "Stopped. Nothing was saved yet.", "tn": "Go emisitswe. Ga go a bolokwa sepe."},
    "greeting_title": {"en": "You were adding your idea '{title}'. Carry on or go to the main menu?", "tn": "O ne o tsenya kakanyo ya gago '{title}'. Tswelela kgotsa ya kwa lenaneng le legolo?"},
    "greeting": {"en": "You were in the middle of a question. Carry on or go to the main menu?", "tn": "O ne o le fa gare ga potso. Tswelela kgotsa ya kwa lenaneng le legolo?"},
    "cancel_ask": {"en": "Keep your idea so you can finish it later, or delete it?", "tn": "A o boloke kakanyo ya gago go e fetsa moragonyana, kgotsa o e phimole?"},
    "keep": {"en": "Keep it", "tn": "E boloke"},
    "delete": {"en": "Delete it", "tn": "E phimole"},
    "deleted": {"en": "Your idea is deleted.", "tn": "Kakanyo ya gago e phimotswe."},
}


def norm(text) -> str:
    """Lower case, letters and digits only, single spaces: "  SKIP! 👍" becomes "skip"."""
    value = unicodedata.normalize("NFKC", str(text or "")).casefold()
    kept = "".join(ch if unicodedata.category(ch)[0] in "LN" else " " for ch in value)
    return re.sub(r"\s+", " ", kept).strip()


class WayOutMixin:
    """Methods ``JourneyRunner`` uses for the way out."""

    def _wo(self, key: str) -> str:
        return pick(WAY_OUT_TEXT[key], self.lang)

    def _wo_words(self, name: str) -> set[str]:
        words = (self.words or {}).get(name)
        if words is None:
            words = DEFAULT_WORDS[name]
        return {norm(word) for word in words if norm(word)}

    def _way_out_on(self, node: dict) -> bool:
        return node.get("type") in WAY_OUT_TYPES and (node.get("settings") or {}).get("way_out", True) is not False

    def _zero_is_menu(self, node: dict) -> bool:
        """On text menus 0 is the main menu, unless this step takes 0 as a real answer."""
        if self.interactive or node.get("type") not in BUTTON_TYPES:
            return False
        settings = node.get("settings") or {}
        if node.get("type") == "question" and settings.get("answer_type") == "number":
            return False
        if node.get("type") == "form_questions":
            field = self._fq_current_field(node)
            if field is None or field.get("type") == "number":
                return False
        # A step whose own text offers 0 ("or 0 for your latest idea") keeps it.
        texts = node.get("text") or {}
        return not any(re.search(r"(?<![\d.])0(?![\d.])", str(value)) for value in (texts.values() if isinstance(texts, dict) else [texts]))

    def _real_choice_titles(self, node: dict) -> set[str]:
        """Titles the step itself offers: choosing one is an answer, even if it is also a menu word."""
        settings = node.get("settings") or {}
        if node.get("type") == "question" and settings.get("answer_type") == "choice":
            return {norm(self.t(option.get("label"))) for option in settings.get("choices") or []}
        if node.get("type") == "form_questions":
            field = self._fq_current_field(node)
            if field and field.get("type") in ("select", "radio", "district", "multiselect", "checkboxes"):
                return {norm(choice.title) for choice in self._fq_choices(field)}
        return set()

    # -- what the screen offers ----------------------------------------------

    def _offer_way_out(self, screen, node: dict, *, optional: bool = False):
        if node.get("type") not in BUTTON_TYPES or not self._way_out_on(node):
            return screen
        from apps.channels.engine import Choice

        if self.interactive:
            extra = [Choice(SKIP, self._wo("skip"))] if optional else []
            extra += [Choice(MENU, self._wo("main_menu")), Choice(STOP, self._wo("save_stop"))]
            if len(screen.choices) + len(extra) <= MAX_ROWS:
                screen.choices = [*screen.choices, *extra]
        elif self._zero_is_menu(node):
            if self.channel == "ussd":
                screen.footer = self._wo("zero")
            else:
                screen.text = f"{screen.text}\n{self._wo('zero')}" if screen.text else self._wo("zero")
        return screen

    # -- answering -----------------------------------------------------------

    def _way_out(self, node: dict, text: str):
        """A screen when the message was a way out; None when it is an answer for the step."""
        value = norm(text)
        pending = self.state.get("pending")
        if pending and pending.get("kind") not in ("greeting", "cancel"):
            pending = None  # another part's question (AI guidance) answers it
        if pending and not self.media:
            answered = self._answer_pending(node, pending, text, value)
            if answered is not None:
                return answered
        if pending:
            self.state.pop("pending", None)
        if self.media or not self._way_out_on(node):
            return None
        if text == MENU:
            return self._go_menu(node, text)
        if text == STOP:
            return self._save_and_stop(node, text)
        if value in self._real_choice_titles(node):
            return None
        if value in self._wo_words("menu_words") or (value == "0" and self._zero_is_menu(node)):
            return self._go_menu(node, text)
        if value in STOP_WORDS:
            return self._save_and_stop(node, text)
        if value in self._wo_words("cancel_words"):
            return self._ask_cancel(node)
        if value in self._wo_words("greeting_words"):
            return self._ask_carry_on(node)
        return None

    def _answer_pending(self, node: dict, pending: dict, text: str, value: str):
        if pending.get("kind") == "greeting":
            index = self._choose(text, 2, [self._wo("carry_on"), self._wo("main_menu")])
            if index == 1:
                self.state.pop("pending", None)
                return self.repeat()
            if index == 2 or value in self._wo_words("menu_words"):
                return self._go_menu(node, text)
            if value in self._wo_words("greeting_words"):
                return self._ask_carry_on(node)
            return None  # they typed their answer instead: use it
        index = self._choose(text, 2, [self._wo("keep"), self._wo("delete")])
        if index == 1:
            self.state.pop("pending", None)
            return self._save_and_stop(node, text)
        if index == 2:
            self.state.pop("pending", None)
            return self._delete_and_menu(node, text)
        return self._ask_cancel(node, error=self.default("invalid_choice"))

    def _pending_screen(self, node: dict, kind: str, body: str, titles: list[str], error: str = ""):
        from apps.channels.engine import Choice, Screen

        self.state["pending"] = {"kind": kind}
        text = "\n".join(part for part in (error, body) if part)
        choices = [Choice(str(i), title) for i, title in enumerate(titles, start=1)]
        screen = Screen(text=text, end=False, node_key=node["key"], node_type=node["type"], choices=choices, expects="choice", node_title=node.get("title") or "", lang=self.lang)
        self._say("bot", screen.ussd_text() if self.channel == "ussd" else text)
        return screen

    def _idea_title(self) -> str:
        return str(self.state["vars"].get("title") or "").strip()[:60]

    def _ask_carry_on(self, node: dict):
        title = self._idea_title()
        body = self._wo("greeting_title").replace("{title}", title) if title else self._wo("greeting")
        return self._pending_screen(node, "greeting", body, [self._wo("carry_on"), self._wo("main_menu")])

    def _has_saved_idea(self) -> bool:
        return bool(self.state.get("draft_id") or self.state.get("sim_draft") or self._idea_title())

    def _ask_cancel(self, node: dict, error: str = ""):
        if not self._has_saved_idea():
            return self._go_menu(node, "cancel")
        return self._pending_screen(node, "cancel", self._wo("cancel_ask"), [self._wo("keep"), self._wo("delete")], error)

    def _forget_idea(self) -> None:
        for key in ("draft_id", "sim_draft", "fq", "mi", "pending", "consented", "file_counts", "needs_web"):
            self.state.pop(key, None)
        for key in ("title", "draft_reference", "reference"):
            self.state["vars"].pop(key, None)

    def _go_menu(self, node: dict, text: str, prefix: list[str] | None = None):
        self._record_way_out(node, text)
        self._forget_idea()
        self.state["node"] = ""
        return self._advance(self.graph.get("start") or "", prefix=prefix or [])

    def _record_way_out(self, node: dict, text: str) -> None:
        shown = {MENU: self._wo("main_menu"), STOP: self._wo("save_stop")}.get(text, text)
        self.logged_steps.append((node["key"], node["type"], "way out"))
        self._say("person", shown[:300])

    def _save_and_stop(self, node: dict, text: str):
        from apps.channels import actions

        self._record_way_out(node, text)
        saved = bool(self.state.get("draft_id") or self.state.get("sim_draft"))
        if not saved and self._idea_title() and not (self.simulation or self.dry_run):
            draft, user, _ = actions.save_draft(
                settings={"program_id": None, "title_variable": "title", "name_variable": "name", "create_account": True},
                variables=dict(self.state["vars"]), phone=self.phone, user=self.user, channel=self.channel, session_id=self.session_id, draft_id=None, simulation=False,
            )
            if draft is not None:
                self.user, saved = user, True
                self.state["draft_id"] = str(draft.id)
                self.effects["draft_id"] = str(draft.id)
                self.effects["user_id"] = str(user.id) if user else ""
        elif not saved and self._idea_title():
            saved = True
        return self._finish([self._wo("saved" if saved else "nothing_saved")], outcome="completed", node_key=node["key"], node_type=node["type"])

    def _delete_and_menu(self, node: dict, text: str):
        from apps.channels import actions

        draft_id = self.state.get("draft_id") or ""
        if draft_id and not (self.simulation or self.dry_run):
            if actions.delete_draft(draft_id=draft_id, user=self.user, phone=self.phone, channel=self.channel):
                self.effects["draft_deleted"] = True
        return self._go_menu(node, text, prefix=[self._wo("deleted")])

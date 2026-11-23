"""The "Show my ideas" step (``my_ideas``): the person's ideas without idea numbers.

It finds the ideas of the account the phone belongs to, plus the drafts and submissions made
from this phone as a guest. Open ideas (drafts, and submissions with no final decision) come
first as buttons or a list, newest first; "Recent ideas" shows the last 5 of any status.
Picking one shows its name, its status in plain words, the last update, what to do next, and
"Continue this idea" for a draft. Typing an idea number still works.

Only the person's own ideas are ever shown, and only public fields: no notes, no reviewer
names. In the phone simulator the ideas are samples and nothing is read or saved.
"""

from __future__ import annotations

from datetime import date, datetime

from django.db.models import Q
from django.utils import timezone

from apps.channels.actions import pick
from apps.channels.form_steps import website_link

MAX_OPEN = 9  # plus "Recent ideas": 10 rows, one WhatsApp list
MAX_RECENT = 5

# TODO tn-review: every Setswana text below.
IDEA_TEXT = {
    "open_title": {"en": "Your open ideas:", "tn": "Dikakanyo tsa gago tse di buleditsweng:"},
    "recent_title": {"en": "Your recent ideas:", "tn": "Dikakanyo tsa gago tsa bosheng:"},
    "none": {"en": "You have no ideas with us yet.", "tn": "Ga o ise o nne le dikakanyo le rona."},
    "no_open": {"en": "You have no open ideas.", "tn": "Ga o na dikakanyo tse di buleditsweng."},
    "recent": {"en": "Recent ideas", "tn": "Dikakanyo tsa bosheng"},
    "continue": {"en": "Continue this idea", "tn": "Tswelela ka kakanyo e"},
    "back": {"en": "Back", "tn": "Morago"},
    "main": {"en": "Main menu", "tn": "Lenane le legolo"},
    "more": {"en": "See all your ideas at {link} (sign in with this phone number).", "tn": "Bona dikakanyo tsotlhe tsa gago kwa {link} (tsena ka nomoro e ya founu)."},
    "not_found": {"en": "We could not find that idea for this number.", "tn": "Ga re a bona kakanyo eo ya nomoro e."},
    "draft": {"en": "Not sent yet", "tn": "Ga e ise e romelwe"},
    "updated": {"en": "Last update: {date}", "tn": "Phetogo ya bofelo: {date}"},
    "next_draft": {"en": "Next: send your draft.", "tn": "Se se latelang: romela kakanyo ya gago."},
    "next_answer": {"en": "Next: answer the officer's question on the website.", "tn": "Se se latelang: araba potso ya motlhankedi mo webosaeteng."},
    "next_wait": {"en": "Nothing to do now. We will tell you when it changes.", "tn": "Ga go na se o tshwanetseng go se dira jaanong. Re tla go itsise fa go fetoga."},
    "next_done": {"en": "The review of this idea is finished.", "tn": "Tshekatsheko ya kakanyo e e fedile."},
    "untitled": {"en": "Untitled idea", "tn": "Kakanyo e e senang leina"},
}

SAMPLE_IDEAS = [  # simulator only
    {"kind": "draft", "id": "sample-draft", "title": "Solar water pump", "status": "draft", "updated": "", "reference": "DRAFT-SAMPLE-1"},
    {"kind": "submission", "id": "sample-sent", "title": "Mobile clinic booking", "status": "under_review", "updated": "", "reference": "IDEA-SAMPLE-2"},
    {"kind": "submission", "id": "sample-info", "title": "Farm produce market app", "status": "requires_more_information", "updated": "", "reference": "IDEA-SAMPLE-3"},
]


def _owner_q(user, phone: str) -> Q | None:
    query = None
    if user is not None:
        query = Q(innovator=user)
    if phone:
        guest = Q(guest_phone=phone, innovator__isnull=True)
        query = guest if query is None else (query | guest)
    return query


def find_ideas(*, user, phone: str) -> list[dict]:
    """The person's drafts and submissions, newest first, as small public dicts."""
    from apps.submissions.models import ApplicationDraft, Submission

    owner = _owner_q(user, phone)
    if owner is None:
        return []
    items = []
    drafts = ApplicationDraft.objects.filter(owner, status=ApplicationDraft.STATUS_DRAFT).order_by("-updated_at")[:50]
    for draft in drafts:
        items.append({"kind": "draft", "id": str(draft.id), "title": draft.title, "status": "draft", "updated": draft.updated_at.isoformat(), "reference": draft.reference_number})
    submissions = Submission.objects.filter(owner).exclude(current_status="draft").order_by("-updated_at")[:50]
    for submission in submissions:
        items.append({"kind": "submission", "id": str(submission.id), "title": submission.title, "status": submission.current_status, "updated": submission.updated_at.isoformat(), "reference": submission.reference_number})
    items.sort(key=lambda item: item["updated"], reverse=True)
    return items


def is_open(item: dict) -> bool:
    from apps.submissions.status_labels import FINISHED_STATUSES

    return item["kind"] == "draft" or item["status"] not in FINISHED_STATUSES


class MyIdeasMixin:
    """Methods ``JourneyRunner`` uses for the ``my_ideas`` step."""

    # state["mi"] = {"node", "view": open | recent | detail, "shown": [item ids], "from": open | recent, "item": id}

    def _mi_text(self, key: str) -> str:
        return pick(IDEA_TEXT[key], self.lang)

    def _mi_setting(self, node: dict, name: str, fallback: str) -> str:
        return self.t((node.get("settings") or {}).get(name)) or self._mi_text(fallback)

    def _mi_ideas(self) -> list[dict]:
        cached = getattr(self, "_mi_cache", None)
        if cached is not None:
            return cached
        if self.simulation or self.dry_run:
            today = timezone.now().isoformat()
            ideas = [{**item, "updated": today} for item in SAMPLE_IDEAS]
        else:
            ideas = find_ideas(user=self.user, phone=self.phone)
        self._mi_cache = ideas
        return ideas

    def _mi_title(self, item: dict, limit: int = 60) -> str:
        title = " ".join((item.get("title") or "").split()) or self._mi_text("untitled")
        return title[:limit]

    def _mi_status(self, item: dict) -> str:
        from apps.submissions.status_labels import public_status_label

        if item["kind"] == "draft":
            return self._mi_text("draft")
        return public_status_label(item["status"])

    def _mi_screen(self, node: dict, text: str, choices: list, prefix: list[str], error: str = ""):
        from apps.channels.engine import Screen

        self.state["node"] = node["key"]
        full = "\n".join(part for part in [*prefix, error, text] if part)
        screen = Screen(text=full, end=False, node_key=node["key"], node_type="my_ideas", choices=choices, expects="choice", node_title=node.get("title") or "", lang=self.lang)
        self._say("bot", screen.ussd_text() if self.channel == "ussd" else full)
        return screen

    def _mi_more(self) -> str:
        link = website_link()
        return self._mi_text("more").replace("{link}", link) if link else ""

    def _mi_list(self, node: dict, view: str, prefix: list[str], error: str = ""):
        from apps.channels.engine import Choice

        ideas = self._mi_ideas()
        mi = self.state["mi"] = {"node": node["key"], "view": view}
        if not ideas:
            self.state.pop("mi", None)
            self.logged_steps.append((node["key"], "my_ideas", ""))
            empty = self._mi_setting(node, "empty_text", "none")
            return self._mi_leave(node, prefix + [empty])
        if view == "open":
            shown = [item for item in ideas if is_open(item)]
            limit = MAX_OPEN if self.channel != "ussd" else 5
            title = self._mi_setting(node, "open_text", "open_title")
            if not shown:
                title = self._mi_text("no_open")
        else:
            shown = list(ideas)
            limit = MAX_RECENT
            title = self._mi_setting(node, "recent_text", "recent_title")
        more = len(shown) > limit
        shown = shown[:limit]
        mi["shown"] = [item["id"] for item in shown]
        choices = [Choice(str(i), self._mi_title(item, 40 if self.channel != "ussd" else 18)) for i, item in enumerate(shown, start=1)]
        if view == "open":
            choices.append(Choice(str(len(choices) + 1), self._mi_text("recent")))
        else:
            choices.append(Choice(str(len(choices) + 1), self._mi_text("back")))
        lines = [title]
        if more or (view == "recent" and len(ideas) > MAX_RECENT):
            lines.append(self._mi_more())
        return self._mi_screen(node, "\n".join(line for line in lines if line), choices, prefix, error)

    def _mi_detail(self, node: dict, item: dict, came_from: str, prefix: list[str]):
        from apps.channels.engine import Choice
        from apps.submissions.status_labels import FINISHED_STATUSES, NEEDS_ACTION_STATUSES

        self.state["mi"] = {"node": node["key"], "view": "detail", "item": item["id"], "kind": item["kind"], "from": came_from}
        updated = ""
        try:
            when = timezone.localtime(datetime.fromisoformat(item["updated"])) if item.get("updated") else None
            updated = when.strftime("%d %b %Y") if when else ""
        except (TypeError, ValueError):
            updated = date.today().strftime("%d %b %Y")
        if item["kind"] == "draft":
            next_step = self._mi_text("next_draft")
        elif item["status"] in NEEDS_ACTION_STATUSES:
            next_step = self._mi_text("next_answer")
        elif item["status"] in FINISHED_STATUSES:
            next_step = self._mi_text("next_done")
        else:
            next_step = self._mi_text("next_wait")
        lines = [self._mi_title(item, 120), self._mi_status(item)]
        if updated:
            lines.append(self._mi_text("updated").replace("{date}", updated))
        lines.append(next_step)
        if item["kind"] == "submission" and item["status"] in NEEDS_ACTION_STATUSES:
            lines.append(website_link().replace("/my-ideas", f"/my-ideas/{item['id']}") if website_link() else "")
        choices = []
        settings = node.get("settings") or {}
        if item["kind"] == "draft" and settings.get("continue_next"):
            choices.append(Choice("1", self._mi_text("continue")))
        choices.append(Choice(str(len(choices) + 1), self._mi_text("back")))
        choices.append(Choice(str(len(choices) + 1), self._mi_text("main")))
        self.logged_steps.append((node["key"], "my_ideas", ""))
        return self._mi_screen(node, "\n".join(line for line in lines if line), choices, prefix)

    def _mi_leave(self, node: dict, prefix: list[str]):
        """Back to the main menu: the step's "Then go to", or the start."""
        self.state.pop("mi", None)
        target = node.get("next") or ""
        if target:
            return self._advance(target, prefix=prefix)
        self.state["node"] = ""
        return self._advance(self.graph.get("start") or "", prefix=prefix)

    def _mi_find(self, item_id: str) -> dict | None:
        for item in self._mi_ideas():
            if item["id"] == item_id:
                return item
        return None

    def _mi_by_reference(self, text: str) -> dict | None:
        reference = " ".join(text.split()).upper()
        if len(reference) < 4:
            return None
        for item in self._mi_ideas():
            if (item.get("reference") or "").upper() == reference:
                return item
        return None

    # -- entering and answering ---------------------------------------------

    def _enter_my_ideas(self, node: dict, prefix: list[str]):
        intro = self.t(node.get("text"))
        return self._mi_list(node, "open", prefix + ([intro] if intro else []))

    def _answer_my_ideas(self, node: dict, text: str):
        mi = self.state.get("mi") or {}
        if mi.get("node") != node["key"]:
            return self._enter_my_ideas(node, [])
        view = mi.get("view") or "open"
        if view == "detail":
            item = self._mi_find(mi.get("item") or "")
            if item is None:
                return self._mi_list(node, "open", [])
            labels = []
            settings = node.get("settings") or {}
            if item["kind"] == "draft" and settings.get("continue_next"):
                labels.append("continue")
            labels += ["back", "main"]
            index = self._choose(text, len(labels), [self._mi_text(k) for k in labels])
            if index is None:
                return self._mi_detail(node, item, mi.get("from") or "open", [self.default("invalid_choice")])
            self._record_answer(node, text)
            action = labels[index - 1]
            if action == "back":
                return self._mi_list(node, mi.get("from") or "open", [])
            if action == "main":
                return self._mi_leave(node, [])
            return self._mi_continue(node, item)
        shown = mi.get("shown") or []
        extra = self._mi_text("recent") if view == "open" else self._mi_text("back")
        ideas = {item["id"]: item for item in self._mi_ideas()}
        titles = [self._mi_title(ideas[i], 40) if i in ideas else "" for i in shown] + [extra]
        index = self._choose(text, len(shown) + 1, titles)
        if index is None:
            item = self._mi_by_reference(text)  # typing an idea number still works
            if item is not None:
                self._record_answer(node, text)
                return self._mi_detail(node, item, view, [])
            return self._mi_list(node, view, [], error=self.default("invalid_choice"))
        self._record_answer(node, text)
        if index == len(shown) + 1:
            return self._mi_list(node, "recent", []) if view == "open" else self._mi_list(node, "open", [])
        item = ideas.get(shown[index - 1])
        if item is None:  # gone since the list was shown
            return self._mi_list(node, view, [], error=self._mi_text("not_found"))
        return self._mi_detail(node, item, view, [])

    def _mi_continue(self, node: dict, item: dict):
        settings = node.get("settings") or {}
        self.state.pop("mi", None)
        self.state.pop("fq", None)
        if self.simulation or self.dry_run:
            from apps.channels.form_steps import program_by_id

            program = program_by_id(None)
            self.state["sim_draft"] = {"program_id": str(program.id) if program else "", "data": {}}
            self.state["draft_id"] = ""
        else:
            from apps.submissions.models import ApplicationDraft

            # Ownership is checked again here, not only when the list was made.
            owner = _owner_q(self.user, self.phone)
            draft = ApplicationDraft.objects.filter(owner, id=item["id"], status=ApplicationDraft.STATUS_DRAFT).first() if owner is not None else None
            if draft is None:
                return self._mi_list(node, "open", [self._mi_text("not_found")])
            self.state.pop("sim_draft", None)
            self.state["draft_id"] = str(draft.id)
            self.effects["draft_id"] = str(draft.id)
        self.state["vars"]["draft_reference"] = item.get("reference") or ""
        self.state["vars"]["title"] = item.get("title") or ""
        return self._advance(settings.get("continue_next") or "", prefix=[])

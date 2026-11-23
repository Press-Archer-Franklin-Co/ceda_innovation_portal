"""The "Ask the form's questions" step (``form_questions``) and the drafts it works on.

At run time the step reads the programme's live form (the latest published version, as the
website shows it) and asks each question in order, in the person's language. It skips
questions hidden by the form's conditions, checks each answer with the form's own rules,
saves every answer into the idea draft under the field key, and understands BACK (the
previous question) and SKIP (an optional question). A question a phone cannot ask is listed
at the end with a link to finish that part on the website.

If no draft exists yet, the step makes one for its programme (so a Save to an idea draft step
before it is not needed). In the phone simulator nothing is saved: the answers live in the
session only (R-69).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from types import SimpleNamespace

from django.conf import settings as django_settings

from apps.channels.actions import pick

logger = logging.getLogger(__name__)

TEXT_TYPES = {"text", "textarea", "email", "phone", "url", "omang_id"}
SINGLE_CHOICE_TYPES = {"select", "radio", "district"}
YES_NO_TYPES = {"yes_no", "boolean"}
MULTI_TYPES = {"multiselect", "checkboxes"}
FILE_TYPES = {"file", "media"}
LAYOUT_TYPES = {"heading", "paragraph"}
ASKABLE = TEXT_TYPES | {"number", "date"} | SINGLE_CHOICE_TYPES | YES_NO_TYPES | MULTI_TYPES | FILE_TYPES
MAX_PROGRAM_CHOICES = 9  # plus "General idea": 10 rows, one WhatsApp list
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL_RE = re.compile(r"^(https?://)?[^\s/]+\.[^\s]+$", re.IGNORECASE)

# TODO tn-review: every Setswana text below.
FORM_TEXT = {
    "choose_program": {"en": "Which challenge is your idea for?", "tn": "Kakanyo ya gago ke ya kgaisano efe?"},
    "general_idea": {"en": "General idea", "tn": "Kakanyo fela"},
    "optional": {"en": "Reply SKIP to leave this out.", "tn": "Araba TLOLA go e tlogela."},
    "multi": {"en": "Reply with the numbers, with commas between them (for example 1,3).", "tn": "Araba ka dinomoro, o di kgaoganya ka dikhoma (sekai 1,3)."},
    "file": {"en": "Send a photo or document. Reply DONE when you have sent them all.", "tn": "Romela setshwantsho kgotsa tokomane. Araba FEDILE fa o di rometse tsotlhe."},
    "invalid_email": {"en": "Please enter an email address like name@example.com.", "tn": "Tsweetswee tsenya aterese ya imeile jaaka name@example.com."},
    "invalid_url": {"en": "Please enter a web address like www.example.com.", "tn": "Tsweetswee tsenya aterese ya webosaete jaaka www.example.com."},
    "required": {"en": "This question needs an answer.", "tn": "Potso e e tlhoka karabo."},
    "nothing_back": {"en": "This is the first question.", "tn": "E ke potso ya ntlha."},
    "website": {"en": "Finish these on the website: {fields}. {link}", "tn": "Fetsa tse mo webosaeteng: {fields}. {link}"},
    "finish_on_web": {"en": "Your idea is saved. Finish the part above on the website to send it.", "tn": "Kakanyo ya gago e bolokilwe. Fetsa karolo e e fa godimo mo webosaeteng go e romela."},
    "no_form": {"en": "This challenge has no questions to answer here.", "tn": "Kgaisano e ga e na dipotso tse di arabiwang fano."},
}

DEFAULT_BACK_WORDS = {"en": "back", "tn": "morago"}
DEFAULT_SKIP_WORDS = {"en": "skip", "tn": "tlola"}
DEFAULT_DONE_WORDS = {"en": "done", "tn": "fedile"}


def website_link(draft_id: str = "") -> str:
    base = (getattr(django_settings, "PUBLIC_BASE_URL", "") or "").rstrip("/")
    if not base:
        return ""
    return f"{base}/my-ideas/draft/{draft_id}" if draft_id else f"{base}/my-ideas"


# --------------------------------------------------------------------------------------
# Programmes, forms and drafts
# --------------------------------------------------------------------------------------


def open_programs() -> list:
    """Published challenges taking ideas now, soonest closing first (not General ideas)."""
    from apps.core.constants import ProgramStatus
    from apps.programs.selectors import ProgramSelector

    programs = ProgramSelector.public_programs(None).filter(status=ProgramStatus.PUBLISHED, is_general_intake=False).order_by("closes_at", "closing_date", "title")[:40]
    from apps.programs.general_idea import form_ready

    # Only challenges that can take an entry now: open, with a published form (prompt 31).
    return [p for p in programs if p.is_submission_open() and form_ready(p)][:MAX_PROGRAM_CHOICES]


def program_by_id(program_id):
    from apps.channels.actions import _program

    return _program(program_id or None)


def form_document(program) -> dict:
    """The programme's live form as the website shows it: the latest published version,
    or the form as it stands when nothing was published yet."""
    from apps.programs.form_schema import build_form_schema

    form = getattr(program, "form", None) if program is not None else None
    if form is None:
        return {}
    version = form.latest_version
    if version is not None and version.schema:
        return version.schema
    return build_form_schema(form, include_inactive=False)


def model_fields(program) -> dict:
    """Form fields by key, for the form's own answer checks."""
    form = getattr(program, "form", None) if program is not None else None
    if form is None:
        return {}
    return {field.key: field for field in form.fields.filter(is_active=True).prefetch_related("field_rules", "options")}


def draft_values(draft_id: str) -> dict:
    from apps.submissions.models import ApplicationDraft

    draft = ApplicationDraft.objects.filter(id=draft_id).first() if draft_id else None
    return dict(draft.draft_data or {}) if draft else {}


def save_answer(*, draft_id: str, key: str, value, title_field: str = "") -> bool:
    """Write one answer into the draft (the same place the website keeps it)."""
    from apps.submissions.draft_services import ApplicationDraftService
    from apps.submissions.models import ApplicationDraft

    draft = ApplicationDraft.objects.filter(id=draft_id, status=ApplicationDraft.STATUS_DRAFT).select_related("program").first()
    if draft is None:
        return False
    data = dict(draft.draft_data or {})
    if value in (None, "", []):
        data.pop(key, None)
    else:
        data[key] = value
    draft.draft_data = data
    update = ["draft_data", "progress_metadata", "updated_at"]
    if title_field and key == title_field and isinstance(value, str) and value.strip():
        draft.title = value.strip()[:255]
        update.append("title")
    try:
        draft.progress_metadata = ApplicationDraftService.build_progress_metadata(draft, data, current_section_code="")
    except Exception:  # progress is a nicety; the answer itself must be kept
        logger.exception("Could not work out draft progress")
    draft.save(update_fields=update)
    return True


# --------------------------------------------------------------------------------------
# The runner part
# --------------------------------------------------------------------------------------


class FormQuestionsMixin:
    """Methods ``JourneyRunner`` uses for the ``form_questions`` step."""

    # state["fq"] = {"node", "program_id", "pos", "history", "current", "force", "website", "files", "choices"}

    def _fq(self) -> dict:
        return self.state.setdefault("fq", {})

    def _fq_text(self, key: str) -> str:
        return pick(FORM_TEXT[key], self.lang)

    def _fq_words(self, settings: dict, name: str, default: dict) -> set[str]:
        return self._words(settings.get(name) or default) | self._words(default)

    def _has_draft(self) -> bool:
        return bool(self.state.get("draft_id") or self.state.get("sim_draft"))

    def _draft_program_id(self) -> str:
        if self.state.get("sim_draft"):
            return self.state["sim_draft"].get("program_id") or ""
        from apps.submissions.models import ApplicationDraft

        draft = ApplicationDraft.objects.filter(id=self.state.get("draft_id")).only("program_id").first()
        return str(draft.program_id) if draft else ""

    def _answers(self) -> dict:
        if self.state.get("sim_draft"):
            return dict(self.state["sim_draft"].get("data") or {})
        return draft_values(self.state.get("draft_id") or "")

    def _store_answer(self, key: str, value, title_field: str) -> bool:
        if self.state.get("sim_draft"):
            data = self.state["sim_draft"].setdefault("data", {})
            if value in (None, "", []):
                data.pop(key, None)
            else:
                data[key] = value
            return True
        return save_answer(draft_id=self.state.get("draft_id") or "", key=key, value=value, title_field=title_field)

    def _make_draft(self, node: dict, program_id: str) -> str:
        """Make the idea draft this step fills in. Returns an error text, or ""."""
        from apps.channels import actions

        settings = node.get("settings") or {}
        if self.simulation or self.dry_run:
            program = program_by_id(program_id)
            variables, fields = self._fq_name_answers(str(program.id) if program else "", settings)
            data = {key: variables[var] for key, var in fields.items() if variables.get(var)}
            self.state["sim_draft"] = {"program_id": str(program.id) if program else "", "data": data}
            self.state["vars"]["draft_reference"] = "TEST-IDEA"
            return ""
        variables, fields = self._fq_name_answers(program_id, settings)
        draft, user, _ = actions.save_draft(
            settings={"program_id": program_id or None, "title_variable": settings.get("title_variable") or "title", "name_variable": settings.get("name_variable") or "name", "create_account": settings.get("create_account", True), "fields": fields},
            variables=variables, phone=self.phone, user=self.user, channel=self.channel, session_id=self.session_id,
            draft_id=None, simulation=False,
        )
        if draft is None:
            return pick(actions.SAVE_FAILED, self.lang)
        self.user = user
        self.state["draft_id"] = str(draft.id)
        self.state["vars"]["draft_reference"] = draft.reference_number
        self.effects["draft_id"] = str(draft.id)
        self.effects["user_id"] = str(user.id) if user else ""
        return ""

    def _fq_name_answers(self, program_id: str, settings: dict) -> tuple[dict, dict]:
        """The name already given (or the account's) fills the form's first and last name, so
        the person is not asked twice. Returns (variables, {field key: variable})."""
        variables = dict(self.state["vars"])
        name = str(variables.get(settings.get("name_variable") or "name") or "").strip()
        first, last = "", ""
        if self.user is not None:
            first, last = (self.user.first_name or "").strip(), (self.user.last_name or "").strip()
        if not first and name:
            first, _, last = name.partition(" ")
        if not first and variables.get("profile_name"):
            first, _, last = str(variables["profile_name"]).strip().partition(" ")
        variables["_first_name"], variables["_last_name"] = first.strip(), last.strip()
        keys = set(model_fields(program_by_id(program_id or None)))
        fields = {key: var for key, var in (("first_name", "_first_name"), ("last_name", "_last_name")) if key in keys and variables.get(var)}
        return variables, fields

    # -- the field list -------------------------------------------------------

    def _fq_program(self):
        # Kept on the runner, never in the state (the state is saved as JSON).
        wanted = self._fq().get("program_id") or ""
        cached = getattr(self, "_fq_program_obj", None)
        if cached is None or getattr(self, "_fq_program_for", None) != wanted:
            self._fq_program_obj = program_by_id(wanted)
            self._fq_program_for = wanted
            self._fq_cache = None
            self._fq_models = None
        return self._fq_program_obj

    def _fq_fields(self, node: dict) -> list[dict]:
        """The questions in form order, in the person's language: [{step, field}]."""
        from apps.programs.form_schema import iter_schema_fields, localize_schema

        program = self._fq_program()
        cache = getattr(self, "_fq_cache", None)
        if cache is not None:
            return cache
        document = form_document(program)
        settings = node.get("settings") or {}
        raw = settings.get("sections") or []
        if isinstance(raw, str):
            raw = re.split(r"[,\s]+", raw)
        sections = {str(code).strip() for code in raw if str(code).strip()}
        items = []
        if document:
            localized = localize_schema(document, self.lang)
            for step, field in iter_schema_fields(localized):
                if step is not None and not step.get("is_active", True):
                    continue
                if not field.get("is_active", True) or field.get("type") in LAYOUT_TYPES:
                    continue
                if sections and (step is None or step.get("code") not in sections):
                    continue
                items.append({"step": (step or {}).get("title") or "", "field": field})
        self._fq_cache = items
        return items

    def _fq_state(self, field: dict, values: dict) -> dict:
        from apps.programs.condition_services import FormConditionService

        shim = SimpleNamespace(
            key=field.get("key") or "", visible_if=field.get("visible_if") or {}, enabled_if=field.get("enabled_if") or {},
            required=bool(field.get("required")), required_if=field.get("required_if") or {},
        )
        try:
            return FormConditionService.field_state(shim, values)
        except Exception:
            return {"visible": True, "enabled": True, "required": bool(field.get("required"))}

    def _fq_next(self, node: dict, prefix: list[str]):
        """Ask the next question from ``pos`` on, or leave the step when none is left."""
        from apps.programs.condition_services import FormConditionService

        fq = self._fq()
        settings = node.get("settings") or {}
        ask_all = (settings.get("ask") or "required") == "all"
        items = self._fq_fields(node)
        values = self._answers()
        effective = dict(values)
        age = FormConditionService._derive_age(effective)
        if age is not None:
            effective["applicant_age"] = age
        pos = int(fq.get("pos") or 0)
        force = fq.get("force") or ""
        while pos < len(items):
            field = items[pos]["field"]
            key = field.get("key") or ""
            state = self._fq_state(field, effective)
            if not state["visible"] or not state["enabled"]:
                pos += 1
                continue
            if not (state["required"] or ask_all):
                pos += 1
                continue
            if key != force and values.get(key) not in (None, "", []):
                pos += 1  # answered already (for example on the website, or before a break)
                continue
            if field.get("type") not in ASKABLE or (field.get("type") in FILE_TYPES and self.channel == "ussd"):
                label = field.get("label") or key
                if label not in fq.setdefault("website", []):
                    fq["website"].append(label)
                if state["required"]:
                    self.state["needs_web"] = True  # the idea cannot be sent from the phone
                pos += 1
                continue
            fq["pos"], fq["current"], fq["force"], fq["files"] = pos, key, "", 0
            return self._fq_show(node, field, prefix, required=state["required"])
        return self._fq_leave(node, prefix)

    def _fq_leave(self, node: dict, prefix: list[str]):
        fq = self.state.pop("fq", {}) or {}
        parts = list(prefix)
        done = self.t((node.get("settings") or {}).get("done_text"))
        if done:
            parts.append(done)
        website = fq.get("website") or []
        if website:
            template = pick((node.get("settings") or {}).get("website_text") or FORM_TEXT["website"], self.lang)
            link = website_link(self.state.get("draft_id") or "")
            parts.append(template.replace("{fields}", ", ".join(website)).replace("{link}", link).strip())
        self.logged_steps.append((node["key"], "form_questions", ""))
        return self._advance(node.get("next") or "", prefix=parts)

    def _fq_choices(self, field: dict) -> list:
        from apps.channels.engine import Choice

        kind = field.get("type")
        if kind in YES_NO_TYPES:
            return [Choice("1", self.default("yes")), Choice("2", self.default("no"))]
        if kind == "district":
            from apps.reference.models import District

            return [Choice(str(i), d.name) for i, d in enumerate(District.objects.filter(active=True).order_by("name")[:40], start=1)]
        return [Choice(str(i), str(option.get("label") or option.get("value") or "")) for i, option in enumerate(field.get("options") or [], start=1)]

    def _fq_show(self, node: dict, field: dict, prefix: list[str], *, required: bool, error: str = ""):
        from apps.channels.engine import Screen

        kind = field.get("type")
        lines = [field.get("label") or field.get("key") or ""]
        help_text = (field.get("help_text") or "").strip()
        if help_text:
            lines.append(help_text[:300])
        choices, expects = [], "text"
        if kind in SINGLE_CHOICE_TYPES or kind in YES_NO_TYPES:
            choices, expects = self._fq_choices(field), "choice"
        elif kind in MULTI_TYPES:
            lines += [f"{c.id}. {c.title}" for c in self._fq_choices(field)]
            lines.append(self._fq_text("multi"))
        elif kind in FILE_TYPES:
            lines.append(self._fq_text("file"))
            expects = "file"
        if not required:
            lines.append(self._fq_text("optional"))
        self.state["node"] = node["key"]
        body = "\n".join(line for line in lines if line)
        text = "\n".join(part for part in [*prefix, error, body] if part)
        screen = Screen(text=text, end=False, node_key=node["key"], node_type="form_questions", choices=choices, expects=expects, node_title=node.get("title") or "", lang=self.lang)
        self._say("bot", screen.ussd_text() if self.channel == "ussd" else text)
        return screen

    def _fq_show_programs(self, node: dict, prefix: list[str], error: str = ""):
        from apps.channels.engine import Choice, Screen

        programs = open_programs()
        fq = self._fq()
        fq["choices"] = [str(p.id) for p in programs] + [""]
        choices = [Choice(str(i), p.title) for i, p in enumerate(programs, start=1)]
        choices.append(Choice(str(len(choices) + 1), self._fq_text("general_idea")))
        self.state["node"] = node["key"]
        body = self.t((node.get("settings") or {}).get("program_text")) or self._fq_text("choose_program")
        text = "\n".join(part for part in [*prefix, error, body] if part)
        screen = Screen(text=text, end=False, node_key=node["key"], node_type="form_questions", choices=choices, expects="choice", node_title=node.get("title") or "", lang=self.lang)
        self._say("bot", screen.ussd_text() if self.channel == "ussd" else text)
        return screen

    # -- entering and answering ---------------------------------------------

    def _enter_form_questions(self, node: dict, prefix: list[str]):
        settings = node.get("settings") or {}
        self.state["fq"] = {"node": node["key"], "pos": 0, "history": [], "website": []}
        self.state.pop("needs_web", None)
        intro = self.t(node.get("text"))
        prefix = prefix + ([intro] if intro else [])
        if self._has_draft():
            self.state["fq"]["program_id"] = self._draft_program_id()
            return self._fq_next(node, prefix)
        source = settings.get("program_source") or "fixed"
        if source == "ask":
            return self._fq_show_programs(node, prefix)
        program_id = str(self.state["vars"].get(settings.get("program_variable") or "") or "") if source == "variable" else (settings.get("program_id") or "")
        return self._fq_start_program(node, program_id, prefix)

    def _fq_start_program(self, node: dict, program_id: str, prefix: list[str]):
        error = self._make_draft(node, program_id)
        if error:
            settings = node.get("settings") or {}
            self.state.pop("fq", None)
            return self._advance(settings.get("error_next") or node.get("next") or "", prefix=prefix + [error])
        fq = self._fq()
        fq["program_id"] = self._draft_program_id()
        if not self._fq_fields(node):
            fq.setdefault("website", [])
            return self._fq_leave(node, prefix + [self._fq_text("no_form")] if not form_document(self._fq_program()) else prefix)
        return self._fq_next(node, prefix)

    def expects_file(self) -> bool:
        node = self._node(self.state.get("node") or "")
        if node is None:
            return False
        if node["type"] == "file":
            return True
        if node["type"] == "form_questions":
            field = self._fq_current_field(node)
            return bool(field and field.get("type") in FILE_TYPES)
        return False

    def _fq_current_field(self, node: dict) -> dict | None:
        fq = self._fq()
        key = fq.get("current") or ""
        if not key:
            return None
        for item in self._fq_fields(node):
            if item["field"].get("key") == key:
                return item["field"]
        return None

    def _answer_form_questions(self, node: dict, text: str):
        settings = node.get("settings") or {}
        fq = self.state.get("fq") or {}
        if fq.get("node") != node["key"]:
            return self._enter_form_questions(node, [])
        lowered = " ".join(text.lower().split())
        if fq.get("choices") is not None and not fq.get("program_id") and not fq.get("current"):
            # Choosing the challenge first.
            ids = fq["choices"]
            programs = open_programs()
            titles = [p.title for p in programs] + [self._fq_text("general_idea")]
            index = self._choose(text, len(ids), titles)
            if index is None:
                return self._fq_show_programs(node, [], error=self.default("invalid_choice"))
            self._record_answer(node, text)
            fq.pop("choices", None)
            return self._fq_start_program(node, ids[index - 1], [])
        field = self._fq_current_field(node)
        if field is None:
            return self._fq_next(node, [])
        key = field.get("key") or ""
        values = self._answers()
        required = self._fq_state(field, values)["required"]
        # BACK: the previous question.
        if lowered in self._fq_words(settings, "back_words", DEFAULT_BACK_WORDS) and not self.media:
            history = fq.get("history") or []
            if not history:
                return self._fq_show(node, field, [], required=required, error=self._fq_text("nothing_back"))
            previous = history.pop()
            for index, item in enumerate(self._fq_fields(node)):
                if item["field"].get("key") == previous:
                    fq["pos"], fq["force"] = index, previous
                    break
            self._record_answer(node, text)
            return self._fq_next(node, [])
        if field.get("type") in FILE_TYPES:
            return self._fq_answer_file(node, field, text, required=required)
        # SKIP: only for optional questions.
        if lowered in self._fq_words(settings, "skip_words", DEFAULT_SKIP_WORDS):
            if required:
                return self._fq_show(node, field, [], required=True, error=self._fq_text("required"))
            self._record_answer(node, text)
            return self._fq_advance(node, key)
        value, error = self._fq_parse(field, text)
        if not error:
            error = self._fq_rules(field, value, values)
        if error:
            return self._fq_show(node, field, [], required=required, error=error)
        self._record_answer(node, text)
        if not self._store_answer(key, value, settings.get("title_field") or "title"):
            from apps.channels import actions

            return self._fq_show(node, field, [], required=required, error=pick(actions.SAVE_FAILED, self.lang))
        return self._fq_advance(node, key)

    def _fq_advance(self, node: dict, key: str):
        fq = self._fq()
        history = fq.setdefault("history", [])
        if key and (not history or history[-1] != key):
            history.append(key)
        fq["pos"] = int(fq.get("pos") or 0) + 1
        fq["current"] = ""
        return self._fq_next(node, [])

    def _fq_answer_file(self, node: dict, field: dict, text: str, *, required: bool):
        settings = node.get("settings") or {}
        media_config = field.get("media_config") or {}
        file_settings = {
            "field_key": field.get("key") or "",
            "allowed_types": media_config.get("allowed_types") or [],
            "max_files": int(media_config.get("max_files") or (5 if media_config.get("multiple") else 1)),
            "max_mb": media_config.get("max_mb") or 10,
            "received_text": settings.get("file_received_text") or {"en": "Got it.", "tn": "Re e amogetse."},  # TODO tn-review
            "wrong_type_text": settings.get("file_wrong_type_text") or {"en": "We cannot take that kind of file.", "tn": "Ga re kgone go amogela faele ya mofuta oo."},  # TODO tn-review
            "too_big_text": settings.get("file_too_big_text") or {"en": "That file is too big. Send a smaller one.", "tn": "Faele eo e kgolo thata. Romela e potlana."},  # TODO tn-review
            "failed_text": {"en": "We could not save that file. Please try again.", "tn": "Ga re a kgona go boloka faele eo. Tsweetswee leka gape."},  # TODO tn-review
        }
        fq = self._fq()
        lowered = " ".join(text.lower().split())
        if self.media:
            count, notes = self._receive_files(file_settings, int(fq.get("files") or 0))
            fq["files"] = count
            self.logged_steps.append((node["key"], "form_questions", lowered[:300], len(self.media)))
            self._say("person", f"[{len(self.media)} file(s)]")
            if count >= file_settings["max_files"]:
                return self._fq_advance_with(node, field, notes[-1:])
            return self._fq_show(node, field, [], required=required, error="\n".join(dict.fromkeys(n for n in notes if n)))
        finish = self._fq_words(settings, "done_words", DEFAULT_DONE_WORDS) | self._fq_words(settings, "skip_words", DEFAULT_SKIP_WORDS)
        if lowered in finish:
            if required and not int(fq.get("files") or 0) and not self._answers().get(field.get("key")):
                return self._fq_show(node, field, [], required=True, error=self._fq_text("required"))
            self._record_answer(node, text)
            return self._fq_advance(node, field.get("key") or "")
        return self._fq_show(node, field, [], required=required, error=self._fq_text("file"))

    def _fq_advance_with(self, node: dict, field: dict, notes: list[str]):
        screen = self._fq_advance(node, field.get("key") or "")
        note = "\n".join(n for n in notes if n)
        if note:
            screen.text = f"{note}\n{screen.text}" if screen.text else note
        return screen

    def _fq_parse(self, field: dict, text: str):
        kind = field.get("type")
        text = text.strip()
        if not text:
            return None, self.default("invalid_text")
        if kind in TEXT_TYPES:
            if kind == "email" and not EMAIL_RE.match(text):
                return None, self._fq_text("invalid_email")
            if kind == "url" and not URL_RE.match(text):
                return None, self._fq_text("invalid_url")
            if len(text) > 4000:
                return None, self.default("too_long")
            return text, ""
        if kind == "number":
            try:
                number = float(text.replace(",", "").replace(" ", ""))
            except ValueError:
                return None, self.default("invalid_number")
            return (int(number) if number.is_integer() else number), ""
        if kind == "date":
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y"):
                try:
                    return datetime.strptime(text, fmt).date().isoformat(), ""
                except ValueError:
                    continue
            return None, self.default("invalid_date")
        choices = self._fq_choices(field)
        if kind in YES_NO_TYPES:
            from apps.channels.engine import NO_WORDS, YES_WORDS

            lowered = text.lower()
            yes = lowered in YES_WORDS or lowered == self.default("yes").lower()
            no = lowered in NO_WORDS or lowered == self.default("no").lower()
            if not (yes or no):
                return None, self.default("invalid_choice")
            if kind == "boolean":
                return yes, ""
            return ("yes" if yes else "no"), ""
        if kind in SINGLE_CHOICE_TYPES:
            index = self._choose(text, len(choices), [c.title for c in choices])
            if index is None:
                return None, self.default("invalid_choice")
            return self._fq_value(field, index), ""
        if kind in MULTI_TYPES:
            picked = []
            for part in re.split(r"[,\s;]+", text):
                if not part:
                    continue
                index = self._choose(part, len(choices), [c.title for c in choices])
                if index is None:
                    return None, self.default("invalid_choice")
                value = self._fq_value(field, index)
                if value not in picked:
                    picked.append(value)
            if not picked:
                return None, self.default("invalid_choice")
            return picked, ""
        return text, ""

    def _fq_value(self, field: dict, index: int):
        if field.get("type") == "district":
            from apps.reference.models import District

            district = list(District.objects.filter(active=True).order_by("name")[:40])[index - 1]
            return district.slug or str(district.id)
        options = field.get("options") or []
        option = options[index - 1]
        return option.get("value") or option.get("label")

    def _fq_rules(self, field: dict, value, values: dict) -> str:
        """The form's own checks for this answer (length, range, pattern, Omang, options)."""
        from apps.submissions.draft_services import ApplicationDraftService

        program = self._fq_program()
        if getattr(self, "_fq_models", None) is None:
            self._fq_models = model_fields(program)
        model = self._fq_models.get(field.get("key") or "")
        if model is None:
            return ""
        try:
            problems = ApplicationDraftService.field_errors(model, {**values, model.key: value})
        except Exception:
            logger.exception("Form check failed for a WhatsApp answer")
            return ""
        return problems[0] if problems else ""

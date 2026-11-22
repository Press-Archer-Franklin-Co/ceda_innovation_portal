"""What the journey builders draw for each step type.

``GET /api/channels/node-types/`` returns these with the type list, so the USSD and
WhatsApp builders build the edit panel, the ports (the places an arrow can start) and the
defaults of a new step from the API. A new step type only needs an entry here (and its
engine handler); the screens show it without a rewrite.

Each type has:
- ``text``: the label of its main text box (English and Setswana), or None when it has none.
- ``next``: True when it has a "Then go to" port. ``ends_when`` names a boolean setting
  that removes that port (a message that ends the session).
- ``fields``: its settings. ``kind`` is one of:
  text, number, boolean, select (``choices``), multi (``choices``), bilingual (English and
  Setswana), node (a port: another step's key), variable (a new answer name),
  variable_ref (an existing answer name), options (menu options: label and a port each),
  choices (answer choices: label only), mapping (form field to answer name), program
  (a published challenge, or none for general ideas).
  ``show_if`` hides a field unless another field has one of the listed values.

Setswana labels are a first draft (TODO tn-review).
"""

from __future__ import annotations

from apps.channels.actions import LOOKUPS


def _f(name, kind, label, label_tn, **extra):
    return {"name": name, "kind": kind, "label": label, "label_tn": label_tn, **extra}


def _choices(pairs):
    return [{"value": value, "label": label, "label_tn": label_tn} for value, label, label_tn in pairs]


ANSWER_TYPES = _choices(
    [
        ("text", "Text", "Mafoko"),
        ("number", "Number", "Nomoro"),
        ("date", "Date", "Letlha"),
        ("yes_no", "Yes or no", "Ee kgotsa nnyaa"),
        ("choice", "One of a list", "Nngwe ya lenane"),
    ]
)
LOOKUP_CHOICES = _choices(
    [
        ("open_challenges", "Open challenges", "Dikgaisano tse di butsweng"),
        ("idea_status", "My idea's status", "Seemo sa kakanyo ya me"),
        ("upcoming_events", "Upcoming events", "Ditiragalo tse di tlang"),
        ("faq", "An FAQ answer", "Karabo ya FAQ"),
    ]
)
assert {c["value"] for c in LOOKUP_CHOICES} == {k for k, _ in LOOKUPS}
OPERATORS = _choices(
    [
        ("equals", "equal to", "e lekana le"),
        ("not_equals", "not equal to", "e sa lekane le"),
        ("is_set", "given", "e neilwe"),
        ("not_set", "not given", "ga e a newa"),
        ("contains", "containing", "e na le"),
        ("gt", "more than", "go feta"),
        ("lt", "less than", "ka fa tlase ga"),
    ]
)
TOPICS = _choices(
    [
        ("challenges", "New challenges", "Dikgaisano tse dintšhwa"),
        ("news", "News", "Dikgang"),
        ("events", "Events", "Ditiragalo"),
        ("results", "Results", "Dipoelo"),
    ]
)

def _file_types():
    from apps.documents.serializers import _ALLOWED_EXTENSIONS

    return _choices([(ext.lstrip("."), ext.lstrip(".").upper(), ext.lstrip(".").upper()) for ext in sorted(_ALLOWED_EXTENSIONS)])


FILE_TYPES = _file_types()

TEXT = {"label": "Text", "label_tn": "Mafoko"}

NODE_SETTINGS: dict[str, dict] = {
    "menu": {
        "text": TEXT,
        "next": False,
        "fields": [
            _f("options", "options", "Options", "Dikgetho", max_ussd=8, max_whatsapp=10, default=[{"label": {"en": "", "tn": ""}, "next": ""}]),
            _f("variable", "variable", "Save the choice as", "Boloka kgetho jaaka", optional=True),
        ],
    },
    "message": {
        "text": TEXT,
        "next": True,
        "ends_when": "end",
        "fields": [_f("end", "boolean", "End the session after this message", "Fetsa kgaolo morago ga molaetsa o", default=False)],
    },
    "question": {
        "text": {"label": "Question", "label_tn": "Potso"},
        "next": True,
        "fields": [
            _f("answer_type", "select", "Answer type", "Mofuta wa karabo", choices=ANSWER_TYPES, default="text"),
            _f("variable", "variable", "Save the answer as", "Boloka karabo jaaka"),
            _f("max_length", "number", "Longest answer (characters)", "Karabo e telele go gaisa (ditlhaka)", default=160, show_if={"field": "answer_type", "in": ["text"]}),
            _f("min", "number", "Lowest", "Bonnye", optional=True, show_if={"field": "answer_type", "in": ["number"]}),
            _f("max", "number", "Highest", "Bogolo", optional=True, show_if={"field": "answer_type", "in": ["number"]}),
            _f("choices", "choices", "Choices", "Dikgetho", max_ussd=8, max_whatsapp=10, show_if={"field": "answer_type", "in": ["choice"]}),
            _f("error_text", "bilingual", "Message when the answer is not right", "Molaetsa fa karabo e sa siama", optional=True),
            _f("sensitive", "boolean", "Sensitive answer (not written to the session log)", "Karabo e e botlhokwa (ga e kwalwe mo rekotong)", default=False),
        ],
    },
    "save_draft": {
        "text": {"label": "Message when it is saved", "label_tn": "Molaetsa fa e bolokilwe"},
        "next": True,
        "fields": [
            _f("program_id", "program", "Challenge", "Kgaisano", default=None),
            _f("title_variable", "variable_ref", "Idea title comes from", "Setlhogo sa kakanyo se tswa mo", default="title"),
            _f("name_variable", "variable_ref", "Person's name comes from", "Leina la motho le tswa mo", optional=True, default="name"),
            _f("fields", "mapping", "Answers saved into the idea form", "Dikarabo tse di bolokwang mo foromong", default={}),
            _f("create_account", "boolean", "Make an account for new numbers", "Dira akhaonto ya dinomoro tse dintšhwa", default=True),
            _f("error_next", "node", "If saving fails, go to", "Fa go boloka go palelwa, ya kwa", optional=True),
        ],
    },
    "lookup": {
        "text": {"label": "Heading above the result", "label_tn": "Setlhogo fa godimo ga dipoelo"},
        "next": True,
        "fields": [
            _f("lookup", "select", "Look up", "Batla", choices=LOOKUP_CHOICES, default="open_challenges"),
            _f("input_variable", "variable_ref", "Using the answer", "Ka go dirisa karabo", optional=True, show_if={"field": "lookup", "in": ["idea_status", "faq"]}),
            _f("save_as", "variable", "Save the result as", "Boloka dipoelo jaaka", optional=True),
        ],
    },
    "condition": {
        "text": None,
        "next": False,
        "fields": [
            _f("check", "select", "Check", "Tlhola", choices=_choices([("registered", "The number belongs to a registered person", "Nomoro ke ya motho yo o kwadisitsweng"), ("variable", "An answer", "Karabo")]), default="registered"),
            _f("variable", "variable_ref", "Answer", "Karabo", show_if={"field": "check", "in": ["variable"]}),
            _f("operator", "select", "Is", "Ke", choices=OPERATORS, default="equals", show_if={"field": "check", "in": ["variable"]}),
            _f("value", "text", "Value", "Boleng", optional=True, show_if={"field": "check", "in": ["variable"]}),
            _f("true_next", "node", "Yes goes to", "Ee e ya kwa"),
            _f("false_next", "node", "No goes to", "Nnyaa e ya kwa"),
        ],
    },
    "subscribe": {
        "text": {"label": "Message when it is done", "label_tn": "Molaetsa fa go fedile"},
        "next": True,
        "fields": [_f("topics", "multi", "Updates about", "Dikitsiso ka ga", choices=TOPICS, default=["challenges"])],
    },
    "language": {"text": {"label": "Question", "label_tn": "Potso"}, "next": True, "fields": []},
    "handoff": {
        "text": {"label": "What we ask first (USSD only)", "label_tn": "Se re se botsang pele (USSD fela)"},
        "next": False,
        "fields": [
            _f("subject", "bilingual", "Subject in the Inbox", "Setlhogo mo Inbox", optional=True),
            _f("done_text", "bilingual", "Message after the hand-over", "Molaetsa morago ga go fetisetsa", optional=True),
        ],
    },
    "end": {"text": TEXT, "next": False, "fields": []},
    # Prompt 10: files people send (WhatsApp) and sending the idea.
    "file": {
        "text": {"label": "What we ask for", "label_tn": "Se re se kopang"},
        "next": True,
        "fields": [
            _f("field_key", "text", "Form field the file belongs to", "Lefelo la foromo le faele e leng ya lone", default="attachments"),
            _f("allowed_types", "multi", "File types we accept", "Mefuta ya difaele e re e amogelang", choices=FILE_TYPES, default=[c["value"] for c in FILE_TYPES]),
            _f("max_files", "number", "Most files", "Difaele tse dintsi", default=3),
            _f("max_mb", "number", "Largest file (MB)", "Faele e kgolo go gaisa (MB)", default=10),
            _f("required", "boolean", "A file is needed to go on", "Faele e a tlhokega go tswelela", default=False),
            _f("skip_words", "bilingual", "Words that skip this step (comma between them)", "Mafoko a a tlolang kgato e", default={"en": "skip", "tn": "tlola"}),
            _f("done_words", "bilingual", "Words that finish sending files", "Mafoko a a fetsang go romela difaele", default={"en": "done", "tn": "fedile"}),
            _f("received_text", "bilingual", "Reply when a file arrives", "Karabo fa faele e goroga", default={"en": "Got it. Send another, or reply DONE.", "tn": "Re e amogetse. Romela e nngwe, kgotsa araba FEDILE."}),
            _f("wrong_type_text", "bilingual", "Reply for a file type we do not accept", "Karabo ya mofuta wa faele o re sa o amogeleng", default={"en": "We cannot take that kind of file. Send a photo, PDF or Office document.", "tn": "Ga re kgone go amogela faele ya mofuta oo. Romela setshwantsho, PDF kgotsa tokomane ya Office."}),
            _f("too_big_text", "bilingual", "Reply for a file that is too big", "Karabo ya faele e kgolo thata", default={"en": "That file is too big. Send a smaller one.", "tn": "Faele eo e kgolo thata. Romela e potlana."}),
            _f("needed_text", "bilingual", "Reply when a file is needed", "Karabo fa faele e tlhokega", default={"en": "Please send a file to go on.", "tn": "Tsweetswee romela faele go tswelela."}),
            _f("failed_text", "bilingual", "Reply when the file could not be saved", "Karabo fa faele e sa kgona go bolokwa", default={"en": "We could not save that file. Please try again.", "tn": "Ga re a kgona go boloka faele eo. Tsweetswee leka gape."}),
        ],
    },
    "submit": {
        "text": None,
        "next": False,
        "fields": [
            _f("require_consent", "boolean", "Ask the person to agree first", "Kopa motho go dumela pele", default=True),
            _f("consent_text", "bilingual", "Question asking them to agree", "Potso e e ba kopang go dumela", default={"en": "Reply YES to agree to the CEDA terms and send your idea.", "tn": "Araba EE go dumela melawana ya CEDA le go romela kakanyo ya gago."}),
            _f("name_variable", "variable_ref", "Person's name comes from", "Leina la motho le tswa mo", optional=True, default="name"),
            _f("success_text", "bilingual", "Message when it is sent", "Molaetsa fa e rometswe", default={"en": "Your idea is sent. Your idea number is {reference}.", "tn": "Kakanyo ya gago e rometswe. Nomoro ya kakanyo ya gago ke {reference}."}),
            _f("declined_text", "bilingual", "Message when they do not agree", "Molaetsa fa ba sa dumele", default={"en": "Your idea is saved but not sent. You can send it later on the CEDA website.", "tn": "Kakanyo ya gago e bolokilwe mme ga e a romelwa. O ka e romela moragonyana mo webosaeteng ya CEDA."}),
            _f("closed_text", "bilingual", "Message when the challenge is not taking ideas", "Molaetsa fa kgaisano e sa amogele dikakanyo", default={"en": "This challenge is not taking ideas right now. Your idea is saved.", "tn": "Kgaisano e ga e amogele dikakanyo jaanong. Kakanyo ya gago e bolokilwe."}),
            _f("error_text", "bilingual", "Message when it cannot be sent", "Molaetsa fa e sa kgone go romelwa", default={"en": "We could not send your idea right now. It is saved; please try again later.", "tn": "Ga re a kgona go romela kakanyo ya gago jaanong. E bolokilwe; tsweetswee leka gape moragonyana."}),
            _f("success_next", "node", "When it is sent, go to", "Fa e rometswe, ya kwa", optional=True),
            _f("error_next", "node", "If it cannot be sent, go to", "Fa e sa kgone go romelwa, ya kwa", optional=True),
        ],
    },
}

DESCRIPTIONS_TN = {
    "file": "E kopa setshwantsho kgotsa tokomane mme e e boloka mo kakanyong.",
    "submit": "E romela kakanyo kwa CEDA mme e neela nomoro ya kakanyo.",
    "menu": "Dikgetho tse di nang le dinomoro mo USSD; dikonopo (go fitlha go 3) kgotsa lenane (go fitlha go 10) mo WhatsApp.",
    "message": "E bontsha mafoko, e bo e tswelela kgotsa e fetsa.",
    "question": "E botsa karabo, e e tlhole e bo e e boloke.",
    "save_draft": "E boloka dikarabo mo kakanyong e motho a ka e fetsang mo webosaeteng.",
    "lookup": "Dikgaisano tse di butsweng, seemo sa kakanyo, ditiragalo kgotsa karabo ya FAQ.",
    "condition": "E ya tsela e le nngwe kgotsa e nngwe go ya ka karabo, kgotsa fa nomoro e kwadisitswe.",
    "subscribe": "E kwadisa nomoro go amogela dikitsiso.",
    "language": "Sekgoa kgotsa Setswana go fitlha bokhutlong.",
    "handoff": "WhatsApp: puisano e ya kwa Inbox ya badiri. USSD: e kopa go leletswa.",
    "end": "E a laela e bo e fetsa.",
}


def defaults_for(node_type: str) -> dict:
    """Settings a new step of this type starts with."""
    spec = NODE_SETTINGS.get(node_type) or {}
    return {f["name"]: f["default"] for f in spec.get("fields", []) if "default" in f}

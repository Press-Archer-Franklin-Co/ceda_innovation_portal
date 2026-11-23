"""Upgrade the example WhatsApp journey so a whole idea is done in WhatsApp.

Used by ``manage.py upgrade_example_whatsapp_journey``. The journey becomes:

    Main menu > Submit an idea > idea name > (your name, if the number is new) > Ask the form's questions
    (pick a challenge or General idea, then the form) > Photo or document > Send the idea > done
    Main menu > Check my idea > Show my ideas (Continue this idea goes back into the form)

It publishes a new version and keeps the old ones, so ``--undo`` (or staff, by copying the
steps back) can return to the version before. Running it twice changes nothing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction

from apps.channels.models import Journey, JourneyNode, JourneyVersion

EXAMPLE_NAME = "CEDA Innovation (WhatsApp)"
MARK = "upgrade_example_whatsapp_journey"
REMOVED_KEYS = ("idea_problem", "idea_solution", "save", "check_ref", "status", "status_done")

# TODO tn-review: every Setswana text below.
STEPS = {
    "idea_form": {
        "type": "form_questions", "title": "Idea questions", "position": {"x": 1380, "y": 20},
        "text": {
            "en": "Let's write your idea. Reply BACK to go to the previous question.",
            "tn": "A re kwaleng kakanyo ya gago. Araba MORAGO go boela kwa potsong e e fetileng.",
        },
        "settings": {
            "program_source": "ask", "program_id": None, "program_variable": "",
            "program_text": {"en": "Which challenge is your idea for?", "tn": "Kakanyo ya gago ke ya kgaisano efe?"},
            "ask": "required", "sections": "", "title_field": "title", "name_variable": "name", "create_account": True,
            "back_words": {"en": "back", "tn": "morago"}, "skip_words": {"en": "skip", "tn": "tlola"}, "done_words": {"en": "done", "tn": "fedile"},
            "done_text": {"en": "Thank you, that is all the questions.", "tn": "Re a leboga, ke dipotso tsotlhe tseo."},
            "website_text": {"en": "Finish these on the website: {fields}. {link}", "tn": "Fetsa tse mo webosaeteng: {fields}. {link}"},
            "error_next": "",
        },
        "next": "idea_file",
    },
    "idea_file": {
        "type": "file", "title": "Photo or document", "position": {"x": 1640, "y": 20},
        "text": {
            "en": "Send a photo or document of your idea, or reply SKIP.",
            "tn": "Romela setshwantsho kgotsa tokomane ya kakanyo ya gago, kgotsa araba TLOLA.",
        },
        "settings": {
            "field_key": "attachments",
            "allowed_types": ["csv", "doc", "docx", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "txt", "xls", "xlsx", "zip"],
            "max_files": 3, "max_mb": 10, "required": False,
            "skip_words": {"en": "skip", "tn": "tlola"}, "done_words": {"en": "done", "tn": "fedile"},
            "received_text": {"en": "Got it. Send another, or reply DONE.", "tn": "Re e amogetse. Romela e nngwe, kgotsa araba FEDILE."},
            "wrong_type_text": {"en": "We cannot take that kind of file. Send a photo, PDF or Office document.", "tn": "Ga re kgone go amogela faele ya mofuta oo. Romela setshwantsho, PDF kgotsa tokomane ya Office."},
            "too_big_text": {"en": "That file is too big. Send a smaller one.", "tn": "Faele eo e kgolo thata. Romela e potlana."},
            "needed_text": {"en": "Send a photo or document, or reply SKIP.", "tn": "Romela setshwantsho kgotsa tokomane, kgotsa araba TLOLA."},
            "failed_text": {"en": "We could not save that file. Please try again.", "tn": "Ga re a kgona go boloka faele eo. Tsweetswee leka gape."},
        },
        "next": "idea_send",
    },
    "idea_send": {
        "type": "submit", "title": "Send the idea", "position": {"x": 1900, "y": 20},
        "text": {},
        "settings": {
            "require_consent": True,
            "consent_text": {"en": "Reply YES to agree to the CEDA terms and send your idea.", "tn": "Araba EE go dumela melawana ya CEDA le go romela kakanyo ya gago."},
            "name_variable": "name",
            "success_text": {"en": "Your idea is sent. Your idea number is {reference}.", "tn": "Kakanyo ya gago e rometswe. Nomoro ya kakanyo ya gago ke {reference}."},
            "declined_text": {"en": "Your idea is saved but not sent. Choose Check my idea to send it later.", "tn": "Kakanyo ya gago e bolokilwe mme ga e a romelwa. Tlhopha Tlhola kakanyo ya me go e romela moragonyana."},
            "closed_text": {"en": "This challenge is not taking ideas right now. Your idea is saved.", "tn": "Kgaisano e ga e amogele dikakanyo jaanong. Kakanyo ya gago e bolokilwe."},
            "error_text": {"en": "We could not send your idea right now. It is saved; please try again later.", "tn": "Ga re a kgona go romela kakanyo ya gago jaanong. E bolokilwe; tsweetswee leka gape moragonyana."},
            "success_next": "idea_done", "error_next": "",
        },
        "next": "",
    },
    "idea_done": {
        "type": "end", "title": "Idea sent", "position": {"x": 2160, "y": 20},
        "text": {"en": "Thank you. Choose Check my idea any time to see how it is going.", "tn": "Re a leboga. Tlhopha Tlhola kakanyo ya me nako nngwe le nngwe go bona gore e tsamaya jang."},
        "settings": {}, "next": "",
    },
    "my_ideas": {
        "type": "my_ideas", "title": "My ideas", "position": {"x": 340, "y": 200},
        "text": {},
        "settings": {
            "open_text": {"en": "Your open ideas:", "tn": "Dikakanyo tsa gago tse di buleditsweng:"},
            "recent_text": {"en": "Your recent ideas:", "tn": "Dikakanyo tsa gago tsa bosheng:"},
            "empty_text": {"en": "You have no ideas with us yet. Choose Submit an idea to send one.", "tn": "Ga o ise o nne le dikakanyo le rona. Tlhopha Romela kakanyo go romela nngwe."},
            "continue_next": "idea_form",
        },
        "next": "",
    },
    "challenges_done": {
        "type": "end", "title": "Challenges shown", "position": {"x": 600, "y": 380},
        "text": {"en": "To enter one, reply MENU and choose Submit an idea.", "tn": "Go tsenela nngwe, araba MENU o bo o tlhopha Romela kakanyo."},
        "settings": {}, "next": "",
    },
}
WIRING = {  # (node key, what changes)
    "idea_title": {"next": "known"},
    "known": {"settings": {"true_next": "idea_form", "false_next": "ask_name"}},
    "ask_name": {"next": "idea_form"},
}
MENU_TARGETS = {"submit an idea": "idea_title", "check my idea": "my_ideas"}


@dataclass
class Result:
    journey: Journey
    changed: bool
    version: int = 0
    lines: list[str] = field(default_factory=list)


def target_journeys() -> list[Journey]:
    """The journeys live WhatsApp connections run; the example by name when none is live."""
    from apps.channels.models import ChannelConnection

    ids = list(
        ChannelConnection.objects.filter(connection__kind="whatsapp", connection__is_active=True, journey__isnull=False)
        .values_list("journey_id", flat=True).distinct()
    )
    journeys = list(Journey.objects.filter(id__in=ids)) if ids else []
    if not journeys:
        journeys = list(Journey.objects.filter(name=EXAMPLE_NAME))
    return journeys


def is_upgraded(journey: Journey) -> bool:
    version = journey.latest_version
    return bool(version and (version.graph or {}).get("upgraded_by") == MARK)


def _set_node(journey: Journey, key: str, spec: dict, lines: list[str]) -> None:
    node = JourneyNode.objects.filter(journey=journey, key=key).first()
    values = {k: spec[k] for k in ("type", "title", "text", "settings", "position")}
    values["next_key"] = spec["next"]
    if node is None:
        JourneyNode.objects.create(journey=journey, key=key, **values)
        lines.append(f"added step {key} ({spec['type']}: {spec['title']})")
        return
    changed = [name for name, value in values.items() if getattr(node, name) != value and name != "position"]
    if changed:
        for name, value in values.items():
            setattr(node, name, value)
        node.save()
        lines.append(f"updated step {key} ({', '.join(changed)})")


@transaction.atomic
def upgrade(journey: Journey, *, actor=None) -> Result:
    from apps.channels.services import JourneyService

    journey = Journey.objects.select_for_update().get(pk=journey.pk)
    result = Result(journey=journey, changed=False, version=journey.version)
    if is_upgraded(journey) and not journey.has_unpublished_changes:
        result.lines.append("already up to date: nothing changed")
        return result
    if journey.has_unpublished_changes:
        raise ValueError(f"{journey.name} has unpublished changes in the builder. Publish or discard them first.")
    if not journey.runs_on("whatsapp"):
        raise ValueError(f"{journey.name} is not a WhatsApp journey.")
    main = JourneyNode.objects.filter(journey=journey, key=journey.start_key or "main", type="menu").first()
    if main is None:
        raise ValueError(f"{journey.name} does not start with a menu, so it is not the example journey. Nothing changed.")
    lines = result.lines
    before = journey.version
    for key, spec in STEPS.items():
        _set_node(journey, key, spec, lines)
    for key, change in WIRING.items():
        node = JourneyNode.objects.filter(journey=journey, key=key).first()
        if node is None:
            continue
        if "next" in change and node.next_key != change["next"]:
            node.next_key = change["next"]
            node.save(update_fields=["next_key", "updated_at"])
            lines.append(f"{key} now goes to {change['next']}")
        if "settings" in change:
            merged = {**(node.settings or {}), **change["settings"]}
            if merged != node.settings:
                node.settings = merged
                node.save(update_fields=["settings", "updated_at"])
                lines.append(f"{key} now goes to {change['settings']}")
    options = list(main.settings.get("options") or [])
    for option in options:
        label = ((option.get("label") or {}).get("en") or "").strip().lower()
        target = MENU_TARGETS.get(label)
        if target and option.get("next") != target:
            lines.append(f"menu option '{option['label']['en']}' now goes to {target} (was {option.get('next') or 'nothing'})")
            option["next"] = target
    main.settings = {**main.settings, "options": options}
    main.save(update_fields=["settings", "updated_at"])
    for key in REMOVED_KEYS:
        deleted, _ = JourneyNode.objects.filter(journey=journey, key=key).delete()
        if deleted:
            lines.append(f"removed step {key} (kept in version {before})")
    journey.has_unpublished_changes = True
    journey.save(update_fields=["has_unpublished_changes", "updated_at"])
    version = JourneyService.publish(journey=journey, actor=actor)
    version.graph = {**version.graph, "upgraded_by": MARK, "upgraded_from": before}
    version.save(update_fields=["graph", "updated_at"])
    result.changed, result.version = True, version.number
    lines.append(f"published version {version.number}; version {before} is kept")
    return result


@transaction.atomic
def undo(journey: Journey, *, actor=None) -> Result:
    """Put back the version before the upgrade, as a new published version."""
    from apps.channels.services import JourneyService

    journey = Journey.objects.select_for_update().get(pk=journey.pk)
    result = Result(journey=journey, changed=False, version=journey.version)
    latest = journey.latest_version
    if not (latest and (latest.graph or {}).get("upgraded_by") == MARK):
        result.lines.append("not upgraded (or changed since): nothing to undo")
        return result
    previous = JourneyVersion.objects.filter(journey=journey, number=(latest.graph or {}).get("upgraded_from")).first()
    if previous is None:
        result.lines.append("the version before the upgrade is gone: nothing to undo")
        return result
    graph = previous.graph or {}
    JourneyNode.objects.filter(journey=journey).delete()
    for key, node in (graph.get("nodes") or {}).items():
        JourneyNode.objects.create(
            journey=journey, key=key, type=node.get("type") or "message", title=node.get("title") or "", text=node.get("text") or {},
            settings=node.get("settings") or {}, next_key=node.get("next") or "", position=node.get("position") or {},
        )
    journey.start_key = graph.get("start") or journey.start_key
    journey.has_unpublished_changes = True
    journey.save(update_fields=["start_key", "has_unpublished_changes", "updated_at"])
    version = JourneyService.publish(journey=journey, actor=actor)
    result.changed, result.version = True, version.number
    result.lines.append(f"put back the steps of version {previous.number} as version {version.number}")
    return result

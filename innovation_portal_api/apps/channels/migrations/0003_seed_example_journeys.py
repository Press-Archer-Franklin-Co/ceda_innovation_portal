"""C2: one example journey per channel, published, so the demo works in the simulator with
no provider. "CEDA Innovation: 1 Submit an idea, 2 Check my idea, 3 Open challenges,
4 Talk to us", in English and Setswana.

The steps are copied here on purpose so later code changes do not rewrite history.
Reversible: the reverse deletes only the journeys made here (by name), if nobody changed
them after the seed.
"""

from django.db import migrations

# TODO tn-review: Setswana below needs checking by a Setswana speaker.
STEPS = [
    {
        "key": "main", "type": "menu", "title": "Main menu", "position": {"x": 40, "y": 220},
        "text": {"en": "CEDA Innovation", "tn": "CEDA Innovation"},
        "settings": {"options": [
            {"label": {"en": "Submit an idea", "tn": "Romela kakanyo"}, "next": "idea_title"},
            {"label": {"en": "Check my idea", "tn": "Tlhola kakanyo ya me"}, "next": "check_ref"},
            {"label": {"en": "Open challenges", "tn": "Dikgaisano tse di butsweng"}, "next": "challenges"},
            {"label": {"en": "Talk to us", "tn": "Bua le rona"}, "next": "talk"},
        ]},
        "next": "",
    },
    {
        "key": "idea_title", "type": "question", "title": "Idea name", "position": {"x": 340, "y": 20},
        "text": {"en": "What is your idea called?", "tn": "Kakanyo ya gago e bidiwa eng?"},
        "settings": {"answer_type": "text", "variable": "title", "max_length": 100},
        "next": "idea_problem",
    },
    {
        "key": "idea_problem", "type": "question", "title": "Problem", "position": {"x": 600, "y": 20},
        "text": {"en": "What problem does your idea solve?", "tn": "Kakanyo ya gago e rarabolola bothata bofe?"},
        "settings": {"answer_type": "text", "variable": "problem", "max_length": 160},
        "next": "idea_solution",
    },
    {
        "key": "idea_solution", "type": "question", "title": "Solution", "position": {"x": 860, "y": 20},
        "text": {"en": "How does your idea solve it?", "tn": "Kakanyo ya gago e o rarabolola jang?"},
        "settings": {"answer_type": "text", "variable": "solution", "max_length": 160},
        "next": "known",
    },
    {
        "key": "known", "type": "condition", "title": "Registered?", "position": {"x": 1120, "y": 20},
        "text": {},
        "settings": {"check": "registered", "true_next": "save", "false_next": "ask_name"},
        "next": "",
    },
    {
        "key": "ask_name", "type": "question", "title": "Name", "position": {"x": 1120, "y": 180},
        "text": {"en": "What is your name?", "tn": "Leina la gago ke mang?"},
        "settings": {"answer_type": "text", "variable": "name", "max_length": 80},
        "next": "save",
    },
    {
        "key": "save", "type": "save_draft", "title": "Save idea", "position": {"x": 1380, "y": 20},
        "text": {
            "en": "Saved as {draft_reference}. Sign in on the CEDA website with this phone number to finish and send it.",
            "tn": "E bolokilwe jaaka {draft_reference}. Tsena mo webosaeteng ya CEDA ka nomoro e go e fetsa le go e romela.",
        },
        "settings": {"program_id": None, "title_variable": "title", "name_variable": "name", "fields": {"problem": "problem", "solution": "solution"}, "create_account": True},
        "next": "idea_done",
    },
    {
        "key": "idea_done", "type": "end", "title": "Idea saved", "position": {"x": 1640, "y": 20},
        "text": {"en": "Thank you.", "tn": "Re a leboga."},
        "settings": {}, "next": "",
    },
    {
        "key": "check_ref", "type": "question", "title": "Idea number", "position": {"x": 340, "y": 200},
        "text": {"en": "Enter your idea number, or 0 for your latest idea.", "tn": "Tsenya nomoro ya kakanyo ya gago, kgotsa 0 go bona ya bofelo."},
        "settings": {"answer_type": "text", "variable": "reference", "max_length": 40},
        "next": "status",
    },
    {
        "key": "status", "type": "lookup", "title": "Idea status", "position": {"x": 600, "y": 200},
        "text": {}, "settings": {"lookup": "idea_status", "input_variable": "reference"},
        "next": "status_done",
    },
    {
        "key": "status_done", "type": "end", "title": "Status shown", "position": {"x": 860, "y": 200},
        "text": {"en": "Thank you for checking.", "tn": "Re a leboga go tlhola."},
        "settings": {}, "next": "",
    },
    {
        "key": "challenges", "type": "lookup", "title": "Open challenges", "position": {"x": 340, "y": 380},
        "text": {"en": "Open challenges:", "tn": "Dikgaisano tse di butsweng:"},
        "settings": {"lookup": "open_challenges"},
        "next": "challenges_done",
    },
    {
        "key": "challenges_done", "type": "end", "title": "Challenges shown", "position": {"x": 600, "y": 380},
        "text": {"en": "Enter on the CEDA website.", "tn": "Tsenela mo webosaeteng ya CEDA."},
        "settings": {}, "next": "",
    },
    {
        "key": "talk", "type": "handoff", "title": "Talk to us", "position": {"x": 340, "y": 540},
        "text": {"en": "Tell us in a few words what you need.", "tn": "Re bolelele ka mafoko a mmalwa se o se tlhokang."},
        "settings": {},  # the subject is filled in per channel below
        "next": "",
    },
]

JOURNEYS = [
    ("CEDA Innovation (USSD)", "ussd", "USSD"),
    ("CEDA Innovation (WhatsApp)", "whatsapp", "WhatsApp"),
]


def _graph(channel_name):
    nodes = {}
    for step in STEPS:
        node = {k: step[k] for k in ("key", "type", "title", "text", "settings", "next")}
        if node["type"] == "handoff":
            node["settings"] = {"subject": {"en": f"Help request from {channel_name}", "tn": f"Kopo ya thuso go tswa {channel_name}"}}
        nodes[step["key"]] = node
    return nodes


def seed(apps, schema_editor):
    Journey = apps.get_model("channels", "Journey")
    JourneyNode = apps.get_model("channels", "JourneyNode")
    JourneyVersion = apps.get_model("channels", "JourneyVersion")
    from django.utils import timezone

    for name, channel, channel_name in JOURNEYS:
        if Journey.objects.filter(name=name).exists():
            continue
        nodes = _graph(channel_name)
        journey = Journey.objects.create(
            name=name,
            description="Example journey. Change it in the builder, then publish.",
            channel=channel,
            status="published",
            version=1,
            default_language="en",
            start_key="main",
            has_unpublished_changes=False,
            published_at=timezone.now(),
        )
        for step in STEPS:
            node = nodes[step["key"]]
            JourneyNode.objects.create(
                journey=journey, key=node["key"], type=node["type"], title=node["title"], text=node["text"],
                settings=node["settings"], next_key=node["next"], position=step["position"],
            )
        JourneyVersion.objects.create(
            journey=journey,
            number=1,
            graph={"start": "main", "default_language": "en", "channel": channel, "nodes": nodes},
            warnings=[],
        )


def unseed(apps, schema_editor):
    Journey = apps.get_model("channels", "Journey")
    Journey.objects.filter(name__in=[name for name, _, _ in JOURNEYS], version=1, has_unpublished_changes=False).delete()


class Migration(migrations.Migration):
    dependencies = [("channels", "0002_channels_capability_and_switches")]

    operations = [migrations.RunPython(seed, unseed)]

"""C2 prompt 10: the example WhatsApp journey asks for an optional file and sends the idea.

After "Save idea" it now asks for a photo or document (reply SKIP to go on), then sends the idea
and gives the idea number. Applied only when staff have not changed the example (still version 1,
no unpublished changes, the seeded steps). Publishes version 2. Reversible: the reverse removes
version 2 and the two steps and puts the "Save idea" step back as it was.
"""

from django.db import migrations
from django.utils import timezone

NAME = "CEDA Innovation (WhatsApp)"
SEEDED_KEYS = {
    "main", "idea_title", "idea_problem", "idea_solution", "known", "ask_name", "save", "idea_done",
    "check_ref", "status", "status_done", "challenges", "challenges_done", "talk",
}
MARK = "0005_whatsapp_example_files_and_send"

# TODO tn-review: Setswana below.
OLD_SAVE_TEXT = {
    "en": "Saved as {draft_reference}. Sign in on the CEDA website with this phone number to finish and send it.",
    "tn": "E bolokilwe jaaka {draft_reference}. Tsena mo webosaeteng ya CEDA ka nomoro e go e fetsa le go e romela.",
}
NEW_SAVE_TEXT = {"en": "Saved as {draft_reference}.", "tn": "E bolokilwe jaaka {draft_reference}."}
FILE_STEP = {
    "key": "idea_file", "type": "file", "title": "Photo or document",
    "text": {
        "en": "Send a photo or document of your idea, or reply SKIP.",
        "tn": "Romela setshwantsho kgotsa tokomane ya kakanyo ya gago, kgotsa araba TLOLA.",
    },
    "settings": {
        "field_key": "attachments",
        "allowed_types": ["csv", "doc", "docx", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "txt", "xls", "xlsx", "zip"],
        "max_files": 3,
        "max_mb": 10,
        "required": False,
        "skip_words": {"en": "skip", "tn": "tlola"},
        "done_words": {"en": "done", "tn": "fedile"},
        "received_text": {"en": "Got it. Send another, or reply DONE.", "tn": "Re e amogetse. Romela e nngwe, kgotsa araba FEDILE."},
        "wrong_type_text": {"en": "We cannot take that kind of file. Send a photo, PDF or Office document.", "tn": "Ga re kgone go amogela faele ya mofuta oo. Romela setshwantsho, PDF kgotsa tokomane ya Office."},
        "too_big_text": {"en": "That file is too big. Send a smaller one.", "tn": "Faele eo e kgolo thata. Romela e potlana."},
        "needed_text": {"en": "Send a photo or document, or reply SKIP.", "tn": "Romela setshwantsho kgotsa tokomane, kgotsa araba TLOLA."},
        "failed_text": {"en": "We could not save that file. Please try again.", "tn": "Ga re a kgona go boloka faele eo. Tsweetswee leka gape."},
    },
    "next": "idea_send",
    "position": {},
}
SEND_STEP = {
    "key": "idea_send", "type": "submit", "title": "Send the idea",
    "text": {},
    "settings": {
        "require_consent": True,
        "consent_text": {"en": "Reply YES to agree to the CEDA terms and send your idea.", "tn": "Araba EE go dumela melawana ya CEDA le go romela kakanyo ya gago."},
        "name_variable": "name",
        "success_text": {"en": "Your idea is sent. Your idea number is {reference}.", "tn": "Kakanyo ya gago e rometswe. Nomoro ya kakanyo ya gago ke {reference}."},
        "declined_text": {"en": "Your idea is saved but not sent. You can send it later on the CEDA website.", "tn": "Kakanyo ya gago e bolokilwe mme ga e a romelwa. O ka e romela moragonyana mo webosaeteng ya CEDA."},
        "closed_text": {"en": "This challenge is not taking ideas right now. Your idea is saved.", "tn": "Kgaisano e ga e amogele dikakanyo jaanong. Kakanyo ya gago e bolokilwe."},
        "error_text": {"en": "We could not send your idea right now. It is saved; please try again later.", "tn": "Ga re a kgona go romela kakanyo ya gago jaanong. E bolokilwe; tsweetswee leka gape moragonyana."},
        "success_next": "idea_done",
        "error_next": "",
    },
    "next": "",
    "position": {},
}


def _graph(journey, JourneyNode):
    nodes = {
        n.key: {"key": n.key, "type": n.type, "title": n.title, "text": n.text, "settings": n.settings, "next": n.next_key}
        for n in JourneyNode.objects.filter(journey=journey)
    }
    return {"start": journey.start_key, "default_language": journey.default_language, "channel": journey.channel, "nodes": nodes, "seeded_by": MARK}


def forward(apps, schema_editor):
    Journey = apps.get_model("channels", "Journey")
    JourneyNode = apps.get_model("channels", "JourneyNode")
    JourneyVersion = apps.get_model("channels", "JourneyVersion")
    journey = Journey.objects.filter(name=NAME, version=1, has_unpublished_changes=False).first()
    if journey is None:
        return
    keys = set(JourneyNode.objects.filter(journey=journey).values_list("key", flat=True))
    save = JourneyNode.objects.filter(journey=journey, key="save").first()
    if keys != SEEDED_KEYS or save is None or save.next_key != "idea_done" or save.text != OLD_SAVE_TEXT:
        return  # staff changed it: leave their journey alone
    for step in (FILE_STEP, SEND_STEP):
        JourneyNode.objects.create(
            journey=journey, key=step["key"], type=step["type"], title=step["title"], text=step["text"],
            settings=step["settings"], next_key=step["next"], position=step["position"],
        )
    save.next_key = "idea_file"
    save.text = NEW_SAVE_TEXT
    save.save(update_fields=["next_key", "text", "updated_at"])
    JourneyVersion.objects.create(journey=journey, number=2, graph=_graph(journey, JourneyNode), warnings=[])
    Journey.objects.filter(pk=journey.pk).update(version=2, published_at=timezone.now(), has_unpublished_changes=False)


def backward(apps, schema_editor):
    Journey = apps.get_model("channels", "Journey")
    JourneyNode = apps.get_model("channels", "JourneyNode")
    JourneyVersion = apps.get_model("channels", "JourneyVersion")
    journey = Journey.objects.filter(name=NAME).first()
    if journey is None:
        return
    version = JourneyVersion.objects.filter(journey=journey, number=2).first()
    if version is None or (version.graph or {}).get("seeded_by") != MARK or journey.version != 2:
        return
    version.delete()
    JourneyNode.objects.filter(journey=journey, key__in=[FILE_STEP["key"], SEND_STEP["key"]]).delete()
    JourneyNode.objects.filter(journey=journey, key="save").update(next_key="idea_done", text=OLD_SAVE_TEXT)
    Journey.objects.filter(pk=journey.pk).update(version=1, has_unpublished_changes=False)


class Migration(migrations.Migration):
    dependencies = [("channels", "0004_twilio_files_and_send")]

    operations = [migrations.RunPython(forward, backward)]

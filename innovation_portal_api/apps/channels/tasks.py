"""Background work for channels."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger("apps.channels.whatsapp")


@shared_task
def send_document_notes(connection_id: str, phone: str, document_ids: list[str], lang: str, node_key: str = "") -> int:
    """Review the files a person sent and send at most 3 short notes on WhatsApp. Returns notes sent."""
    from apps.channels import ai_guidance
    from apps.channels.engine import Screen
    from apps.channels.models import ChannelConnection
    from apps.channels.services import WhatsAppOutbound, _provider
    from apps.documents.models import SubmissionDocument

    link = ChannelConnection.objects.select_related("connection").filter(pk=connection_id, connection__is_active=True).first()
    provider = _provider(link) if link else None
    if provider is None:
        logger.info("whatsapp ai_guidance feature=document_review node=%s outcome=skipped reason=no_connection", node_key)
        return 0
    notes: list[str] = []
    for document_id in document_ids:
        notes += ai_guidance.document_notes(document_id=document_id, lang=lang, node_key=node_key)
        if len(notes) >= ai_guidance.MAX_NOTES:
            break
    notes = notes[: ai_guidance.MAX_NOTES]
    if not notes:
        return 0
    name = SubmissionDocument.objects.filter(pk=document_ids[0]).values_list("original_filename", flat=True).first() or ""
    title = ai_guidance.text("notes_title", lang).replace("{name}", name or ("your file" if lang != "tn" else "faele ya gago"))
    body = "\n".join([ai_guidance.text("label", lang), title, *[f"- {note}" for note in notes]])
    WhatsAppOutbound.send_screen(provider, phone, Screen(text=body, end=False, lang=lang))
    return len(notes)

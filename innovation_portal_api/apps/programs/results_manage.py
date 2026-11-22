"""R-59 (3.37): the winners manager. Which winning and shortlisted entries show on the public results, in what
order, with a photo and a short story. Names follow Program.show_names_on_results (#72)."""

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService

PHOTO_MAX_BYTES = 5 * 1024 * 1024


def _iso(value):
    return value.isoformat() if value else None


def _short(user) -> str:
    if user is None:
        return ""
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{first} {last[:1]}." if first and last else first


def candidates(program):
    """Winners (from winner records or the final decision) and the shortlist, as (submission, place)."""
    from apps.core.constants import SubmissionStatus
    from apps.programs.challenge_entry import SHORTLIST_STATUSES

    sent = program.submissions.filter(submitted_at__isnull=False).select_related("innovator", "district")
    places = {w.submission_id: w.position for w in program.winner_spotlights.all() if w.submission_id}
    rows = []
    for submission in sent:
        if submission.id in places:
            rows.append((submission, places[submission.id]))
        elif submission.current_status == SubmissionStatus.WINNER:
            rows.append((submission, "winner"))
        elif submission.current_status in SHORTLIST_STATUSES:
            rows.append((submission, "shortlisted"))
    return rows


def entry_payload(submission, place, entry, request=None) -> dict:
    from apps.programs.challenge_entry import _district

    photo = entry.photo if entry and entry.photo else None
    spotlight = getattr(submission, "winner_spotlight", None)
    if photo is None and spotlight is not None and spotlight.photo:
        photo = spotlight.photo
    return {
        "submission_id": str(submission.id),
        "title": submission.title,
        "applicant": _short(submission.innovator),
        "district": _district(submission, "en"),
        "place": place,
        "order": entry.order if entry else 0,
        "show_on_results": entry.show_on_results if entry else True,
        "photo_url": (request.build_absolute_uri(photo.url) if request else photo.url) if photo else None,
        "story": entry.story if entry else {},
    }


def manage(program, request=None) -> dict:
    from apps.content.models import ResultEntry
    from apps.programs.challenge_entry import PLACE_ORDER

    entries = {row.submission_id: row for row in ResultEntry.objects.filter(program=program)}
    rows = [entry_payload(submission, place, entries.get(submission.id), request) for submission, place in candidates(program)]
    rows.sort(key=lambda row: (row["order"] or 999, PLACE_ORDER.get(row["place"], 6 if row["place"] == "winner" else 9), row["title"]))
    return {
        "results_published": bool(program.results_announced_at),
        "published_at": _iso(program.results_announced_at),
        "show_names": program.show_names_on_results,
        "entries": rows,
    }


@transaction.atomic
def update_entry(program, submission_id, data: dict, *, actor) -> dict:
    from apps.content.models import ResultEntry

    found = {str(submission.id): (submission, place) for submission, place in candidates(program)}
    if str(submission_id) not in found:
        raise ValidationError({"submission": "Only winning and shortlisted entries of this challenge can be shown."})
    submission, place = found[str(submission_id)]
    entry, _ = ResultEntry.objects.get_or_create(program=program, submission=submission)
    before = {"show_on_results": entry.show_on_results, "order": entry.order, "story": entry.story}
    for name in ("show_on_results", "order"):
        if name in data:
            setattr(entry, name, data[name])
    if "story" in data:
        story = data["story"] or {}
        entry.story = {lang: str(story.get(lang) or "").strip()[:1000] for lang in ("en", "tn") if str(story.get(lang) or "").strip()}
    entry.save()
    AuditService.log_action(actor=actor, action_type="challenge_result_entry_updated", target=program, before_state=before, after_state={"show_on_results": entry.show_on_results, "order": entry.order, "story": entry.story}, metadata={"submission_id": str(submission.id)})
    return entry_payload(submission, place, entry)


def set_photo(program, submission_id, upload, *, actor, request=None) -> dict:
    from PIL import Image, UnidentifiedImageError

    from apps.content.models import ResultEntry

    found = {str(submission.id): (submission, place) for submission, place in candidates(program)}
    if str(submission_id) not in found:
        raise ValidationError({"submission": "Only winning and shortlisted entries of this challenge can be shown."})
    if upload is None:
        raise ValidationError({"file": "Choose a photo."})
    if upload.size > PHOTO_MAX_BYTES:
        raise ValidationError({"file": "The photo must be 5 MB or smaller."})
    try:
        Image.open(upload).verify()
        upload.seek(0)
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValidationError({"file": "This is not a photo we can read. Use a JPG or PNG."}) from None
    submission, place = found[str(submission_id)]
    entry, _ = ResultEntry.objects.get_or_create(program=program, submission=submission)
    entry.photo.save(upload.name, upload, save=True)
    AuditService.log_action(actor=actor, action_type="challenge_result_photo_changed", target=program, metadata={"submission_id": str(submission.id)})
    return entry_payload(submission, place, entry, request)


def public_view(program):
    """For 1.10: {submission id: entry} and the hidden ids."""
    from apps.content.models import ResultEntry

    entries = {row.submission_id: row for row in ResultEntry.objects.filter(program=program)}
    hidden = {key for key, row in entries.items() if not row.show_on_results}
    return entries, hidden

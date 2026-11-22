"""U10: entering a challenge (1.9, 1.9b, 2.10) and its results (1.10, 2.11).

A challenge is its own programme with its own form, so "Enter" never falls back to the general idea form.
Reads here; the few writes (eligibility answers, staff rule edits, publishing results) are services too.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import SubmissionStatus
from apps.programs import eligibility_rules as blocks
from apps.programs.access import ProgramAccessService
from apps.core.i18n import get_text
from apps.programs.challenge_public import _iso, challenge_status, has_results, text_in
from apps.programs.models import EligibilityRule, Program

GENERAL_IDEA_URL = "/submit"
SHORTLIST_STATUSES = (SubmissionStatus.SHORTLISTED, SubmissionStatus.FINALIST)
PLACE_ORDER = {"1st": 1, "2nd": 2, "3rd": 3, "runner_up": 4, "special": 5}


def _text(rule, attr: str, lang: str) -> str:
    english = getattr(rule, attr, "") or ""
    tn = ((rule.translations or {}).get("tn") or {}).get(attr, "")
    return tn if lang == "tn" and isinstance(tn, str) and tn.strip() else english


def _rules(program):
    return list(program.eligibility_rules.filter(active=True))


def asked(rule, lang: str) -> str:
    """The question as asked: what staff wrote, else the question a rule block gives (R-48), else the title."""
    written = _text(rule, "question", lang)
    if lang == "tn" and rule.field and not (((rule.translations or {}).get("tn") or {}).get("question") or "").strip():
        written = ""  # the English question staff wrote is not Setswana; the block can say it
    if written:
        return written
    return blocks.question(rule, lang) if rule.field else rule.title


def reason(rule, lang: str) -> str:
    return _text(rule, "reason", lang) or (blocks.sentence([rule], lang) if rule.field else "")


def question_payload(rule, lang: str) -> dict:
    return {
        "id": str(rule.id),
        "question": asked(rule, lang),
        "help": _text(rule, "description", lang),
    }


def documents_payload(program, lang: str) -> list[dict]:
    """R-48: documents applicants must bring."""
    rows = []
    for document in program.required_documents.all():
        tn = (document.translations or {}).get("tn") or {}
        rows.append(
            {
                "id": str(document.id),
                "name": (tn.get("name") if lang == "tn" else "") or document.name,
                "hint": (tn.get("hint") if lang == "tn" else "") or document.hint,
                "required": document.required,
                "accept": document.accept or [],
                "max_mb": document.max_mb,
            }
        )
    return rows


def _entry_link(submission) -> dict:
    return {
        "id": str(submission.id),
        "reference_number": submission.reference_number,
        "title": submission.title,
        "submitted_at": _iso(submission.submitted_at),
        "url": f"/my-ideas/{submission.id}",
    }


def _open_draft(program, user):
    from apps.submissions.models import ApplicationDraft

    if not user or not user.is_authenticated:
        return None
    return (
        ApplicationDraft.objects.filter(program=program, innovator=user, status=ApplicationDraft.STATUS_DRAFT)
        .order_by("-updated_at")
        .first()
    )


def _passed(draft) -> bool:
    return bool(((draft.metadata or {}).get("eligibility") or {}).get("passed")) if draft else False


def entry_state(program, user, lang: str) -> dict:
    """What "Enter" leads to for this person right now (1.9 and 1.9b).

    state: sign_in | questions | form | not_open | closed | entered | limit | audience.
    "not_eligible" is only ever an answer to the questions (check_eligibility); nothing is stored for it.
    """
    status = challenge_status(program)
    rules = _rules(program)
    signed_in = bool(user and user.is_authenticated)
    data = {
        "challenge": {
            "id": str(program.id),
            "slug": program.slug,
            "title": program.title,
            "status": status,
            "closes_at": _iso(program.submission_closes_at),
            "opens_at": _iso(program.submission_opens_at),
            "has_results": status == "closed" and has_results(program),
            "support_headline": text_in(program, "support_headline", lang),
            "results_publish_at": _iso(program.results_publish_at),
        },
        "state": "",
        "message": "",
        "questions": [],
        "draft_id": None,
        "entry": None,
        "entries_used": ProgramAccessService.entries_used(program, user),
        "max_entries": program.max_entries_per_person,
        "general_idea_url": GENERAL_IDEA_URL,
        "eligibility_sentence": blocks.sentence(rules, lang),
        "documents": documents_payload(program, lang),
    }
    latest = None
    if signed_in:
        latest = program.submissions.filter(innovator=user, submitted_at__isnull=False).order_by("-submitted_at").first()
        data["entry"] = _entry_link(latest) if latest else None

    if status == "closed":
        data["state"] = "closed"
        return data
    if status == "upcoming":
        data["state"] = "not_open"
        return data
    if not signed_in:
        data["state"] = "sign_in"
        return data

    code, message = ProgramAccessService.entry_block(program, user)
    if code == "limit":
        # One entry allowed and it is in: "already entered" with a link to it.
        data["state"] = "entered" if (program.max_entries_per_person or 0) <= 1 else "limit"
        data["message"] = message
        return data
    if code:
        data["state"] = "audience" if code == "audience" else "closed"
        data["message"] = message
        return data

    draft = _open_draft(program, user)
    if draft and (not rules or _passed(draft)):
        data["state"] = "form"
        data["draft_id"] = str(draft.id)
        return data
    if rules:
        data["state"] = "questions"
        data["questions"] = [question_payload(rule, lang) for rule in rules]
        return data
    data["state"] = "form"  # no questions: the form starts on check_eligibility({})
    return data


@transaction.atomic
def check_eligibility(program, user, answers: dict, lang: str) -> dict:
    """Checks the yes/no answers. Eligible: opens (or reuses) this challenge's draft and returns its id.

    Not eligible: returns the reasons and the general idea link; nothing is stored.
    """
    from apps.submissions.draft_services import ApplicationDraftService
    from apps.submissions.intake import submission_type_for

    ProgramAccessService.assert_can_enter(program, user)
    rules = _rules(program)
    answers = answers or {}
    missing = [str(rule.id) for rule in rules if not isinstance(answers.get(str(rule.id)), bool)]
    if missing:
        raise ValidationError({"answers": {"code": "answer_all", "detail": "Answer every question.", "missing": missing}})

    failed = [rule for rule in rules if answers[str(rule.id)] != rule.required_answer]
    if failed:
        return {
            "eligible": False,
            "reasons": [
                {"id": str(rule.id), "question": asked(rule, lang), "reason": reason(rule, lang)}
                for rule in failed
            ],
            "draft_id": None,
            "general_idea_url": GENERAL_IDEA_URL,
        }

    draft = _open_draft(program, user)
    eligibility = {"passed": True, "answers": {str(rule.id): answers[str(rule.id)] for rule in rules}, "at": timezone.now().isoformat()}
    if draft is None:
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=user,
            submission_type=submission_type_for(program),
            title=program.title,
            draft_data={},
            metadata={"eligibility": eligibility},
        )
    else:
        draft.metadata = {**(draft.metadata or {}), "eligibility": eligibility}
        draft.save(update_fields=["metadata", "updated_at"])
    AuditService.log_action(actor=user, action_type="challenge_eligibility_passed", target=program, metadata={"draft_id": str(draft.id)})
    return {"eligible": True, "reasons": [], "draft_id": str(draft.id), "general_idea_url": GENERAL_IDEA_URL}


def results_published(program) -> bool:
    return challenge_status(program) == "closed" and has_results(program)


def public_results(program, lang: str) -> dict:
    """1.10: winners (with names) and the shortlist (titles only), once the challenge has published results. Never scores or judges."""
    published = results_published(program)
    data = {
        "challenge": {"id": str(program.id), "slug": program.slug, "title": program.title, "status": challenge_status(program)},
        "published": published,
        "published_at": _iso(program.results_announced_at),
        "results_publish_at": _iso(program.results_publish_at),
        "winners": [],
        "shortlisted": [],
        "entries_count": 0,
        "districts_count": 0,
        "criteria": [],
    }
    if not published:
        return data
    from apps.programs.results_manage import public_view

    # R-59 (3.37): staff can hide entries, set their order, add a photo and a story, and hide names.
    entries, hidden, show_names = public_view(program)

    def order(submission_id, fallback):
        entry = entries.get(submission_id)
        return (entry.order if entry and entry.order else 999, fallback)

    def story(submission_id):
        entry = entries.get(submission_id)
        text = (entry.story or {}) if entry else {}
        return (text.get(lang) or text.get("en") or "") if text else ""

    def photo(submission_id, fallback):
        entry = entries.get(submission_id)
        return entry.photo.url if entry and entry.photo else fallback

    spotlights = [w for w in program.winner_spotlights.all() if w.submission_id not in hidden]
    spotlights.sort(key=lambda w: order(w.submission_id, (PLACE_ORDER.get(w.position, 9), w.team_name)))
    winner_ids = {w.submission_id for w in program.winner_spotlights.all() if w.submission_id}
    data["winners"] = [
        {
            "position": w.position,
            "name": w.team_name if show_names else "",
            "title": w.project_name,
            "description": w.description,
            "story": story(w.submission_id),
            "prize_label": w.prize_label,
            "prize_amount": w.prize_amount,
            "members_count": w.members_count,
            "photo_url": photo(w.submission_id, w.photo.url if w.photo else None),
            "district": _district(w.submission, lang),
        }
        for w in spotlights
    ]
    shortlisted = [
        s
        for s in program.submissions.filter(submitted_at__isnull=False, current_status__in=SHORTLIST_STATUSES).exclude(id__in=winner_ids)
        if s.id not in hidden
    ]
    shortlisted.sort(key=lambda s: order(s.id, s.title))
    # Nshathisi (22 Nov): shortlisted entries show the idea title only; winners keep their names.
    data["shortlisted"] = [{"title": s.title} for s in shortlisted]
    data["show_names"] = show_names
    sent = program.submissions.filter(submitted_at__isnull=False)
    data["entries_count"] = sent.count()
    data["districts_count"] = sent.exclude(district__isnull=True).values("district").distinct().count()
    data["criteria"] = _criteria_weights(program)
    return data


def _district(submission, lang: str) -> str:
    district = getattr(submission, "district", None) if submission else None
    return get_text(district.name, lang) if district else ""


def _criteria_weights(program) -> list[dict]:
    """1.10 "How we judged": each criterion's share of the total weight, in percent."""
    if not program.marking_criteria_id:
        return []
    items = list(program.marking_criteria.items.order_by("ordering"))
    total = sum(float(item.weight) for item in items)
    if not total:
        return []
    return [{"name": item.name, "weight": round(float(item.weight) * 100 / total)} for item in items]


def _panel_feedback(submission) -> str:
    """The latest feedback the team released to this person (the comment only: never judges or raw scores)."""
    snapshot = submission.feedback_snapshots.order_by("-released_at", "-created_at").first()
    if not snapshot:
        return ""
    return (((snapshot.payload_json or {}).get("release") or {}).get("comment") or "").strip()


def _score_summary(submission) -> dict | None:
    """The entry's final score and the average per criterion, out of 100, from submitted score sheets."""
    from apps.core.constants import ScoreSheetStatus
    from apps.evaluation.models import CriterionScore
    from apps.programs.challenge_results import ChallengeResultsService

    total = ChallengeResultsService._final_score(submission)
    scores = CriterionScore.objects.filter(
        score_sheet__submission=submission,
        score_sheet__status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
    )
    by_name: dict[str, list[float]] = {}
    for score in scores:
        top = float(score.criterion_max_score_snapshot or 0)
        if not top:
            continue
        by_name.setdefault(score.criterion_name_snapshot or "", []).append(float(score.raw_score) * 100 / top)
    criteria = [{"name": name, "score": round(sum(v) / len(v))} for name, v in by_name.items() if name]
    if total is None and not criteria:
        return None
    return {"total": round(total) if total is not None else None, "criteria": criteria}


def my_result(program, user, lang: str) -> dict:
    """2.11: this person's own outcome in one challenge. Score summary only if the challenge shares scores."""
    entry = program.submissions.filter(innovator=user, submitted_at__isnull=False).order_by("-submitted_at").first()
    published = results_published(program)
    data = {
        "challenge": {"id": str(program.id), "slug": program.slug, "title": program.title, "status": challenge_status(program)},
        "published": published,
        "published_at": _iso(program.results_announced_at),
        "results_publish_at": _iso(program.results_publish_at),
        "entry": _entry_link(entry) if entry else None,
        "outcome": "no_entry" if entry is None else "waiting",
        "position": None,
        "prize_label": "",
        "prize_amount": "",
        "scores": None,
        "scores_shared": program.share_scores_with_entrants,
        "first_name": (user.first_name or "").strip(),
        "entries_count": 0,
        "shortlisted_count": 0,
        "feedback": "",
        "next_step": None,
    }
    if entry is None or not published:
        return data
    sent = program.submissions.filter(submitted_at__isnull=False)
    data["entries_count"] = sent.count()
    winner_ids = set(program.winner_spotlights.exclude(submission__isnull=True).values_list("submission_id", flat=True))
    data["shortlisted_count"] = len(winner_ids | set(sent.filter(current_status__in=SHORTLIST_STATUSES).values_list("id", flat=True)))
    data["feedback"] = _panel_feedback(entry)
    spotlight = program.winner_spotlights.filter(submission=entry).first()
    if spotlight:
        data.update(outcome="winner", position=spotlight.position, prize_label=spotlight.prize_label, prize_amount=spotlight.prize_amount)
    elif entry.current_status in SHORTLIST_STATUSES:
        data["outcome"] = "shortlisted"
    else:
        data["outcome"] = "not_selected"
    # 2.11 "Next step": the challenge's event (pitch day or awards), for winners and the shortlist, while it is ahead.
    if data["outcome"] in ("winner", "shortlisted") and program.event_date and program.event_date > timezone.now():
        data["next_step"] = {"at": _iso(program.event_date)}
    if program.share_scores_with_entrants:
        data["scores"] = _score_summary(entry)
    return data


# Staff -----------------------------------------------------------------------------------------------------------


def staff_rule(rule) -> dict:
    return {
        "id": str(rule.id),
        "field": rule.field or None,
        "operator": rule.operator or None,
        "value": rule.value if rule.field else None,
        "question": rule.question or rule.title,
        "help": rule.description,
        "required_answer": rule.required_answer,
        "reason": rule.reason,
        "ordering": rule.ordering,
        "active": rule.active,
        "translations": rule.translations or {},
        "sentence": blocks.sentences([rule]),
    }


def staff_rules(program) -> list[dict]:
    return [staff_rule(rule) for rule in program.eligibility_rules.all()]


def staff_eligibility(program) -> dict:
    """GET /api/programs/{id}/eligibility/: rules, documents and the sentence the public page shows."""
    from apps.programs.models import ProgramDocument  # noqa: F401  (documents come through the related name)

    return {
        "rules": staff_rules(program),
        "documents": [
            {
                "id": str(document.id),
                "name": document.name,
                "hint": document.hint,
                "required": document.required,
                "accept": document.accept or [],
                "max_mb": document.max_mb,
                "translations": document.translations or {},
            }
            for document in program.required_documents.all()
        ],
        "sentence": blocks.sentences(_rules(program)),
    }


@transaction.atomic
def save_documents(program, items: list[dict], *, actor) -> None:
    """Replaces the challenge's document list with `items`, in order. Items with an id update that document."""
    from apps.programs.models import ProgramDocument

    before = staff_eligibility(program)["documents"]
    existing = {str(document.id): document for document in program.required_documents.all()}
    kept = set()
    for index, item in enumerate(items, start=1):
        document = existing.get(str(item.get("id") or "")) or ProgramDocument(program=program)
        for name in ("name", "hint", "required", "accept", "max_mb", "translations"):
            if name in item:
                setattr(document, name, item[name])
        document.ordering = index
        document.save()
        kept.add(str(document.id))
    for document_id, document in existing.items():
        if document_id not in kept:
            document.delete()
    AuditService.log_action(
        actor=actor, action_type="challenge_documents_updated", target=program, before_state={"documents": before}, after_state={"documents": staff_eligibility(program)["documents"]}
    )


@transaction.atomic
def save_rules(program, items: list[dict], *, actor) -> list[dict]:
    """Replaces the challenge's questions with `items`, in order. Items with an id update that rule.

    An item with `field` is a rule block (R-48): its question and the answer it needs come from the block
    unless staff wrote a question.
    """
    before = staff_rules(program)
    existing = {str(rule.id): rule for rule in program.eligibility_rules.all()}
    kept = set()
    for index, item in enumerate(items, start=1):
        rule = existing.get(str(item.get("id") or "")) or EligibilityRule(program=program)
        field = item.get("field") or ""
        rule.field = field
        rule.operator = item.get("operator") or "" if field else ""
        rule.value = blocks.clean_block(field, rule.operator, item.get("value")) if field else None
        rule.question = item.get("question") or ""
        rule.title = (rule.question or (blocks.question(rule, "en") if field else ""))[:255]
        rule.description = item.get("help", "")
        rule.required_answer = blocks.expects_yes(rule) if field else item.get("required_answer", True)
        rule.reason = item.get("reason", "")
        rule.translations = item.get("translations") or {}
        rule.active = item.get("active", True)
        rule.ordering = index
        rule.save()
        kept.add(str(rule.id))
    for rule_id, rule in existing.items():
        if rule_id not in kept:
            rule.delete()
    after = staff_rules(program)
    AuditService.log_action(actor=actor, action_type="challenge_eligibility_updated", target=program, before_state={"rules": before}, after_state={"rules": after})
    return after


def publish_results(program: Program, *, actor) -> dict:
    """Staff "Publish results" (1.10). Winners already chosen by hand are published as they are; otherwise the
    automatic ranking runs now, without waiting for the results date. A tie or missing marks keeps them on hold."""
    from apps.programs.challenge_results import ChallengeResultsService

    if program.results_announced_at:
        return {"published": True, "published_at": _iso(program.results_announced_at), "hold_reason": ""}
    if challenge_status(program) != "closed":
        raise ValidationError({"detail": {"code": "still_open", "detail": "Results can be published once the challenge has closed."}})
    if program.winner_spotlights.exists():
        program.results_announced_at = timezone.now()
        program.results_hold_reason = ""
        program.save(update_fields=["results_announced_at", "results_hold_reason", "updated_at"])
        AuditService.log_action(actor=actor, action_type="challenge_results_published", target=program, metadata={"by_hand": True})
    else:
        saved_date = program.results_publish_at
        if saved_date and saved_date > timezone.now():
            Program.objects.filter(pk=program.pk).update(results_publish_at=None)
        announced = ChallengeResultsService.try_announce(program)
        program.refresh_from_db()
        if not announced and saved_date and program.results_publish_at is None:
            Program.objects.filter(pk=program.pk).update(results_publish_at=saved_date)
            program.refresh_from_db()
        if announced:
            AuditService.log_action(actor=actor, action_type="challenge_results_published", target=program, metadata={"by_hand": False})
    return {"published": bool(program.results_announced_at), "published_at": _iso(program.results_announced_at), "hold_reason": program.results_hold_reason}

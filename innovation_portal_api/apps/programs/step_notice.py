"""Tell the innovator each time their idea moves to a new step (23 Nov).

One hook for every way a step moves (officer or manager decision, panel score, automatic move, staff move, send back
to an earlier review): WorkflowRuntimeService calls on_step_entered after the move, and the message goes after the
save commits. Same channels as the shortlist news (pitch._deliver): the portal, email, and WhatsApp only when the
idea came in on WhatsApp.

The switch is configurable, never hard-coded: a challenge stage uses its "Tell applicants" setting
(ProgramStage.notify_applicants); any other step (General ideas, steps without a stage setting) uses the step's own
"notify_innovator" setting, on by default.

No double messages: a move onto the shortlist already sends the shortlist news, so it sends nothing more here.
Returned, rejected and finished do not enter a new step, so they keep their own single message.
"""

from __future__ import annotations

from django.db import transaction

from apps.audit.services import AuditService

STEP_SETTING = "notify_innovator"


def stage_for(submission, step):
    from apps.programs.models import ProgramStage

    return ProgramStage.objects.filter(program_id=submission.program_id, code=step.code, is_active=True).first()


def switch_on(submission, step) -> bool:
    stage = stage_for(submission, step)
    if stage is not None:
        return bool(stage.notify_applicants)
    return bool((step.settings_json or {}).get(STEP_SETTING, True))


def public_name(submission, step) -> str:
    stage = stage_for(submission, step)
    return (stage.name if stage and stage.name else step.name) or "the next step"


def next_text(submission, step) -> str:
    from apps.submissions.timeline import GENERIC_EXPLANATION, SubmissionTimelineService

    text = SubmissionTimelineService._explanation(step, stage_for(submission, step))
    return "" if text == GENERIC_EXPLANATION else text


def on_step_entered(submission, step, previous_status: str, *, actor=None) -> None:
    """Called right after the idea's instance moved to ``step``; sends after commit when the switch is on."""
    from apps.programs.pitch import SHORTLISTED

    if step is None:
        return
    if submission.innovator_id is None and not submission.guest_phone:
        return  # nobody to tell (same rule as the shortlist news)
    if submission.current_status in SHORTLISTED and previous_status not in SHORTLISTED:
        return  # the shortlist news is this move's one message
    if not switch_on(submission, step):
        return
    transaction.on_commit(lambda: send(submission, step, actor=actor))


def send(submission, step, *, actor=None) -> dict:
    from apps.programs.pitch import _deliver

    name = public_name(submission, step)
    extra = next_text(submission, step)
    title = {"en": "Your idea moved on", "tn": "Kakanyo ya gago e tswelela pele"}
    body = {
        "en": f"Your idea {submission.title} has moved to {name}." + (f" {extra}" if extra else ""),
        # The step's own explanation is written in English by staff; the Setswana sentence names the step.
        "tn": f"Kakanyo ya gago {submission.title} e tsene mo kgatong ya {name}." + (f" {extra}" if extra else ""),
    }
    sent = _deliver(submission, notification_type="idea_moved_on", title=title, body=body, actor=actor)
    AuditService.log_action(
        actor=actor,
        action_type="step_notification_sent",
        target=submission,
        metadata={"step": step.code, "step_name": name, "channels": [channel for channel, count in sent.items() if count]},
    )
    return sent

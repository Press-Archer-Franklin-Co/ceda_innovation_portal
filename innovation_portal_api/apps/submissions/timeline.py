"""The innovator-facing timeline of an idea (screens 1.5, 2.1 and 2.4).

Stages are "Submitted" followed by the active steps of the submission's workflow.
Each step is matched by code to a ProgramStage of the programme, whose
`explanation` and `usual_duration` the innovation team can edit; without one a
built-in explanation and a duration derived from the step's deadline are used.
"""
from __future__ import annotations

from django.utils import timezone

from apps.core.constants import AssignmentStatus

STATUS_DONE = "done"
STATUS_CURRENT = "current"
STATUS_UPCOMING = "upcoming"
# Only when the review has ended early (for example an idea that was not selected
# at screening): the later stages will not happen.
STATUS_SKIPPED = "skipped"

SUBMITTED_STAGE = {
    "code": "submitted",
    "name": "Submitted",
    "explanation": "We have your idea. It is waiting for the innovation team to pick it up.",
}

# Plain-language explanations by workflow step code, then by the status the step sets.
EXPLANATIONS = {
    "intake": "The innovation team registers your idea and checks that nothing is missing.",
    "screening": "An innovation officer checks that the idea is complete and fits what CEDA supports.",
    "under_review": "Officers look at your idea in detail. They may ask you questions.",
    "judging_review": "A panel reviews your idea and scores it against the published criteria.",
    "assigned_to_judges": "Your idea is with the judging panel.",
    "under_judging": "The judging panel is scoring your idea.",
    "shortlisted": "Your idea is on the shortlist for the next round.",
    "final_decision": "CEDA makes a decision and tells you the outcome and the next steps.",
    "approved": "CEDA makes a decision and tells you the outcome and the next steps.",
}
GENERIC_EXPLANATION = "The innovation team is working on this stage."

ENDED_WORKFLOW_STATUSES = {"completed", "rejected", "cancelled"}
INACTIVE_ASSIGNMENT_STATUSES = {AssignmentStatus.DECLINED, AssignmentStatus.REASSIGNED}


def _iso(value):
    return value.isoformat() if value else None


def duration_from_hours(hours: int | None) -> str:
    if not hours:
        return ""
    days = max(1, round(hours / 24))
    if days <= 2:
        return "1 to 2 days"
    if days < 14:
        return f"about {days} days"
    weeks = round(days / 7)
    return f"about {weeks} weeks"


def officer_label(user) -> str:
    """First name and initial only, e.g. "Neo K."."""
    if not user:
        return ""
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if not first:
        return ""
    return f"{first} {last[0]}." if last else first


class SubmissionTimelineService:
    @staticmethod
    def _program_stages(program) -> dict:
        return {stage.code: stage for stage in program.stages.filter(is_active=True)}

    @staticmethod
    def _explanation(step, program_stage) -> str:
        if program_stage and program_stage.explanation:
            return program_stage.explanation
        return EXPLANATIONS.get(step.code) or EXPLANATIONS.get(step.submission_status or "") or GENERIC_EXPLANATION

    @staticmethod
    def _current_officer(submission, step) -> str:
        from apps.assignments.models import Assignment

        assignment = (
            Assignment.objects.filter(submission=submission, workflow_step=step)
            .exclude(status__in=INACTIVE_ASSIGNMENT_STATUSES)
            .select_related("assignee")
            .order_by("-assigned_at")
            .first()
        )
        return officer_label(assignment.assignee) if assignment else ""

    @classmethod
    def build(cls, submission, *, public: bool = False) -> dict:
        """Ordered stages for a submission.

        public=True is the reduced form for /api/track/{reference}/: no officer names.
        """
        program = submission.program
        instance = getattr(submission, "workflow_instance", None)
        program_stages = cls._program_stages(program)
        submitted_at = submission.submitted_at or submission.created_at

        stages = [
            {
                "code": SUBMITTED_STAGE["code"],
                "name": SUBMITTED_STAGE["name"],
                "status": STATUS_DONE if submission.submitted_at else STATUS_CURRENT,
                "reached_at": _iso(submitted_at) if submission.submitted_at else None,
                "explanation": (program_stages.get("submitted").explanation if program_stages.get("submitted") and program_stages["submitted"].explanation else SUBMITTED_STAGE["explanation"]),
                "usual_duration": program_stages["submitted"].usual_duration if program_stages.get("submitted") else "",
                "officer": "",
            }
        ]

        steps = []
        if instance:
            steps = list(instance.workflow_definition.steps.filter(is_active=True).order_by("order", "created_at"))
        elif program_stages:
            # No workflow yet: describe the programme's own stages, all upcoming.
            for stage in sorted(program_stages.values(), key=lambda item: item.ordering):
                if stage.code == "submitted":
                    continue
                stages.append(
                    {
                        "code": stage.code,
                        "name": stage.name,
                        "status": STATUS_UPCOMING,
                        "reached_at": None,
                        "explanation": stage.explanation or GENERIC_EXPLANATION,
                        "usual_duration": stage.usual_duration,
                        "officer": "",
                    }
                )

        logs_by_step: dict = {}
        if instance:
            for log in instance.action_logs.exclude(step__isnull=True).order_by("timestamp"):
                logs_by_step.setdefault(log.step_id, []).append(log.timestamp)

        current_step = getattr(instance, "current_step", None)
        ended = bool(instance) and instance.status in ENDED_WORKFLOW_STATUSES
        current_order = current_step.order if current_step else None
        previous_reached = submitted_at
        for step in steps:
            program_stage = program_stages.get(step.code)
            if ended:
                status = STATUS_DONE if current_order is None or step.order <= current_order else STATUS_SKIPPED
            elif current_order is None:
                status = STATUS_UPCOMING
            elif step.order < current_order:
                status = STATUS_DONE
            elif step.id == current_step.id:
                status = STATUS_CURRENT
            else:
                status = STATUS_UPCOMING

            reached_at = None
            if status in (STATUS_DONE, STATUS_CURRENT):
                own_logs = logs_by_step.get(step.id)
                reached_at = own_logs[0] if own_logs else previous_reached
                previous_reached = (own_logs[-1] if own_logs else reached_at) or previous_reached

            stages.append(
                {
                    "code": step.code,
                    "name": program_stage.name if program_stage and program_stage.name else step.name,
                    "status": status,
                    "reached_at": _iso(reached_at),
                    "explanation": cls._explanation(step, program_stage),
                    "usual_duration": (program_stage.usual_duration if program_stage and program_stage.usual_duration else duration_from_hours(step.due_in_hours)),
                    "officer": "" if public or status != STATUS_CURRENT else cls._current_officer(submission, step),
                }
            )

        if public:
            for stage in stages:
                stage.pop("officer", None)

        next_panel_at = program.next_panel_at if program.next_panel_at and program.next_panel_at > timezone.now() else None
        current = next((stage for stage in stages if stage["status"] == STATUS_CURRENT), None)
        return {
            "stages": stages,
            "current_stage_code": current["code"] if current else "",
            "next_panel_at": _iso(next_panel_at),
        }

    @classmethod
    def next_steps(cls, submission) -> list[dict]:
        """What happens from now on: the current stage and the ones after it."""
        timeline = cls.build(submission, public=True)
        return [
            {"name": stage["name"], "explanation": stage["explanation"], "usual_duration": stage["usual_duration"]}
            for stage in timeline["stages"]
            if stage["status"] in (STATUS_CURRENT, STATUS_UPCOMING)
        ]

"""R-42 (3.20): one to-do list for a staff member.

Sources: assignments (review, score, quick check), workflow tasks, applicant messages waiting for a staff
reply, website changes waiting for this person's approval, and invitations to judge or review.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Max, OuterRef, Q, Subquery
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.constants import AssignmentRoleType, AssignmentStatus
from apps.core.permissions import HasCapability
from apps.submissions.staff_views import person_name

TABS = ("open", "done_week", "assigned_by_me")
OPEN_ASSIGNMENT = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED)
OPEN_TASK = ("pending", "claimed")


def _iso(value):
    return value.isoformat() if value else None


def _one_line(submission) -> str:
    """The first written answer, cut to one line."""
    for response in submission.responses.all():
        value = response.value.get("value") if isinstance(response.value, dict) else response.value
        if isinstance(value, str) and len(value.split()) >= 4:
            text = " ".join(value.split())
            return text if len(text) <= 140 else text[:137].rstrip() + "..."
    return ""


def _submission(submission) -> dict | None:
    if submission is None:
        return None
    return {
        "id": str(submission.id),
        "title": submission.title,
        "reference": submission.reference_number,
        "innovator": person_name(submission),
        "program": {"id": str(submission.program_id), "title": submission.program.title},
        "channel": submission.channel,
        "sent_at": _iso(submission.submitted_at),
        "one_line": _one_line(submission),
    }


def _step(step) -> dict | None:
    if step is None:
        return None
    steps = list(step.workflow_definition.steps.filter(is_active=True).order_by("order", "created_at").values_list("id", flat=True))
    return {"name": step.name, "number": steps.index(step.id) + 1 if step.id in steps else None, "of": len(steps)}


def _kind_for_step(step, role_type: str) -> str:
    if role_type == AssignmentRoleType.JUDGE or (step is not None and step.requires_evaluation):
        return "score"
    if step is not None and "screen" in (step.code or ""):
        return "quick_check"
    return "review"


def _item(*, id, kind, title, context, due_at, submission=None, why=None, step=None, link, done_at=None, **extra) -> dict:
    now = timezone.now()
    return {
        "id": str(id),
        "kind": kind,
        "title": title,
        "context": context,
        "due_at": _iso(due_at),
        "overdue": bool(due_at and done_at is None and due_at < now),
        "submission": _submission(submission),
        "why": why,
        "step": _step(step),
        "link": link,
        "done_at": _iso(done_at),
        **extra,
    }


def _submission_link(kind: str, submission_id) -> str:
    return f"/judging/{submission_id}" if kind == "score" else f"/submissions/{submission_id}"


def assignment_items(assignments, *, by_me=False) -> list[dict]:
    items = []
    for assignment in assignments:
        kind = _kind_for_step(assignment.workflow_step, assignment.role_type)
        if by_me:
            why = {"kind": "person", "name": assignment.assignee.full_name or assignment.assignee.email}
        elif assignment.assigned_by_id:
            why = {"kind": "person", "name": assignment.assigned_by.full_name or assignment.assigned_by.email}
        else:
            why = {"kind": "workflow", "name": assignment.workflow_step.name if assignment.workflow_step_id else ""}
        items.append(
            _item(
                id=assignment.id,
                kind=kind,
                title=assignment.submission.title,
                context=assignment.submission.program.title,
                due_at=assignment.deadline,
                submission=assignment.submission,
                why=why,
                step=assignment.workflow_step,
                link=_submission_link(kind, assignment.submission_id),
                done_at=assignment.completed_at,
                assignment_id=str(assignment.id),
                status=assignment.status,
            )
        )
    return items


def task_items(tasks) -> list[dict]:
    items = []
    for task in tasks:
        submission = task.workflow_instance.submission
        kind = _kind_for_step(task.workflow_step, "")
        items.append(
            _item(
                id=task.id,
                kind=kind,
                title=submission.title if submission else task.workflow_step.name,
                context=submission.program.title if submission else task.workflow_step.name,
                due_at=task.due_at,
                submission=submission,
                why={"kind": "workflow", "name": task.workflow_step.name},
                step=task.workflow_step,
                link=_submission_link(kind, submission.id) if submission else "/assignments",
                done_at=task.completed_at,
                status=task.status,
            )
        )
    return items


def reply_items(user) -> list[dict]:
    """Ideas where the applicant wrote last and this person looks after the idea or wrote the last staff message."""
    from apps.assignments.models import Assignment
    from apps.communications.models import Message, MessageThread

    last = Message.objects.filter(thread=OuterRef("pk")).exclude(author_role="system").order_by("-created_at")
    mine = Assignment.objects.filter(assignee=user, status__in=OPEN_ASSIGNMENT).exclude(role_type=AssignmentRoleType.JUDGE).values("submission_id")
    officer_last = Message.objects.filter(thread=OuterRef("pk"), author_role="officer").order_by("-created_at")
    threads = (
        MessageThread.objects.filter(submission__isnull=False)
        .annotate(last_role=Subquery(last.values("author_role")[:1]), last_at=Subquery(last.values("created_at")[:1]), last_officer=Subquery(officer_last.values("author")[:1]))
        .filter(last_role="applicant")
        .filter(Q(submission_id__in=mine) | Q(last_officer=user.id))
        .select_related("submission__program", "submission__innovator")
        .prefetch_related("submission__responses")
    )
    return [
        _item(
            id=thread.id,
            kind="reply",
            title=thread.submission.title,
            context=thread.submission.program.title,
            due_at=None,
            submission=thread.submission,
            why={"kind": "applicant", "name": person_name(thread.submission)},
            link=f"/submissions/{thread.submission_id}?tab=messages",
            waiting_since=_iso(thread.last_at),
        )
        for thread in threads
    ]


def approval_items(user) -> list[dict]:
    from apps.content.models import ApprovalRequest
    from apps.content.services import ApprovalService

    items = []
    for approval in ApprovalRequest.objects.filter(status=ApprovalRequest.Status.PENDING).select_related("requested_by"):
        if not ApprovalService.can_approve(user, approval):
            continue
        requester = approval.requested_by
        items.append(
            _item(
                id=approval.id,
                kind="approve",
                title=approval.summary or "Website change",
                context="Website",
                due_at=approval.publish_at,
                why={"kind": "person", "name": (requester.full_name or requester.email) if requester else ""},
                link="/content/approvals",
                approval_id=str(approval.id),
            )
        )
    return items


def invite_items(user) -> list[dict]:
    from apps.assignments.models import SpecialistInvitation, SpecialistInvitationStatus
    from apps.programs.models import ChallengeJudge

    if not user.email:
        return []
    email = user.email.strip().lower()
    items = [
        _item(
            id=judge.id,
            kind="invite",
            title=judge.program.title,
            context="Judging",
            due_at=judge.program.judging_end or judge.program.evaluation_closes_at,
            why={"kind": "invite", "name": "Judging invitation"},
            link=f"/programs/{judge.program_id}",
        )
        for judge in ChallengeJudge.objects.filter(email=email, invited_at__isnull=False, accepted_at__isnull=True, declined_at__isnull=True).select_related("program")
    ]
    now = timezone.now()
    for invitation in SpecialistInvitation.objects.filter(invitee_email__iexact=email, status=SpecialistInvitationStatus.PENDING, expires_at__gt=now).select_related(
        "submission__program", "invited_by"
    ):
        inviter = invitation.invited_by
        items.append(
            _item(
                id=invitation.id,
                kind="invite",
                title=invitation.submission.title,
                context=invitation.submission.program.title,
                due_at=invitation.expires_at,
                submission=invitation.submission,
                why={"kind": "person", "name": (inviter.full_name or inviter.email) if inviter else ""},
                step=invitation.workflow_step,
                link=f"/submissions/{invitation.submission_id}",
            )
        )
    return items


def _sorted(items) -> list[dict]:
    far = "9999"
    return sorted(items, key=lambda item: (not item["overdue"], item["due_at"] or far, item["title"]))


def my_work(user, tab: str) -> dict:
    from apps.assignments.models import Assignment
    from apps.workflow.models import TaskExecution

    assignments = Assignment.objects.select_related("submission__program", "submission__innovator", "workflow_step__workflow_definition", "assigned_by", "assignee").prefetch_related(
        "submission__responses"
    )
    tasks = TaskExecution.objects.select_related(
        "workflow_instance__submission__program", "workflow_instance__submission__innovator", "workflow_step__workflow_definition"
    ).prefetch_related("workflow_instance__submission__responses")
    week = timezone.now() - timedelta(days=7)

    def open_items():
        mine = assignments.filter(assignee=user, status__in=OPEN_ASSIGNMENT)
        open_tasks = tasks.filter(assignee=user, status__in=OPEN_TASK).filter(Q(assignment__isnull=True) | ~Q(assignment__in=mine))
        return _sorted(assignment_items(mine) + task_items(open_tasks) + reply_items(user) + approval_items(user) + invite_items(user))

    def done_items():
        from apps.content.models import ApprovalDecision

        done = assignments.filter(assignee=user, status=AssignmentStatus.COMPLETED, completed_at__gte=week)
        done_tasks = tasks.filter(assignee=user, status="completed", completed_at__gte=week, assignment__isnull=True)
        from apps.content.models import ApprovalRequest

        decided = ApprovalDecision.objects.filter(decided_by=user, created_at__gte=week).values("request_id").annotate(at=Max("created_at"))

        approvals = {str(item.id): item for item in ApprovalRequest.objects.filter(id__in=[row["request_id"] for row in decided])}
        approval_rows = [
            _item(id=row["request_id"], kind="approve", title=approvals[str(row["request_id"])].summary or "Website change", context="Website", due_at=None, link="/content/approvals", done_at=row["at"])
            for row in decided
            if str(row["request_id"]) in approvals
        ]
        items = assignment_items(done) + task_items(done_tasks) + approval_rows
        return sorted(items, key=lambda item: item["done_at"] or "", reverse=True)

    def by_me_items():
        from apps.programs.challenge_judging import AUTO_ACCEPT_NOTE

        # Not the judges a challenge assigns by itself to its owner's name.
        mine = assignments.filter(assigned_by=user, status__in=OPEN_ASSIGNMENT).exclude(assignee=user).exclude(acceptance__response_note=AUTO_ACCEPT_NOTE)
        return _sorted(assignment_items(mine, by_me=True))

    pick = {"open": open_items, "done_week": done_items, "assigned_by_me": by_me_items}
    chosen = pick[tab]()
    counts = {name: (len(chosen) if name == tab else len(pick[name]())) for name in TABS}
    return {"counts": counts, "items": chosen}


class MyWorkView(APIView):
    permission_classes = [HasCapability.of("entries.review")]

    @extend_schema(
        tags=["Staff ideas (R-42)"],
        summary="My work (3.20)",
        description="{counts: {open, done_week, assigned_by_me}, items: [{id, kind: review|reply|approve|score|quick_check|invite, title, context, "
        "due_at, overdue, submission: {id, title, reference, innovator, program, channel, sent_at, one_line} | null, why: {kind, name}, "
        "step: {name, number, of} | null, link}]}. Overdue first, then by due date.",
        parameters=[OpenApiParameter("tab", OpenApiTypes.STR, enum=list(TABS))],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        tab = request.query_params.get("tab") or "open"
        if tab not in TABS:
            raise ValidationError({"tab": f"Use one of: {', '.join(TABS)}."})
        return api_success(data=my_work(request.user, tab))

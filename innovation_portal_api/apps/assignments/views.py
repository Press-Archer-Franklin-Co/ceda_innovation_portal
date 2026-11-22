from drf_spectacular.utils import extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone

from apps.assignments.models import Assignment
from apps.assignments.serializers import AssignmentSerializer, ConflictSerializer, ReviewerQueueItemSerializer
from apps.assignments.services import AssignmentService
from apps.audit.serializers import AuditLogSerializer
from apps.audit.models import AuditLog
from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.constants import AssignmentRoleType, AssignmentStatus
from apps.core.permissions import IsJudge, IsJudgeOrOfficer, IsOfficerOrAdmin, IsStaffWorker
from apps.submissions.models import Submission
from apps.workflow.models import TaskExecution


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy", "resolve_conflict", "reassign", "unassign"}:
            return [IsOfficerOrAdmin()]
        if self.action in {"accept", "decline", "conflict", "complete"}:
            return [IsStaffWorker()]
        if self.action in {"claim_submission"}:
            return [IsStaffWorker()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Assignment.objects.select_related("submission__program", "submission__innovator", "assignee", "workflow_step")

        if self.action == "list":
            requested_role = self.request.query_params.get("role") or None
            eligible_role_types = AssignmentService.eligible_assignment_roles_for_user(user, requested_role)
            if not eligible_role_types:
                return qs.none()
            return qs.filter(assignee=user, role_type__in=eligible_role_types)

        if user.is_superuser or user.roles.filter(
            code__in=["innovation_officer", "innovation_manager", "administrator"],
            user_roles__is_active=True,
        ).exists():
            return qs.all()

        return qs.filter(assignee=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = Submission.objects.get(id=self.request.data["submission"])
        assignment = AssignmentService.create_assignment(
            submission=submission,
            assignee=serializer.validated_data["assignee"],
            role_type=serializer.validated_data["role_type"],
            assigned_by=self.request.user,
            deadline=serializer.validated_data.get("deadline"),
            panel=serializer.validated_data.get("panel"),
        )
        return api_success(data=self.get_serializer(assignment).data, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        assignment = AssignmentService.respond(self.get_object(), request.user, accept=True, note=request.data.get("note", ""))
        return api_success(data=self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        assignment = AssignmentService.respond(self.get_object(), request.user, accept=False, note=request.data.get("note", ""))
        return api_success(data=self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"])
    def conflict(self, request, pk=None):
        assignment = self.get_object()
        AssignmentService.declare_conflict(assignment, request.user, request.data["conflict_details"])
        return api_success(data=self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        assignment = AssignmentService.complete(self.get_object(), request.user, note=request.data.get("note", ""))
        return api_success(data=self.get_serializer(assignment).data)

    @action(detail=False, methods=["post"], url_path=r"claim-submission/(?P<submission_id>[^/.]+)")
    def claim_submission(self, request, submission_id=None):
        submission = Submission.objects.get(id=submission_id)
        assignment = AssignmentService.claim_submission(submission=submission, actor=request.user)
        return api_success(data=self.get_serializer(assignment).data, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsOfficerOrAdmin], url_path="resolve-conflict")
    def resolve_conflict(self, request, pk=None):
        assignment = AssignmentService.resolve_conflict(
            self.get_object(),
            request.user,
            resolution_note=request.data.get("resolution_note", ""),
            reopen_assignment=request.data.get("reopen_assignment", False),
        )
        return api_success(data=self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOfficerOrAdmin])
    def reassign(self, request, pk=None):
        assignment = self.get_object()
        assignee = assignment.assignee.__class__.objects.get(id=request.data["assignee"])
        updated = AssignmentService.reassign(assignment=assignment, assignee=assignee, actor=request.user, deadline=request.data.get("deadline"))
        return api_success(data=self.get_serializer(updated).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOfficerOrAdmin])
    def unassign(self, request, pk=None):
        updated = AssignmentService.unassign(assignment=self.get_object(), actor=request.user)
        return api_success(data=self.get_serializer(updated).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        assignment = self.get_object()
        logs = AuditLog.objects.filter(
            metadata__assignment_id=str(assignment.id),
        ).order_by("-created_at")
        return api_success(data=AuditLogSerializer(logs, many=True).data)


class ReviewerQueueView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ReviewerQueueItemSerializer

    def _user_eligible_step_roles(self, user):
        """Return the set of step assignment_role values this user can handle."""
        return AssignmentService.eligible_assignment_roles_for_user(user)

    def get_queryset(self):
        user = self.request.user
        requested_role = self.request.query_params.get("role") or None
        eligible_step_roles = AssignmentService.eligible_assignment_roles_for_user(user, requested_role)
        if not eligible_step_roles:
            return []

        mine = self.request.query_params.get("mine") == "true"
        unassigned = self.request.query_params.get("unassigned") == "true"
        assigned = self.request.query_params.get("assigned") == "true"
        completed = self.request.query_params.get("completed") == "true"

        queryset = Submission.objects.select_related(
            "workflow_instance__current_step"
        ).prefetch_related("assignments__assignee").filter(workflow_instance__isnull=False)
        queryset = self._apply_filters(queryset)

        results = []
        for submission in queryset:
            instance = submission.workflow_instance
            step = instance.current_step
            if not step or not step.requires_assignment:
                continue
            if step.assignment_role not in eligible_step_roles:
                continue
            active_assignments = submission.assignments.filter(
                workflow_step=step, status__in=AssignmentService.ACTIVE_ASSIGNMENT_STATUSES
            )
            active_tasks = submission.workflow_instance.tasks.filter(
                workflow_step=step,
                status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED, TaskExecution.STATUS_COMPLETED],
            )

            min_required = step.minimum_assignments or 0
            slots_remaining = max(min_required - active_assignments.count(), 0)
            has_my_assignment = active_assignments.filter(assignee=user).exists()

            include = False
            if mine and active_tasks.filter(assignee=user).exists():
                include = True
            if unassigned:
                from apps.core.constants import AssignmentRoleType as _ART
                if step.assignment_role == _ART.SPECIALIST:
                    if not active_assignments.filter(status__in=["accepted", "completed"]).exists():
                        include = True
                elif slots_remaining > 0 and not has_my_assignment:
                    include = True
            if assigned and active_tasks.filter(
                status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]
            ).exists():
                include = True
            if completed and active_tasks.filter(status=TaskExecution.STATUS_COMPLETED).exists():
                include = True
            if not any([mine, unassigned, assigned, completed]):
                include = True
            if include:
                results.append(submission)
        return results

    def _apply_filters(self, queryset):
        """B5 filters (also stored in saved views): program, sector, channel, stage, overdue."""
        from django.utils import timezone

        params = self.request.query_params
        try:
            if params.get("program"):
                queryset = queryset.filter(program_id=params["program"])
            if params.get("sector"):
                queryset = queryset.filter(sector_id=params["sector"])
        except Exception:  # not a UUID
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"detail": "program and sector must be ids."})
        if params.get("channel"):
            queryset = queryset.filter(channel=params["channel"])
        if params.get("stage"):
            queryset = queryset.filter(workflow_instance__current_step__code=params["stage"])
        if params.get("overdue") == "true":
            queryset = queryset.filter(workflow_instance__due_at__lt=timezone.now())
        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)


class ReviewerQueueStatsView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        queryset = Assignment.objects.all()
        data = {
            "assigned": queryset.filter(status=AssignmentStatus.ASSIGNED).count(),
            "accepted": queryset.filter(status=AssignmentStatus.ACCEPTED).count(),
            "completed": queryset.filter(status=AssignmentStatus.COMPLETED).count(),
            "declined": queryset.filter(status=AssignmentStatus.DECLINED).count(),
            "reassigned": queryset.filter(status=AssignmentStatus.REASSIGNED).count(),
            "overdue": queryset.filter(deadline__lt=timezone.now(), status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED]).count(),
        }
        return api_success(data=data)


class OverdueAssignmentListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.select_related("submission", "assignee", "workflow_step").filter(
            deadline__lt=timezone.now(),
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
        ).order_by("deadline")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)


class ReviewerSuggestionView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        submission_id = request.query_params.get("submission")
        role_type = request.query_params.get("role_type", "judge")
        assignee_model = Assignment.assignee.field.related_model
        required_role = "judge" if role_type == "judge" else "innovation_officer"
        eligible_users = assignee_model.objects.filter(roles__code=required_role, roles__user_roles__is_active=True).distinct()
        suggestions = []
        for user in eligible_users:
            active_count = Assignment.objects.filter(
                assignee=user,
                status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
            ).count()
            suggestions.append({"user_id": str(user.id), "full_name": user.full_name, "active_assignment_count": active_count})
        suggestions.sort(key=lambda item: (item["active_assignment_count"], item["full_name"]))
        return api_success(data={"submission_id": submission_id, "role_type": role_type, "suggestions": suggestions[:5]})



from apps.assignments.models import SpecialistInvitation, SpecialistInvitationStatus
from apps.assignments.serializers import InviteSpecialistSerializer, SpecialistInvitationSerializer
from apps.core.permissions import IPRateThrottle
from apps.workflow.models import WorkflowStep


class InviteSpecialistView(generics.CreateAPIView):
    """POST /api/submissions/{submission_id}/invite-specialist/
    Creates a SpecialistInvitation and sends the invite email.
    Allowed for: Innovation Officers, Managers, and Administrators.
    """
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = InviteSpecialistSerializer

    def create(self, request, submission_id=None):
        from django.utils import timezone
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            submission = Submission.objects.select_related("program").get(id=submission_id)
        except Submission.DoesNotExist:
            return Response({"detail": "Submission not found."}, status=status.HTTP_404_NOT_FOUND)

        workflow_step = None
        if data.get("workflow_step"):
            try:
                workflow_step = WorkflowStep.objects.get(id=data["workflow_step"])
            except WorkflowStep.DoesNotExist:
                pass
        if workflow_step is None:
            workflow_step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)

        current_step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if current_step is None or not current_step.requires_assignment:
            return Response(
                {"detail": "This entry is not at a workflow step that takes reviewers, so a specialist cannot be invited now."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if current_step.assignment_role and current_step.assignment_role != AssignmentRoleType.SPECIALIST:
            return Response(
                {
                    "detail": (
                        f"This entry is at '{current_step.name}', which is set up for {current_step.get_assignment_role_display().lower()}s, "
                        "not specialists. Assign it from Assignments instead, or change the step's assignment role to Specialist."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        expires_at = timezone.now() + timezone.timedelta(days=data["expires_in_days"])
        required_review_count = data.get("required_review_count", 1)
        invitation = SpecialistInvitation.objects.create(
            submission=submission,
            workflow_step=workflow_step,
            invited_by=request.user,
            invitee_email=data["invitee_email"],
            invitee_name=data["invitee_name"],
            message=data.get("message", ""),
            required_review_count=required_review_count,
            expires_at=expires_at,
        )
        SpecialistInvitation.objects.filter(
            submission=submission,
            workflow_step=workflow_step,
            status__in=(SpecialistInvitationStatus.PENDING, SpecialistInvitationStatus.ACCEPTED),
        ).update(required_review_count=required_review_count)

        try:
            _send_specialist_invite_email(invitation, request)
        except Exception:
            pass

        return api_success(
            data=SpecialistInvitationSerializer(invitation).data,
            status_code=status.HTTP_201_CREATED,
        )


class SubmissionSpecialistInvitationListView(generics.ListAPIView):
    """GET /api/submissions/{submission_id}/specialist-invitations/
    Lists all invitations for a submission. Staff only.
    """
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = SpecialistInvitationSerializer

    def get_queryset(self):
        return SpecialistInvitation.objects.filter(
            submission_id=self.kwargs["submission_id"]
        ).select_related("invited_by", "accepted_by", "assignment", "workflow_step")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)


class SpecialistInvitationDetailView(generics.RetrieveDestroyAPIView):
    """GET/DELETE /api/specialist-invitations/{id}/
    Revoke (DELETE) or retrieve an invitation.
    """
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = SpecialistInvitationSerializer
    queryset = SpecialistInvitation.objects.all()

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def destroy(self, request, *args, **kwargs):
        invitation = self.get_object()
        if invitation.status not in (SpecialistInvitationStatus.PENDING,):
            return Response(
                {"detail": "Only pending invitations can be revoked."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invitation.status = SpecialistInvitationStatus.REVOKED
        invitation.save(update_fields=["status", "updated_at"])
        return api_success(data={"detail": "Invitation revoked."})


class SpecialistInvitationResendView(generics.GenericAPIView):
    """POST /api/specialist-invitations/{id}/resend/"""
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk=None):
        try:
            invitation = SpecialistInvitation.objects.get(pk=pk)
        except SpecialistInvitation.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if invitation.status not in (SpecialistInvitationStatus.PENDING,):
            return Response(
                {"detail": "Only pending invitations can be resent."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            _send_specialist_invite_email(invitation, request)
        except Exception as exc:
            return Response({"detail": f"Email failed: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return api_success(data={"detail": "Invitation resent."})


class SpecialistInvitationTokenView(generics.RetrieveAPIView):
    """GET /api/specialist-invite/{token}/  — public, no auth required.
    Returns enough context for the landing page.
    """
    permission_classes = [AllowAny]  # public on purpose: the unguessable token is the key
    authentication_classes = []
    throttle_classes = [IPRateThrottle]

    def get(self, request, token=None):
        from django.utils import timezone
        try:
            invitation = SpecialistInvitation.objects.select_related(
                "submission__program", "invited_by", "workflow_step"
            ).get(token=token)
        except SpecialistInvitation.DoesNotExist:
            return Response({"detail": "Invalid or expired invitation link."}, status=status.HTTP_404_NOT_FOUND)

        if invitation.status == SpecialistInvitationStatus.REVOKED:
            return Response({"detail": "This invitation has been revoked."}, status=status.HTTP_410_GONE)
        if invitation.is_expired and invitation.status == SpecialistInvitationStatus.PENDING:
            invitation.status = SpecialistInvitationStatus.EXPIRED
            invitation.save(update_fields=["status", "updated_at"])

        return api_success(data={
            "id": str(invitation.id),
            "status": invitation.status,
            "invitee_name": invitation.invitee_name,
            "invitee_email": invitation.invitee_email,
            "message": invitation.message,
            "invited_by_name": invitation.invited_by.full_name if invitation.invited_by else "",
            "submission_id": str(invitation.submission_id),
            "submission_title": invitation.submission.title,
            "program_title": invitation.submission.program.title if invitation.submission.program else "",
            "workflow_step_name": invitation.workflow_step.name if invitation.workflow_step else "",
            "required_review_count": invitation.required_review_count,
            "expires_at": invitation.expires_at.isoformat(),
            "is_expired": invitation.is_expired,
            # R-50 (1.15)
            "can_decline": invitation.status == SpecialistInvitationStatus.PENDING and not invitation.is_expired,
            "declined": invitation.status == SpecialistInvitationStatus.DECLINED,
        })


class SpecialistInvitationClaimView(generics.GenericAPIView):
    """POST /api/specialist-invite/{token}/claim/
    Authenticated specialist claims the invitation → creates Assignment.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, token=None):
        from django.utils import timezone
        from apps.assignments.services import AssignmentService
        from apps.core.constants import AssignmentRoleType

        try:
            invitation = SpecialistInvitation.objects.select_related(
                "submission", "workflow_step"
            ).get(token=token)
        except SpecialistInvitation.DoesNotExist:
            return Response({"detail": "Invalid invitation link."}, status=status.HTTP_404_NOT_FOUND)

        if invitation.status == SpecialistInvitationStatus.REVOKED:
            return Response({"detail": "This invitation has been revoked."}, status=status.HTTP_410_GONE)
        if invitation.is_expired:
            invitation.status = SpecialistInvitationStatus.EXPIRED
            invitation.save(update_fields=["status", "updated_at"])
            return Response({"detail": "This invitation has expired."}, status=status.HTTP_410_GONE)
        if invitation.status == SpecialistInvitationStatus.ACCEPTED:
            return api_success(data={
                "detail": "Already accepted.",
                "assignment_id": str(invitation.assignment_id) if invitation.assignment_id else None,
                "submission_id": str(invitation.submission_id),
            })

        accepted_count = SpecialistInvitation.objects.filter(
            submission=invitation.submission,
            workflow_step=invitation.workflow_step,
            status=SpecialistInvitationStatus.ACCEPTED,
        ).exclude(pk=invitation.pk).count()
        required_review_count = max(1, invitation.required_review_count or 1)
        if accepted_count >= required_review_count:
            return Response(
                {"detail": "The required number of specialists has already accepted this invitation."},
                status=status.HTTP_409_CONFLICT,
            )

        if invitation.status != SpecialistInvitationStatus.PENDING:
            return Response(
                {"detail": "This invitation is no longer valid."},
                status=status.HTTP_410_GONE,
            )

        user = request.user

        from apps.assignments.models import Assignment, AssignmentStatus
        existing = Assignment.objects.filter(
            submission=invitation.submission,
            assignee=user,
            role_type=AssignmentRoleType.SPECIALIST,
        ).exclude(status=AssignmentStatus.DECLINED).first()
        if existing:
            invitation.status = SpecialistInvitationStatus.ACCEPTED
            invitation.accepted_by = user
            invitation.assignment = existing
            invitation.save(update_fields=["status", "accepted_by", "assignment", "updated_at"])
            return api_success(data={
                "detail": "Invitation accepted.",
                "assignment_id": str(existing.id),
                "submission_id": str(invitation.submission_id),
            })

        from apps.core.constants import RoleType
        from django.apps import apps as django_apps
        Role = django_apps.get_model("accounts", "Role")
        UserRole = django_apps.get_model("accounts", "UserRole")
        specialist_role, _ = Role.objects.get_or_create(
            code=RoleType.SPECIALIST,
            defaults={"name": "Specialist"},
        )
        UserRole.objects.get_or_create(user=user, role=specialist_role, defaults={"is_active": True})

        try:
            assignment = AssignmentService.create_assignment(
                submission=invitation.submission,
                assignee=user,
                role_type=AssignmentRoleType.SPECIALIST,
                assigned_by=invitation.invited_by,
                deadline=None,
            )
        except DRFValidationError:
            return Response(
                {
                    "detail": (
                        "This invitation can't be accepted because the entry is no longer at a step that takes specialist reviews. "
                        "Please contact the person who invited you."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.status = SpecialistInvitationStatus.ACCEPTED
        invitation.accepted_by = user
        invitation.assignment = assignment
        invitation.save(update_fields=["status", "accepted_by", "assignment", "updated_at"])

        accepted_count += 1
        if accepted_count >= required_review_count:
            SpecialistInvitation.objects.filter(
                submission=invitation.submission,
                workflow_step=invitation.workflow_step,
                status=SpecialistInvitationStatus.PENDING,
            ).exclude(pk=invitation.pk).update(status=SpecialistInvitationStatus.REVOKED)

        return api_success(data={
            "detail": "Invitation accepted.",
            "assignment_id": str(assignment.id),
            "submission_id": str(invitation.submission_id),
        })


def _send_specialist_invite_email(invitation, request):
    from django.conf import settings as django_settings
    from apps.communications.email_notifications import EmailNotificationService

    public_url = getattr(django_settings, "PUBLIC_BASE_URL", "").rstrip("/")
    invite_url = f"{public_url}/specialist-invite/{invitation.token}"
    inviter_name = invitation.invited_by.full_name if invitation.invited_by else "The CEDA Innovation Team"
    submission_title = invitation.submission.title
    program_title = getattr(invitation.submission.program, "title", "")
    expiry = invitation.expires_at.strftime("%d %B %Y")

    summary_items = [
        {"label": "Invited by", "value": inviter_name},
        {"label": "Submission", "value": submission_title},
        {"label": "Required specialist reviews", "value": str(invitation.required_review_count)},
    ]
    if program_title:
        summary_items.append({"label": "Programme", "value": program_title})
    summary_items.append({"label": "Link expires", "value": expiry})
    if invitation.message:
        summary_items.append({"label": "Message", "value": invitation.message})

    context = EmailNotificationService._base_context(
        preheader=f"You have been invited to review a submission on the CEDA Innovation Portal.",
        headline="Review invitation",
        intro=f"Dear {invitation.invitee_name}, {inviter_name} has invited you to review a submission on the CEDA Innovation Portal. Click the button below to view and accept your invitation.",
        action_label="View & Accept Invitation",
        action_url=invite_url,
        fallback_label="View invitation",
        fallback_url=invite_url,
        summary_items=summary_items,
    )
    EmailNotificationService._send(
        to_email=invitation.invitee_email,
        to_name=invitation.invitee_name or invitation.invitee_email,
        subject=f"Invitation to review: {submission_title}",
        template_name="notification_generic",
        context=context,
    )


class SpecialistInvitationDeclineView(generics.GenericAPIView):
    """R-50: decline a specialist invitation from the link. No sign-in: the unguessable token is the key."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPRateThrottle]

    @extend_schema(tags=["Assignments"], summary="Decline a specialist invitation (1.15)", description="{reason?} up to 500 characters. Tells the person who invited.")
    def post(self, request, token=None):
        from apps.notifications.services import NotificationService

        invitation = SpecialistInvitation.objects.select_related("invited_by", "submission").filter(token=token).first()
        if invitation is None:
            return Response({"detail": "Invalid invitation link."}, status=status.HTTP_404_NOT_FOUND)
        if invitation.status == SpecialistInvitationStatus.DECLINED:
            return api_success(data={"declined": True})
        if invitation.status != SpecialistInvitationStatus.PENDING or invitation.is_expired:
            raise DRFValidationError({"detail": "This invitation can no longer be declined."})
        reason = str(request.data.get("reason") or "").strip()
        if len(reason) > 500:
            raise DRFValidationError({"reason": "Keep it to 500 characters."})
        invitation.status = SpecialistInvitationStatus.DECLINED
        invitation.decline_reason = reason
        invitation.save(update_fields=["status", "decline_reason", "updated_at"])
        AuditService.log_action(actor=None, action_type="specialist_invitation_declined", target=invitation, metadata={"reason": reason})
        if invitation.invited_by is not None:
            text = f"{invitation.invitee_name} will not review {invitation.submission.title}." + (f" Reason: {reason}" if reason else "")
            NotificationService.notify(user=invitation.invited_by, notification_type="specialist_invitation_declined", title="An invitation was declined", message=text)
        return api_success(data={"declined": True}, message="Thank you for letting us know.")

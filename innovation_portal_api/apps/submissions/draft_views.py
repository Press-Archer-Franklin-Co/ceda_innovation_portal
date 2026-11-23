"""Draft endpoints at /api/drafts/, for signed-in owners and for guests with a resume token."""
from __future__ import annotations

import ipaddress

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated

from apps.submissions import openapi as docs
from apps.accounts.services import UserVerificationService
from apps.core.api import api_success
from apps.core.i18n import resolve_request_language
from apps.core.permissions import IPRateThrottle
from apps.platform_config.flags import require_feature
from apps.programs.access import ProgramAccessService
from apps.programs.general_idea import FORM_NOT_READY, GeneralIdeaProgram, form_ready
from apps.submissions.draft_services import _UNSET, ApplicationDraftService
from apps.submissions.intake import (
    DRAFT_TOKEN_HEADER,
    DraftClaimService,
    DraftStepService,
    DraftTokenService,
    GuestDraftService,
    IdeaSubmitService,
    QuickStartService,
    submission_type_for,
)
from apps.submissions.models import ApplicationDraft
from apps.submissions.serializers import (
    ApplicationDraftSerializer,
    DraftPhoneVerifySerializer,
    DraftStepSerializer,
    DraftSubmitSerializer,
    QuickStartResponseSerializer,
    QuickStartSerializer,
    SubmissionSerializer,
)

# Actions a guest may use with the X-Draft-Token header instead of signing in.
GUEST_ACTIONS = frozenset({"retrieve", "update", "partial_update", "steps", "submit", "verify_phone"})

DRAFT_TOKEN_PARAMETER = OpenApiParameter(
    name=DRAFT_TOKEN_HEADER,
    type=str,
    location=OpenApiParameter.HEADER,
    required=False,
    description="Resume token from quick start, for guest drafts (instead of signing in).",
)


def client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    raw = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


class QuickStartThrottle(IPRateThrottle):
    scope = "draft_quick_start"


class DraftAccess(BasePermission):
    """Signed in, or (for GUEST_ACTIONS) carrying a resume token; the object check is in get_object."""

    def has_permission(self, request, view):
        if view.action == "quick_start":
            return True
        if request.user and request.user.is_authenticated:
            return True
        if view.action in GUEST_ACTIONS and DraftTokenService.token_from_request(request):
            return True
        raise NotAuthenticated()


@extend_schema_view(
    list=extend_schema(tags=["Drafts"], summary="List my drafts"),
    retrieve=extend_schema(tags=["Drafts"], summary="Retrieve a draft (owner or resume token)", parameters=[DRAFT_TOKEN_PARAMETER]),
    create=extend_schema(tags=["Drafts"], summary="Create a draft (without a programme it goes to General ideas)"),
    update=extend_schema(tags=["Drafts"], summary="Update a draft (owner or resume token)", parameters=[DRAFT_TOKEN_PARAMETER]),
    partial_update=extend_schema(tags=["Drafts"], summary="Partially update a draft (owner or resume token)", parameters=[DRAFT_TOKEN_PARAMETER]),
)
class ApplicationDraftViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationDraftSerializer
    permission_classes = [DraftAccess]
    search_fields = ("title", "reference_number", "program__title")
    filterset_fields = ("program", "submission_type", "status")

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return ApplicationDraft.objects.none()
        return ApplicationDraft.objects.filter(innovator=self.request.user).select_related("program", "sector")

    def get_throttles(self):
        if self.action == "quick_start":
            return [QuickStartThrottle()]
        return super().get_throttles()

    def get_object(self):
        pk = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        user = self.request.user
        try:
            if user.is_authenticated:
                draft = ApplicationDraft.objects.filter(id=pk, innovator=user).select_related("program__program_type", "sector").first()
                if draft:
                    return draft
            token = DraftTokenService.token_from_request(self.request)
            if token and self.action in GUEST_ACTIONS:
                draft = DraftTokenService.guest_draft(token, pk)
                if draft:
                    return draft
                raise PermissionDenied({"code": "draft_token_invalid", "detail": "This link to your idea is not valid any more. Sign in to continue."})
        except (DjangoValidationError, ValueError):
            pass
        raise Http404

    # Owner create/update ---------------------------------------------------

    def perform_create(self, serializer):
        UserVerificationService.assert_verified(user=self.request.user, reason="draft_create")
        data = serializer.validated_data
        program = data.get("program") or GeneralIdeaProgram.get()
        # Who may enter and when come first, so people get the audience, dates or limit reason before the form one.
        ProgramAccessService.assert_can_enter(program, self.request.user)
        if not program.is_general_intake and not form_ready(program):
            raise ValidationError({"program": {"code": "form_not_ready", "detail": FORM_NOT_READY}})
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=self.request.user,
            submission_type=data.get("submission_type") or submission_type_for(program),
            title=data["title"],
            draft_data=data.get("draft_data") or {},
            team=data.get("team"),
            current_section_code=data.get("current_section_code", ""),
            metadata=data.get("metadata"),
            sector=data["sector"] if "sector" in data else _UNSET,
        )
        serializer.instance = draft

    def perform_update(self, serializer):
        instance = serializer.instance
        data = serializer.validated_data
        if instance.innovator_id is None:
            serializer.instance = GuestDraftService.update(draft=instance, data=data)
            return
        UserVerificationService.assert_verified(user=self.request.user, reason="draft_update")
        updated = ApplicationDraftService.save_draft(
            program=data.get("program", instance.program),
            innovator=self.request.user,
            submission_type=data.get("submission_type", instance.submission_type),
            title=data.get("title", instance.title),
            draft_data=data.get("draft_data", instance.draft_data),
            team=data.get("team", instance.team),
            draft=instance,
            current_section_code=data.get("current_section_code", instance.current_section_code),
            metadata=data.get("metadata", instance.metadata),
            sector=data["sector"] if "sector" in data else _UNSET,
        )
        serializer.instance = updated

    # Guest quick start -------------------------------------------------------

    @extend_schema(
        tags=["Drafts"],
        summary="Start an idea without signing in (screens 1.1, 1.2)",
        request=QuickStartSerializer,
        responses={201: docs.QUICK_START},
    )
    @action(detail=False, methods=["post"], url_path="quick-start", permission_classes=[AllowAny], authentication_classes=[])
    def quick_start(self, request):
        require_feature("guest_quick_start")
        serializer = QuickStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft, token = QuickStartService.start(
            title=serializer.validated_data["title"],
            sector=serializer.validated_data.get("sector"),
            program_id=serializer.validated_data.get("program_id"),
            ip_address=client_ip(request),
        )
        return api_success(
            data={"draft_id": str(draft.id), "resume_token": token, "expires_in": DraftTokenService.max_age()},
            status_code=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=["Drafts"], summary="Attach a guest draft to my account after signing in", request=None, parameters=[DRAFT_TOKEN_PARAMETER], responses=docs.DRAFT)
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def claim(self, request, pk=None):
        token = DraftTokenService.token_from_request(request)
        if not token:
            raise PermissionDenied({"code": "draft_token_required", "detail": f"Send the resume token in the {DRAFT_TOKEN_HEADER} header."})
        try:
            draft = DraftTokenService.guest_draft(token, pk)
        except (DjangoValidationError, ValueError):
            draft = None
        if draft is None:
            raise PermissionDenied({"code": "draft_token_invalid", "detail": "This idea cannot be claimed with this link."})
        draft = DraftClaimService.claim(draft=draft, user=request.user)
        return api_success(data=ApplicationDraftSerializer(draft, context={"request": request}).data)

    @extend_schema(tags=["Drafts"], summary="Confirm a guest's phone with a sign-in code, without creating an account", request=DraftPhoneVerifySerializer, parameters=[DRAFT_TOKEN_PARAMETER], responses=docs.DRAFT)
    @action(detail=True, methods=["post"], url_path="verify-phone")
    def verify_phone(self, request, pk=None):
        draft = self.get_object()
        if draft.innovator_id:
            raise PermissionDenied({"code": "not_a_guest_draft", "detail": "This idea already belongs to an account."})
        serializer = DraftPhoneVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft = GuestDraftService.verify_phone(draft=draft, phone=serializer.validated_data["phone"], code=serializer.validated_data["code"])
        return api_success(data=ApplicationDraftSerializer(draft, context={"request": request}).data)

    # One step at a time ------------------------------------------------------

    @extend_schema(tags=["Drafts"], summary="Save and check one step of the form (screen 2.3)", request=DraftStepSerializer, parameters=[DRAFT_TOKEN_PARAMETER], responses=docs.STEP)
    @action(detail=True, methods=["put"], url_path=r"steps/(?P<section_code>[^/]+)")
    def steps(self, request, pk=None, section_code=None):
        draft = self.get_object()
        if draft.innovator_id:
            UserVerificationService.assert_verified(user=request.user, reason="draft_update")
        serializer = DraftStepSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = DraftStepService.save_step(
            draft=draft,
            section_code=section_code,
            answers=serializer.validated_data["answers"],
            actor=request.user if request.user.is_authenticated else None,
        )
        return api_success(data=result)

    # Submit ------------------------------------------------------------------

    @extend_schema(tags=["Drafts"], summary="Send the idea (owner or resume token)", description="Owners also get every field of the submission next to these.", request=DraftSubmitSerializer, parameters=[DRAFT_TOKEN_PARAMETER], responses=docs.SUBMIT)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        draft = self.get_object()
        serializer = DraftSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner = request.user if request.user.is_authenticated and draft.innovator_id == request.user.id else None
        if owner is not None:
            UserVerificationService.assert_verified(user=owner, reason="draft_submit")
        outcome = IdeaSubmitService.submit(
            draft=draft,
            user=owner,
            consent=serializer.validated_data["consent"],
            create_account=serializer.validated_data["create_account"],
            name=serializer.validated_data.get("name", ""),
            first_name=serializer.validated_data.get("first_name", ""),
            last_name=serializer.validated_data.get("last_name", ""),
            district=serializer.validated_data.get("district"),
            email=serializer.validated_data.get("email", ""),
            ip_address=client_ip(request),
        )
        payload = IdeaSubmitService.response_payload(outcome, lang=resolve_request_language(request))
        if owner is not None:
            payload = {**SubmissionSerializer(outcome.submission, context={"request": request}).data, **payload}
        return api_success(data=payload)

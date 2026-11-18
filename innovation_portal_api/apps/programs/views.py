from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, extend_schema_view

from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.permissions import IsOfficerOrAdmin
from apps.programs.access import ProgramAccessService
from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.models import ChallengeJudge, FieldValidationRule, FormSection, Program, ProgramStage, ProgramType, SubmissionForm, SubmissionFormField, SubmissionFormFieldOption, TermsAndConditions
from apps.programs.selectors import ProgramSelector
from apps.programs.serializers import (
    ChallengeJudgeSerializer,
    FieldValidationRuleSerializer,
    FormSectionSerializer,
    ProgramSerializer,
    ProgramTypeSerializer,
    ProgramStatusUpdateSerializer,
    ProgramStageSerializer,
    SubmissionFormFieldSerializer,
    SubmissionFormFieldOptionSerializer,
    SubmissionFormSerializer,
    TermsAndConditionsSerializer,
    TermsAndConditionsWriteSerializer,
)
from apps.submissions.serializers import SubmissionOutcomeSerializer
from apps.programs.services import ProgramService, SubmissionFormLifecycleService


@extend_schema_view(
    list=extend_schema(tags=["Programs"], summary="List programs"),
    retrieve=extend_schema(tags=["Programs"], summary="Retrieve program"),
    create=extend_schema(
        tags=["Programs"],
        summary="Create program",
        description="Creates an innovation call, challenge call, or hackathon program.",
        examples=[
            OpenApiExample(
                "Program create payload",
                value={
                    "title": "CEDA Youth Enterprise Hackathon 2026",
                    "description": "Hackathon for practical digital innovation solutions.",
                    "program_type_id": "11111111-1111-1111-1111-111111111111",
                    "opening_date": "2026-04-01T08:00:00Z",
                    "closing_date": "2026-04-30T23:59:00Z",
                    "allow_team_submission": True,
                    "allow_individual_submission": False,
                    "is_public": False,
                    "max_team_size": 6,
                },
                request_only=True,
            )
        ],
    ),
    update=extend_schema(tags=["Programs"], summary="Update program"),
    partial_update=extend_schema(tags=["Programs"], summary="Partially update program"),
)
class ProgramViewSet(viewsets.ModelViewSet):
    serializer_class = ProgramSerializer
    filterset_fields = ("status", "program_type")
    search_fields = ("title", "description")

    def get_permissions(self):
        if self.action in {"public", "retrieve", "form", "availability"}:
            return [AllowAny()]
        return [IsOfficerOrAdmin()]

    def get_queryset(self):
        user = self.request.user
        if self.action == "public":
            return ProgramSelector.public_programs(user)
        if user.is_authenticated:
            queryset = Program.objects.select_related("program_type", "owner").all()
            if IsOfficerOrAdmin().has_permission(self.request, self):
                return queryset
            return ProgramAccessService.exclude_hidden(queryset, user)
        return ProgramSelector.public_programs(user)

    def perform_create(self, serializer):
        program = serializer.save()
        ChallengeJudgingService.sync_workflow(program, actor=self.request.user)
        AuditService.log_action(actor=self.request.user, action_type="program_created", target=program, after_state={"status": program.status})

    def perform_update(self, serializer):
        program = serializer.save()
        ChallengeJudgingService.sync_workflow(program, actor=self.request.user)
        AuditService.log_action(actor=self.request.user, action_type="program_updated", target=program, after_state={"status": program.status})

    @action(detail=True, methods=["get", "post"], url_path="judges")
    @extend_schema(tags=["Programs"], summary="List or add innovation challenge judges")
    def judges(self, request, pk=None):
        program = self.get_object()
        if request.method == "GET":
            return Response(ChallengeJudgeSerializer(program.challenge_judges.all(), many=True).data)
        serializer = ChallengeJudgeSerializer(data=request.data, context={"program": program})
        serializer.is_valid(raise_exception=True)
        judge = serializer.save(program=program)
        ChallengeJudgingService.sync_workflow(program, actor=request.user)
        AuditService.log_action(actor=request.user, action_type="challenge_judge_added", target=program, metadata={"judge_email": judge.email})
        return Response(ChallengeJudgeSerializer(judge).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"judges/(?P<judge_id>[^/.]+)")
    @extend_schema(tags=["Programs"], summary="Remove an innovation challenge judge")
    def remove_judge(self, request, pk=None, judge_id=None):
        program = self.get_object()
        judge = get_object_or_404(ChallengeJudge, id=judge_id, program=program)
        judge.delete()
        ChallengeJudgingService.sync_workflow(program, actor=request.user)
        AuditService.log_action(actor=request.user, action_type="challenge_judge_removed", target=program, metadata={"judge_email": judge.email})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    @extend_schema(tags=["Programs"], summary="List public programs")
    def public(self, request):
        serializer = self.get_serializer(ProgramSelector.public_programs(request.user), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    @extend_schema(tags=["Programs"], summary="Publish program")
    def publish(self, request, pk=None):
        program = ProgramService.publish(self.get_object(), request.user)
        return Response(self.get_serializer(program).data)

    @action(detail=True, methods=["post"])
    @extend_schema(tags=["Programs"], summary="Close program")
    def close(self, request, pk=None):
        program = ProgramService.close(self.get_object(), request.user)
        return Response(self.get_serializer(program).data)

    @action(detail=True, methods=["post"])
    @extend_schema(tags=["Programs"], summary="Unpublish program")
    def unpublish(self, request, pk=None):
        program = ProgramService.unpublish(self.get_object(), request.user)
        return Response(self.get_serializer(program).data)

    @action(detail=True, methods=["post"], url_path="set-status")
    @extend_schema(tags=["Programs"], summary="Set program status")
    def set_status(self, request, pk=None):
        serializer = ProgramStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        program = ProgramService.set_status(self.get_object(), serializer.validated_data["status"], request.user)
        return Response(self.get_serializer(program).data)

    @action(detail=True, methods=["get", "post"], url_path="stages")
    @extend_schema(tags=["Programs"], summary="List or create program stages")
    def stages(self, request, pk=None):
        program = self.get_object()
        if request.method == "GET":
            return Response(ProgramStageSerializer(program.stages.all(), many=True).data)
        serializer = ProgramStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(program=program)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="form")
    @extend_schema(tags=["Programs"], summary="Get program submission form")
    def form(self, request, pk=None):
        program = self.get_object()
        form = getattr(program, "submission_form", None)
        if not form:
            return Response({"detail": "This program does not have a submission form configured."}, status=404)
        return Response(SubmissionFormSerializer(form).data)

    @action(detail=True, methods=["post"], url_path="form-fields")
    @extend_schema(
        tags=["Programs"],
        summary="Create submission form field",
        description="Adds a configurable field to the program submission form.",
    )
    def form_fields(self, request, pk=None):
        program = self.get_object()
        form, _ = SubmissionForm.objects.get_or_create(program=program, defaults={"title": f"{program.title} Submission Form"})
        serializer = SubmissionFormFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(form=form)
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_field_created")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="form-sections")
    @extend_schema(tags=["Programs"], summary="List or create submission form sections")
    def form_sections(self, request, pk=None):
        program = self.get_object()
        form, _ = SubmissionForm.objects.get_or_create(program=program, defaults={"title": f"{program.title} Submission Form"})
        if request.method == "GET":
            return Response(FormSectionSerializer(form.sections.all(), many=True).data)
        serializer = FormSectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(form=form)
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_section_created")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path=r"form-fields/(?P<field_id>[^/.]+)/rules")
    @extend_schema(tags=["Programs"], summary="Create field validation rule")
    def field_rules(self, request, pk=None, field_id=None):
        program = self.get_object()
        field = program.submission_form.fields.get(id=field_id)
        serializer = FieldValidationRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(field=field)
        SubmissionFormLifecycleService.bump_version(program.submission_form, actor=request.user, reason="form_rule_created")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="availability")
    @extend_schema(tags=["Programs"], summary="Get program submission and evaluation window availability")
    def availability(self, request, pk=None):
        return Response(self.get_object().availability_summary())

    @action(detail=True, methods=["get"], url_path="outcomes")
    @extend_schema(tags=["Programs"], summary="List submission outcomes for a program")
    def outcomes(self, request, pk=None):
        program = self.get_object()
        queryset = program.submission_outcomes.select_related("submission", "decided_by", "decision_step").all()
        return api_success(data=SubmissionOutcomeSerializer(queryset, many=True).data)


class FormSectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = FormSection.objects.select_related("form", "form__program").all()
    serializer_class = FormSectionSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        SubmissionFormLifecycleService.bump_version(serializer.instance.form, actor=request.user, reason="form_section_updated")
        return api_success(data=serializer.data)

    def destroy(self, request, *args, **kwargs):
        form = self.get_object().form
        self.get_object().delete()
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_section_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormSectionFieldListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = SubmissionFormFieldSerializer

    def get_queryset(self):
        return SubmissionFormField.objects.filter(section_id=self.kwargs["section_id"]).select_related("section", "form")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        section = FormSection.objects.get(id=self.kwargs["section_id"])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(form=section.form, section=section)
        SubmissionFormLifecycleService.bump_version(section.form, actor=request.user, reason="form_field_created")
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)


class FormFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = SubmissionFormField.objects.select_related("form", "section").all()
    serializer_class = SubmissionFormFieldSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        SubmissionFormLifecycleService.bump_version(serializer.instance.form, actor=request.user, reason="form_field_updated")
        return api_success(data=serializer.data)

    def destroy(self, request, *args, **kwargs):
        field = self.get_object()
        form = field.form
        field.delete()
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_field_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldOptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = SubmissionFormFieldOption.objects.select_related("field").all()
    serializer_class = SubmissionFormFieldOptionSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        SubmissionFormLifecycleService.bump_version(serializer.instance.field.form, actor=request.user, reason="form_option_updated")
        return api_success(data=serializer.data)

    def destroy(self, request, *args, **kwargs):
        option = self.get_object()
        form = option.field.form
        option.delete()
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_option_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = FieldValidationRule.objects.select_related("field").all()
    serializer_class = FieldValidationRuleSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        SubmissionFormLifecycleService.bump_version(serializer.instance.field.form, actor=request.user, reason="form_rule_updated")
        return api_success(data=serializer.data)

    def destroy(self, request, *args, **kwargs):
        rule = self.get_object()
        form = rule.field.form
        rule.delete()
        SubmissionFormLifecycleService.bump_version(form, actor=request.user, reason="form_rule_deleted")
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldOptionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = SubmissionFormFieldOptionSerializer

    def get_queryset(self):
        return SubmissionFormFieldOption.objects.filter(field_id=self.kwargs["field_id"]).order_by("ordering")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        field = SubmissionFormField.objects.get(id=self.kwargs["field_id"])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(field=field)
        SubmissionFormLifecycleService.bump_version(field.form, actor=request.user, reason="form_option_created")
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)


class FormFieldRuleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FieldValidationRuleSerializer

    def get_queryset(self):
        return FieldValidationRule.objects.filter(field_id=self.kwargs["field_id"]).order_by("rule_type")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        field = SubmissionFormField.objects.get(id=self.kwargs["field_id"])
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(field=field)
        SubmissionFormLifecycleService.bump_version(field.form, actor=request.user, reason="form_rule_created")
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)


class TermsAndConditionsViewSet(viewsets.ModelViewSet):
    """CRUD for Terms & Conditions documents. Supports PDF file upload or external URL."""
    permission_classes = [IsOfficerOrAdmin]
    queryset = TermsAndConditions.objects.all().order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method in ('POST', 'PUT', 'PATCH'):
            return TermsAndConditionsWriteSerializer
        return TermsAndConditionsSerializer

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return api_success(data=TermsAndConditionsSerializer(instance).data, status_code=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return api_success(data=TermsAndConditionsSerializer(instance).data)


class ProgramTypeListView(generics.ListAPIView):
    """GET /api/programs/types/ — all program types, staff only."""
    serializer_class = ProgramTypeSerializer
    permission_classes = [IsOfficerOrAdmin]
    queryset = ProgramType.objects.all().order_by("name")


class ChallengeJudgeInviteView(generics.GenericAPIView):
    """GET: details for a judging invitation link (no sign-in needed).
    POST: the signed-in invitee accepts, gets every entry assigned and is sent to their marking list."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, token=None):
        judge = get_object_or_404(ChallengeJudge.objects.select_related("program"), token=token)
        program = judge.program
        return api_success(data={
            "name": judge.name,
            "email": judge.email,
            "program_title": program.title,
            "marking_closes_at": program.marking_closes_at,
            "accepted": bool(judge.accepted_at),
            "marking_closed": bool(program.marking_closes_at and timezone.now() > program.marking_closes_at),
        })

    def post(self, request, token=None):
        judge = ChallengeJudgingService.accept_invitation(token, request.user)
        return api_success(data={"accepted": True, "program_title": judge.program.title, "next": "/staff/assignments"})

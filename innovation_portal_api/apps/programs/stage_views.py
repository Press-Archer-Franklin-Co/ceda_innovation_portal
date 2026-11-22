"""R-48 (3.6c): stages of a challenge for the challenge builder."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.permissions import HasCapability
from apps.programs import stage_settings
from apps.programs.models import Program
from apps.programs.serializers import ProgramStageSerializer

TAGS = ["Programs"]
SHAPE = (
    "{workflow: {id, name, step_count} | null, stages: [{step_id, order, name, form: {id, title, version} | null, opens_at, closes_at, "
    "takes_part: all|shortlisted, moves_on: {kind: automatic|officer|manager|panel_score, pass_mark?}, notify_applicants, reviewers_label}]}"
)


class MovesOnSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=stage_settings.MOVES_ON)
    pass_mark = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True)


class StageUpdateSerializer(serializers.Serializer):
    form = serializers.UUIDField(required=False, allow_null=True, help_text="A published form for this stage, or null.")
    opens_at = serializers.DateTimeField(required=False, allow_null=True)
    closes_at = serializers.DateTimeField(required=False, allow_null=True)
    takes_part = serializers.ChoiceField(choices=stage_settings.TAKES_PART, required=False)
    moves_on = MovesOnSerializer(required=False)
    notify_applicants = serializers.BooleanField(required=False)


class ProgramStagesView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(tags=TAGS, summary="The challenge's stages (3.6c)", description=f"{SHAPE}. The workflow's active steps, in its order.", responses=OpenApiTypes.OBJECT)
    def get(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        return api_success(data=stage_settings.stages(program))

    @extend_schema(tags=TAGS, summary="Add a stage description (timeline text)", request=ProgramStageSerializer, responses=ProgramStageSerializer)
    def post(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = ProgramStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(program=program)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProgramStageDetailView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Change one stage (3.6c)",
        description="Any of form, opens_at, closes_at, takes_part, moves_on, notify_applicants. Answers the stage as in the list. "
        "A panel_score pass mark on the judging step is also the challenge's pass mark.",
        request=StageUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def patch(self, request, program_id, step_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = StageUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return api_success(data=stage_settings.update_stage(program, step_id, serializer.validated_data, actor=request.user))

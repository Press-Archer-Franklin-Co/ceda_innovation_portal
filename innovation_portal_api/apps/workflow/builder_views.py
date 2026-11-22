"""R-48 endpoints: workflow templates (3.21a), step panel settings (3.21), staff teams and the board (3.22)."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.views import APIView

from apps.assignments.models import ReviewPanel
from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.permissions import IsOfficerOrAdmin
from apps.workflow import builder
from apps.workflow.models import WorkflowStep

TAGS = ["Workflow builder (R-48)"]


class WorkflowTemplatesView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=TAGS, summary="Workflow templates (3.21a)", description="[{code, name, description, step_count, steps: [{name, code, order}]}]", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=builder.templates())


class WhoHasItSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=builder.WHO_MODES)
    role = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    team_id = serializers.UUIDField(required=False, allow_null=True)
    people = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)


class DutiesSerializer(serializers.Serializer):
    conflict_first = serializers.BooleanField(required=False)
    comment_every_criterion = serializers.BooleanField(required=False)
    see_other_scores = serializers.BooleanField(required=False)


class NextStepSerializer(serializers.Serializer):
    when = serializers.CharField(max_length=120, help_text='For example "score>=60", "approved" or "always".')
    to_step = serializers.UUIDField()


class StepSettingsSerializer(serializers.Serializer):
    who_has_it = WhoHasItSerializer(required=False)
    judges_per_idea = serializers.IntegerField(min_value=1, max_value=20, required=False)
    share_out = serializers.ChoiceField(choices=builder.SHARE_OUT, required=False)
    duties = DutiesSerializer(required=False)
    buttons = serializers.ListField(child=serializers.CharField(max_length=80), required=False)
    marking_criteria = serializers.UUIDField(required=False, allow_null=True)
    pass_mark = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True)
    time_limit_days = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=0, max_value=365, required=False)
    reminder_after_days = serializers.IntegerField(min_value=0, max_value=365, required=False, allow_null=True)
    next_steps = NextStepSerializer(many=True, required=False)


STEP_SHAPE = (
    "{step_id, name, who_has_it: {mode: role|team|people, role, team_id, people}, judges_per_idea, share_out: take_turns|least_busy|everyone, "
    "duties: {conflict_first, comment_every_criterion, see_other_scores}, buttons, marking_criteria, pass_mark, time_limit_days, "
    "reminder_after_days, next_steps: [{when, to_step}]}"
)


class WorkflowStepSettingsView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=TAGS, summary="Step panel settings (3.21)", description=STEP_SHAPE, responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        return api_success(data=builder.step_settings(get_object_or_404(WorkflowStep, pk=pk)))

    @extend_schema(tags=TAGS, summary="Change step panel settings (3.21)", description=f"Any part of {STEP_SHAPE}.", request=StepSettingsSerializer, responses=OpenApiTypes.OBJECT)
    def patch(self, request, pk):
        step = get_object_or_404(WorkflowStep.objects.select_related("workflow_definition"), pk=pk)
        serializer = StepSettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "time_limit_days" in data:
            data["time_limit_days"] = float(data["time_limit_days"])
        return api_success(data=builder.save_step_settings(step, data, actor=request.user))


class StaffTeamSerializer(serializers.ModelSerializer):
    members = serializers.PrimaryKeyRelatedField(many=True, required=False, queryset=ReviewPanel.members.rel.model.objects.filter(is_active=True))
    member_count = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()

    class Meta:
        model = ReviewPanel
        fields = ("id", "name", "description", "program", "members", "member_count", "label", "is_active")

    def get_member_count(self, obj) -> int:
        return obj.members.count()

    def get_label(self, obj) -> str:
        count = obj.members.count()
        return f"{obj.name} ({count} {'person' if count == 1 else 'people'})"


def _team_state(team) -> dict:
    return {"name": team.name, "members": sorted(str(item) for item in team.members.values_list("id", flat=True)), "is_active": team.is_active}


class StaffTeamListView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=TAGS, summary="Staff teams", description="[{id, name, description, program, members, member_count, label, is_active}]", responses=StaffTeamSerializer(many=True))
    def get(self, request):
        teams = ReviewPanel.objects.prefetch_related("members")
        if request.query_params.get("program"):
            teams = teams.filter(program_id=request.query_params["program"]) | teams.filter(program__isnull=True)
        return api_success(data=StaffTeamSerializer(teams.distinct(), many=True).data)

    @extend_schema(tags=TAGS, summary="Add a staff team", request=StaffTeamSerializer, responses=StaffTeamSerializer)
    def post(self, request):
        serializer = StaffTeamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        team = serializer.save()
        AuditService.log_action(actor=request.user, action_type="staff_team_created", target=team, after_state=_team_state(team))
        return api_success(data=StaffTeamSerializer(team).data, status_code=status.HTTP_201_CREATED)


class StaffTeamDetailView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=TAGS, summary="Change a staff team", request=StaffTeamSerializer, responses=StaffTeamSerializer)
    def patch(self, request, pk):
        team = get_object_or_404(ReviewPanel, pk=pk)
        before = _team_state(team)
        serializer = StaffTeamSerializer(team, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        team = serializer.save()
        AuditService.log_action(actor=request.user, action_type="staff_team_updated", target=team, before_state=before, after_state=_team_state(team))
        return api_success(data=StaffTeamSerializer(team).data)

    @extend_schema(tags=TAGS, summary="Retire a staff team", description="Kept for history; it stops showing in pickers.", responses=StaffTeamSerializer)
    def delete(self, request, pk):
        team = get_object_or_404(ReviewPanel, pk=pk)
        team.is_active = False
        team.save(update_fields=["is_active", "updated_at"])
        AuditService.log_action(actor=request.user, action_type="staff_team_retired", target=team)
        return api_success(data=StaffTeamSerializer(team).data)

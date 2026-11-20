from rest_framework import serializers
from apps.programs.models import FormSection, Program, SubmissionForm, SubmissionFormField

from apps.workflow.models import (
    AssignmentInstance,
    AssignmentInstanceActionLog,
    AssignmentPolicy,
    NodeAction,
    NodeAssignmentBinding,
    NodeFormBinding,
    NodeInstance,
    TaskExecution,
    TransitionExecutionLog,
    WorkflowActionLog,
    WorkflowAuditLog,
    WorkflowDataEnvelope,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowNode,
    WorkflowRule,
    WorkflowStep,
    WorkflowTransition,
)


class WorkflowProgramSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ("id", "title", "slug", "status")


class WorkflowStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowStep
        fields = (
            "id",
            "name",
            "code",
            "order",
            "role_required",
            "actions_allowed",
            "submission_status",
            "execution_mode",
            "minimum_completions_required",
            "advance_automatically",
            "due_in_hours",
            "requires_assignment",
            "assignment_role",
            "minimum_assignments",
            "requires_evaluation",
            "minimum_evaluations",
            "evaluation_round",
            "is_active",
        )


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    steps = WorkflowStepSerializer(many=True, read_only=True)
    node_count = serializers.SerializerMethodField()
    transition_count = serializers.SerializerMethodField()
    program_detail = WorkflowProgramSummarySerializer(source="program", read_only=True)

    class Meta:
        model = WorkflowDefinition
        fields = (
            "id",
            "name",
            "code",
            "description",
            "workflow_type",
            "scope",
            "program",
            "program_detail",
            "status",
            "version",
            "is_current",
            "previous_version",
            "is_active",
            "published_at",
            "archived_at",
            "metadata_json",
            "node_count",
            "transition_count",
            "steps",
        )

    def get_node_count(self, obj):
        return obj.nodes.count()

    def get_transition_count(self, obj):
        return obj.transitions.count()


class WorkflowDefinitionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowDefinition
        fields = ("id", "name", "code", "description", "workflow_type", "scope", "program", "metadata_json")
        read_only_fields = ("id",)

    def validate_program(self, value):
        if value is None:
            raise serializers.ValidationError("A program is required for workflow definitions.")
        return value


class WorkflowStepWriteSerializer(serializers.ModelSerializer):
    workflow_definition = serializers.PrimaryKeyRelatedField(queryset=WorkflowDefinition.objects.all(), required=False)

    class Meta:
        model = WorkflowStep
        fields = (
            "id",
            "workflow_definition",
            "name",
            "code",
            "order",
            "role_required",
            "actions_allowed",
            "submission_status",
            "due_in_hours",
            "execution_mode",
            "minimum_completions_required",
            "requires_assignment",
            "assignment_role",
            "minimum_assignments",
            "requires_evaluation",
            "minimum_evaluations",
            "evaluation_round",
            "is_active",
        )
        validators = []


class WorkflowActionLogSerializer(serializers.ModelSerializer):
    step_name = serializers.CharField(source="step.name", read_only=True)
    performed_by_name = serializers.CharField(source="performed_by.full_name", read_only=True)

    class Meta:
        model = WorkflowActionLog
        fields = ("id", "action", "step", "step_name", "performed_by", "performed_by_name", "comment", "metadata", "timestamp")


class TaskExecutionSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    workflow_step_name = serializers.CharField(source="workflow_step.name", read_only=True)

    class Meta:
        model = TaskExecution
        fields = (
            "id",
            "workflow_instance",
            "workflow_step",
            "workflow_step_name",
            "assignment",
            "assignee",
            "assignee_name",
            "status",
            "due_at",
            "started_at",
            "completed_at",
            "outcome",
            "comment",
            "metadata",
        )


class WorkflowInstanceSerializer(serializers.ModelSerializer):
    current_step_detail = WorkflowStepSerializer(source="current_step", read_only=True)
    current_node_detail = serializers.SerializerMethodField()
    action_logs = WorkflowActionLogSerializer(many=True, read_only=True)
    tasks = TaskExecutionSerializer(many=True, read_only=True)
    node_instances = serializers.SerializerMethodField()
    transition_logs = serializers.SerializerMethodField()
    data_envelope = serializers.SerializerMethodField()
    assignment_instances = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowInstance
        fields = (
            "id",
            "workflow_definition",
            "workflow_definition_version",
            "entity_type",
            "entity_id",
            "current_step",
            "current_step_detail",
            "current_node",
            "current_node_detail",
            "status",
            "started_at",
            "completed_at",
            "action_logs",
            "tasks",
            "node_instances",
            "assignment_instances",
            "transition_logs",
            "data_envelope",
        )

    def get_current_node_detail(self, obj):
        return WorkflowNodeSerializer(obj.current_node).data if obj.current_node_id else None

    def get_node_instances(self, obj):
        return NodeInstanceSerializer(obj.node_instances.all(), many=True).data

    def get_transition_logs(self, obj):
        return TransitionExecutionLogSerializer(obj.transition_logs.all(), many=True).data

    def get_data_envelope(self, obj):
        return WorkflowDataEnvelopeSerializer(obj.data_envelope).data if hasattr(obj, "data_envelope") else None

    def get_assignment_instances(self, obj):
        assignments = AssignmentInstance.objects.filter(node_instance__workflow_instance=obj).select_related("node_instance__node", "assignee_user")
        return AssignmentInstanceSerializer(assignments, many=True).data


class WorkflowActionRequestSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=("approve", "reject", "return"))
    comment = serializers.CharField(required=False, allow_blank=True)


class WorkflowDefinitionActivationSerializer(serializers.Serializer):
    pass


class WorkflowDefinitionPublishSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class WorkflowDefinitionArchiveSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class WorkflowDefinitionCloneSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    comment = serializers.CharField(required=False, allow_blank=True)


class WorkflowDefinitionValidationSerializer(serializers.Serializer):
    valid = serializers.BooleanField()
    mode = serializers.CharField()
    errors = serializers.DictField()
    warnings = serializers.ListField(child=serializers.CharField())


class NodeActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = NodeAction
        fields = (
            "id",
            "node",
            "key",
            "label",
            "requires_comment",
            "requires_attachment",
            "is_terminal_action",
            "is_active",
            "metadata_json",
        )


class AssignmentPolicySerializer(serializers.ModelSerializer):
    fallback_policy_name = serializers.CharField(source="fallback_policy.name", read_only=True)

    class Meta:
        model = AssignmentPolicy
        fields = (
            "id",
            "name",
            "code",
            "policy_type",
            "config_json",
            "fallback_policy",
            "fallback_policy_name",
            "sla_hours",
            "escalation_policy",
            "is_active",
        )


class NodeAssignmentBindingSerializer(serializers.ModelSerializer):
    assignment_policy_name = serializers.CharField(source="assignment_policy.name", read_only=True)

    class Meta:
        model = NodeAssignmentBinding
        fields = (
            "id",
            "node",
            "assignment_policy",
            "assignment_policy_name",
            "minimum_assignees",
            "maximum_assignees",
            "execution_mode",
            "minimum_completions_required",
            "is_active",
            "metadata_json",
        )


class WorkflowFormFieldSerializer(serializers.ModelSerializer):
    form_section = serializers.PrimaryKeyRelatedField(source="section", queryset=FormSection.objects.all(), required=False)
    rules = serializers.SerializerMethodField()
    data_source_type = serializers.CharField(read_only=True)
    data_source_config = serializers.JSONField(read_only=True)
    validation_schema = serializers.JSONField(read_only=True)
    ui_schema = serializers.JSONField(read_only=True)
    order = serializers.IntegerField(read_only=True)

    class Meta:
        model = SubmissionFormField
        fields = (
            "id",
            "form_section",
            "key",
            "label",
            "field_type",
            "required",
            "default_value",
            "help_text",
            "data_source_type",
            "data_source_config",
            "validation_schema",
            "ui_schema",
            "order",
            "rules",
        )

    def get_rules(self, obj):
        return [
            {
                "id": str(rule.id),
                "rule_type": rule.rule_type,
                "expression": {"value": rule.rule_value},
                "priority": index + 1,
            }
            for index, rule in enumerate(obj.field_rules.filter(is_active=True).order_by("created_at"))
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["default_value"] = instance.default_value
        data["data_source_type"] = "static"
        data["data_source_config"] = {}
        data["validation_schema"] = instance.validation_rules
        data["ui_schema"] = {
            "placeholder": instance.placeholder,
            "example_value": instance.example_value,
            "media_config": instance.media_config,
            "visible_if": instance.visible_if,
            "required_if": instance.required_if,
            "enabled_if": instance.enabled_if,
        }
        data["order"] = instance.ordering
        return data


class WorkflowFormSectionSerializer(serializers.ModelSerializer):
    form_definition = serializers.PrimaryKeyRelatedField(source="form", queryset=SubmissionForm.objects.all(), required=False)
    fields = WorkflowFormFieldSerializer(many=True, read_only=True)
    order = serializers.IntegerField(read_only=True)

    class Meta:
        model = FormSection
        fields = ("id", "form_definition", "title", "code", "order", "description", "fields")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["order"] = instance.ordering
        return data


class WorkflowFormDefinitionSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="title")
    status = serializers.SerializerMethodField()
    program = serializers.CharField(source="program_id", read_only=True)
    program_title = serializers.CharField(source="program.title", read_only=True)
    metadata_json = serializers.JSONField(read_only=True)
    sections = WorkflowFormSectionSerializer(many=True, read_only=True)

    class Meta:
        model = SubmissionForm
        fields = ("id", "name", "code", "description", "status", "version", "program", "program_title", "metadata_json", "sections")

    def get_status(self, obj):
        return "published" if obj.active else "archived"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["metadata_json"] = {}
        return data


class NodeFormBindingSerializer(serializers.ModelSerializer):
    form_definition_name = serializers.CharField(source="form_definition.title", read_only=True)

    class Meta:
        model = NodeFormBinding
        fields = (
            "id",
            "node",
            "form_definition",
            "form_definition_name",
            "binding_type",
            "mode",
            "required_on_entry",
            "required_on_exit",
            "is_active",
            "metadata_json",
        )


class WorkflowNodeSerializer(serializers.ModelSerializer):
    actions = NodeActionSerializer(many=True, read_only=True)
    assignment_binding = NodeAssignmentBindingSerializer(read_only=True)
    form_bindings = NodeFormBindingSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowNode
        fields = (
            "id",
            "workflow_definition",
            "name",
            "code",
            "node_type",
            "description",
            "position_x",
            "position_y",
            "is_initial",
            "is_terminal",
            "is_active",
            "metadata_json",
            "actions",
            "assignment_binding",
            "form_bindings",
        )


class WorkflowNodeWriteSerializer(serializers.ModelSerializer):
    workflow_definition = serializers.PrimaryKeyRelatedField(queryset=WorkflowDefinition.objects.all(), required=False)

    class Meta:
        model = WorkflowNode
        fields = (
            "id",
            "workflow_definition",
            "name",
            "code",
            "node_type",
            "description",
            "position_x",
            "position_y",
            "is_initial",
            "is_terminal",
            "is_active",
            "metadata_json",
        )


class WorkflowTransitionSerializer(serializers.ModelSerializer):
    from_node_name = serializers.CharField(source="from_node.name", read_only=True)
    to_node_name = serializers.CharField(source="to_node.name", read_only=True)

    class Meta:
        model = WorkflowTransition
        fields = (
            "id",
            "workflow_definition",
            "from_node",
            "from_node_name",
            "to_node",
            "to_node_name",
            "action_key",
            "condition_expression",
            "condition_language",
            "priority",
            "label",
            "is_default",
            "is_active",
        )


class WorkflowRuleSerializer(serializers.ModelSerializer):
    node_name = serializers.CharField(source="node.name", read_only=True)
    transition_label = serializers.CharField(source="transition.label", read_only=True)

    class Meta:
        model = WorkflowRule
        fields = (
            "id",
            "workflow_definition",
            "scope_type",
            "node",
            "node_name",
            "transition",
            "transition_label",
            "rule_type",
            "expression_language",
            "expression",
            "priority",
            "enabled",
            "metadata_json",
        )


class WorkflowTransitionWriteSerializer(serializers.ModelSerializer):
    workflow_definition = serializers.PrimaryKeyRelatedField(queryset=WorkflowDefinition.objects.all(), required=False)
    action_key = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = WorkflowTransition
        fields = (
            "id",
            "workflow_definition",
            "from_node",
            "to_node",
            "action_key",
            "condition_expression",
            "condition_language",
            "priority",
            "label",
            "is_default",
            "is_active",
        )


class WorkflowAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source="performed_by.full_name", read_only=True)
    node_name = serializers.CharField(source="node.name", read_only=True)

    class Meta:
        model = WorkflowAuditLog
        fields = (
            "id",
            "workflow_definition",
            "node",
            "node_name",
            "transition",
            "performed_by",
            "performed_by_name",
            "action",
            "comment",
            "metadata",
            "created_at",
        )


class WorkflowInstanceStartSerializer(serializers.Serializer):
    workflow_definition = serializers.PrimaryKeyRelatedField(queryset=WorkflowDefinition.objects.all())
    entity_type = serializers.CharField(required=False, allow_blank=True)
    entity_id = serializers.CharField(required=False, allow_blank=True)
    payload_json = serializers.JSONField(required=False)


class WorkflowInstanceActionSerializer(serializers.Serializer):
    action_key = serializers.CharField(allow_blank=True)
    comment = serializers.CharField(required=False, allow_blank=True)
    payload_json = serializers.JSONField(required=False)


class NodeInstanceSerializer(serializers.ModelSerializer):
    node_name = serializers.CharField(source="node.name", read_only=True)
    assignment_instances = serializers.SerializerMethodField()

    class Meta:
        model = NodeInstance
        fields = (
            "id",
            "workflow_instance",
            "node",
            "node_name",
            "status",
            "entered_at",
            "exited_at",
            "assignment_policy_snapshot_json",
            "form_snapshot_json",
            "metadata_json",
            "assignment_instances",
        )

    def get_assignment_instances(self, obj):
        return AssignmentInstanceSerializer(obj.assignment_instances.select_related("assignee_user").all(), many=True).data


class AssignmentInstanceSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(source="assignee_user.full_name", read_only=True)
    node_code = serializers.CharField(source="node_instance.node.code", read_only=True)
    workflow_instance = serializers.UUIDField(source="node_instance.workflow_instance_id", read_only=True)
    claimed_by_name = serializers.CharField(source="claimed_by.full_name", read_only=True)

    class Meta:
        model = AssignmentInstance
        fields = (
            "id",
            "node_instance",
            "workflow_instance",
            "node_code",
            "assignee_type",
            "assignee_id",
            "assignee_user",
            "assignee_name",
            "status",
            "assigned_at",
            "claimed_at",
            "claimed_by",
            "claimed_by_name",
            "accepted_at",
            "completed_at",
            "cancelled_at",
            "declined_at",
            "completed_by",
            "metadata_json",
        )


class AssignmentInstanceActionLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True)

    class Meta:
        model = AssignmentInstanceActionLog
        fields = (
            "id",
            "assignment_instance",
            "actor",
            "actor_name",
            "action",
            "previous_status",
            "new_status",
            "note",
            "metadata_json",
            "created_at",
        )


class AssignmentInstanceDetailSerializer(AssignmentInstanceSerializer):
    action_logs = AssignmentInstanceActionLogSerializer(many=True, read_only=True)

    class Meta(AssignmentInstanceSerializer.Meta):
        fields = AssignmentInstanceSerializer.Meta.fields + ("action_logs",)


class AssignmentInstanceAcceptSerializer(serializers.Serializer):
    pass


class AssignmentInstanceClaimSerializer(serializers.Serializer):
    pass


class AssignmentInstanceCompleteSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)
    metadata_json = serializers.JSONField(required=False)


class AssignmentInstanceCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class AssignmentInstanceDeclineSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class AssignmentInstanceReassignSerializer(serializers.Serializer):
    new_assignee = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)


class TransitionExecutionLogSerializer(serializers.ModelSerializer):
    from_node_name = serializers.CharField(source="from_node.name", read_only=True)
    to_node_name = serializers.CharField(source="to_node.name", read_only=True)
    triggered_by_name = serializers.CharField(source="triggered_by.full_name", read_only=True)

    class Meta:
        model = TransitionExecutionLog
        fields = (
            "id",
            "workflow_instance",
            "node_instance",
            "from_node",
            "from_node_name",
            "to_node",
            "to_node_name",
            "transition",
            "action_key",
            "triggered_by",
            "triggered_by_name",
            "condition_result",
            "executed_at",
        )


class WorkflowDataEnvelopeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowDataEnvelope
        fields = ("id", "workflow_instance", "payload_json", "schema_version", "updated_at")


class WorkflowCurrentStateSerializer(serializers.Serializer):
    workflow_instance_id = serializers.UUIDField()
    workflow_definition_id = serializers.UUIDField()
    workflow_definition_name = serializers.CharField()
    workflow_definition_version = serializers.IntegerField()
    current_step_id = serializers.UUIDField(allow_null=True)
    current_step = serializers.CharField(allow_blank=True)
    current_step_code = serializers.CharField(allow_blank=True, required=False)
    current_step_order = serializers.IntegerField(allow_null=True)
    workflow_status = serializers.CharField()
    due_at = serializers.DateTimeField(allow_null=True)
    is_overdue = serializers.BooleanField()
    submission_status = serializers.CharField()
    requires_assignment = serializers.BooleanField()
    requires_evaluation = serializers.BooleanField()
    role_required = serializers.CharField(allow_blank=True)
    allowed_actions = serializers.ListField(child=serializers.CharField())
    applicant_action_required = serializers.BooleanField()
    assignment_summary = serializers.DictField()
    evaluation_summary = serializers.DictField()
    task_summary = serializers.DictField()
    step_completion = serializers.DictField(required=False)
    latest_manager_review = serializers.DictField(required=False)


class WorkflowHistoryEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    step_name = serializers.CharField()
    action = serializers.CharField()
    timestamp = serializers.DateTimeField()
    resulting_status = serializers.CharField(allow_blank=True)
    performed_by = serializers.CharField(required=False, allow_blank=True)
    performed_by_name = serializers.CharField(required=False, allow_blank=True)
    comment = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.DictField(required=False)

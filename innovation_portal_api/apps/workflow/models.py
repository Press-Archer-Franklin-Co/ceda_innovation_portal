from django.conf import settings
from django.db import models

from apps.core.constants import AssignmentRoleType, RoleType, SubmissionFormFieldType, SubmissionStatus
from apps.core.models import TimeStampedModel, UUIDModel
from apps.programs.models import SubmissionForm


class WorkflowDefinition(UUIDModel, TimeStampedModel):
    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ACTIVE = "active"
    STATUS_INACTIVE = "inactive"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_INACTIVE, "Inactive"),
        (STATUS_ARCHIVED, "Archived"),
    )

    name = models.CharField(max_length=255)
    code = models.SlugField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    workflow_type = models.CharField(max_length=80, blank=True)
    scope = models.CharField(max_length=120, blank=True)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="workflow_definitions")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    version = models.PositiveIntegerField(default=1)
    is_current = models.BooleanField(default=True)
    previous_version = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="next_versions")
    is_active = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_definitions_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_definitions_updated",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["program"],
                condition=models.Q(is_active=True),
                name="uq_active_workflow_per_program",
            ),
            models.UniqueConstraint(fields=["program", "version"], name="uq_workflow_definition_program_version"),
            models.UniqueConstraint(fields=["program"], condition=models.Q(is_current=True), name="uq_workflow_definition_current_per_program"),
        ]
        ordering = ("program", "-version", "-created_at")

    def __str__(self) -> str:
        return f"{self.program.title} - {self.name} v{self.version}"


class WorkflowStep(UUIDModel, TimeStampedModel):
    EXECUTION_SEQUENTIAL = "sequential"
    EXECUTION_PARALLEL_ALL = "parallel_all"
    EXECUTION_PARALLEL_ANY = "parallel_any"
    EXECUTION_PARALLEL_MINIMUM = "parallel_minimum"
    EXECUTION_MODE_CHOICES = (
        (EXECUTION_SEQUENTIAL, "Sequential"),
        (EXECUTION_PARALLEL_ALL, "Parallel All"),
        (EXECUTION_PARALLEL_ANY, "Parallel Any"),
        (EXECUTION_PARALLEL_MINIMUM, "Parallel Minimum"),
    )

    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.CASCADE, related_name="steps")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=80)
    order = models.PositiveIntegerField()
    role_required = models.CharField(max_length=50, choices=RoleType.choices, blank=True, default="")
    actions_allowed = models.JSONField(default=list, blank=True)
    submission_status = models.CharField(max_length=40, choices=SubmissionStatus.choices, blank=True, default="")
    execution_mode = models.CharField(max_length=30, choices=EXECUTION_MODE_CHOICES, default=EXECUTION_SEQUENTIAL)
    minimum_completions_required = models.PositiveIntegerField(default=1)
    due_in_hours = models.PositiveIntegerField(default=72)
    requires_assignment = models.BooleanField(default=False)
    assignment_role = models.CharField(max_length=20, choices=AssignmentRoleType.choices, blank=True)
    minimum_assignments = models.PositiveIntegerField(default=0)
    requires_evaluation = models.BooleanField(default=False)
    minimum_evaluations = models.PositiveIntegerField(default=0)
    evaluation_round = models.ForeignKey("evaluation.EvaluationRound", on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_steps")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("order",)
        constraints = [
            models.UniqueConstraint(fields=["workflow_definition", "code"], name="uq_workflow_step_code_per_definition"),
            models.UniqueConstraint(fields=["workflow_definition", "order"], name="uq_workflow_step_order_per_definition"),
        ]

    def __str__(self) -> str:
        return f"{self.workflow_definition.name} - {self.name}"


class WorkflowNode(UUIDModel, TimeStampedModel):
    TYPE_START = "start"
    TYPE_USER_TASK = "user_task"
    TYPE_REVIEW_TASK = "review_task"
    TYPE_APPROVAL_TASK = "approval_task"
    TYPE_SYSTEM_TASK = "system_task"
    TYPE_DECISION = "decision"
    TYPE_WAIT = "wait"
    TYPE_NOTIFICATION = "notification"
    TYPE_END = "end"
    TYPE_CHOICES = (
        (TYPE_START, "Start"),
        (TYPE_USER_TASK, "User Task"),
        (TYPE_REVIEW_TASK, "Review Task"),
        (TYPE_APPROVAL_TASK, "Approval Task"),
        (TYPE_SYSTEM_TASK, "System Task"),
        (TYPE_DECISION, "Decision"),
        (TYPE_WAIT, "Wait"),
        (TYPE_NOTIFICATION, "Notification"),
        (TYPE_END, "End"),
    )

    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.CASCADE, related_name="nodes")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=80)
    node_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    description = models.TextField(blank=True)
    position_x = models.IntegerField(default=0)
    position_y = models.IntegerField(default=0)
    is_initial = models.BooleanField(default=False)
    is_terminal = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at", "name")
        constraints = [
            models.UniqueConstraint(fields=["workflow_definition", "code"], name="uq_workflow_node_code_per_definition"),
            models.UniqueConstraint(
                fields=["workflow_definition"],
                condition=models.Q(is_initial=True),
                name="uq_workflow_initial_node_per_definition",
            ),
        ]


class WorkflowTransition(UUIDModel, TimeStampedModel):
    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.CASCADE, related_name="transitions")
    from_node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name="outgoing_transitions")
    to_node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name="incoming_transitions")
    action_key = models.CharField(max_length=80, blank=True)
    condition_expression = models.JSONField(default=dict, blank=True)
    condition_language = models.CharField(max_length=40, default="json_logic")
    priority = models.PositiveIntegerField(default=1)
    label = models.CharField(max_length=255, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("priority", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["workflow_definition", "from_node", "action_key", "priority"],
                name="uq_workflow_transition_priority_per_action",
            )
        ]


class NodeAction(UUIDModel, TimeStampedModel):
    node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name="actions")
    key = models.CharField(max_length=80)
    label = models.CharField(max_length=120)
    requires_comment = models.BooleanField(default=False)
    requires_attachment = models.BooleanField(default=False)
    is_terminal_action = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at", "label")
        constraints = [models.UniqueConstraint(fields=["node", "key"], name="uq_node_action_key_per_node")]


class AssignmentPolicy(UUIDModel, TimeStampedModel):
    TYPE_SPECIFIC_USER = "specific_user"
    TYPE_ROLE_BASED = "role_based"
    TYPE_GROUP_BASED = "group_based"
    TYPE_DEPARTMENT_BASED = "department_based"
    TYPE_ROUND_ROBIN = "round_robin"
    TYPE_LEAST_LOADED = "least_loaded"
    TYPE_SUBMITTER_MANAGER = "submitter_manager"
    TYPE_DYNAMIC_QUERY = "dynamic_query"
    TYPE_CHOICES = (
        (TYPE_SPECIFIC_USER, "Specific User"),
        (TYPE_ROLE_BASED, "Role Based"),
        (TYPE_GROUP_BASED, "Group Based"),
        (TYPE_DEPARTMENT_BASED, "Department Based"),
        (TYPE_ROUND_ROBIN, "Round Robin"),
        (TYPE_LEAST_LOADED, "Least Loaded"),
        (TYPE_SUBMITTER_MANAGER, "Submitter Manager"),
        (TYPE_DYNAMIC_QUERY, "Dynamic Query"),
    )

    name = models.CharField(max_length=255)
    code = models.SlugField(max_length=120, unique=True)
    policy_type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    config_json = models.JSONField(default=dict, blank=True)
    fallback_policy = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="fallback_for")
    sla_hours = models.PositiveIntegerField(default=72)
    escalation_policy = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignment_policies_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignment_policies_updated",
    )

    class Meta:
        ordering = ("name",)


class NodeAssignmentBinding(UUIDModel, TimeStampedModel):
    EXECUTION_SEQUENTIAL = "sequential"
    EXECUTION_PARALLEL_ALL = "parallel_all"
    EXECUTION_PARALLEL_ANY = "parallel_any"
    EXECUTION_PARALLEL_MINIMUM = "parallel_minimum"
    EXECUTION_MODE_CHOICES = (
        (EXECUTION_SEQUENTIAL, "Sequential"),
        (EXECUTION_PARALLEL_ALL, "Parallel All"),
        (EXECUTION_PARALLEL_ANY, "Parallel Any"),
        (EXECUTION_PARALLEL_MINIMUM, "Parallel Minimum"),
    )

    node = models.OneToOneField(WorkflowNode, on_delete=models.CASCADE, related_name="assignment_binding")
    assignment_policy = models.ForeignKey(AssignmentPolicy, on_delete=models.PROTECT, related_name="node_bindings")
    minimum_assignees = models.PositiveIntegerField(default=1)
    maximum_assignees = models.PositiveIntegerField(default=1)
    execution_mode = models.CharField(max_length=30, choices=EXECUTION_MODE_CHOICES, default=EXECUTION_SEQUENTIAL)
    minimum_completions_required = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    metadata_json = models.JSONField(default=dict, blank=True)


class WorkflowRule(UUIDModel, TimeStampedModel):
    SCOPE_WORKFLOW = "workflow"
    SCOPE_NODE = "node"
    SCOPE_TRANSITION = "transition"
    SCOPE_CHOICES = (
        (SCOPE_WORKFLOW, "Workflow"),
        (SCOPE_NODE, "Node"),
        (SCOPE_TRANSITION, "Transition"),
    )

    RULE_ENTRY_CONDITION = "entry_condition"
    RULE_EXIT_CONDITION = "exit_condition"
    RULE_TRANSITION_CONDITION = "transition_condition"
    RULE_VISIBILITY_CONDITION = "visibility_condition"
    RULE_ASSIGNMENT_OVERRIDE = "assignment_override"
    RULE_NOTIFICATION_TRIGGER = "notification_trigger"
    RULE_SLA_TRIGGER = "sla_trigger"
    RULE_TYPE_CHOICES = (
        (RULE_ENTRY_CONDITION, "Entry Condition"),
        (RULE_EXIT_CONDITION, "Exit Condition"),
        (RULE_TRANSITION_CONDITION, "Transition Condition"),
        (RULE_VISIBILITY_CONDITION, "Visibility Condition"),
        (RULE_ASSIGNMENT_OVERRIDE, "Assignment Override"),
        (RULE_NOTIFICATION_TRIGGER, "Notification Trigger"),
        (RULE_SLA_TRIGGER, "SLA Trigger"),
    )

    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.CASCADE, related_name="rules")
    scope_type = models.CharField(max_length=20, choices=SCOPE_CHOICES)
    node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, null=True, blank=True, related_name="rules")
    transition = models.ForeignKey(WorkflowTransition, on_delete=models.CASCADE, null=True, blank=True, related_name="rules")
    rule_type = models.CharField(max_length=40, choices=RULE_TYPE_CHOICES)
    expression_language = models.CharField(max_length=40, default="json_logic")
    expression = models.JSONField(default=dict, blank=True)
    priority = models.PositiveIntegerField(default=1)
    enabled = models.BooleanField(default=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("scope_type", "priority", "created_at")


class WorkflowFormDefinition(UUIDModel, TimeStampedModel):
    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_ARCHIVED, "Archived"),
    )

    name = models.CharField(max_length=255)
    code = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    version = models.PositiveIntegerField(default=1)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("name", "-version")


class WorkflowFormSection(UUIDModel, TimeStampedModel):
    form_definition = models.ForeignKey(WorkflowFormDefinition, on_delete=models.CASCADE, related_name="sections")
    title = models.CharField(max_length=255)
    code = models.SlugField(max_length=100)
    order = models.PositiveIntegerField(default=1)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ("order", "title")
        constraints = [models.UniqueConstraint(fields=["form_definition", "code"], name="uq_workflow_form_section_code")]


class WorkflowFormField(UUIDModel, TimeStampedModel):
    DATA_SOURCE_STATIC = "static"
    DATA_SOURCE_API = "api"
    DATA_SOURCE_DYNAMIC = "dynamic"
    DATA_SOURCE_CHOICES = (
        (DATA_SOURCE_STATIC, "Static"),
        (DATA_SOURCE_API, "API"),
        (DATA_SOURCE_DYNAMIC, "Dynamic"),
    )

    form_section = models.ForeignKey(WorkflowFormSection, on_delete=models.CASCADE, related_name="fields")
    key = models.SlugField(max_length=100)
    label = models.CharField(max_length=255)
    field_type = models.CharField(max_length=30, choices=SubmissionFormFieldType.choices)
    required = models.BooleanField(default=False)
    default_value = models.JSONField(default=dict, blank=True)
    help_text = models.TextField(blank=True)
    data_source_type = models.CharField(max_length=20, choices=DATA_SOURCE_CHOICES, default=DATA_SOURCE_STATIC)
    data_source_config = models.JSONField(default=dict, blank=True)
    validation_schema = models.JSONField(default=dict, blank=True)
    ui_schema = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("order", "label")
        constraints = [models.UniqueConstraint(fields=["form_section", "key"], name="uq_workflow_form_field_key")]


class WorkflowFormFieldRule(UUIDModel, TimeStampedModel):
    RULE_VISIBLE_IF = "visible_if"
    RULE_REQUIRED_IF = "required_if"
    RULE_ENABLED_IF = "enabled_if"
    RULE_COMPUTED_IF = "computed_if"
    RULE_CHOICES = (
        (RULE_VISIBLE_IF, "Visible If"),
        (RULE_REQUIRED_IF, "Required If"),
        (RULE_ENABLED_IF, "Enabled If"),
        (RULE_COMPUTED_IF, "Computed If"),
    )

    form_field = models.ForeignKey(WorkflowFormField, on_delete=models.CASCADE, related_name="rules")
    rule_type = models.CharField(max_length=20, choices=RULE_CHOICES)
    expression = models.JSONField(default=dict, blank=True)
    priority = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("priority", "created_at")


class NodeFormBinding(UUIDModel, TimeStampedModel):
    TYPE_ENTRY = "entry"
    TYPE_REVIEW = "review"
    TYPE_DECISION = "decision"
    TYPE_FEEDBACK = "feedback"
    TYPE_CHOICES = (
        (TYPE_ENTRY, "Entry"),
        (TYPE_REVIEW, "Review"),
        (TYPE_DECISION, "Decision"),
        (TYPE_FEEDBACK, "Feedback"),
    )

    MODE_READ_ONLY = "read_only"
    MODE_EDITABLE = "editable"
    MODE_PARTIAL_EDIT = "partial_edit"
    MODE_CHOICES = (
        (MODE_READ_ONLY, "Read Only"),
        (MODE_EDITABLE, "Editable"),
        (MODE_PARTIAL_EDIT, "Partial Edit"),
    )

    node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name="form_bindings")
    form_definition = models.ForeignKey(SubmissionForm, on_delete=models.PROTECT, related_name="node_bindings")
    binding_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_ENTRY)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_EDITABLE)
    required_on_entry = models.BooleanField(default=False)
    required_on_exit = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["node", "form_definition", "binding_type"],
                name="uq_node_form_binding_type",
            )
        ]


class WorkflowAuditLog(UUIDModel, TimeStampedModel):
    ACTION_CREATED = "definition_created"
    ACTION_UPDATED = "definition_updated"
    ACTION_NODE_ADDED = "node_added"
    ACTION_NODE_UPDATED = "node_updated"
    ACTION_NODE_DELETED = "node_deleted"
    ACTION_TRANSITION_ADDED = "transition_added"
    ACTION_TRANSITION_UPDATED = "transition_updated"
    ACTION_TRANSITION_DELETED = "transition_deleted"
    ACTION_ACTION_CHANGED = "node_action_changed"
    ACTION_FORM_BINDING_CHANGED = "form_binding_changed"
    ACTION_ASSIGNMENT_BINDING_CHANGED = "assignment_binding_changed"
    ACTION_PUBLISHED = "published"
    ACTION_ACTIVATED = "activated"
    ACTION_ARCHIVED = "archived"
    ACTION_CLONED = "cloned"
    ACTION_VALIDATED = "validated"
    ACTION_CHOICES = (
        (ACTION_CREATED, "Definition Created"),
        (ACTION_UPDATED, "Definition Updated"),
        (ACTION_NODE_ADDED, "Node Added"),
        (ACTION_NODE_UPDATED, "Node Updated"),
        (ACTION_NODE_DELETED, "Node Deleted"),
        (ACTION_TRANSITION_ADDED, "Transition Added"),
        (ACTION_TRANSITION_UPDATED, "Transition Updated"),
        (ACTION_TRANSITION_DELETED, "Transition Deleted"),
        (ACTION_ACTION_CHANGED, "Node Action Changed"),
        (ACTION_FORM_BINDING_CHANGED, "Form Binding Changed"),
        (ACTION_ASSIGNMENT_BINDING_CHANGED, "Assignment Binding Changed"),
        (ACTION_PUBLISHED, "Published"),
        (ACTION_ACTIVATED, "Activated"),
        (ACTION_ARCHIVED, "Archived"),
        (ACTION_CLONED, "Cloned"),
        (ACTION_VALIDATED, "Validated"),
    )

    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.CASCADE, related_name="audit_logs")
    node = models.ForeignKey(WorkflowNode, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    transition = models.ForeignKey(WorkflowTransition, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_definition_audits")
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    comment = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)


class WorkflowInstance(UUIDModel, TimeStampedModel):
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_PAUSED = "paused"
    STATUS_COMPLETED = "completed"
    STATUS_REJECTED = "rejected"
    STATUS_RETURNED = "returned"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_PAUSED, "Paused"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_RETURNED, "Returned"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    submission = models.OneToOneField("submissions.Submission", on_delete=models.CASCADE, related_name="workflow_instance", null=True, blank=True)
    workflow_definition = models.ForeignKey(WorkflowDefinition, on_delete=models.PROTECT, related_name="instances")
    workflow_definition_version = models.PositiveIntegerField(default=1)
    entity_type = models.CharField(max_length=120, blank=True)
    entity_id = models.CharField(max_length=120, blank=True)
    current_step = models.ForeignKey(WorkflowStep, on_delete=models.SET_NULL, null=True, blank=True, related_name="instances")
    current_node = models.ForeignKey(WorkflowNode, on_delete=models.SET_NULL, null=True, blank=True, related_name="instances")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_IN_PROGRESS)
    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="started_workflows")
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    pause_reason = models.TextField(blank=True)
    paused_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="paused_workflows")
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        identifier = self.submission.reference_number if self.submission_id else self.entity_id or self.id
        return f"Workflow<{identifier}>"


class NodeInstance(UUIDModel, TimeStampedModel):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_SKIPPED = "skipped"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_SKIPPED, "Skipped"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    workflow_instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name="node_instances")
    node = models.ForeignKey(WorkflowNode, on_delete=models.PROTECT, related_name="node_instances")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    entered_at = models.DateTimeField(null=True, blank=True)
    exited_at = models.DateTimeField(null=True, blank=True)
    assignment_policy_snapshot_json = models.JSONField(default=dict, blank=True)
    form_snapshot_json = models.JSONField(default=dict, blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at",)


class AssignmentInstance(UUIDModel, TimeStampedModel):
    ASSIGNEE_USER = "user"
    ASSIGNEE_ROLE = "role"
    ASSIGNEE_GROUP = "group"
    ASSIGNEE_DEPARTMENT = "department"
    ASSIGNEE_TYPE_CHOICES = (
        (ASSIGNEE_USER, "User"),
        (ASSIGNEE_ROLE, "Role"),
        (ASSIGNEE_GROUP, "Group"),
        (ASSIGNEE_DEPARTMENT, "Department"),
    )

    STATUS_AVAILABLE = "available"
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_DECLINED = "declined"
    STATUS_CHOICES = (
        (STATUS_AVAILABLE, "Available"),
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_DECLINED, "Declined"),
    )

    node_instance = models.ForeignKey(NodeInstance, on_delete=models.CASCADE, related_name="assignment_instances")
    assignee_type = models.CharField(max_length=20, choices=ASSIGNEE_TYPE_CHOICES, default=ASSIGNEE_USER)
    assignee_id = models.CharField(max_length=120)
    assignee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graph_assignment_instances",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    assigned_at = models.DateTimeField(auto_now_add=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="claimed_graph_assignment_instances",
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_graph_assignment_instances",
    )
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("assigned_at", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["node_instance", "assignee_type", "assignee_id"],
                name="uq_assignment_instance_per_assignee",
            )
        ]


class AssignmentInstanceActionLog(UUIDModel, TimeStampedModel):
    ACTION_CLAIMED = "claimed"
    ACTION_ACCEPTED = "accepted"
    ACTION_COMPLETED = "completed"
    ACTION_CANCELLED = "cancelled"
    ACTION_REASSIGNED = "reassigned"
    ACTION_DECLINED = "declined"
    ACTION_CHOICES = (
        (ACTION_CLAIMED, "Claimed"),
        (ACTION_ACCEPTED, "Accepted"),
        (ACTION_COMPLETED, "Completed"),
        (ACTION_CANCELLED, "Cancelled"),
        (ACTION_REASSIGNED, "Reassigned"),
        (ACTION_DECLINED, "Declined"),
    )

    assignment_instance = models.ForeignKey(AssignmentInstance, on_delete=models.CASCADE, related_name="action_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="graph_assignment_action_logs",
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    previous_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20, blank=True)
    note = models.TextField(blank=True)
    metadata_json = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("created_at",)


class TransitionExecutionLog(UUIDModel, TimeStampedModel):
    workflow_instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name="transition_logs")
    node_instance = models.ForeignKey(NodeInstance, on_delete=models.SET_NULL, null=True, blank=True, related_name="transition_logs")
    from_node = models.ForeignKey(WorkflowNode, on_delete=models.SET_NULL, null=True, blank=True, related_name="transition_logs_from")
    to_node = models.ForeignKey(WorkflowNode, on_delete=models.SET_NULL, null=True, blank=True, related_name="transition_logs_to")
    transition = models.ForeignKey(WorkflowTransition, on_delete=models.SET_NULL, null=True, blank=True, related_name="execution_logs")
    action_key = models.CharField(max_length=80, blank=True)
    triggered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_transition_logs")
    condition_result = models.JSONField(default=dict, blank=True)
    executed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("executed_at",)


class WorkflowDataEnvelope(UUIDModel, TimeStampedModel):
    workflow_instance = models.OneToOneField(WorkflowInstance, on_delete=models.CASCADE, related_name="data_envelope")
    payload_json = models.JSONField(default=dict, blank=True)
    schema_version = models.PositiveIntegerField(default=1)


class WorkflowActionLog(UUIDModel):
    ACTION_APPROVE = "approve"
    ACTION_REJECT = "reject"
    ACTION_RETURN = "return"
    ACTION_RESUBMIT = "resubmit"
    ACTION_ASSIGN = "assign"
    ACTION_REASSIGN = "reassign"
    ACTION_UNASSIGN = "unassign"
    ACTION_SUBMIT = "submit"
    ACTION_CHOICES = (
        (ACTION_APPROVE, "Approve"),
        (ACTION_REJECT, "Reject"),
        (ACTION_RETURN, "Return"),
        (ACTION_RESUBMIT, "Resubmit"),
        (ACTION_ASSIGN, "Assign"),
        (ACTION_REASSIGN, "Reassign"),
        (ACTION_UNASSIGN, "Unassign"),
        (ACTION_SUBMIT, "Submit"),
    )

    workflow_instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name="action_logs")
    step = models.ForeignKey(WorkflowStep, on_delete=models.SET_NULL, null=True, blank=True, related_name="action_logs")
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_actions")
    comment = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("timestamp",)

    def __str__(self) -> str:
        return f"{self.workflow_instance_id} - {self.action}"


class TaskExecution(UUIDModel, TimeStampedModel):
    STATUS_PENDING = "pending"
    STATUS_CLAIMED = "claimed"
    STATUS_COMPLETED = "completed"
    STATUS_REJECTED = "rejected"
    STATUS_RETURNED = "returned"
    STATUS_REASSIGNED = "reassigned"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_CLAIMED, "Claimed"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_RETURNED, "Returned"),
        (STATUS_REASSIGNED, "Reassigned"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    workflow_instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name="tasks")
    workflow_step = models.ForeignKey(WorkflowStep, on_delete=models.CASCADE, related_name="tasks")
    assignment = models.ForeignKey("assignments.Assignment", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="workflow_tasks")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(max_length=20, choices=WorkflowActionLog.ACTION_CHOICES, blank=True)
    comment = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("workflow_step__order", "created_at")

    def __str__(self) -> str:
        return f"Task<{self.workflow_instance_id}:{self.workflow_step.code}:{self.status}>"

from copy import deepcopy

from django.db import models, transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import User
from apps.audit.services import AuditService
from apps.assignments.models import Assignment
from apps.core.constants import (
    AssignmentRoleType,
    AssignmentStatus,
    FinalDecisionType,
    ProgramTypeCode,
    RoleType,
    ScoreSheetStatus,
    SubmissionOutcomeType,
    SubmissionStatus,
)
from apps.evaluation.models import CriterionScore, ScoreSheet
from apps.notifications.services import NotificationService
from apps.programs.models import SubmissionFormField
from apps.submissions.models import Submission, SubmissionInternalNote, SubmissionOutcome, SubmissionStatusHistory
from apps.workflow.models import (
    AssignmentInstance,
    AssignmentInstanceActionLog,
    AssignmentPolicy,
    NodeAssignmentBinding,
    NodeAction,
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


class StepCompletionEvaluator:
    @staticmethod
    def evaluate(*, instance: WorkflowInstance, step: WorkflowStep | None = None) -> dict:
        step = step or instance.current_step
        tasks = (
            instance.tasks.filter(workflow_step=step).exclude(
                status__in=[
                    TaskExecution.STATUS_CANCELLED,
                    TaskExecution.STATUS_REASSIGNED,
                    TaskExecution.STATUS_RETURNED,
                ]
            )
            if step
            else TaskExecution.objects.none()
        )
        total_tasks = tasks.count()
        completed_tasks = tasks.filter(status=TaskExecution.STATUS_COMPLETED).count()
        approved_tasks = tasks.filter(status=TaskExecution.STATUS_COMPLETED, outcome=WorkflowActionLog.ACTION_APPROVE).count()
        rejected_tasks = tasks.filter(
            models.Q(status=TaskExecution.STATUS_REJECTED)
            | models.Q(status=TaskExecution.STATUS_COMPLETED, outcome=WorkflowActionLog.ACTION_REJECT)
        ).count()
        pending_tasks = tasks.filter(
            status__in=[
                TaskExecution.STATUS_PENDING,
                TaskExecution.STATUS_CLAIMED,
            ]
        ).count()

        blocked_reasons = []
        completion_reason = ""
        may_advance = False

        if not step:
            blocked_reasons.append("No active workflow step is configured.")
        elif total_tasks == 0:
            may_advance = True
            completion_reason = "No task executions are required for this workflow step."
        elif step.execution_mode == WorkflowStep.EXECUTION_PARALLEL_ANY:
            may_advance = completed_tasks >= 1
            completion_reason = "At least one task completion (any decision) is required."
            if not may_advance:
                blocked_reasons.append("No task completion has been recorded yet.")
        elif step.execution_mode == WorkflowStep.EXECUTION_PARALLEL_MINIMUM:
            required = max(1, step.minimum_completions_required)
            if step.assignment_role == AssignmentRoleType.SPECIALIST and instance.submission_id:
                from apps.assignments.models import SpecialistInvitation

                invite_required = (
                    SpecialistInvitation.objects
                    .filter(
                        submission=instance.submission,
                        status__in=["pending", "accepted", "completed"],
                    )
                    .filter(models.Q(workflow_step=step) | models.Q(workflow_step__isnull=True))
                    .order_by("-required_review_count")
                    .values_list("required_review_count", flat=True)
                    .first()
                )
                if invite_required:
                    required = max(1, int(invite_required))
            may_advance = completed_tasks >= required
            completion_reason = f"At least {required} task completions are required."
            if not may_advance:
                blocked_reasons.append(f"{required} task completions are required before this step can advance.")
        else:
            may_advance = pending_tasks == 0 and completed_tasks == total_tasks
            completion_reason = "All task executions must reach a final decision."
            if pending_tasks:
                blocked_reasons.append("Pending task executions remain open.")
            if completed_tasks < total_tasks and not pending_tasks:
                blocked_reasons.append("Not all task executions have reached a final decision.")

        return {
            "execution_mode": step.execution_mode if step else "",
            "minimum_completions_required": step.minimum_completions_required if step else 0,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "approved_tasks": approved_tasks,
            "rejected_tasks": rejected_tasks,
            "pending_tasks": pending_tasks,
            "may_advance": may_advance,
            "completion_reason": completion_reason,
            "blocked_reasons": blocked_reasons,
        }


class WorkflowDefinitionService:
    DEFAULT_TEMPLATES = {
        ProgramTypeCode.IDEA: [
            {
                "name": "Intake",
                "code": "intake",
                "order": 1,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SUBMITTED,
            },
            {
                "name": "Screening",
                "code": "screening",
                "order": 2,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SCREENING,
            },
            {
                "name": "Judging Review",
                "code": "judging_review",
                "order": 3,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.JUDGING_REVIEW,
            },
            {
                "name": "Final Decision",
                "code": "final_decision",
                "order": 4,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.APPROVED,
            },
        ],
        ProgramTypeCode.CHALLENGE_CALL: [
            {
                "name": "Intake",
                "code": "intake",
                "order": 1,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SUBMITTED,
            },
            {
                "name": "Screening",
                "code": "screening",
                "order": 2,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SCREENING,
            },
            {
                "name": "Judging Review",
                "code": "judging_review",
                "order": 3,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.JUDGING_REVIEW,
            },
            {
                "name": "Final Decision",
                "code": "final_decision",
                "order": 4,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.APPROVED,
            },
        ],
        ProgramTypeCode.HACKATHON: [
            {
                "name": "Intake",
                "code": "intake",
                "order": 1,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SUBMITTED,
            },
            {
                "name": "Screening",
                "code": "screening",
                "order": 2,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SCREENING,
            },
            {
                "name": "Shortlisting",
                "code": "shortlisting",
                "order": 3,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.SHORTLISTED,
            },
            {
                "name": "Judge Review",
                "code": "judge_review",
                "order": 4,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.JUDGING_REVIEW,
                "requires_assignment": True,
                "assignment_role": AssignmentRoleType.JUDGE,
                "minimum_assignments": 2,
                "execution_mode": WorkflowStep.EXECUTION_PARALLEL_MINIMUM,
                "minimum_completions_required": 2,
                "requires_evaluation": True,
                "minimum_evaluations": 2,
            },
            {
                "name": "Finalist Review",
                "code": "finalist_review",
                "order": 5,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.FINALIST,
            },
            {
                "name": "Winner Confirmation",
                "code": "winner_confirmation",
                "order": 6,
                "role_required": RoleType.INNOVATION_OFFICER,
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": SubmissionStatus.WINNER,
            },
        ],
    }

    @staticmethod
    def in_use(definition: WorkflowDefinition) -> bool:
        return definition.instances.exists()

    @staticmethod
    def validate_step_payloads(step_payloads: list[dict]) -> None:
        if not step_payloads:
            raise ValidationError({"steps": "Workflow definitions must contain at least one step."})
        errors = {}
        orders = []
        codes = set()
        for index, step in enumerate(step_payloads):
            prefix = f"steps[{index}]"
            actions = step.get("actions_allowed") or []
            order = step.get("order")
            code = step.get("code")
            orders.append(order)
            if not code:
                errors[f"{prefix}.code"] = "Step code is required."
            elif code in codes:
                errors[f"{prefix}.code"] = "Duplicate step code."
            else:
                codes.add(code)
            if not actions:
                errors[f"{prefix}.actions_allowed"] = "Each step must define at least one allowed action."
            if step.get("requires_assignment") and not step.get("assignment_role"):
                errors[f"{prefix}.assignment_role"] = "Assignment role is required when assignments are enabled."
            if step.get("minimum_assignments", 0) and not step.get("requires_assignment"):
                errors[f"{prefix}.requires_assignment"] = "Assignment minimums require assignment support."
            if step.get("minimum_evaluations", 0) and not step.get("requires_evaluation"):
                errors[f"{prefix}.requires_evaluation"] = "Evaluation minimums require evaluation support."
            if step.get("execution_mode") == WorkflowStep.EXECUTION_PARALLEL_MINIMUM and int(step.get("minimum_completions_required", 0) or 0) < 1:
                errors[f"{prefix}.minimum_completions_required"] = "Parallel minimum execution mode requires at least one completion."
        sorted_orders = sorted(orders)
        if sorted_orders[0] != 1:
            errors["steps"] = "Workflow steps must start at order 1."
        if sorted_orders != list(range(1, len(sorted_orders) + 1)):
            errors["steps_sequence"] = "Workflow step order must be contiguous with no gaps or duplicates."
        if errors:
            raise ValidationError(errors)

    @classmethod
    def validate_definition(cls, definition: WorkflowDefinition) -> None:
        steps = list(definition.steps.filter(is_active=True).order_by("order").values(
            "code",
            "order",
            "actions_allowed",
            "requires_assignment",
            "assignment_role",
            "minimum_assignments",
            "requires_evaluation",
            "minimum_evaluations",
            "evaluation_round",
            "execution_mode",
            "minimum_completions_required",
        ))
        cls.validate_step_payloads(steps)

    @classmethod
    def next_version_number(cls, program) -> int:
        return (program.workflow_definitions.aggregate_max("version") if hasattr(program.workflow_definitions, "aggregate_max") else None) or (
            program.workflow_definitions.order_by("-version").values_list("version", flat=True).first() or 0
        ) + 1

    @classmethod
    @transaction.atomic
    def create_definition(cls, *, program, name: str, actor=None, steps_data: list[dict] | None = None, activate: bool = False):
        version = (program.workflow_definitions.order_by("-version").values_list("version", flat=True).first() or 0) + 1
        program.workflow_definitions.filter(is_current=True).update(is_current=False)
        definition = WorkflowDefinition.objects.create(
            name=name,
            code=slugify(name) or f"workflow-{version}",
            program=program,
            status=WorkflowDefinition.STATUS_DRAFT,
            version=version,
            is_active=False,
            is_current=True,
            created_by=actor,
            updated_by=actor,
        )
        for item in steps_data or []:
            WorkflowStep.objects.create(workflow_definition=definition, **item)
        if steps_data:
            cls.validate_definition(definition)
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_CREATED,
            metadata={"program_id": str(program.id), "version": version},
        )
        if activate:
            cls.activate_definition(definition, actor=actor)
        return definition

    @classmethod
    @transaction.atomic
    def clone_definition(cls, definition: WorkflowDefinition):
        definition.program.workflow_definitions.filter(is_current=True).update(is_current=False)
        clone = WorkflowDefinition.objects.create(
            name=definition.name,
            code=definition.code,
            description=definition.description,
            workflow_type=definition.workflow_type,
            scope=definition.scope,
            program=definition.program,
            status=WorkflowDefinition.STATUS_DRAFT,
            version=(definition.program.workflow_definitions.order_by("-version").values_list("version", flat=True).first() or 0) + 1,
            is_current=True,
            previous_version=definition,
            is_active=False,
            metadata_json=deepcopy(definition.metadata_json),
        )
        for step in definition.steps.order_by("order"):
            WorkflowStep.objects.create(
                workflow_definition=clone,
                name=step.name,
                code=step.code,
                order=step.order,
                role_required=step.role_required,
                actions_allowed=deepcopy(step.actions_allowed),
                submission_status=step.submission_status,
                execution_mode=step.execution_mode,
                minimum_completions_required=step.minimum_completions_required,
                requires_assignment=step.requires_assignment,
                assignment_role=step.assignment_role,
                minimum_assignments=step.minimum_assignments,
                requires_evaluation=step.requires_evaluation,
                minimum_evaluations=step.minimum_evaluations,
                evaluation_round=step.evaluation_round,
                is_active=step.is_active,
            )
        node_map = {}
        for node in definition.nodes.order_by("created_at"):
            node_map[node.id] = WorkflowNode.objects.create(
                workflow_definition=clone,
                name=node.name,
                code=node.code,
                node_type=node.node_type,
                description=node.description,
                position_x=node.position_x,
                position_y=node.position_y,
                is_initial=node.is_initial,
                is_terminal=node.is_terminal,
                is_active=node.is_active,
                metadata_json=deepcopy(node.metadata_json),
            )
        for node in definition.nodes.prefetch_related("actions").all():
            clone_node = node_map[node.id]
            for action in node.actions.all():
                NodeAction.objects.create(
                    node=clone_node,
                    key=action.key,
                    label=action.label,
                    requires_comment=action.requires_comment,
                    requires_attachment=action.requires_attachment,
                    is_terminal_action=action.is_terminal_action,
                    is_active=action.is_active,
                    metadata_json=deepcopy(action.metadata_json),
                )
        for transition in definition.transitions.order_by("priority", "created_at"):
            WorkflowTransition.objects.create(
                workflow_definition=clone,
                from_node=node_map[transition.from_node_id],
                to_node=node_map[transition.to_node_id],
                action_key=transition.action_key,
                condition_expression=deepcopy(transition.condition_expression),
                condition_language=transition.condition_language,
                priority=transition.priority,
                label=transition.label,
                is_default=transition.is_default,
                is_active=transition.is_active,
            )
        for node in definition.nodes.select_related("assignment_binding__assignment_policy").all():
            clone_node = node_map[node.id]
            if hasattr(node, "assignment_binding"):
                binding = node.assignment_binding
                NodeAssignmentBinding.objects.create(
                    node=clone_node,
                    assignment_policy=binding.assignment_policy,
                    minimum_assignees=binding.minimum_assignees,
                    maximum_assignees=binding.maximum_assignees,
                    execution_mode=binding.execution_mode,
                    minimum_completions_required=binding.minimum_completions_required,
                    is_active=binding.is_active,
                    metadata_json=deepcopy(binding.metadata_json),
                )
        for rule in definition.rules.select_related("node", "transition").all():
            WorkflowRule.objects.create(
                workflow_definition=clone,
                scope_type=rule.scope_type,
                node=node_map.get(rule.node_id) if rule.node_id else None,
                transition=clone.transitions.get(
                    from_node=node_map[rule.transition.from_node_id],
                    to_node=node_map[rule.transition.to_node_id],
                    priority=rule.transition.priority,
                    action_key=rule.transition.action_key,
                ) if rule.transition_id else None,
                rule_type=rule.rule_type,
                expression_language=rule.expression_language,
                expression=deepcopy(rule.expression),
                priority=rule.priority,
                enabled=rule.enabled,
                metadata_json=deepcopy(rule.metadata_json),
            )
        WorkflowAuditLog.objects.create(
            workflow_definition=clone,
            performed_by=definition.updated_by or definition.created_by,
            action=WorkflowAuditLog.ACTION_CLONED,
            metadata={"source_definition_id": str(definition.id), "version": clone.version},
        )
        return clone

    @classmethod
    @transaction.atomic
    def ensure_editable_definition(cls, definition: WorkflowDefinition):
        if definition.status in {WorkflowDefinition.STATUS_ACTIVE, WorkflowDefinition.STATUS_PUBLISHED, WorkflowDefinition.STATUS_ARCHIVED}:
            return cls.clone_definition(definition), True
        if definition.is_active and cls.in_use(definition):
            return cls.clone_definition(definition), True
        return definition, False

    @classmethod
    @transaction.atomic
    def activate_definition(cls, definition: WorkflowDefinition, actor=None):
        WorkflowValidationService.ensure_valid(definition)
        WorkflowDefinition.objects.filter(program=definition.program, is_active=True).exclude(id=definition.id).update(is_active=False)
        WorkflowDefinition.objects.filter(program=definition.program, status=WorkflowDefinition.STATUS_ACTIVE).exclude(id=definition.id).update(status=WorkflowDefinition.STATUS_INACTIVE)
        definition.is_active = True
        definition.status = WorkflowDefinition.STATUS_ACTIVE
        definition.published_at = definition.published_at or timezone.now()
        definition.updated_by = actor
        definition.save(update_fields=["is_active", "status", "published_at", "updated_by", "updated_at"])
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_ACTIVATED,
            metadata={"workflow_definition_version": definition.version},
        )
        if actor:
            AuditService.log_action(
                actor=actor,
                action_type="workflow_definition_activated",
                target=definition.program,
                metadata={"workflow_definition_id": str(definition.id), "workflow_definition_version": definition.version},
            )
        return definition

    @classmethod
    def definition_summary(cls, definition: WorkflowDefinition) -> dict:
        return {
            "id": str(definition.id),
            "name": definition.name,
            "code": definition.code,
            "program_id": str(definition.program_id),
            "status": definition.status,
            "version": definition.version,
            "is_active": definition.is_active,
            "in_use": cls.in_use(definition),
        }

    @classmethod
    @transaction.atomic
    def ensure_active_definition(cls, program):
        definition = program.workflow_definitions.filter(is_active=True).prefetch_related("steps").first()
        if definition:
            cls.validate_definition(definition)
            return definition
        template = cls.DEFAULT_TEMPLATES.get(program.program_type.code, cls.DEFAULT_TEMPLATES[ProgramTypeCode.IDEA])
        definition = cls.create_definition(program=program, name=f"{program.title} Workflow", steps_data=template)
        cls.activate_definition(definition)
        return definition

    @classmethod
    @transaction.atomic
    def publish_definition(cls, definition: WorkflowDefinition, actor=None, comment: str = ""):
        if definition.status == WorkflowDefinition.STATUS_ARCHIVED:
            raise ValidationError({"detail": "Archived workflow definitions cannot be published."})
        WorkflowValidationService.ensure_valid(definition)
        definition.status = WorkflowDefinition.STATUS_PUBLISHED
        definition.published_at = timezone.now()
        definition.updated_by = actor
        definition.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_PUBLISHED,
            comment=comment,
        )
        return definition

    @classmethod
    @transaction.atomic
    def archive_definition(cls, definition: WorkflowDefinition, actor=None, comment: str = ""):
        if definition.is_active:
            raise ValidationError({"detail": "Active workflow definitions cannot be archived directly. Activate another version first."})
        if definition.instances.exists():
            raise ValidationError({"detail": "Workflow definitions with runtime history cannot be archived. Mark them inactive instead."})
        definition.status = WorkflowDefinition.STATUS_ARCHIVED
        definition.archived_at = timezone.now()
        definition.is_current = False
        definition.updated_by = actor
        definition.save(update_fields=["status", "archived_at", "is_current", "updated_by", "updated_at"])
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_ARCHIVED,
            comment=comment,
        )
        return definition


class WorkflowValidationService:
    SUPPORTED_EXPRESSION_LANGUAGES = {"json_logic"}

    @classmethod
    def validate_expression(cls, expression_language: str, expression) -> list[str]:
        errors = []
        if expression_language not in cls.SUPPORTED_EXPRESSION_LANGUAGES:
            errors.append(f"Unsupported expression language `{expression_language}`.")
        if expression in (None, ""):
            return errors
        if not isinstance(expression, (dict, list, str, int, float, bool)):
            errors.append("Expression must be JSON-serializable and use a constrained structure.")
        if isinstance(expression, dict) and "__python__" in expression:
            errors.append("Arbitrary Python execution is not allowed in workflow expressions.")
        return errors

    @classmethod
    def validate_graph(cls, definition: WorkflowDefinition) -> dict:
        errors = {}
        warnings = []
        nodes = list(definition.nodes.filter(is_active=True))
        transitions = list(definition.transitions.filter(is_active=True))
        if not nodes:
            return {"valid": False, "mode": "graph", "errors": {"nodes": "At least one workflow node is required."}, "warnings": warnings}
        initial_nodes = [node for node in nodes if node.is_initial]
        if len(initial_nodes) != 1:
            errors["initial_node"] = "Exactly one initial node is required."
        terminal_nodes = [node for node in nodes if node.is_terminal or node.node_type == WorkflowNode.TYPE_END]
        if not terminal_nodes:
            errors["terminal_node"] = "At least one terminal node is required."
        node_ids = {node.id for node in nodes}
        outgoing = {node.id: [] for node in nodes}
        incoming = {node.id: [] for node in nodes}
        for transition in transitions:
            if transition.from_node_id not in node_ids or transition.to_node_id not in node_ids:
                errors.setdefault("transitions", []).append("Transitions must connect active nodes in the same definition.")
                continue
            expression_errors = cls.validate_expression(transition.condition_language, transition.condition_expression)
            if expression_errors:
                errors[f"transition:{transition.id}:condition"] = expression_errors
            outgoing[transition.from_node_id].append(transition)
            incoming[transition.to_node_id].append(transition)
        for node in nodes:
            if node.is_initial and incoming[node.id]:
                errors[f"node:{node.code}:incoming"] = "Initial nodes cannot have incoming transitions."
            if not node.is_initial and not incoming[node.id]:
                errors[f"node:{node.code}:orphan"] = "Node has no incoming transition."
            if not (node.is_terminal or node.node_type == WorkflowNode.TYPE_END) and not outgoing[node.id]:
                errors[f"node:{node.code}:dead_end"] = "Non-terminal node has no outgoing transition."
        for node in nodes:
            action_keys = set(node.actions.filter(is_active=True).values_list("key", flat=True))
            for transition in outgoing[node.id]:
                if transition.action_key and transition.action_key not in action_keys:
                    errors[f"transition:{transition.id}:action"] = f"Transition action `{transition.action_key}` is not defined on node `{node.code}`."
            default_count = sum(1 for item in outgoing[node.id] if item.is_default)
            if default_count > 1:
                errors[f"node:{node.code}:default_transition"] = "Only one default transition is allowed per node."
            if node.node_type == WorkflowNode.TYPE_DECISION and not outgoing[node.id]:
                errors[f"node:{node.code}:decision"] = "Decision nodes must define outgoing transitions."
            if hasattr(node, "assignment_binding"):
                binding = node.assignment_binding
                if binding.minimum_assignees < 1:
                    errors[f"node:{node.code}:assignment_binding"] = "Minimum assignees must be at least 1."
                if binding.maximum_assignees and binding.maximum_assignees < binding.minimum_assignees:
                    errors[f"node:{node.code}:assignment_binding_bounds"] = "Maximum assignees must be greater than or equal to minimum assignees."
                if binding.execution_mode == NodeAssignmentBinding.EXECUTION_PARALLEL_MINIMUM and binding.minimum_completions_required < 1:
                    errors[f"node:{node.code}:minimum_completions_required"] = "Parallel minimum bindings require at least one completion."
            for binding in node.form_bindings.filter(is_active=True).select_related("form_definition"):
                if not binding.form_definition.sections.exists():
                    errors[f"node:{node.code}:form_binding:{binding.id}"] = "Bound forms must contain at least one section."
                elif not SubmissionFormField.objects.filter(form=binding.form_definition, is_active=True).exists():
                    errors[f"node:{node.code}:form_binding_fields:{binding.id}"] = "Bound forms must contain at least one field."
        for rule in definition.rules.filter(enabled=True).select_related("node", "transition"):
            expression_errors = cls.validate_expression(rule.expression_language, rule.expression)
            if expression_errors:
                errors[f"rule:{rule.id}:expression"] = expression_errors
            if rule.scope_type == WorkflowRule.SCOPE_NODE and not rule.node_id:
                errors[f"rule:{rule.id}:scope"] = "Node-scoped rules must reference a node."
            if rule.scope_type == WorkflowRule.SCOPE_TRANSITION and not rule.transition_id:
                errors[f"rule:{rule.id}:scope"] = "Transition-scoped rules must reference a transition."
        if not errors:
            WorkflowAuditLog.objects.create(workflow_definition=definition, action=WorkflowAuditLog.ACTION_VALIDATED, metadata={"mode": "graph"})
        return {"valid": not bool(errors), "mode": "graph", "errors": errors, "warnings": warnings}

    @classmethod
    def validate_definition(cls, definition: WorkflowDefinition) -> dict:
        if definition.nodes.filter(is_active=True).exists():
            return cls.validate_graph(definition)
        try:
            WorkflowDefinitionService.validate_definition(definition)
            return {"valid": True, "mode": "ordered_steps", "errors": {}, "warnings": ["Definition uses legacy ordered-step mode."]}
        except ValidationError as exc:
            detail = exc.detail if hasattr(exc, "detail") else {"detail": str(exc)}
            return {"valid": False, "mode": "ordered_steps", "errors": detail, "warnings": []}

    @classmethod
    def ensure_valid(cls, definition: WorkflowDefinition) -> dict:
        result = cls.validate_definition(definition)
        if not result["valid"]:
            raise ValidationError(result["errors"])
        return result


class WorkflowNodeService:
    @staticmethod
    @transaction.atomic
    def create_node(definition: WorkflowDefinition, *, actor=None, **data):
        node = WorkflowNode.objects.create(workflow_definition=definition, **data)
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            node=node,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_NODE_ADDED,
            metadata={"node_code": node.code},
        )
        return node


class AssignmentPolicyService:
    @staticmethod
    def validate_policy_payload(*, policy_type: str, config_json: dict | None) -> None:
        config_json = config_json or {}
        errors = {}
        if policy_type == AssignmentPolicy.TYPE_SPECIFIC_USER and not config_json.get("user_ids"):
            errors["config_json.user_ids"] = "Specific user policies require `user_ids`."
        if policy_type == AssignmentPolicy.TYPE_ROLE_BASED and not config_json.get("role_codes"):
            errors["config_json.role_codes"] = "Role-based policies require `role_codes`."
        if policy_type in {AssignmentPolicy.TYPE_GROUP_BASED, AssignmentPolicy.TYPE_DEPARTMENT_BASED} and not config_json.get("target_ids"):
            errors["config_json.target_ids"] = "Group/department policies require `target_ids`."
        if policy_type == AssignmentPolicy.TYPE_DYNAMIC_QUERY and not config_json.get("query"):
            errors["config_json.query"] = "Dynamic query policies require `query`."
        if errors:
            raise ValidationError(errors)

    @classmethod
    @transaction.atomic
    def create_policy(cls, *, actor=None, **data):
        cls.validate_policy_payload(policy_type=data["policy_type"], config_json=data.get("config_json"))
        policy = AssignmentPolicy.objects.create(created_by=actor, updated_by=actor, **data)
        return policy

    @classmethod
    @transaction.atomic
    def update_policy(cls, policy: AssignmentPolicy, *, actor=None, **data):
        cls.validate_policy_payload(policy_type=data.get("policy_type", policy.policy_type), config_json=data.get("config_json", policy.config_json))
        for key, value in data.items():
            setattr(policy, key, value)
        policy.updated_by = actor
        policy.save()
        return policy


class NodeAssignmentBindingService:
    @staticmethod
    def validate_binding_payload(*, minimum_assignees: int, maximum_assignees: int, execution_mode: str, minimum_completions_required: int):
        errors = {}
        if minimum_assignees < 1:
            errors["minimum_assignees"] = "Minimum assignees must be at least 1."
        if maximum_assignees < minimum_assignees:
            errors["maximum_assignees"] = "Maximum assignees must be greater than or equal to minimum assignees."
        if execution_mode == NodeAssignmentBinding.EXECUTION_PARALLEL_MINIMUM and minimum_completions_required < 1:
            errors["minimum_completions_required"] = "Parallel minimum requires at least one completion."
        if errors:
            raise ValidationError(errors)

    @classmethod
    @transaction.atomic
    def bind(cls, node: WorkflowNode, *, assignment_policy: AssignmentPolicy, actor=None, **data):
        cls.validate_binding_payload(
            minimum_assignees=data.get("minimum_assignees", 1),
            maximum_assignees=data.get("maximum_assignees", 1),
            execution_mode=data.get("execution_mode", NodeAssignmentBinding.EXECUTION_SEQUENTIAL),
            minimum_completions_required=data.get("minimum_completions_required", 1),
        )
        binding, _ = NodeAssignmentBinding.objects.update_or_create(
            node=node,
            defaults={"assignment_policy": assignment_policy, **data},
        )
        WorkflowAuditLog.objects.create(
            workflow_definition=node.workflow_definition,
            node=node,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_ASSIGNMENT_BINDING_CHANGED,
            metadata={"assignment_policy_id": str(assignment_policy.id)},
        )
        return binding


class WorkflowTransitionService:
    @staticmethod
    @transaction.atomic
    def create_transition(definition: WorkflowDefinition, *, actor=None, **data):
        transition = WorkflowTransition.objects.create(workflow_definition=definition, **data)
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            transition=transition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_TRANSITION_ADDED,
            metadata={"from_node_id": str(transition.from_node_id), "to_node_id": str(transition.to_node_id)},
        )
        return transition


class NodeActionService:
    @staticmethod
    @transaction.atomic
    def create_action(node: WorkflowNode, *, actor=None, **data):
        action = NodeAction.objects.create(node=node, **data)
        WorkflowAuditLog.objects.create(
            workflow_definition=node.workflow_definition,
            node=node,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_ACTION_CHANGED,
            metadata={"node_action_key": action.key, "change": "created"},
        )
        return action


class WorkflowRuleService:
    @classmethod
    @transaction.atomic
    def create_rule(cls, definition: WorkflowDefinition, *, actor=None, **data):
        expression_errors = WorkflowValidationService.validate_expression(data.get("expression_language", "json_logic"), data.get("expression"))
        if expression_errors:
            raise ValidationError({"expression": expression_errors})
        rule = WorkflowRule.objects.create(workflow_definition=definition, **data)
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            node=rule.node,
            transition=rule.transition,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_UPDATED,
            metadata={"rule_id": str(rule.id), "rule_type": rule.rule_type},
        )
        return rule


class AssignmentResolutionService:
    @staticmethod
    def _role_based_users(role_codes: list[str]):
        return User.objects.filter(
            is_active=True,
            user_roles__is_active=True,
            roles__code__in=role_codes,
        ).distinct().order_by("email")

    @classmethod
    def _resolve_users(cls, policy: AssignmentPolicy):
        config = policy.config_json or {}
        if policy.policy_type == AssignmentPolicy.TYPE_SPECIFIC_USER:
            user_ids = [str(item) for item in config.get("user_ids", [])]
            users = list(User.objects.filter(id__in=user_ids, is_active=True).order_by("email"))
            ordered_users = []
            user_map = {str(user.id): user for user in users}
            for user_id in user_ids:
                user = user_map.get(user_id)
                if user:
                    ordered_users.append(user)
            return ordered_users
        if policy.policy_type == AssignmentPolicy.TYPE_ROLE_BASED:
            if config.get("claim_required"):
                return []
            return list(cls._role_based_users(config.get("role_codes", [])))
        if policy.fallback_policy_id:
            return cls._resolve_users(policy.fallback_policy)
        raise ValidationError({"assignment_policy": f"Assignment policy type `{policy.policy_type}` is not supported by the graph runtime yet."})

    @classmethod
    @transaction.atomic
    def create_assignments(cls, node_instance: NodeInstance, users: list[User]):
        created = []
        for user in users:
            assignment, _ = AssignmentInstance.objects.get_or_create(
                node_instance=node_instance,
                assignee_type=AssignmentInstance.ASSIGNEE_USER,
                assignee_id=str(user.id),
                defaults={
                    "assignee_user": user,
                    "status": AssignmentInstance.STATUS_PENDING,
                },
            )
            created.append(assignment)
        return created

    @classmethod
    @transaction.atomic
    def create_claimable_role_assignments(cls, node_instance: NodeInstance, role_codes: list[str], binding: NodeAssignmentBinding):
        created = []
        target_count = min(max(binding.minimum_assignees, 1), max(binding.maximum_assignees, 1))
        codes = [code for code in role_codes if code]
        if not codes:
            return []
        for index in range(target_count):
            role_code = codes[index % len(codes)]
            assignment, _ = AssignmentInstance.objects.get_or_create(
                node_instance=node_instance,
                assignee_type=AssignmentInstance.ASSIGNEE_ROLE,
                assignee_id=f"{role_code}:{index + 1}",
                defaults={
                    "status": AssignmentInstance.STATUS_AVAILABLE,
                    "metadata_json": {"claimable": True, "role_code": role_code},
                },
            )
            created.append(assignment)
        return created

    @classmethod
    @transaction.atomic
    def resolve_for_node_instance(cls, node_instance: NodeInstance):
        binding = getattr(node_instance.node, "assignment_binding", None)
        if not binding or not binding.is_active:
            return []
        policy = binding.assignment_policy
        config = policy.config_json or {}
        if policy.policy_type == AssignmentPolicy.TYPE_ROLE_BASED and config.get("claim_required"):
            assignments = cls.create_claimable_role_assignments(node_instance, config.get("role_codes", []), binding)
            snapshot = dict(node_instance.assignment_policy_snapshot_json or {})
            snapshot["resolved_assignment_count"] = len(assignments)
            snapshot["claim_required"] = True
            snapshot["role_codes"] = config.get("role_codes", [])
            node_instance.assignment_policy_snapshot_json = snapshot
            node_instance.save(update_fields=["assignment_policy_snapshot_json", "updated_at"])
            return assignments
        users = cls._resolve_users(policy)
        if not users and binding.minimum_assignees:
            raise ValidationError({"assignment_policy": "No eligible assignees were resolved for this node."})
        users = users[: binding.maximum_assignees]
        if len(users) < binding.minimum_assignees:
            raise ValidationError({"assignment_policy": "Resolved assignees do not satisfy the node minimum assignee requirement."})
        assignments = cls.create_assignments(node_instance, users)
        snapshot = dict(node_instance.assignment_policy_snapshot_json or {})
        snapshot["resolved_assignee_ids"] = [str(user.id) for user in users]
        snapshot["resolved_assignment_count"] = len(assignments)
        node_instance.assignment_policy_snapshot_json = snapshot
        node_instance.save(update_fields=["assignment_policy_snapshot_json", "updated_at"])
        return assignments


class GraphAssignmentRuntimeService:
    OFFICER_ROLE_CODES = {RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR}

    @staticmethod
    def _is_officer_or_admin(user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return user.roles.filter(code__in=GraphAssignmentRuntimeService.OFFICER_ROLE_CODES, user_roles__is_active=True).exists()

    @classmethod
    def _lock_assignment(cls, assignment_instance: AssignmentInstance) -> AssignmentInstance:
        return AssignmentInstance.objects.select_for_update(of=("self",)).select_related(
            "assignee_user",
            "node_instance__node",
            "node_instance__workflow_instance",
        ).get(id=assignment_instance.id)

    @classmethod
    def _ensure_assignment_actionable(cls, assignment: AssignmentInstance):
        instance = assignment.node_instance.workflow_instance
        if instance.status != WorkflowInstance.STATUS_IN_PROGRESS:
            raise ValidationError({"assignment_instance": "Assignments on non-running workflow instances cannot be updated."})
        if assignment.node_instance.status != NodeInstance.STATUS_ACTIVE:
            raise ValidationError({"assignment_instance": "This assignment no longer belongs to an active node instance."})
        if instance.current_node_id != assignment.node_instance.node_id:
            raise ValidationError({"assignment_instance": "This assignment is no longer attached to the current workflow node."})

    @staticmethod
    def _log_action(*, assignment: AssignmentInstance, actor, action: str, previous_status: str, new_status: str, note: str = "", metadata_json: dict | None = None):
        AssignmentInstanceActionLog.objects.create(
            assignment_instance=assignment,
            actor=actor,
            action=action,
            previous_status=previous_status,
            new_status=new_status,
            note=note,
            metadata_json=metadata_json or {},
        )

    @staticmethod
    def _merge_metadata(existing: dict | None, patch: dict | None):
        merged = dict(existing or {})
        merged.update(patch or {})
        return merged

    @staticmethod
    def _user_role_codes(user) -> set[str]:
        if not user or not user.is_authenticated:
            return set()
        return set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))

    @classmethod
    def _is_claimable_for_user(cls, assignment: AssignmentInstance, user) -> bool:
        if assignment.assignee_user_id:
            return False
        if assignment.status not in {AssignmentInstance.STATUS_AVAILABLE, AssignmentInstance.STATUS_PENDING}:
            return False
        if assignment.assignee_type == AssignmentInstance.ASSIGNEE_ROLE:
            role_code = (assignment.metadata_json or {}).get("role_code") or str(assignment.assignee_id).split(":", 1)[0]
            return role_code in cls._user_role_codes(user)
        return bool((assignment.metadata_json or {}).get("claimable"))

    @classmethod
    @transaction.atomic
    def claim(cls, assignment_instance: AssignmentInstance, user):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if not cls._is_claimable_for_user(assignment, user) and not cls._is_officer_or_admin(user):
            raise PermissionDenied("You are not eligible to claim this graph assignment.")
        if assignment.status not in {AssignmentInstance.STATUS_AVAILABLE, AssignmentInstance.STATUS_PENDING}:
            raise ValidationError({"assignment_instance": "Only available or pending assignments can be claimed."})
        if assignment.assignee_user_id and assignment.assignee_user_id != user.id:
            raise ValidationError({"assignment_instance": "This assignment is already owned by another user."})
        previous_status = assignment.status
        now = timezone.now()
        assignment.assignee_user = user
        assignment.claimed_by = user
        assignment.claimed_at = now
        assignment.accepted_at = now
        assignment.status = AssignmentInstance.STATUS_ACCEPTED
        assignment.metadata_json = cls._merge_metadata(assignment.metadata_json, {"claimed": True})
        assignment.save(
            update_fields=[
                "assignee_user",
                "claimed_by",
                "claimed_at",
                "accepted_at",
                "status",
                "metadata_json",
                "updated_at",
            ]
        )
        cls._log_action(
            assignment=assignment,
            actor=user,
            action=AssignmentInstanceActionLog.ACTION_CLAIMED,
            previous_status=previous_status,
            new_status=assignment.status,
        )
        return assignment

    @classmethod
    @transaction.atomic
    def accept(cls, assignment_instance: AssignmentInstance, user):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if assignment.assignee_user_id != user.id and not cls._is_officer_or_admin(user):
            raise PermissionDenied("You may only accept your own graph assignment.")
        if assignment.status == AssignmentInstance.STATUS_ACCEPTED:
            return assignment
        if assignment.status not in {AssignmentInstance.STATUS_PENDING, AssignmentInstance.STATUS_AVAILABLE}:
            raise ValidationError({"assignment_instance": "Only pending assignments can be accepted."})
        if assignment.status == AssignmentInstance.STATUS_AVAILABLE and not assignment.assignee_user_id:
            raise ValidationError({"assignment_instance": "Available assignments must be claimed before they can be accepted."})
        previous_status = assignment.status
        assignment.status = AssignmentInstance.STATUS_ACCEPTED
        assignment.accepted_at = timezone.now()
        assignment.save(update_fields=["status", "accepted_at", "updated_at"])
        cls._log_action(
            assignment=assignment,
            actor=user,
            action=AssignmentInstanceActionLog.ACTION_ACCEPTED,
            previous_status=previous_status,
            new_status=assignment.status,
        )
        return assignment

    @classmethod
    @transaction.atomic
    def complete(cls, assignment_instance: AssignmentInstance, user, *, note: str = "", metadata_json: dict | None = None):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if assignment.assignee_user_id != user.id and not cls._is_officer_or_admin(user):
            raise PermissionDenied("You may only complete your own graph assignment.")
        if assignment.status in {AssignmentInstance.STATUS_COMPLETED, AssignmentInstance.STATUS_CANCELLED, AssignmentInstance.STATUS_DECLINED}:
            raise ValidationError({"assignment_instance": "This assignment can no longer be completed."})
        previous_status = assignment.status
        now = timezone.now()
        if not assignment.accepted_at:
            assignment.accepted_at = now
        assignment.status = AssignmentInstance.STATUS_COMPLETED
        assignment.completed_at = now
        assignment.completed_by = user
        assignment.metadata_json = cls._merge_metadata(assignment.metadata_json, metadata_json)
        assignment.save(update_fields=["status", "accepted_at", "completed_at", "completed_by", "metadata_json", "updated_at"])
        cls._log_action(
            assignment=assignment,
            actor=user,
            action=AssignmentInstanceActionLog.ACTION_COMPLETED,
            previous_status=previous_status,
            new_status=assignment.status,
            note=note,
            metadata_json=metadata_json,
        )
        return assignment

    @classmethod
    @transaction.atomic
    def cancel(cls, assignment_instance: AssignmentInstance, actor, *, reason: str = ""):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if not cls._is_officer_or_admin(actor):
            raise PermissionDenied("Only officers or administrators can cancel graph assignments.")
        if assignment.status in {AssignmentInstance.STATUS_COMPLETED, AssignmentInstance.STATUS_CANCELLED}:
            raise ValidationError({"assignment_instance": "This assignment cannot be cancelled."})
        previous_status = assignment.status
        assignment.status = AssignmentInstance.STATUS_CANCELLED
        assignment.cancelled_at = timezone.now()
        assignment.metadata_json = cls._merge_metadata(assignment.metadata_json, {"cancel_reason": reason} if reason else {})
        assignment.save(update_fields=["status", "cancelled_at", "metadata_json", "updated_at"])
        cls._log_action(
            assignment=assignment,
            actor=actor,
            action=AssignmentInstanceActionLog.ACTION_CANCELLED,
            previous_status=previous_status,
            new_status=assignment.status,
            note=reason,
        )
        return assignment

    @classmethod
    @transaction.atomic
    def decline(cls, assignment_instance: AssignmentInstance, user, *, reason: str = ""):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if assignment.assignee_user_id != user.id and not cls._is_officer_or_admin(user):
            raise PermissionDenied("You may only decline your own graph assignment.")
        if assignment.status in {AssignmentInstance.STATUS_COMPLETED, AssignmentInstance.STATUS_CANCELLED, AssignmentInstance.STATUS_DECLINED}:
            raise ValidationError({"assignment_instance": "This assignment cannot be declined."})
        previous_status = assignment.status
        assignment.status = AssignmentInstance.STATUS_DECLINED
        assignment.declined_at = timezone.now()
        assignment.metadata_json = cls._merge_metadata(assignment.metadata_json, {"decline_reason": reason} if reason else {})
        assignment.save(update_fields=["status", "declined_at", "metadata_json", "updated_at"])
        cls._log_action(
            assignment=assignment,
            actor=user,
            action=AssignmentInstanceActionLog.ACTION_DECLINED,
            previous_status=previous_status,
            new_status=assignment.status,
            note=reason,
        )
        return assignment

    @classmethod
    @transaction.atomic
    def reassign(cls, assignment_instance: AssignmentInstance, actor, *, new_assignee, reason: str = ""):
        assignment = cls._lock_assignment(assignment_instance)
        cls._ensure_assignment_actionable(assignment)
        if not cls._is_officer_or_admin(actor):
            raise PermissionDenied("Only officers or administrators can reassign graph assignments.")
        if assignment.status == AssignmentInstance.STATUS_COMPLETED:
            raise ValidationError({"assignment_instance": "Completed assignments cannot be reassigned."})
        if str(new_assignee.id) == assignment.assignee_id and assignment.assignee_user_id == new_assignee.id:
            raise ValidationError({"new_assignee": "The new assignee must differ from the current assignee."})
        previous_status = assignment.status
        assignment.status = AssignmentInstance.STATUS_CANCELLED
        assignment.cancelled_at = timezone.now()
        assignment.metadata_json = cls._merge_metadata(
            assignment.metadata_json,
            {"reassigned_to": str(new_assignee.id), "reassign_reason": reason} if reason else {"reassigned_to": str(new_assignee.id)},
        )
        assignment.save(update_fields=["status", "cancelled_at", "metadata_json", "updated_at"])
        cls._log_action(
            assignment=assignment,
            actor=actor,
            action=AssignmentInstanceActionLog.ACTION_REASSIGNED,
            previous_status=previous_status,
            new_status=assignment.status,
            note=reason,
            metadata_json={"new_assignee_id": str(new_assignee.id)},
        )
        replacement = AssignmentInstance.objects.create(
            node_instance=assignment.node_instance,
            assignee_type=AssignmentInstance.ASSIGNEE_USER,
            assignee_id=str(new_assignee.id),
            assignee_user=new_assignee,
            status=AssignmentInstance.STATUS_PENDING,
            metadata_json={"reassigned_from": str(assignment.id)},
        )
        cls._log_action(
            assignment=replacement,
            actor=actor,
            action=AssignmentInstanceActionLog.ACTION_REASSIGNED,
            previous_status="",
            new_status=replacement.status,
            note=reason,
            metadata_json={"previous_assignment_id": str(assignment.id)},
        )
        return replacement


class RuleEvaluationService:
    @staticmethod
    def _resolve_var(path: str, context: dict):
        current = context
        for part in str(path).split("."):
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current

    @classmethod
    def evaluate(cls, expression, context: dict):
        if expression in (None, "", {}):
            return True
        if isinstance(expression, bool):
            return expression
        if not isinstance(expression, dict):
            return bool(expression)
        if "var" in expression:
            return cls._resolve_var(expression["var"], context)
        if "==" in expression:
            left, right = expression["=="]
            return cls.evaluate(left, context) == cls.evaluate(right, context)
        if "!=" in expression:
            left, right = expression["!="]
            return cls.evaluate(left, context) != cls.evaluate(right, context)
        if ">" in expression:
            left, right = expression[">"]
            return cls.evaluate(left, context) > cls.evaluate(right, context)
        if "<" in expression:
            left, right = expression["<"]
            return cls.evaluate(left, context) < cls.evaluate(right, context)
        if "and" in expression:
            return all(cls.evaluate(item, context) for item in expression["and"])
        if "or" in expression:
            return any(cls.evaluate(item, context) for item in expression["or"])
        if "in" in expression:
            item, container = expression["in"]
            return cls.evaluate(item, context) in cls.evaluate(container, context)
        return False


class NodeExitGuard:
    @staticmethod
    def _has_value(value):
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, dict, tuple, set)):
            return len(value) > 0
        return True

    @classmethod
    def _check_forms(cls, *, node_instance: NodeInstance, payload: dict):
        errors = []
        bindings = (node_instance.form_snapshot_json or {}).get("bindings", [])
        for binding in bindings:
            if not binding.get("required_on_exit"):
                continue
            missing = []
            for field in binding.get("fields", []):
                if not field.get("required"):
                    continue
                if not cls._has_value(payload.get(field["key"])):
                    missing.append(field["key"])
            if missing:
                errors.append(
                    {
                        "binding_type": binding.get("binding_type", ""),
                        "form_definition_code": binding.get("form_definition_code", ""),
                        "missing_fields": missing,
                    }
                )
        return errors

    @staticmethod
    def _assignment_requirement(snapshot: dict, total_assignments: int):
        if not snapshot:
            return 0
        execution_mode = snapshot.get("execution_mode", NodeAssignmentBinding.EXECUTION_SEQUENTIAL)
        minimum_completions = int(snapshot.get("minimum_completions_required") or 0)
        if execution_mode == NodeAssignmentBinding.EXECUTION_PARALLEL_ANY:
            return 1
        if execution_mode == NodeAssignmentBinding.EXECUTION_PARALLEL_MINIMUM:
            return max(1, minimum_completions)
        return total_assignments

    @classmethod
    def _check_assignments(cls, *, node_instance: NodeInstance):
        snapshot = node_instance.assignment_policy_snapshot_json or {}
        if not snapshot:
            return {}
        assignments = node_instance.assignment_instances.exclude(status=AssignmentInstance.STATUS_CANCELLED)
        actionable_assignments = assignments.exclude(status=AssignmentInstance.STATUS_DECLINED)
        total_assignments = assignments.count()
        actionable_count = actionable_assignments.count()
        completed_assignments = actionable_assignments.filter(status=AssignmentInstance.STATUS_COMPLETED).count()
        minimum_assignees = int(snapshot.get("minimum_assignees") or 0)
        required_completions = min(cls._assignment_requirement(snapshot, actionable_count), actionable_count)
        blocked_reasons = []
        if total_assignments < minimum_assignees:
            blocked_reasons.append("Assignment resolution did not create the minimum required assignees for this node.")
        if completed_assignments < required_completions:
            blocked_reasons.append(
                f"{required_completions} completed assignment(s) are required before this node can exit."
            )
        return {
            "required": bool(snapshot),
            "total_assignments": total_assignments,
            "completed_assignments": completed_assignments,
            "required_completions": required_completions,
            "blocked_reasons": blocked_reasons,
        }

    @classmethod
    def _check_rules(cls, *, node_instance: NodeInstance, action_key: str, payload: dict):
        errors = []
        context = {
            "payload": payload,
            "workflow_instance_id": str(node_instance.workflow_instance_id),
            "node_code": node_instance.node.code,
            "action_key": action_key,
        }
        rules = node_instance.node.rules.filter(
            enabled=True,
            rule_type=WorkflowRule.RULE_EXIT_CONDITION,
        ).order_by("priority", "created_at")
        for rule in rules:
            if not RuleEvaluationService.evaluate(rule.expression, context):
                errors.append(
                    {
                        "rule_id": str(rule.id),
                        "rule_type": rule.rule_type,
                        "message": "Node exit condition failed.",
                    }
                )
        return errors

    @classmethod
    def can_exit(cls, node_instance: NodeInstance, action_key: str, context: dict | None = None):
        payload = (context or {}).get("payload", {})
        form_errors = cls._check_forms(node_instance=node_instance, payload=payload)
        assignment_summary = cls._check_assignments(node_instance=node_instance)
        rule_errors = cls._check_rules(node_instance=node_instance, action_key=action_key, payload=payload)
        errors = {}
        if form_errors:
            errors["forms"] = form_errors
        if assignment_summary.get("blocked_reasons"):
            errors["assignments"] = assignment_summary
        if rule_errors:
            errors["rules"] = rule_errors
        if errors:
            raise ValidationError({"node_exit_guard": errors})
        return {
            "allowed": True,
            "assignment_summary": assignment_summary,
        }


class TransitionResolverService:
    @staticmethod
    def resolve(*, instance: WorkflowInstance, node: WorkflowNode, action_key: str, payload: dict | None = None):
        context = {
            "payload": payload or {},
            "entity_type": instance.entity_type,
            "entity_id": instance.entity_id,
            "workflow_instance_id": str(instance.id),
            "node_code": node.code,
            "action_key": action_key,
        }
        candidates = list(
            instance.workflow_definition.transitions.filter(
                from_node=node,
                is_active=True,
            ).order_by("priority", "created_at")
        )
        matched = []
        default_transition = None
        for transition in candidates:
            if transition.is_default and not transition.action_key:
                default_transition = transition
            if transition.action_key and transition.action_key != action_key:
                continue
            result = RuleEvaluationService.evaluate(transition.condition_expression, context)
            if result:
                matched.append((transition, {"matched": True, "condition_result": result}))
        if matched:
            return matched[0]
        fallback = next((transition for transition in candidates if transition.is_default and (not transition.action_key or transition.action_key == action_key)), None) or default_transition
        if fallback:
            return fallback, {"matched": False, "condition_result": "default"}
        raise ValidationError({"action_key": f"No valid transition found for action `{action_key}` on node `{node.code}`."})


class GraphWorkflowRuntimeService:
    @staticmethod
    def _graph_mode(definition: WorkflowDefinition) -> bool:
        return definition.nodes.filter(is_active=True).exists()

    @staticmethod
    def _initial_node(definition: WorkflowDefinition):
        return definition.nodes.filter(is_initial=True, is_active=True).first()

    @staticmethod
    def _node_assignment_snapshot(node: WorkflowNode):
        binding = getattr(node, "assignment_binding", None)
        if not binding:
            return {}
        return {
            "assignment_policy_id": str(binding.assignment_policy_id),
            "assignment_policy_code": binding.assignment_policy.code,
            "assignment_policy_type": binding.assignment_policy.policy_type,
            "minimum_assignees": binding.minimum_assignees,
            "maximum_assignees": binding.maximum_assignees,
            "execution_mode": binding.execution_mode,
            "minimum_completions_required": binding.minimum_completions_required,
            "sla_hours": binding.assignment_policy.sla_hours,
        }

    @staticmethod
    def _node_form_snapshot(node: WorkflowNode):
        bindings = node.form_bindings.filter(is_active=True).select_related("form_definition").prefetch_related("form_definition__sections__fields")
        return {
            "bindings": [
                {
                    "form_definition_id": str(binding.form_definition_id),
                    "form_definition_code": binding.form_definition.code,
                    "binding_type": binding.binding_type,
                    "mode": binding.mode,
                    "required_on_entry": binding.required_on_entry,
                    "required_on_exit": binding.required_on_exit,
                    "fields": [
                        {
                            "key": field.key,
                            "required": field.required,
                            "field_type": field.field_type,
                        }
                        for section in binding.form_definition.sections.all().order_by("ordering")
                        for field in section.fields.all().order_by("ordering")
                    ],
                }
                for binding in bindings
            ]
        }

    @classmethod
    def _enter_node(cls, *, instance: WorkflowInstance, node: WorkflowNode):
        node_instance = NodeInstance.objects.create(
            workflow_instance=instance,
            node=node,
            status=NodeInstance.STATUS_ACTIVE,
            entered_at=timezone.now(),
            assignment_policy_snapshot_json=cls._node_assignment_snapshot(node),
            form_snapshot_json=cls._node_form_snapshot(node),
        )
        AssignmentResolutionService.resolve_for_node_instance(node_instance)
        return node_instance

    @classmethod
    @transaction.atomic
    def start(cls, *, definition: WorkflowDefinition, actor, entity_type: str = "", entity_id: str = "", payload_json: dict | None = None, submission: Submission | None = None):
        if definition.status != WorkflowDefinition.STATUS_ACTIVE:
            raise ValidationError({"workflow_definition": "Only active workflow definitions can start new workflow instances."})
        WorkflowValidationService.ensure_valid(definition)
        if not cls._graph_mode(definition):
            raise ValidationError({"workflow_definition": "This definition does not yet have a graph to execute."})
        initial_node = cls._initial_node(definition)
        if not initial_node:
            raise ValidationError({"workflow_definition": "A graph workflow requires exactly one initial node."})
        instance = WorkflowInstance.objects.create(
            submission=submission,
            workflow_definition=definition,
            workflow_definition_version=definition.version,
            entity_type=entity_type or ("submission" if submission else ""),
            entity_id=entity_id or (str(submission.id) if submission else ""),
            current_node=initial_node,
            status=WorkflowInstance.STATUS_IN_PROGRESS,
            started_at=timezone.now(),
            started_by=actor,
        )
        node_instance = cls._enter_node(instance=instance, node=initial_node)
        WorkflowDataEnvelope.objects.create(
            workflow_instance=instance,
            payload_json=payload_json or {},
            schema_version=1,
        )
        WorkflowAuditLog.objects.create(
            workflow_definition=definition,
            node=initial_node,
            performed_by=actor,
            action=WorkflowAuditLog.ACTION_ACTIVATED,
            metadata={"graph_runtime_started": True, "workflow_instance_id": str(instance.id)},
        )
        return instance, node_instance

    @classmethod
    @transaction.atomic
    def perform_action(cls, *, instance: WorkflowInstance, actor, action_key: str, comment: str = "", payload_json: dict | None = None):
        # Lock only the instance row: PostgreSQL refuses FOR UPDATE on the nullable side of a join (current_node).
        instance = WorkflowInstance.objects.select_for_update(of=("self",)).select_related("workflow_definition", "current_node").get(id=instance.id)
        if not instance.current_node_id:
            raise ValidationError({"detail": "This workflow instance is not currently executing a graph node."})
        if instance.status != WorkflowInstance.STATUS_IN_PROGRESS:
            raise ValidationError({"detail": "Only running graph workflow instances can accept actions."})
        current_node = instance.current_node
        current_node_instance = instance.node_instances.filter(node=current_node, status=NodeInstance.STATUS_ACTIVE).order_by("-entered_at").first()
        if not current_node_instance:
            raise ValidationError({"detail": "No active node instance exists for the current node."})
        action = current_node.actions.filter(key=action_key, is_active=True).first()
        if not action and current_node.actions.filter(is_active=True).exists():
            raise ValidationError({"action_key": f"Action `{action_key}` is not configured for node `{current_node.code}`."})
        if action and action.requires_comment and not comment:
            raise ValidationError({"comment": "A comment is required for this action."})
        envelope, _ = WorkflowDataEnvelope.objects.get_or_create(workflow_instance=instance, defaults={"payload_json": {}, "schema_version": 1})
        if payload_json:
            merged = dict(envelope.payload_json)
            merged.update(payload_json)
            envelope.payload_json = merged
            envelope.save(update_fields=["payload_json", "updated_at"])
        NodeExitGuard.can_exit(current_node_instance, action_key, context={"payload": envelope.payload_json})
        transition, resolution = TransitionResolverService.resolve(instance=instance, node=current_node, action_key=action_key, payload=envelope.payload_json)
        current_node_instance.status = NodeInstance.STATUS_COMPLETED
        current_node_instance.exited_at = timezone.now()
        current_node_instance.metadata_json = {"action_key": action_key, "comment": comment}
        current_node_instance.save(update_fields=["status", "exited_at", "metadata_json", "updated_at"])
        next_node = transition.to_node
        TransitionExecutionLog.objects.create(
            workflow_instance=instance,
            node_instance=current_node_instance,
            from_node=current_node,
            to_node=next_node,
            transition=transition,
            action_key=action_key,
            triggered_by=actor,
            condition_result=resolution,
        )
        if next_node.is_terminal or next_node.node_type == WorkflowNode.TYPE_END or (action and action.is_terminal_action):
            instance.current_node = next_node
            instance.status = WorkflowInstance.STATUS_COMPLETED
            instance.completed_at = timezone.now()
            instance.save(update_fields=["current_node", "status", "completed_at", "updated_at"])
            completed_node_instance = NodeInstance.objects.create(
                workflow_instance=instance,
                node=next_node,
                status=NodeInstance.STATUS_COMPLETED,
                entered_at=timezone.now(),
                exited_at=timezone.now(),
                assignment_policy_snapshot_json=cls._node_assignment_snapshot(next_node),
                form_snapshot_json=cls._node_form_snapshot(next_node),
            )
            AssignmentResolutionService.resolve_for_node_instance(completed_node_instance)
        else:
            instance.current_node = next_node
            instance.save(update_fields=["current_node", "updated_at"])
            cls._enter_node(instance=instance, node=next_node)
        return instance

    @classmethod
    @transaction.atomic
    def pause(cls, instance: WorkflowInstance, actor, reason: str = ""):
        instance = WorkflowInstance.objects.select_for_update().get(id=instance.id)
        if instance.status != WorkflowInstance.STATUS_IN_PROGRESS:
            raise ValidationError({"detail": "Only running workflow instances can be paused."})
        instance.status = WorkflowInstance.STATUS_PAUSED
        instance.paused_at = timezone.now()
        instance.pause_reason = reason
        instance.paused_by = actor
        instance.save(update_fields=["status", "paused_at", "pause_reason", "paused_by", "updated_at"])
        return instance

    @classmethod
    @transaction.atomic
    def resume(cls, instance: WorkflowInstance, actor, reason: str = ""):
        instance = WorkflowInstance.objects.select_for_update().get(id=instance.id)
        if instance.status != WorkflowInstance.STATUS_PAUSED:
            raise ValidationError({"detail": "Only paused workflow instances can be resumed."})
        instance.status = WorkflowInstance.STATUS_IN_PROGRESS
        instance.save(update_fields=["status", "updated_at"])
        return instance

    @classmethod
    @transaction.atomic
    def cancel(cls, instance: WorkflowInstance, actor, reason: str = ""):
        instance = WorkflowInstance.objects.select_for_update().get(id=instance.id)
        if instance.status in {WorkflowInstance.STATUS_COMPLETED, WorkflowInstance.STATUS_CANCELLED}:
            return instance
        instance.status = WorkflowInstance.STATUS_CANCELLED
        instance.completed_at = timezone.now()
        instance.save(update_fields=["status", "completed_at", "updated_at"])
        active_node = instance.node_instances.filter(status=NodeInstance.STATUS_ACTIVE)
        active_node.update(status=NodeInstance.STATUS_CANCELLED, exited_at=timezone.now(), updated_at=timezone.now())
        return instance


class WorkflowRuntimeService:
    ACTION_SCREEN_OUT = "screen_out"
    ACTION_SEND_BACK = "send_back"

    ACTION_TO_INSTANCE_STATUS = {
        WorkflowActionLog.ACTION_REJECT: WorkflowInstance.STATUS_REJECTED,
        WorkflowActionLog.ACTION_RETURN: WorkflowInstance.STATUS_RETURNED,
    }

    @staticmethod
    def _locked_submission(submission: Submission) -> Submission:
        # Lock only the submission row: innovator is nullable (guest submissions), and
        # PostgreSQL refuses FOR UPDATE on the nullable side of an outer join.
        return Submission.objects.select_for_update(of=("self",)).select_related("program", "innovator").get(id=submission.id)

    @staticmethod
    def _locked_instance(instance: WorkflowInstance) -> WorkflowInstance:
        return WorkflowInstance.objects.select_for_update().select_related("workflow_definition").get(id=instance.id)

    @staticmethod
    def _compute_due_at(step):
        if not step:
            return None
        return timezone.now() + timezone.timedelta(hours=step.due_in_hours or 72)

    @staticmethod
    def _log_history(submission: Submission, actor, from_status: str, to_status: str, reason: str = "", comment: str = ""):
        if from_status == to_status and not reason and not comment:
            return None
        return SubmissionStatusHistory.objects.create(
            submission=submission,
            from_status=from_status,
            to_status=to_status,
            changed_by=actor,
            reason=reason,
            comment=comment,
        )

    @staticmethod
    def _append_note(submission: Submission, actor, note: str):
        if note:
            return SubmissionInternalNote.objects.create(submission=submission, author=actor, note=note)
        return None

    @staticmethod
    def _user_role_codes(user):
        if not user or not user.is_authenticated:
            return set()
        return set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))

    @staticmethod
    def _active_assignments(instance: WorkflowInstance):
        step = instance.current_step
        if not step:
            return Assignment.objects.none()
        return instance.submission.assignments.filter(
            workflow_step=step,
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
        )

    @staticmethod
    def _step_tasks(instance: WorkflowInstance):
        step = instance.current_step
        if not step:
            return TaskExecution.objects.none()
        return instance.tasks.filter(workflow_step=step)

    @staticmethod
    def _create_step_tasks(instance: WorkflowInstance, *, step: WorkflowStep, actor=None):
        if not step:
            return []
        if step.requires_assignment:
            return list(instance.tasks.filter(workflow_step=step))
        task, _ = TaskExecution.objects.get_or_create(
            workflow_instance=instance,
            workflow_step=step,
            assignment=None,
            defaults={
                "assignee": actor if actor and step.role_required in WorkflowRuntimeService._user_role_codes(actor) else None,
                "due_at": WorkflowRuntimeService._compute_due_at(step),
            },
        )
        return [task]

    @staticmethod
    def _ensure_timed_evaluation_cycle(submission: Submission, step: WorkflowStep | None):
        if not step or not step.requires_evaluation:
            return None
        try:
            stage_config = step.evaluation_config
        except Exception:
            return None
        try:
            from apps.evaluation.models import StageEvaluationConfig
            from apps.evaluation.services import ReviewCycleService

            if stage_config.review_mode != StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
                return None
            return ReviewCycleService.get_or_open(submission=submission, workflow_step=step)
        except Exception:
            return None

    @staticmethod
    def task_summary(instance: WorkflowInstance, user=None):
        step = instance.current_step
        tasks = WorkflowRuntimeService._step_tasks(instance).select_related("assignee", "assignment").order_by(
            models.Case(
                models.When(status=TaskExecution.STATUS_CLAIMED, then=0),
                models.When(status=TaskExecution.STATUS_PENDING, then=1),
                models.When(status=TaskExecution.STATUS_COMPLETED, then=2),
                default=3,
                output_field=models.IntegerField(),
            ),
            "-created_at",
        )
        include_staff = bool(user and user.is_authenticated and (user.is_superuser or WorkflowRuntimeService._user_role_codes(user) & {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR, RoleType.MANAGEMENT_VIEWER, RoleType.JUDGE}))
        items = []
        for task in tasks:
            item = {
                "task_id": str(task.id),
                "status": task.status,
                "due_at": task.due_at,
                "outcome": task.outcome,
            }
            if include_staff:
                item["assignee_id"] = str(task.assignee_id) if task.assignee_id else None
                item["assignee_name"] = task.assignee.full_name if task.assignee_id else ""
                item["assignment_id"] = str(task.assignment_id) if task.assignment_id else None
                item["comment"] = task.comment
            items.append(item)
        if (
            include_staff
            and step
            and step.requires_assignment
            and step.assignment_role
            and user
            and user.is_authenticated
        ):
            try:
                from apps.assignments.services import AssignmentService  # noqa: PLC0415

                required_slots = step.minimum_assignments or 0
                try:
                    from apps.evaluation.models import StageEvaluationConfig  # noqa: PLC0415

                    config = getattr(step, "evaluation_config", None)
                    if (
                        step.requires_evaluation
                        and config
                        and config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
                    ):
                        required_slots = config.maximum_reviews_allowed or required_slots or 20
                except Exception:
                    pass

                active_assignments = instance.submission.assignments.filter(
                    workflow_step=step,
                    role_type=step.assignment_role,
                    status__in=AssignmentService.ACTIVE_ASSIGNMENT_STATUSES,
                )
                eligible_roles = AssignmentService.eligible_assignment_roles_for_user(user)
                has_my_assignment = active_assignments.filter(assignee=user).exists()
                has_my_open_task = tasks.filter(
                    assignee=user,
                    status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED],
                ).exists()
                can_claim = (
                    step.assignment_role in eligible_roles
                    and required_slots > active_assignments.count()
                    and not has_my_assignment
                    and not has_my_open_task
                )
                if can_claim:
                    items.append({
                        "task_id": None,
                        "status": TaskExecution.STATUS_PENDING,
                        "due_at": instance.due_at,
                        "outcome": "",
                        "assignee_id": None,
                        "assignee_name": "",
                        "assignment_id": None,
                        "comment": "",
                        "can_claim_submission": True,
                        "claim_submission_id": str(instance.submission_id),
                    })
            except Exception:
                pass
        return {
            "count": tasks.count(),
            "completed_count": tasks.filter(status=TaskExecution.STATUS_COMPLETED).count(),
            "pending_count": sum(
                1
                for item in items
                if item["status"] in [TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]
            ),
            "items": items,
        }

    @staticmethod
    def step_completion_summary(instance: WorkflowInstance):
        return StepCompletionEvaluator.evaluate(instance=instance)

    @staticmethod
    def _step_has_criteria(step: "WorkflowStep | None") -> bool:
        """True when the step has any configured scoring criteria attached."""
        if not step or not step.requires_evaluation:
            return False
        try:
            stage_config = getattr(step, "evaluation_config", None)
            if stage_config and stage_config.effective_criteria:
                return True
        except Exception:
            pass
        if step.evaluation_round_id:
            try:
                return step.evaluation_round.rubric.criteria.exists()
            except Exception:
                return False
        return False

    @staticmethod
    def evaluation_readiness(instance: WorkflowInstance):
        step = instance.current_step

        if step and step.requires_evaluation and not WorkflowRuntimeService._step_has_criteria(step):
            completion = StepCompletionEvaluator.evaluate(instance=instance, step=step)
            required = step.minimum_completions_required if step else 0
            return {
                "required_evaluations": required,
                "completed_evaluations": completion["completed_tasks"],
                "pending_evaluations": completion["pending_tasks"],
                "conflicted_evaluations": 0,
                "declined_evaluations": 0,
                "may_advance": completion["may_advance"],
                "blocked_reasons": completion["blocked_reasons"],
            }

        assignments = instance.submission.assignments.filter(workflow_step=step, role_type=AssignmentRoleType.JUDGE)
        final_qs = ScoreSheet.objects.filter(
            submission=instance.submission,
            evaluation_round=step.evaluation_round if step and step.evaluation_round_id else None,
            status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
            is_final=True,
        ) if step and step.requires_evaluation else ScoreSheet.objects.none()
        if step and step.requires_evaluation and not step.evaluation_round_id:
            final_qs = ScoreSheet.objects.filter(
                submission=instance.submission,
                status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
                is_final=True,
            )
        completed = final_qs.values("judge_id").distinct().count()
        pending = assignments.filter(status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED]).count()
        conflicted = assignments.filter(conflict_declaration__isnull=False).count()
        declined = assignments.filter(status=AssignmentStatus.DECLINED).count()
        required = step.minimum_evaluations if step else 0
        may_advance = completed >= required and pending == 0
        blocked_reasons = []
        if completed < required:
            blocked_reasons.append("Minimum final evaluations not reached.")
        if pending:
            blocked_reasons.append("Pending evaluator assignments remain open.")
        if conflicted:
            blocked_reasons.append("Conflicted evaluator assignments remain unresolved.")
        return {
            "required_evaluations": required,
            "completed_evaluations": completed,
            "pending_evaluations": pending,
            "conflicted_evaluations": conflicted,
            "declined_evaluations": declined,
            "may_advance": may_advance,
            "blocked_reasons": blocked_reasons,
        }

    @staticmethod
    def _final_evaluations(instance: WorkflowInstance):
        return ScoreSheet.objects.filter(
            submission=instance.submission,
            status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
            is_final=True,
        )

    @staticmethod
    def _can_act_on_step(instance: WorkflowInstance, actor):
        if not actor or not actor.is_authenticated:
            return False
        if actor.is_superuser:
            return True
        step = instance.current_step
        if not step:
            return False
        role_codes = WorkflowRuntimeService._user_role_codes(actor)
        officer_like = bool(role_codes & {RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR})

        if step.requires_assignment:
            if officer_like:
                return True
            return instance.submission.assignments.filter(
                workflow_step=step,
                assignee=actor,
                status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
            ).exists()

        if step.role_required in {RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR}:
            return officer_like
        if step.role_required == RoleType.INNOVATION_MANAGER:
            return bool(role_codes & {RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR})
        return step.role_required in role_codes

    @staticmethod
    def allowed_actions_for_user(instance: WorkflowInstance, user):
        if not instance or not instance.current_step:
            return []
        if instance.status == WorkflowInstance.STATUS_RETURNED and user.is_authenticated and instance.submission.innovator_id == user.id:
            return [WorkflowActionLog.ACTION_RESUBMIT]
        if WorkflowRuntimeService._can_act_on_step(instance, user):
            step = instance.current_step
            actions = list(step.actions_allowed)
            if step.requires_evaluation and not WorkflowRuntimeService._step_has_criteria(step):
                actions = [a for a in actions if a != "score_submitted"]
                for a in (WorkflowActionLog.ACTION_APPROVE, WorkflowActionLog.ACTION_REJECT, WorkflowActionLog.ACTION_RETURN):
                    if a not in actions:
                        actions.append(a)
            return actions
        return []

    @staticmethod
    def _validate_step_action(instance: WorkflowInstance, actor, action: str, comment: str = ""):
        if instance.status == WorkflowInstance.STATUS_PAUSED:
            raise ValidationError("This workflow is paused and cannot progress until resumed.")
        if instance.status in {WorkflowInstance.STATUS_COMPLETED, WorkflowInstance.STATUS_REJECTED, WorkflowInstance.STATUS_CANCELLED}:
            raise ValidationError("This workflow is already closed.")
        if not instance.current_step:
            raise ValidationError("Workflow instance has no active step.")
        step = instance.current_step
        no_criteria = step.requires_evaluation and not WorkflowRuntimeService._step_has_criteria(step)
        effective_actions = list(step.actions_allowed)
        if no_criteria and action in (WorkflowActionLog.ACTION_APPROVE, WorkflowActionLog.ACTION_REJECT, WorkflowActionLog.ACTION_RETURN):
            effective_actions = effective_actions + [WorkflowActionLog.ACTION_APPROVE, WorkflowActionLog.ACTION_REJECT, WorkflowActionLog.ACTION_RETURN]
        if action not in effective_actions:
            raise ValidationError(f"Action `{action}` is not allowed on step `{step.name}`.")
        if action in {WorkflowActionLog.ACTION_RETURN, WorkflowRuntimeService.ACTION_SEND_BACK} and not comment:
            raise ValidationError({"comment": "A comment is required for this action."})
        if step.role_required == RoleType.INNOVATION_MANAGER and action in {
            WorkflowActionLog.ACTION_APPROVE,
            WorkflowActionLog.ACTION_REJECT,
            WorkflowActionLog.ACTION_RETURN,
        } and not comment:
            raise ValidationError({"comment": "A manager comment is required before releasing feedback to the innovator."})
        if not WorkflowRuntimeService._can_act_on_step(instance, actor):
            raise PermissionDenied("You do not have permission to perform this workflow action.")
        if action == WorkflowActionLog.ACTION_APPROVE:
            if step.requires_assignment:
                completion = StepCompletionEvaluator.evaluate(instance=instance)
                if not completion["may_advance"]:
                    raise ValidationError({"tasks": completion["blocked_reasons"] or [completion["completion_reason"]]})
            if step.requires_evaluation and not no_criteria:
                readiness = WorkflowRuntimeService.evaluation_readiness(instance)
                if not readiness["may_advance"]:
                    raise ValidationError({"evaluation": readiness["blocked_reasons"] or ["The current workflow step is not evaluation-ready."]})

    @staticmethod
    def _resolve_step_transition(instance: WorkflowInstance, action: str):
        if not instance.current_step_id:
            return None, None

        definition = instance.workflow_definition
        current_step = instance.current_step
        current_node = definition.nodes.filter(code=current_step.code, is_active=True).first()
        if not current_node:
            return None, None

        transition = (
            definition.transitions
            .filter(from_node=current_node, is_active=True, action_key=action)
            .select_related("to_node")
            .order_by("priority", "created_at")
            .first()
        )
        if not transition:
            transition = (
                definition.transitions
                .filter(from_node=current_node, is_active=True, is_default=True)
                .select_related("to_node")
                .order_by("priority", "created_at")
                .first()
            )
        if not transition:
            return None, None

        next_step = definition.steps.filter(code=transition.to_node.code, is_active=True).first()
        return next_step, transition.to_node

    @staticmethod
    def _terminal_submission_status_from_node(node: WorkflowNode | None):
        if not node:
            return ""
        code = (node.code or "").lower()
        valid_statuses = {choice for choice, _label in SubmissionStatus.choices}
        return code if code in valid_statuses else ""

    @staticmethod
    def _next_step(instance: WorkflowInstance, action: str | None = None):
        if not instance.current_step:
            return None
        if action:
            next_step, _target_node = WorkflowRuntimeService._resolve_step_transition(instance, action)
            if next_step:
                return next_step
        return instance.workflow_definition.steps.filter(order__gt=instance.current_step.order, is_active=True).order_by("order").first()

    @staticmethod
    def _log_action(instance, step, action, actor, comment="", metadata=None):
        return WorkflowActionLog.objects.create(
            workflow_instance=instance,
            step=step,
            action=action,
            performed_by=actor,
            comment=comment,
            metadata=metadata or {},
        )

    @staticmethod
    def _latest_completed_review_cycle(submission: Submission, step_code: str):
        from apps.evaluation.models import ReviewCycle  # noqa: PLC0415

        return (
            ReviewCycle.objects
            .filter(
                submission=submission,
                workflow_step__code=step_code,
                status=ReviewCycle.STATUS_COMPLETED,
                outcome__isnull=False,
            )
            .order_by("-closed_at", "-created_at")
            .first()
        )

    @staticmethod
    def _manager_approved_action(*, submission: Submission, step: WorkflowStep, default_action: str):
        if default_action != WorkflowActionLog.ACTION_APPROVE:
            return default_action

        source_step = {
            "innovation_manager_review": "officer_review",
            "committee_manager_review": "committee_review",
        }.get(step.code if step else "")
        if not source_step:
            return default_action

        cycle = WorkflowRuntimeService._latest_completed_review_cycle(submission, source_step)
        if not cycle:
            raise ValidationError("No completed scoring outcome is available for manager approval.")

        from apps.evaluation.models import ReviewCycle  # noqa: PLC0415

        if cycle.outcome == ReviewCycle.OUTCOME_PASS:
            return WorkflowActionLog.ACTION_APPROVE
        if cycle.outcome == ReviewCycle.OUTCOME_RETURN:
            return WorkflowActionLog.ACTION_RETURN
        if cycle.outcome == ReviewCycle.OUTCOME_REJECT:
            return (
                WorkflowRuntimeService.ACTION_SCREEN_OUT
                if source_step == "officer_review"
                else WorkflowActionLog.ACTION_REJECT
            )
        return default_action

    @staticmethod
    def _send_back_target_code(step: WorkflowStep | None):
        return {
            "innovation_manager_review": "officer_review",
            "committee_manager_review": "committee_review",
        }.get(step.code if step else "")

    @staticmethod
    def _reopen_step_for_review(*, instance: WorkflowInstance, submission: Submission, target_step: WorkflowStep, actor, comment: str):
        from apps.evaluation.services import ReviewCycleService  # noqa: PLC0415

        previous_status = submission.current_status
        previous_reviewers = []
        seen_reviewers = set()
        if target_step.requires_assignment and target_step.assignment_role:
            required_slots = target_step.minimum_assignments or 1
            for assignment in (
                submission.assignments
                .filter(workflow_step=target_step, assignee__isnull=False)
                .select_related("assignee")
                .order_by("-completed_at", "-updated_at")
            ):
                if assignment.assignee_id in seen_reviewers:
                    continue
                seen_reviewers.add(assignment.assignee_id)
                previous_reviewers.append((assignment.assignee, assignment))
                if len(previous_reviewers) >= required_slots:
                    break
        submission.assignments.filter(workflow_step=target_step).update(
            status=AssignmentStatus.REASSIGNED,
            reassigned_at=timezone.now(),
            updated_at=timezone.now(),
        )
        instance.tasks.filter(workflow_step=target_step).exclude(status=TaskExecution.STATUS_CANCELLED).update(
            status=TaskExecution.STATUS_REASSIGNED,
            completed_at=timezone.now(),
            comment=comment,
            updated_at=timezone.now(),
        )
        if target_step.requires_evaluation:
            ReviewCycleService.open_new_cycle(submission=submission, workflow_step=target_step)
        instance.current_step = target_step
        instance.status = WorkflowInstance.STATUS_IN_PROGRESS
        instance.due_at = WorkflowRuntimeService._compute_due_at(target_step)
        instance.save(update_fields=["current_step", "status", "due_at", "updated_at"])
        WorkflowRuntimeService._sync_submission(submission, status_value=target_step.submission_status, locked=True)
        WorkflowRuntimeService._create_step_tasks(instance, step=target_step, actor=actor)
        if previous_reviewers:
            from apps.assignments.services import AssignmentService  # noqa: PLC0415

            for reviewer, previous_assignment in previous_reviewers:
                try:
                    new_assignment = AssignmentService.create_assignment(
                        submission=submission,
                        assignee=reviewer,
                        role_type=target_step.assignment_role,
                        assigned_by=actor,
                        deadline=instance.due_at,
                        previous_assignment=previous_assignment,
                    )
                    AssignmentService.respond(
                        new_assignment,
                        reviewer,
                        accept=True,
                        note="Reassigned after manager send-back.",
                    )
                except Exception:
                    continue
        WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, comment=comment)

    @staticmethod
    def _clear_stale_step_assignments(*, instance: WorkflowInstance, submission: Submission, step: WorkflowStep):
        """
        When a workflow revisits an assignment-based step, old completed work for
        that same step must not consume the new claim slots.  The historical
        action logs remain intact; these records are just retired from the live
        queue so the step can be claimed again.
        """
        if not step or not step.requires_assignment:
            return
        submission.assignments.filter(
            workflow_step=step,
            status__in=[
                AssignmentStatus.ASSIGNED,
                AssignmentStatus.ACCEPTED,
                AssignmentStatus.COMPLETED,
            ],
        ).update(
            status=AssignmentStatus.REASSIGNED,
            reassigned_at=timezone.now(),
            updated_at=timezone.now(),
        )
        instance.tasks.filter(workflow_step=step).exclude(
            status__in=[TaskExecution.STATUS_CANCELLED, TaskExecution.STATUS_REASSIGNED]
        ).update(
            status=TaskExecution.STATUS_REASSIGNED,
            completed_at=timezone.now(),
            comment="Retired before re-entering this workflow step.",
            updated_at=timezone.now(),
        )

    @staticmethod
    def _restore_previous_step_assignees(*, instance: WorkflowInstance, submission: Submission, step: WorkflowStep, actor):
        """
        When a workflow returns to an assignment-based gate, restore the people
        who handled that same gate before.  This keeps manager send-back loops
        with the same manager instead of leaving the step with stale reassigned
        tasks and no active decision owner.
        """
        if not step or not step.requires_assignment or not step.assignment_role:
            return []
        from apps.assignments.services import AssignmentService  # noqa: PLC0415

        required_slots = step.minimum_assignments or 1
        previous = []
        seen = set()
        for assignment in (
            submission.assignments
            .filter(workflow_step=step, assignee__isnull=False)
            .select_related("assignee")
            .order_by("-completed_at", "-reassigned_at", "-updated_at")
        ):
            if assignment.assignee_id in seen:
                continue
            seen.add(assignment.assignee_id)
            previous.append((assignment.assignee, assignment))
            if len(previous) >= required_slots:
                break

        restored = []
        for assignee, previous_assignment in previous:
            try:
                new_assignment = AssignmentService.create_assignment(
                    submission=submission,
                    assignee=assignee,
                    role_type=step.assignment_role,
                    assigned_by=actor,
                    deadline=instance.due_at,
                    previous_assignment=previous_assignment,
                )
                AssignmentService.respond(
                    new_assignment,
                    assignee,
                    accept=True,
                    note="Reassigned after workflow returned to this step.",
                )
                restored.append(new_assignment)
            except Exception:
                continue
        return restored

    @staticmethod
    def _sync_submission(submission: Submission, *, status_value: str, locked: bool):
        submission.current_status = status_value
        submission.locked_for_editing = locked
        submission.save(update_fields=["current_status", "locked_for_editing", "updated_at"])
        return submission

    @staticmethod
    def _score_snapshot(submission: Submission):
        final_sheets = submission.score_sheets.filter(status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED], is_final=True)
        count = final_sheets.count()
        if not count:
            return {}
        average = sum(float(sheet.total_score) for sheet in final_sheets) / count
        return {"final_evaluations": count, "average_score": average}

    @staticmethod
    def _sync_outcome(*, submission: Submission, actor, step, rationale: str = "", ranking_position=None):
        status_to_outcome = {
            SubmissionStatus.SHORTLISTED: SubmissionOutcomeType.SHORTLISTED,
            SubmissionStatus.FINALIST: SubmissionOutcomeType.FINALIST,
            SubmissionStatus.WINNER: SubmissionOutcomeType.WINNER,
            SubmissionStatus.REJECTED: SubmissionOutcomeType.REJECTED,
            SubmissionStatus.APPROVED: SubmissionOutcomeType.APPROVED,
        }
        outcome_type = status_to_outcome.get(submission.current_status)
        if not outcome_type:
            return None
        existing = submission.outcomes.filter(is_current=True).first()
        if existing and existing.outcome_type == outcome_type and existing.ranking_position == ranking_position:
            return existing
        SubmissionOutcome.objects.filter(submission=submission, is_current=True).update(is_current=False)
        outcome = SubmissionOutcome.objects.create(
            submission=submission,
            program=submission.program,
            outcome_type=outcome_type,
            decided_by=actor,
            decision_step=step,
            decided_at=timezone.now(),
            score_snapshot=WorkflowRuntimeService._score_snapshot(submission),
            ranking_position=ranking_position,
            rationale=rationale,
            is_current=True,
        )
        AuditService.log_action(
            actor=actor,
            action_type="submission_outcome_recorded",
            target=submission,
            metadata={"outcome_id": str(outcome.id), "outcome_type": outcome_type, "ranking_position": ranking_position},
        )
        return outcome

    @staticmethod
    def assignment_summary(instance: WorkflowInstance, user=None):
        step = getattr(instance, "current_step", None)
        if not step:
            return {"required": False, "required_count": 0, "active_count": 0, "items": []}
        assignments = WorkflowRuntimeService._active_assignments(instance).select_related("assignee")
        items = []
        include_staff_detail = bool(user and user.is_authenticated and (user.is_superuser or WorkflowRuntimeService._user_role_codes(user) & {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR, RoleType.JUDGE, RoleType.MANAGEMENT_VIEWER}))
        for assignment in assignments:
            item = {
                "assignment_id": str(assignment.id),
                "role_type": assignment.role_type,
                "status": assignment.status,
            }
            if include_staff_detail:
                item["assignee_id"] = str(assignment.assignee_id)
                item["assignee_name"] = assignment.assignee.full_name
            items.append(item)
        return {
            "required": step.requires_assignment,
            "required_role": step.assignment_role,
            "required_count": step.minimum_assignments,
            "active_count": assignments.count(),
            "items": items,
        }

    @staticmethod
    def evaluation_summary(instance: WorkflowInstance):
        step = getattr(instance, "current_step", None)
        sheets = ScoreSheet.objects.filter(submission=instance.submission).prefetch_related(
            "criterion_scores__criterion",
            "criterion_scores__stage_criterion",
            "criterion_scores__marking_criteria_item",
        )
        final_sheets = sheets.filter(is_final=True)
        per_criterion = {}
        for score in (
            CriterionScore.objects
            .filter(score_sheet__submission=instance.submission, score_sheet__is_final=True)
            .select_related("criterion", "stage_criterion", "marking_criteria_item")
        ):
            criterion_id = score.criterion_id or score.stage_criterion_id or score.marking_criteria_item_id
            if not criterion_id:
                continue
            bucket = per_criterion.setdefault(
                str(criterion_id),
                {"criterion_id": str(criterion_id), "criterion_name": score.criterion_name, "average_raw_score": 0, "count": 0},
            )
            bucket["average_raw_score"] += float(score.raw_score)
            bucket["count"] += 1
        for item in per_criterion.values():
            item["average_raw_score"] = item["average_raw_score"] / item["count"] if item["count"] else 0
        total_score = sum(float(sheet.total_score) for sheet in final_sheets)
        completed = final_sheets.count()
        return {
            "required": bool(step and step.requires_evaluation),
            "required_count": step.minimum_evaluations if step else 0,
            "total_evaluators": sheets.values("judge_id").distinct().count(),
            "completed_evaluators": completed,
            "average_score": (total_score / completed) if completed else None,
            "per_criterion": list(per_criterion.values()),
            "readiness": WorkflowRuntimeService.evaluation_readiness(instance),
        }

    @staticmethod
    def safe_action_history(instance: WorkflowInstance, *, internal: bool):
        logs = instance.action_logs.select_related("step", "performed_by")
        results = []
        for log in logs:
            item = {
                "id": str(log.id),
                "step_name": log.step.name if log.step else "",
                "action": log.action,
                "timestamp": log.timestamp,
                "resulting_status": log.metadata.get("status") or (
                    SubmissionStatus.RETURNED if log.action == WorkflowActionLog.ACTION_RETURN else SubmissionStatus.SCREENED_OUT if log.action == WorkflowRuntimeService.ACTION_SCREEN_OUT else SubmissionStatus.REJECTED if log.action == WorkflowActionLog.ACTION_REJECT else ""
                ),
            }
            if internal:
                item["performed_by"] = str(log.performed_by_id) if log.performed_by_id else None
                item["performed_by_name"] = log.performed_by.full_name if log.performed_by_id else ""
                item["comment"] = log.comment
                item["metadata"] = log.metadata
            results.append(item)
        return results

    @staticmethod
    @transaction.atomic
    def start_workflow(submission: Submission, actor):
        submission = WorkflowRuntimeService._locked_submission(submission)
        definition = WorkflowDefinitionService.ensure_active_definition(submission.program)
        if definition.nodes.filter(is_active=True).exists() and not definition.steps.filter(is_active=True).exists():
            instance, _ = GraphWorkflowRuntimeService.start(
                definition=definition,
                actor=actor,
                submission=submission,
                entity_type="submission",
                entity_id=str(submission.id),
            )
            return instance
        first_step = definition.steps.filter(is_active=True).order_by("order").first()
        if not first_step:
            raise ValidationError("No active workflow steps are configured for this program.")
        instance, created = WorkflowInstance.objects.get_or_create(
            submission=submission,
            defaults={
                "workflow_definition": definition,
                "current_step": first_step,
                "status": WorkflowInstance.STATUS_IN_PROGRESS,
                "due_at": WorkflowRuntimeService._compute_due_at(first_step),
            },
        )
        if created:
            previous_status = submission.current_status
            WorkflowRuntimeService._sync_submission(submission, status_value=first_step.submission_status, locked=True)
            WorkflowRuntimeService._create_step_tasks(instance, step=first_step, actor=actor)
            WorkflowRuntimeService._ensure_timed_evaluation_cycle(submission, first_step)
            WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status)
            WorkflowRuntimeService._log_action(instance, first_step, WorkflowActionLog.ACTION_SUBMIT, actor, metadata={"status": first_step.submission_status})

            if (
                first_step.role_required == RoleType.INNOVATOR
                and "submit" in (first_step.actions_allowed or [])
            ):
                next_step = definition.steps.filter(is_active=True, order__gt=first_step.order).order_by("order").first()
                if next_step:
                    instance.current_step = next_step
                    instance.due_at = WorkflowRuntimeService._compute_due_at(next_step)
                    instance.save(update_fields=["current_step", "due_at", "updated_at"])
                    prev = submission.current_status
                    WorkflowRuntimeService._sync_submission(submission, status_value=next_step.submission_status, locked=True)
                    WorkflowRuntimeService._clear_stale_step_assignments(instance=instance, submission=submission, step=next_step)
                    WorkflowRuntimeService._create_step_tasks(instance, step=next_step, actor=actor)
                    WorkflowRuntimeService._ensure_timed_evaluation_cycle(submission, next_step)
                    WorkflowRuntimeService._log_history(submission, actor, prev, submission.current_status)
                    WorkflowRuntimeService._log_action(instance, next_step, WorkflowActionLog.ACTION_SUBMIT, actor, metadata={"status": next_step.submission_status, "auto_advanced": True})

        return instance

    @staticmethod
    @transaction.atomic
    def resubmit(instance: WorkflowInstance, actor, comment: str = ""):
        instance = WorkflowRuntimeService._locked_instance(instance)
        if instance.status != WorkflowInstance.STATUS_RETURNED:
            raise ValidationError("Only returned workflow instances can be resubmitted.")
        previous_status = instance.submission.current_status
        instance.status = WorkflowInstance.STATUS_IN_PROGRESS
        instance.completed_at = None
        instance.due_at = WorkflowRuntimeService._compute_due_at(instance.current_step)
        instance.save(update_fields=["status", "completed_at", "due_at", "updated_at"])
        submission = instance.submission
        WorkflowRuntimeService._sync_submission(
            submission,
            status_value=instance.current_step.submission_status if instance.current_step else SubmissionStatus.SUBMITTED,
            locked=True,
        )
        WorkflowRuntimeService._create_step_tasks(instance, step=instance.current_step, actor=actor)

        current_step = instance.current_step
        if current_step:
            Assignment.objects.filter(
                submission=submission,
                workflow_step=current_step,
                status=AssignmentStatus.COMPLETED,
            ).update(status=AssignmentStatus.ACCEPTED, completed_at=None, updated_at=timezone.now())

            instance.tasks.filter(
                workflow_step=current_step,
                status__in=[TaskExecution.STATUS_RETURNED, TaskExecution.STATUS_COMPLETED],
            ).update(
                status=TaskExecution.STATUS_PENDING,
                completed_at=None,
                outcome="",
                comment="",
                updated_at=timezone.now(),
            )

            if current_step.requires_evaluation:
                from apps.evaluation.services import ReviewCycleService  # noqa: PLC0415
                ReviewCycleService.open_new_cycle(submission=submission, workflow_step=current_step)

        WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, comment=comment)
        WorkflowRuntimeService._log_action(instance, instance.current_step, WorkflowActionLog.ACTION_RESUBMIT, actor, comment=comment, metadata={"status": submission.current_status})
        AuditService.log_action(actor=actor, action_type="workflow_resubmitted", target=submission, metadata={"workflow_instance_id": str(instance.id), "step": instance.current_step.name if instance.current_step else ""})
        return instance

    @staticmethod
    @transaction.atomic
    def perform_action(*, submission: Submission, actor, action: str, comment: str = ""):
        submission = WorkflowRuntimeService._locked_submission(submission)
        if not hasattr(submission, "workflow_instance"):
            raise ValidationError("This submission does not have a workflow instance.")
        instance = WorkflowRuntimeService._locked_instance(submission.workflow_instance)
        submission = instance.submission
        WorkflowRuntimeService._validate_step_action(instance, actor, action, comment)
        current_step = instance.current_step
        previous_status = submission.current_status
        if action == WorkflowRuntimeService.ACTION_SEND_BACK:
            target_code = WorkflowRuntimeService._send_back_target_code(current_step)
            target_step = (
                instance.workflow_definition.steps
                .filter(code=target_code, is_active=True)
                .first()
                if target_code
                else None
            )
            if not target_step:
                raise ValidationError("This manager step does not have a configured send-back target.")
            WorkflowRuntimeService._reopen_step_for_review(
                instance=instance,
                submission=submission,
                target_step=target_step,
                actor=actor,
                comment=comment,
            )
            WorkflowRuntimeService._append_note(submission, actor, comment)
            WorkflowRuntimeService._log_action(
                instance,
                current_step,
                action,
                actor,
                comment=comment,
                metadata={"status": submission.current_status, "target_step": target_step.code},
            )
            AuditService.log_action(
                actor=actor,
                action_type=f"workflow_{action}",
                target=submission,
                before_state={"status": previous_status, "step": current_step.name if current_step else None},
                after_state={"status": submission.current_status, "step": target_step.name, "workflow_status": instance.status},
                metadata={"workflow_instance_id": str(instance.id), "target_step": target_step.code},
            )
            return instance

        requested_action = action
        action = WorkflowRuntimeService._manager_approved_action(
            submission=submission,
            step=current_step,
            default_action=action,
        )

        if action == WorkflowActionLog.ACTION_RETURN:
            WorkflowRuntimeService._step_tasks(instance).filter(status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]).update(
                status=TaskExecution.STATUS_RETURNED,
                completed_at=timezone.now(),
                comment=comment,
                updated_at=timezone.now(),
            )
            instance.status = WorkflowInstance.STATUS_RETURNED
            instance.due_at = None
            instance.save(update_fields=["status", "due_at", "updated_at"])
            WorkflowRuntimeService._sync_submission(submission, status_value=SubmissionStatus.RETURNED, locked=False)
            WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, reason=comment, comment=comment)
        elif action in {WorkflowActionLog.ACTION_REJECT, WorkflowRuntimeService.ACTION_SCREEN_OUT}:
            WorkflowRuntimeService._step_tasks(instance).filter(status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]).update(
                status=TaskExecution.STATUS_REJECTED,
                completed_at=timezone.now(),
                comment=comment,
                updated_at=timezone.now(),
            )
            instance.status = WorkflowInstance.STATUS_REJECTED
            instance.completed_at = timezone.now()
            instance.due_at = None
            instance.save(update_fields=["status", "completed_at", "due_at", "updated_at"])
            rejection_status = SubmissionStatus.SCREENED_OUT if action == WorkflowRuntimeService.ACTION_SCREEN_OUT else SubmissionStatus.REJECTED
            WorkflowRuntimeService._sync_submission(submission, status_value=rejection_status, locked=True)
            submission.final_decision = FinalDecisionType.REJECTED
            submission.save(update_fields=["final_decision", "updated_at"])
            WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, reason=comment, comment=comment)
            WorkflowRuntimeService._sync_outcome(submission=submission, actor=actor, step=current_step, rationale=comment)
        elif action == WorkflowActionLog.ACTION_APPROVE:
            WorkflowRuntimeService._step_tasks(instance).filter(status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]).update(
                status=TaskExecution.STATUS_COMPLETED,
                completed_at=timezone.now(),
                outcome=WorkflowActionLog.ACTION_APPROVE,
                comment=comment,
                updated_at=timezone.now(),
            )
            next_step = WorkflowRuntimeService._next_step(instance, action)
            if next_step:
                instance.current_step = next_step
                instance.status = WorkflowInstance.STATUS_IN_PROGRESS
                instance.due_at = WorkflowRuntimeService._compute_due_at(next_step)
                instance.save(update_fields=["current_step", "status", "due_at", "updated_at"])
                WorkflowRuntimeService._sync_submission(submission, status_value=next_step.submission_status, locked=True)
                WorkflowRuntimeService._clear_stale_step_assignments(instance=instance, submission=submission, step=next_step)
                WorkflowRuntimeService._restore_previous_step_assignees(instance=instance, submission=submission, step=next_step, actor=actor)
                WorkflowRuntimeService._create_step_tasks(instance, step=next_step, actor=actor)
                WorkflowRuntimeService._ensure_timed_evaluation_cycle(submission, next_step)
                WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, comment=comment)
                WorkflowRuntimeService._sync_outcome(submission=submission, actor=actor, step=next_step, rationale=comment)
            else:
                _unused_step, target_node = WorkflowRuntimeService._resolve_step_transition(instance, action)
                terminal_status = WorkflowRuntimeService._terminal_submission_status_from_node(target_node) or current_step.submission_status
                instance.status = WorkflowInstance.STATUS_COMPLETED
                instance.completed_at = timezone.now()
                instance.due_at = None
                instance.save(update_fields=["status", "completed_at", "due_at", "updated_at"])
                WorkflowRuntimeService._sync_submission(submission, status_value=terminal_status, locked=True)
                if submission.current_status in {
                    SubmissionStatus.APPROVED,
                    SubmissionStatus.REJECTED,
                    SubmissionStatus.SELECTED_FOR_HACKATHON,
                    SubmissionStatus.FINALIST,
                    SubmissionStatus.WINNER,
                    SubmissionStatus.CLOSED,
                }:
                    submission.final_decision = submission.current_status
                    submission.save(update_fields=["final_decision", "updated_at"])
                WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, comment=comment)
                WorkflowRuntimeService._sync_outcome(submission=submission, actor=actor, step=current_step, rationale=comment)

        WorkflowRuntimeService._append_note(submission, actor, comment)
        action_log = WorkflowRuntimeService._log_action(instance, current_step, action, actor, comment=comment, metadata={"status": submission.current_status, "requested_action": requested_action})

        from apps.submissions.services import ApplicantFeedbackSnapshotService  # noqa: PLC0415

        ApplicantFeedbackSnapshotService.capture_release(
            submission=submission,
            workflow_instance=instance,
            release_step=current_step,
            action=action,
            actor=actor,
            comment=comment,
            source_action_log=action_log,
        )

        if action == WorkflowActionLog.ACTION_RETURN:
            NotificationService.notify(
                user=submission.innovator,
                notification_type="submission_returned",
                title="Submission returned for correction",
                message=f"Submission {submission.reference_number} was returned for correction. {comment}",
                send_email=True,
            )
        elif action in {WorkflowActionLog.ACTION_REJECT, WorkflowRuntimeService.ACTION_SCREEN_OUT}:
            NotificationService.notify(
                user=submission.innovator,
                notification_type="submission_rejected" if action == WorkflowActionLog.ACTION_REJECT else "submission_screened_out",
                title="Submission rejected" if action == WorkflowActionLog.ACTION_REJECT else "Submission screened out",
                message=f"Submission {submission.reference_number} has been {'rejected' if action == WorkflowActionLog.ACTION_REJECT else 'screened out'}. {comment}",
                send_email=True,
            )
        elif action == WorkflowActionLog.ACTION_APPROVE and instance.status == WorkflowInstance.STATUS_COMPLETED:
            NotificationService.notify(
                user=submission.innovator,
                notification_type="workflow_completed",
                title="Workflow completed",
                message=f"Submission {submission.reference_number} has completed its current workflow.",
                send_email=True,
            )

        AuditService.log_action(
            actor=actor,
            action_type=f"workflow_{action}",
            target=submission,
            before_state={"status": previous_status, "step": current_step.name if current_step else None},
            after_state={"status": submission.current_status, "step": instance.current_step.name if instance.current_step else None, "workflow_status": instance.status},
            metadata={"workflow_instance_id": str(instance.id)},
        )
        return instance

    @staticmethod
    @transaction.atomic
    def pause(instance: WorkflowInstance, actor, reason: str):
        instance = WorkflowRuntimeService._locked_instance(instance)
        if instance.status != WorkflowInstance.STATUS_IN_PROGRESS:
            raise ValidationError("Only in-progress workflows can be paused.")
        instance.status = WorkflowInstance.STATUS_PAUSED
        instance.paused_at = timezone.now()
        instance.pause_reason = reason
        instance.paused_by = actor
        instance.save(update_fields=["status", "paused_at", "pause_reason", "paused_by", "updated_at"])
        WorkflowRuntimeService._log_action(instance, instance.current_step, "return", actor, comment=f"Paused workflow. {reason}", metadata={"forced_action": "pause", "status": instance.submission.current_status})
        AuditService.log_action(actor=actor, action_type="workflow_paused", target=instance.submission, metadata={"workflow_instance_id": str(instance.id), "reason": reason})
        return instance

    @staticmethod
    @transaction.atomic
    def resume(instance: WorkflowInstance, actor, reason: str = ""):
        instance = WorkflowRuntimeService._locked_instance(instance)
        if instance.status != WorkflowInstance.STATUS_PAUSED:
            raise ValidationError("Only paused workflows can be resumed.")
        instance.status = WorkflowInstance.STATUS_IN_PROGRESS
        instance.due_at = WorkflowRuntimeService._compute_due_at(instance.current_step)
        instance.save(update_fields=["status", "due_at", "updated_at"])
        WorkflowRuntimeService._log_action(instance, instance.current_step, WorkflowActionLog.ACTION_RESUBMIT, actor, comment=reason or "Workflow resumed.", metadata={"forced_action": "resume", "status": instance.submission.current_status})
        AuditService.log_action(actor=actor, action_type="workflow_resumed", target=instance.submission, metadata={"workflow_instance_id": str(instance.id), "reason": reason})
        return instance

    @staticmethod
    @transaction.atomic
    def force_advance(submission: Submission, actor, reason: str):
        submission = WorkflowRuntimeService._locked_submission(submission)
        if not hasattr(submission, "workflow_instance"):
            raise ValidationError("Submission does not have a workflow instance.")
        instance = WorkflowRuntimeService._locked_instance(submission.workflow_instance)
        current_step = instance.current_step
        previous_status = submission.current_status
        next_step = WorkflowRuntimeService._next_step(instance)
        if next_step:
            instance.current_step = next_step
            instance.status = WorkflowInstance.STATUS_IN_PROGRESS
            instance.due_at = WorkflowRuntimeService._compute_due_at(next_step)
            instance.save(update_fields=["current_step", "status", "due_at", "updated_at"])
            WorkflowRuntimeService._sync_submission(submission, status_value=next_step.submission_status, locked=True)
            WorkflowRuntimeService._clear_stale_step_assignments(instance=instance, submission=submission, step=next_step)
            WorkflowRuntimeService._create_step_tasks(instance, step=next_step, actor=actor)
            WorkflowRuntimeService._ensure_timed_evaluation_cycle(submission, next_step)
        else:
            instance.status = WorkflowInstance.STATUS_COMPLETED
            instance.completed_at = timezone.now()
            instance.due_at = None
            instance.save(update_fields=["status", "completed_at", "due_at", "updated_at"])
            WorkflowRuntimeService._sync_submission(submission, status_value=current_step.submission_status, locked=True)
        WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, reason=reason, comment=reason)
        WorkflowRuntimeService._log_action(instance, current_step, WorkflowActionLog.ACTION_APPROVE, actor, comment=reason, metadata={"forced_action": "force_advance", "status": submission.current_status})
        WorkflowRuntimeService._sync_outcome(submission=submission, actor=actor, step=instance.current_step or current_step, rationale=reason)
        AuditService.log_action(actor=actor, action_type="workflow_force_advanced", target=submission, metadata={"workflow_instance_id": str(instance.id), "reason": reason})
        return instance

    @staticmethod
    @transaction.atomic
    def force_close(submission: Submission, actor, reason: str):
        submission = WorkflowRuntimeService._locked_submission(submission)
        if not hasattr(submission, "workflow_instance"):
            raise ValidationError("Submission does not have a workflow instance.")
        instance = WorkflowRuntimeService._locked_instance(submission.workflow_instance)
        previous_status = submission.current_status
        instance.status = WorkflowInstance.STATUS_CANCELLED
        instance.completed_at = timezone.now()
        instance.due_at = None
        instance.save(update_fields=["status", "completed_at", "due_at", "updated_at"])
        WorkflowRuntimeService._sync_submission(submission, status_value=SubmissionStatus.CLOSED, locked=True)
        submission.final_decision = FinalDecisionType.CLOSED
        submission.save(update_fields=["final_decision", "updated_at"])
        WorkflowRuntimeService._log_history(submission, actor, previous_status, submission.current_status, reason=reason, comment=reason)
        WorkflowRuntimeService._log_action(instance, instance.current_step, WorkflowActionLog.ACTION_REJECT, actor, comment=reason, metadata={"forced_action": "force_close", "status": submission.current_status})
        AuditService.log_action(actor=actor, action_type="workflow_force_closed", target=submission, metadata={"workflow_instance_id": str(instance.id), "reason": reason})
        return instance


class TaskExecutionService:
    @staticmethod
    def _locked_task(task: TaskExecution) -> TaskExecution:
        return TaskExecution.objects.select_for_update().get(id=task.id)

    @staticmethod
    def _revoke_specialist_role_if_done(task: TaskExecution, actor, outcome: str) -> None:
        """
        Remove the temporary specialist role from the actor once their review is
        fully resolved (approve or reject).  If the outcome is 'return', the
        submission goes back to the innovator and the specialist must review again
        after resubmission — so the role is kept until that next completion.
        """
        if outcome == WorkflowActionLog.ACTION_RETURN:
            return
        role_type = task.metadata.get("role_type") if task.metadata else None
        if role_type != AssignmentRoleType.SPECIALIST:
            return
        try:
            from django.apps import apps as django_apps
            UserRole = django_apps.get_model("accounts", "UserRole")
            Role = django_apps.get_model("accounts", "Role")
            specialist_role = Role.objects.filter(code=RoleType.SPECIALIST).first()
            if not specialist_role:
                return
            active_specialist_assignments = Assignment.objects.filter(
                assignee=actor,
                role_type=AssignmentRoleType.SPECIALIST,
                status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
            ).exclude(id=task.assignment_id)
            if active_specialist_assignments.exists():
                return
            UserRole.objects.filter(user=actor, role=specialist_role).update(is_active=False)
        except Exception:
            pass

    @staticmethod
    @transaction.atomic
    def ensure_assignment_task(assignment: Assignment):
        if not assignment.workflow_step_id or not hasattr(assignment.submission, "workflow_instance"):
            return None
        task, created = TaskExecution.objects.get_or_create(
            workflow_instance=assignment.submission.workflow_instance,
            workflow_step=assignment.workflow_step,
            assignment=assignment,
            defaults={
                "assignee": assignment.assignee,
                "status": TaskExecution.STATUS_PENDING,
                "due_at": assignment.deadline or WorkflowRuntimeService._compute_due_at(assignment.workflow_step),
                "metadata": {"role_type": assignment.role_type},
            },
        )
        if assignment.role_type == AssignmentRoleType.SPECIALIST and assignment.assignee_id:
            try:
                from django.apps import apps as django_apps
                Role = django_apps.get_model("accounts", "Role")
                UserRole = django_apps.get_model("accounts", "UserRole")
                specialist_role = Role.objects.filter(code=RoleType.SPECIALIST).first()
                if specialist_role:
                    UserRole.objects.update_or_create(
                        user=assignment.assignee,
                        role=specialist_role,
                        defaults={"is_active": True},
                    )
            except Exception:
                pass
        return task

    @staticmethod
    @transaction.atomic
    def claim(task: TaskExecution, actor):
        task = TaskExecutionService._locked_task(task)
        if task.status == TaskExecution.STATUS_COMPLETED:
            return task
        if task.assignee_id and task.assignee_id != actor.id and not actor.is_superuser:
            raise PermissionDenied("You cannot claim a task assigned to another user.")
        task.assignee = actor
        task.status = TaskExecution.STATUS_CLAIMED
        task.started_at = task.started_at or timezone.now()
        task.save(update_fields=["assignee", "status", "started_at", "updated_at"])
        WorkflowRuntimeService._log_action(task.workflow_instance, task.workflow_step, "assign", actor, comment="Task claimed.", metadata={"task_id": str(task.id), "status": task.workflow_instance.submission.current_status})
        AuditService.log_action(actor=actor, action_type="task_claimed", target=task.workflow_instance.submission, metadata={"task_id": str(task.id), "workflow_step_id": str(task.workflow_step_id)})
        return task

    @staticmethod
    @transaction.atomic
    def complete(task: TaskExecution, actor, *, outcome="approve", comment=""):
        task = TaskExecutionService._locked_task(task)
        if task.status == TaskExecution.STATUS_COMPLETED and task.outcome == outcome:
            return task
        if task.assignee_id and task.assignee_id != actor.id and not actor.is_superuser:
            raise PermissionDenied("You cannot complete a task assigned to another user.")
        task.status = TaskExecution.STATUS_COMPLETED
        task.outcome = outcome
        task.comment = comment
        task.started_at = task.started_at or timezone.now()
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "outcome", "comment", "started_at", "completed_at", "updated_at"])
        if task.assignment_id and task.assignment.status != AssignmentStatus.COMPLETED:
            task.assignment.status = AssignmentStatus.COMPLETED
            task.assignment.completed_at = timezone.now()
            task.assignment.save(update_fields=["status", "completed_at", "updated_at"])
        WorkflowRuntimeService._log_action(task.workflow_instance, task.workflow_step, outcome, actor, comment=comment, metadata={"task_id": str(task.id), "status": task.workflow_instance.submission.current_status})
        AuditService.log_action(actor=actor, action_type="task_completed", target=task.workflow_instance.submission, metadata={"task_id": str(task.id), "outcome": outcome})

        TaskExecutionService._revoke_specialist_role_if_done(task, actor, outcome)

        step = task.workflow_step
        instance = task.workflow_instance
        no_criteria = step.requires_evaluation and not WorkflowRuntimeService._step_has_criteria(step)
        if step.code == "challenge_judging":
            return task
        if step.requires_assignment and (not step.requires_evaluation or no_criteria):
            completion = StepCompletionEvaluator.evaluate(instance=instance, step=step)
            if completion["may_advance"]:
                done_tasks = instance.tasks.filter(
                    workflow_step=step,
                    status=TaskExecution.STATUS_COMPLETED,
                )
                outcomes = list(done_tasks.values_list("outcome", flat=True))
                reject_count = outcomes.count(WorkflowActionLog.ACTION_REJECT)
                return_count = outcomes.count(WorkflowActionLog.ACTION_RETURN)
                auto_action = WorkflowActionLog.ACTION_APPROVE
                if WorkflowRuntimeService.ACTION_SEND_BACK in outcomes:
                    auto_action = WorkflowRuntimeService.ACTION_SEND_BACK
                elif reject_count > 0:
                    auto_action = WorkflowRuntimeService.ACTION_SCREEN_OUT if WorkflowRuntimeService.ACTION_SCREEN_OUT in (step.actions_allowed or []) else WorkflowActionLog.ACTION_REJECT
                elif return_count > 0:
                    auto_action = WorkflowActionLog.ACTION_RETURN
                auto_comment = comment or f"Auto-decided from {len(outcomes)} officer review(s)."
                WorkflowRuntimeService.perform_action(
                    submission=instance.submission,
                    actor=actor,
                    action=auto_action,
                    comment=auto_comment,
                )

        return task

    @staticmethod
    @transaction.atomic
    def reassign(task: TaskExecution, actor, assignee, *, deadline=None, reason=""):
        task = TaskExecutionService._locked_task(task)
        if task.assignment_id:
            from apps.assignments.services import AssignmentService

            updated_assignment = AssignmentService.reassign(assignment=task.assignment, assignee=assignee, actor=actor, deadline=deadline)
            task.status = TaskExecution.STATUS_REASSIGNED
            task.comment = reason
            task.completed_at = timezone.now()
            task.save(update_fields=["status", "comment", "completed_at", "updated_at"])
            return TaskExecutionService.ensure_assignment_task(updated_assignment)
        task.assignee = assignee
        task.status = TaskExecution.STATUS_PENDING
        task.due_at = deadline or task.due_at
        task.comment = reason
        task.save(update_fields=["assignee", "status", "due_at", "comment", "updated_at"])
        WorkflowRuntimeService._log_action(task.workflow_instance, task.workflow_step, "reassign", actor, comment=reason or "Task reassigned.", metadata={"task_id": str(task.id), "assignee_id": str(assignee.id)})
        AuditService.log_action(actor=actor, action_type="task_reassigned", target=task.workflow_instance.submission, metadata={"task_id": str(task.id), "assignee_id": str(assignee.id)})
        return task


class SubmissionWorkflowService:
    @classmethod
    def validate_transition(cls, submission: Submission, to_status: str, actor, reason: str = ""):
        raise ValidationError(
            {
                "status": (
                    "Direct submission status transitions are no longer supported. "
                    "Use workflow actions or the submit/resubmit endpoints."
                )
            }
        )

    @classmethod
    def transition(cls, submission: Submission, to_status: str, actor, reason: str = "", note: str = ""):
        cls.validate_transition(submission, to_status, actor, reason)

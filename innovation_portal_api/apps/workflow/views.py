from django.db import models
from django.db.models import Count, F, Q
from django.db.models import Q as ModelQ
from django.utils import timezone
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.api import api_success
from apps.core.permissions import IsOfficerOrAdmin
from apps.programs.models import FormSection, SubmissionForm, SubmissionFormField
from apps.workflow.models import (
    AssignmentInstance,
    AssignmentPolicy,
    NodeAction,
    TaskExecution,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowNode,
    WorkflowAuditLog,
    WorkflowRule,
    WorkflowStep,
    WorkflowTransition,
)
from apps.workflow.serializers import (
    AssignmentInstanceAcceptSerializer,
    AssignmentInstanceCancelSerializer,
    AssignmentInstanceClaimSerializer,
    AssignmentInstanceCompleteSerializer,
    AssignmentInstanceDeclineSerializer,
    AssignmentInstanceDetailSerializer,
    AssignmentInstanceReassignSerializer,
    AssignmentInstanceSerializer,
    AssignmentPolicySerializer,
    NodeActionSerializer,
    NodeAssignmentBindingSerializer,
    NodeFormBindingSerializer,
    NodeInstanceSerializer,
    TaskExecutionSerializer,
    TransitionExecutionLogSerializer,
    WorkflowDefinitionArchiveSerializer,
    WorkflowDefinitionActivationSerializer,
    WorkflowDefinitionCloneSerializer,
    WorkflowDefinitionPublishSerializer,
    WorkflowDefinitionSerializer,
    WorkflowDefinitionValidationSerializer,
    WorkflowDefinitionWriteSerializer,
    WorkflowFormDefinitionSerializer,
    WorkflowFormFieldSerializer,
    WorkflowFormSectionSerializer,
    WorkflowInstanceActionSerializer,
    WorkflowInstanceSerializer,
    WorkflowInstanceStartSerializer,
    WorkflowNodeSerializer,
    WorkflowNodeWriteSerializer,
    WorkflowRuleSerializer,
    WorkflowStepSerializer,
    WorkflowStepWriteSerializer,
    WorkflowTransitionSerializer,
    WorkflowTransitionWriteSerializer,
)
from apps.workflow.services import (
    AssignmentPolicyService,
    GraphWorkflowRuntimeService,
    GraphAssignmentRuntimeService,
    NodeAssignmentBindingService,
    NodeActionService,
    TaskExecutionService,
    WorkflowDefinitionService,
    WorkflowNodeService,
    WorkflowRuntimeService,
    WorkflowRuleService,
    WorkflowTransitionService,
    WorkflowValidationService,
)


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter(
                name="program",
                location=OpenApiParameter.QUERY,
                required=False,
                type=str,
                description="Filter workflow definitions by program id.",
            )
        ]
    )
)
class WorkflowDefinitionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOfficerOrAdmin]

    def get_queryset(self):
        queryset = WorkflowDefinition.objects.select_related("program", "previous_version").prefetch_related("steps").all()
        program_id = self.request.query_params.get("program")
        if program_id:
            queryset = queryset.filter(program_id=program_id)
        return queryset

    def get_serializer_class(self):
        if self.action == "nodes":
            if getattr(self.request, "method", "GET") == "POST":
                return WorkflowNodeWriteSerializer
            return WorkflowNodeSerializer
        if self.action == "transitions":
            if getattr(self.request, "method", "GET") == "POST":
                return WorkflowTransitionWriteSerializer
            return WorkflowTransitionSerializer
        if self.action in {"create", "update", "partial_update"}:
            return WorkflowDefinitionWriteSerializer
        return WorkflowDefinitionSerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return api_success(data=serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        definition = WorkflowDefinitionService.create_definition(
            program=serializer.validated_data["program"],
            name=serializer.validated_data["name"],
            steps_data=request.data.get("steps_data"),
            actor=request.user,
        )
        for field in ("code", "description", "workflow_type", "scope", "metadata_json"):
            if field in serializer.validated_data:
                setattr(definition, field, serializer.validated_data[field])
        definition.updated_by = request.user
        definition.save(update_fields=["code", "description", "workflow_type", "scope", "metadata_json", "updated_by", "updated_at"])
        return api_success(data=WorkflowDefinitionSerializer(definition).data, status_code=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        definition = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        serializer = self.get_serializer(editable_definition, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        payload = WorkflowDefinitionSerializer(editable_definition).data
        if versioned:
            payload["versioned_copy_created"] = True
            payload["source_definition_id"] = str(definition.id)
        return api_success(data=payload)

    def destroy(self, request, *args, **kwargs):
        definition = self.get_object()
        if definition.is_active and WorkflowDefinitionService.in_use(definition):
            return Response(
                {"detail": "Active workflow definitions already in use cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if definition.instances.exists():
            return Response(
                {"detail": "Workflow definitions with historical instances cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        definition.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "post"], url_path="steps")
    def steps(self, request, pk=None):
        definition = self.get_object()
        if request.method == "GET":
            serializer = WorkflowStepSerializer(definition.steps.order_by("order"), many=True)
            return api_success(data=serializer.data)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        payload = request.data.copy()
        payload["workflow_definition"] = str(editable_definition.id)
        serializer = WorkflowStepWriteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save(workflow_definition=editable_definition)
        WorkflowDefinitionService.validate_definition(editable_definition)
        payload = WorkflowStepSerializer(editable_definition.steps.get(id=serializer.instance.id)).data
        if versioned:
            payload["versioned_copy_created"] = True
            payload["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=payload, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        definition = self.get_object()
        serializer = WorkflowDefinitionActivationSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        WorkflowDefinitionService.activate_definition(definition, actor=request.user)
        return api_success(data=WorkflowDefinitionSerializer(definition).data)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        definition = self.get_object()
        serializer = WorkflowDefinitionPublishSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        definition = WorkflowDefinitionService.publish_definition(definition, actor=request.user, comment=serializer.validated_data.get("comment", ""))
        return api_success(data=WorkflowDefinitionSerializer(definition).data)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        definition = self.get_object()
        serializer = WorkflowDefinitionArchiveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        definition = WorkflowDefinitionService.archive_definition(definition, actor=request.user, comment=serializer.validated_data.get("comment", ""))
        return api_success(data=WorkflowDefinitionSerializer(definition).data)

    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request, pk=None):
        definition = self.get_object()
        serializer = WorkflowDefinitionCloneSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        clone = WorkflowDefinitionService.clone_definition(definition)
        if serializer.validated_data.get("name"):
            clone.name = serializer.validated_data["name"]
            clone.save(update_fields=["name", "updated_at"])
        return api_success(data=WorkflowDefinitionSerializer(clone).data, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="validate")
    def validate(self, request, pk=None):
        definition = self.get_object()
        result = WorkflowValidationService.validate_definition(definition)
        return api_success(data=WorkflowDefinitionValidationSerializer(result).data)

    @action(detail=True, methods=["get", "post"], url_path="nodes")
    @extend_schema(
        methods=["GET"],
        responses=WorkflowNodeSerializer(many=True),
        parameters=[
            OpenApiParameter(name="id", location=OpenApiParameter.PATH, required=True, type=str),
        ],
    )
    @extend_schema(
        methods=["POST"],
        request=WorkflowNodeWriteSerializer,
        responses=WorkflowNodeSerializer,
        parameters=[
            OpenApiParameter(name="id", location=OpenApiParameter.PATH, required=True, type=str),
        ],
    )
    def nodes(self, request, pk=None):
        definition = self.get_object()
        if request.method == "GET":
            serializer = WorkflowNodeSerializer(definition.nodes.order_by("created_at"), many=True)
            return api_success(data=serializer.data)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        payload = request.data.copy()
        payload["workflow_definition"] = str(editable_definition.id)
        serializer = WorkflowNodeWriteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        node_data = dict(serializer.validated_data)
        node_data.pop("workflow_definition", None)
        node = WorkflowNodeService.create_node(editable_definition, actor=request.user, **node_data)
        result = WorkflowNodeSerializer(node).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="transitions")
    @extend_schema(
        methods=["GET"],
        responses=WorkflowTransitionSerializer(many=True),
        parameters=[
            OpenApiParameter(name="id", location=OpenApiParameter.PATH, required=True, type=str),
        ],
    )
    @extend_schema(
        methods=["POST"],
        request=WorkflowTransitionWriteSerializer,
        responses=WorkflowTransitionSerializer,
        parameters=[
            OpenApiParameter(name="id", location=OpenApiParameter.PATH, required=True, type=str),
        ],
    )
    def transitions(self, request, pk=None):
        definition = self.get_object()
        if request.method == "GET":
            serializer = WorkflowTransitionSerializer(definition.transitions.order_by("priority", "created_at"), many=True)
            return api_success(data=serializer.data)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        payload = request.data.copy()
        payload["workflow_definition"] = str(editable_definition.id)
        serializer = WorkflowTransitionWriteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        transition_data = dict(serializer.validated_data)
        transition_data.pop("workflow_definition", None)
        transition = WorkflowTransitionService.create_transition(editable_definition, actor=request.user, **transition_data)
        result = WorkflowTransitionSerializer(transition).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="rules")
    def rules(self, request, pk=None):
        definition = self.get_object()
        if request.method == "GET":
            serializer = WorkflowRuleSerializer(definition.rules.order_by("scope_type", "priority", "created_at"), many=True)
            return api_success(data=serializer.data)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        payload = request.data.copy()
        payload["workflow_definition"] = str(editable_definition.id)
        serializer = WorkflowRuleSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        rule_data = dict(serializer.validated_data)
        rule_data.pop("workflow_definition", None)
        rule = WorkflowRuleService.create_rule(editable_definition, actor=request.user, **rule_data)
        result = WorkflowRuleSerializer(rule).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result, status_code=status.HTTP_201_CREATED)


class WorkflowStepDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = WorkflowStep.objects.select_related("workflow_definition", "workflow_definition__program").all()

    def get_serializer_class(self):
        if self.request.method == "GET":
            return WorkflowStepSerializer
        return WorkflowStepWriteSerializer

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return api_success(data=serializer.data)

    def update(self, request, *args, **kwargs):
        from django.db import transaction
        partial = kwargs.pop("partial", False)
        step = self.get_object()
        definition = step.workflow_definition
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        editable_step = editable_definition.steps.get(code=step.code)
        serializer = self.get_serializer(editable_step, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        new_order = serializer.validated_data.get("order", editable_step.order)
        old_order = editable_step.order

        with transaction.atomic():
            if new_order != old_order:
                if new_order > old_order:
                    editable_definition.steps.filter(
                        order__gt=old_order, order__lte=new_order
                    ).exclude(pk=editable_step.pk).update(order=F("order") - 1)
                else:
                    editable_definition.steps.filter(
                        order__gte=new_order, order__lt=old_order
                    ).exclude(pk=editable_step.pk).update(order=F("order") + 1)
            serializer.save(workflow_definition=editable_definition)

        WorkflowDefinitionService.validate_definition(editable_definition)
        editable_step.refresh_from_db()
        payload = WorkflowStepSerializer(editable_step).data
        if versioned:
            payload["versioned_copy_created"] = True
            payload["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=payload)

    def destroy(self, request, *args, **kwargs):
        step = self.get_object()
        definition = step.workflow_definition
        if step.instances.exists() or step.action_logs.exists() or step.assignments.exists():
            return Response({"detail": "Workflow steps referenced by running or historical workflow data cannot be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(definition)
        editable_step = editable_definition.steps.get(code=step.code)
        editable_step.delete()
        WorkflowDefinitionService.validate_definition(editable_definition)
        if versioned:
            return api_success(data={"workflow_definition_id": str(editable_definition.id), "versioned_copy_created": True})
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowNodeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = WorkflowNode.objects.select_related("workflow_definition", "workflow_definition__program").prefetch_related("actions").all()

    def get_serializer_class(self):
        if self.request.method == "GET":
            return WorkflowNodeSerializer
        return WorkflowNodeWriteSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        node = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(node.workflow_definition)
        editable_node = editable_definition.nodes.get(code=node.code)
        serializer = self.get_serializer(editable_node, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(workflow_definition=editable_definition)
        result = WorkflowNodeSerializer(editable_node).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)

    def destroy(self, request, *args, **kwargs):
        node = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(node.workflow_definition)
        editable_node = editable_definition.nodes.get(code=node.code)
        editable_node.delete()
        if versioned:
            return api_success(data={"workflow_definition_id": str(editable_definition.id), "versioned_copy_created": True})
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowTransitionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = WorkflowTransition.objects.select_related("workflow_definition", "from_node", "to_node").all()

    def get_serializer_class(self):
        if self.request.method == "GET":
            return WorkflowTransitionSerializer
        return WorkflowTransitionWriteSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        transition = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(transition.workflow_definition)
        editable_transition = editable_definition.transitions.get(id=transition.id) if editable_definition.id == transition.workflow_definition_id else editable_definition.transitions.get(
            from_node__code=transition.from_node.code,
            to_node__code=transition.to_node.code,
            priority=transition.priority,
            action_key=transition.action_key,
        )
        serializer = self.get_serializer(editable_transition, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(workflow_definition=editable_definition)
        result = WorkflowTransitionSerializer(editable_transition).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)

    def destroy(self, request, *args, **kwargs):
        transition = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(transition.workflow_definition)
        editable_transition = editable_definition.transitions.get(id=transition.id) if editable_definition.id == transition.workflow_definition_id else editable_definition.transitions.get(
            from_node__code=transition.from_node.code,
            to_node__code=transition.to_node.code,
            priority=transition.priority,
            action_key=transition.action_key,
        )
        editable_transition.delete()
        if versioned:
            return api_success(data={"workflow_definition_id": str(editable_definition.id), "versioned_copy_created": True})
        return Response(status=status.HTTP_204_NO_CONTENT)


class NodeActionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = NodeActionSerializer

    def get_queryset(self):
        return NodeAction.objects.filter(node_id=self.kwargs["node_id"]).order_by("created_at")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        node = WorkflowNode.objects.get(id=self.kwargs["node_id"])
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(node.workflow_definition)
        editable_node = editable_definition.nodes.get(code=node.code)
        payload = request.data.copy()
        payload["node"] = str(editable_node.id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        action_data = dict(serializer.validated_data)
        action_data.pop("node", None)
        action = NodeActionService.create_action(editable_node, actor=request.user, **action_data)
        result = NodeActionSerializer(action).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result, status_code=status.HTTP_201_CREATED)


class NodeActionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = NodeAction.objects.select_related("node", "node__workflow_definition").all()
    serializer_class = NodeActionSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        action = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(action.node.workflow_definition)
        editable_action = editable_definition.nodes.get(code=action.node.code).actions.get(key=action.key)
        serializer = self.get_serializer(editable_action, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(node=editable_action.node)
        result = serializer.data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)

    def destroy(self, request, *args, **kwargs):
        action = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(action.node.workflow_definition)
        editable_action = editable_definition.nodes.get(code=action.node.code).actions.get(key=action.key)
        editable_action.delete()
        if versioned:
            return api_success(data={"workflow_definition_id": str(editable_definition.id), "versioned_copy_created": True})
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssignmentPolicyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOfficerOrAdmin]
    queryset = AssignmentPolicy.objects.select_related("fallback_policy").all()
    serializer_class = AssignmentPolicySerializer

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        policy = AssignmentPolicyService.create_policy(actor=request.user, **serializer.validated_data)
        return api_success(data=self.get_serializer(policy).data, status_code=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        policy = AssignmentPolicyService.update_policy(self.get_object(), actor=request.user, **serializer.validated_data)
        return api_success(data=self.get_serializer(policy).data)


class WorkflowRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = WorkflowRule.objects.select_related("workflow_definition", "node", "transition").all()
    serializer_class = WorkflowRuleSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        rule = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(rule.workflow_definition)
        editable_rule = editable_definition.rules.get(id=rule.id) if editable_definition.id == rule.workflow_definition_id else editable_definition.rules.get(
            rule_type=rule.rule_type,
            priority=rule.priority,
            scope_type=rule.scope_type,
        )
        serializer = self.get_serializer(editable_rule, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        expression_errors = WorkflowValidationService.validate_expression(
            serializer.validated_data.get("expression_language", editable_rule.expression_language),
            serializer.validated_data.get("expression", editable_rule.expression),
        )
        if expression_errors:
            raise ValidationError({"expression": expression_errors})
        serializer.save(workflow_definition=editable_definition)
        result = serializer.data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)

    def destroy(self, request, *args, **kwargs):
        rule = self.get_object()
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(rule.workflow_definition)
        editable_rule = editable_definition.rules.get(id=rule.id) if editable_definition.id == rule.workflow_definition_id else editable_definition.rules.get(
            rule_type=rule.rule_type,
            priority=rule.priority,
            scope_type=rule.scope_type,
        )
        editable_rule.delete()
        if versioned:
            return api_success(data={"workflow_definition_id": str(editable_definition.id), "versioned_copy_created": True})
        return Response(status=status.HTTP_204_NO_CONTENT)


class NodeAssignmentBindingView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = NodeAssignmentBindingSerializer

    def post(self, request, pk, *args, **kwargs):
        node = WorkflowNode.objects.get(id=pk)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(node.workflow_definition)
        editable_node = editable_definition.nodes.get(code=node.code)
        payload = request.data.copy()
        payload["node"] = str(editable_node.id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        policy = AssignmentPolicy.objects.get(id=serializer.validated_data["assignment_policy"].id)
        binding_data = dict(serializer.validated_data)
        binding_data.pop("node", None)
        binding_data.pop("assignment_policy", None)
        binding = NodeAssignmentBindingService.bind(editable_node, assignment_policy=policy, actor=request.user, **binding_data)
        result = self.get_serializer(binding).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)


class WorkflowFormDefinitionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOfficerOrAdmin]
    queryset = SubmissionForm.objects.select_related("program").prefetch_related("sections__fields__field_rules", "sections__fields__options").all()
    serializer_class = WorkflowFormDefinitionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        program_id = self.request.query_params.get("program")
        if program_id:
            queryset = queryset.filter(program_id=program_id)
        return queryset

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        raise ValidationError({"detail": "Workflow forms are program submission forms. Create them through `/api/programs/{id}/form-*` endpoints."})

    def update(self, request, *args, **kwargs):
        raise ValidationError({"detail": "Workflow forms are program submission forms. Update them through `/api/programs/{id}/form-*` endpoints."})


class WorkflowFormSectionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = WorkflowFormSectionSerializer

    def get_queryset(self):
        return FormSection.objects.filter(form_id=self.kwargs["form_id"]).prefetch_related("fields__field_rules", "fields__options").order_by("ordering")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        form = SubmissionForm.objects.get(id=self.kwargs["form_id"])
        payload = request.data.copy()
        payload["form_definition"] = str(form.id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save(form=form)
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)


class WorkflowFormFieldListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = WorkflowFormFieldSerializer

    def get_queryset(self):
        return SubmissionFormField.objects.filter(section_id=self.kwargs["section_id"]).prefetch_related("field_rules", "options").order_by("ordering")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def create(self, request, *args, **kwargs):
        section = FormSection.objects.get(id=self.kwargs["section_id"])
        payload = request.data.copy()
        payload["form_section"] = str(section.id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save(section=section, form=section.form)
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)


class NodeFormBindingView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = NodeFormBindingSerializer

    def post(self, request, pk, *args, **kwargs):
        node = WorkflowNode.objects.get(id=pk)
        editable_definition, versioned = WorkflowDefinitionService.ensure_editable_definition(node.workflow_definition)
        editable_node = editable_definition.nodes.get(code=node.code)
        payload = request.data.copy()
        payload["node"] = str(editable_node.id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        form_definition = SubmissionForm.objects.get(id=serializer.validated_data["form_definition"].id)
        binding_data = dict(serializer.validated_data)
        binding_data.pop("node", None)
        binding_data.pop("form_definition", None)
        binding, _ = editable_node.form_bindings.update_or_create(
            form_definition=form_definition,
            binding_type=binding_data.get("binding_type", "entry"),
            defaults={
                "mode": binding_data.get("mode", "editable"),
                "required_on_entry": binding_data.get("required_on_entry", False),
                "required_on_exit": binding_data.get("required_on_exit", False),
                "is_active": binding_data.get("is_active", True),
                "metadata_json": binding_data.get("metadata_json", {}),
            },
        )
        WorkflowAuditLog.objects.create(
            workflow_definition=editable_node.workflow_definition,
            node=editable_node,
            performed_by=request.user,
            action=WorkflowAuditLog.ACTION_FORM_BINDING_CHANGED,
            metadata={"form_definition_id": str(form_definition.id), "binding_type": binding.binding_type},
        )
        result = self.get_serializer(binding).data
        if versioned:
            result["versioned_copy_created"] = True
            result["workflow_definition_id"] = str(editable_definition.id)
        return api_success(data=result)


class GraphWorkflowInstanceStartView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = WorkflowInstanceStartSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance, _node_instance = GraphWorkflowRuntimeService.start(
            definition=serializer.validated_data["workflow_definition"],
            actor=request.user,
            entity_type=serializer.validated_data.get("entity_type", ""),
            entity_id=serializer.validated_data.get("entity_id", ""),
            payload_json=serializer.validated_data.get("payload_json") or {},
        )
        return api_success(data=WorkflowInstanceSerializer(instance).data, status_code=status.HTTP_201_CREATED)


class GraphWorkflowInstanceListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = WorkflowInstanceSerializer

    def get_queryset(self):
        queryset = WorkflowInstance.objects.select_related("workflow_definition", "current_node", "current_step").prefetch_related(
            "node_instances__node",
            "node_instances__assignment_instances__assignee_user",
            "transition_logs__from_node",
            "transition_logs__to_node",
            "action_logs",
            "tasks",
        ).order_by("-started_at", "-created_at")
        workflow_definition = self.request.query_params.get("workflow_definition")
        if workflow_definition:
            queryset = queryset.filter(workflow_definition_id=workflow_definition)
        status_value = self.request.query_params.get("status")
        if status_value:
            queryset = queryset.filter(status=status_value)
        current_node = self.request.query_params.get("current_node")
        if current_node:
            queryset = queryset.filter(current_node_id=current_node)
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter(name="workflow_definition", location=OpenApiParameter.QUERY, required=False, type=str),
            OpenApiParameter(name="status", location=OpenApiParameter.QUERY, required=False, type=str),
            OpenApiParameter(name="current_node", location=OpenApiParameter.QUERY, required=False, type=str),
        ],
        responses=WorkflowInstanceSerializer(many=True),
    )
    def get(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)


class GraphWorkflowInstanceDetailView(generics.RetrieveAPIView):
    permission_classes = [IsOfficerOrAdmin]
    queryset = WorkflowInstance.objects.select_related("workflow_definition", "current_node", "current_step").prefetch_related(
        "node_instances__node",
        "node_instances__assignment_instances__assignee_user",
        "transition_logs__from_node",
        "transition_logs__to_node",
        "action_logs",
        "tasks",
    )
    serializer_class = WorkflowInstanceSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)


class GraphWorkflowInstanceHistoryView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        data = {
            "node_instances": NodeInstanceSerializer(instance.node_instances.select_related("node").prefetch_related("assignment_instances__assignee_user").all(), many=True).data,
            "assignment_instances": AssignmentInstanceSerializer(
                AssignmentInstance.objects.filter(node_instance__workflow_instance=instance).select_related("node_instance__node", "assignee_user"),
                many=True,
            ).data,
            "transition_logs": TransitionExecutionLogSerializer(instance.transition_logs.select_related("from_node", "to_node", "triggered_by").all(), many=True).data,
        }
        return api_success(data=data)


class GraphWorkflowInstanceActionView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = WorkflowInstanceActionSerializer

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = GraphWorkflowRuntimeService.perform_action(
            instance=instance,
            actor=request.user,
            action_key=serializer.validated_data["action_key"],
            comment=serializer.validated_data.get("comment", ""),
            payload_json=serializer.validated_data.get("payload_json") or {},
        )
        return api_success(data=WorkflowInstanceSerializer(instance).data)


class GraphWorkflowInstancePauseView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        instance = GraphWorkflowRuntimeService.pause(instance, request.user, reason=request.data.get("reason", ""))
        return api_success(data={"workflow_instance_id": str(instance.id), "status": instance.status})


class GraphWorkflowInstanceResumeView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        instance = GraphWorkflowRuntimeService.resume(instance, request.user, reason=request.data.get("reason", ""))
        return api_success(data={"workflow_instance_id": str(instance.id), "status": instance.status})


class GraphWorkflowInstanceCancelView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        instance = GraphWorkflowRuntimeService.cancel(instance, request.user, reason=request.data.get("reason", ""))
        return api_success(data={"workflow_instance_id": str(instance.id), "status": instance.status})


class AssignmentInstanceQuerysetMixin:
    @staticmethod
    def _is_officer_or_admin(user):
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return user.roles.filter(code__in=["innovation_officer", "administrator"], user_roles__is_active=True).exists()

    def get_queryset(self):
        queryset = AssignmentInstance.objects.select_related(
            "assignee_user",
            "claimed_by",
            "completed_by",
            "node_instance__node",
            "node_instance__workflow_instance",
        ).prefetch_related("action_logs__actor")
        request = self.request
        if not self._is_officer_or_admin(request.user):
            role_codes = list(request.user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
            claimable_q = ModelQ(
                assignee_user__isnull=True,
                assignee_type=AssignmentInstance.ASSIGNEE_ROLE,
                metadata_json__role_code__in=role_codes,
                status__in=[AssignmentInstance.STATUS_AVAILABLE, AssignmentInstance.STATUS_PENDING],
            )
            queryset = queryset.filter(ModelQ(assignee_user=request.user) | claimable_q)
        mine = request.query_params.get("mine")
        if mine and mine.lower() == "true":
            queryset = queryset.filter(assignee_user=request.user)
        if request.query_params.get("status"):
            queryset = queryset.filter(status=request.query_params["status"])
        if request.query_params.get("workflow_instance"):
            queryset = queryset.filter(node_instance__workflow_instance_id=request.query_params["workflow_instance"])
        if request.query_params.get("node_instance"):
            queryset = queryset.filter(node_instance_id=request.query_params["node_instance"])
        return queryset.order_by("-assigned_at", "-created_at")

    def get_assignment_instance(self, pk):
        return get_object_or_404(self.get_queryset(), id=pk)


class AssignmentInstanceListView(AssignmentInstanceQuerysetMixin, generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceSerializer

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)


class AssignmentInstanceDetailView(AssignmentInstanceQuerysetMixin, generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceDetailSerializer

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)


class AssignmentInstanceAcceptView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceAcceptSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        assignment = GraphAssignmentRuntimeService.accept(assignment, request.user)
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class AssignmentInstanceClaimView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceClaimSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        assignment = GraphAssignmentRuntimeService.claim(assignment, request.user)
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class AssignmentInstanceCompleteView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceCompleteSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        assignment = GraphAssignmentRuntimeService.complete(
            assignment,
            request.user,
            note=serializer.validated_data.get("note", ""),
            metadata_json=serializer.validated_data.get("metadata_json") or {},
        )
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class AssignmentInstanceCancelView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceCancelSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        assignment = GraphAssignmentRuntimeService.cancel(
            assignment,
            request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class AssignmentInstanceDeclineView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceDeclineSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        assignment = GraphAssignmentRuntimeService.decline(
            assignment,
            request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class AssignmentInstanceReassignView(AssignmentInstanceQuerysetMixin, generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AssignmentInstanceReassignSerializer

    def post(self, request, pk, *args, **kwargs):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        assignment = self.get_assignment_instance(pk)
        new_assignee = AssignmentInstance.assignee_user.field.related_model.objects.get(id=serializer.validated_data["new_assignee"])
        assignment = GraphAssignmentRuntimeService.reassign(
            assignment,
            request.user,
            new_assignee=new_assignee,
            reason=serializer.validated_data.get("reason", ""),
        )
        return api_success(data=AssignmentInstanceDetailSerializer(assignment).data)


class WorkflowStuckListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        cutoff = timezone.now() - timezone.timedelta(hours=72)
        workflows = WorkflowInstance.objects.select_related("submission", "current_step", "workflow_definition").filter(
            status__in=[WorkflowInstance.STATUS_IN_PROGRESS, WorkflowInstance.STATUS_RETURNED],
        ).filter(Q(updated_at__lte=cutoff) | Q(due_at__lt=timezone.now()))
        data = [
            {
                "workflow_instance_id": str(item.id),
                "submission_id": str(item.submission_id),
                "reference_number": item.submission.reference_number,
                "workflow_definition": item.workflow_definition.name,
                "current_step": item.current_step.name if item.current_step else "",
                "status": item.status,
                "due_at": item.due_at,
                "updated_at": item.updated_at,
            }
            for item in workflows
        ]
        return api_success(data=data)


class WorkflowOverdueListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        workflows = WorkflowInstance.objects.select_related("submission", "current_step").filter(
            status=WorkflowInstance.STATUS_IN_PROGRESS,
            due_at__isnull=False,
            due_at__lt=timezone.now(),
        )
        data = [
            {
                "workflow_instance_id": str(item.id),
                "reference_number": item.submission.reference_number,
                "current_step": item.current_step.name if item.current_step else "",
                "due_at": item.due_at,
                "overdue_by_hours": round((timezone.now() - item.due_at).total_seconds() / 3600, 2),
            }
            for item in workflows
        ]
        return api_success(data=data)


class WorkflowPauseView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        instance = WorkflowRuntimeService.pause(instance, request.user, request.data.get("reason", "Paused by officer/admin."))
        return api_success(data={"workflow_instance_id": str(instance.id), "status": instance.status})


class WorkflowResumeView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        instance = WorkflowInstance.objects.get(id=pk)
        instance = WorkflowRuntimeService.resume(instance, request.user, request.data.get("reason", "Resumed by officer/admin."))
        return api_success(data={"workflow_instance_id": str(instance.id), "status": instance.status})


class TaskClaimView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        task = TaskExecution.objects.get(id=pk)
        task = TaskExecutionService.claim(task, request.user)
        return api_success(data=TaskExecutionSerializer(task).data)


class TaskCompleteView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        task = TaskExecution.objects.get(id=pk)
        task = TaskExecutionService.complete(task, request.user, outcome=request.data.get("outcome", "approve"), comment=request.data.get("comment", ""))
        return api_success(data=TaskExecutionSerializer(task).data)


class TaskReassignView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, pk, *args, **kwargs):
        task = TaskExecution.objects.get(id=pk)
        user_model = TaskExecution.assignee.field.related_model
        assignee = user_model.objects.get(id=request.data["assignee"])
        task = TaskExecutionService.reassign(task, request.user, assignee=assignee, deadline=request.data.get("deadline"), reason=request.data.get("reason", ""))
        return api_success(data=TaskExecutionSerializer(task).data)

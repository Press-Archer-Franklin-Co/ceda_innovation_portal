from django.test import TestCase
from django.core.management import call_command
from django.utils import timezone
from django.urls import reverse
from io import StringIO
import yaml
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.models import AssignmentInstance, AssignmentPolicy, WorkflowDefinition, WorkflowInstance
from apps.workflow.services import WorkflowRuntimeService


class WorkflowManagementAndVisibilityApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="workflow-api-officer@example.com", password="StrongPass123", first_name="Officer", last_name="Api")
        self.judge = User.objects.create_user(email="workflow-api-judge@example.com", password="StrongPass123", first_name="Judge", last_name="Api")
        self.innovator = User.objects.create_user(email="workflow-api-innovator@example.com", password="StrongPass123", first_name="Innovator", last_name="Api")
        self.other_innovator = User.objects.create_user(email="workflow-api-other@example.com", password="StrongPass123", first_name="Other", last_name="User")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.other_innovator, [RoleType.INNOVATOR])

        self.program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Workflow API Program",
            slug="workflow-api-program",
            description="Workflow API Program",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Idea Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Workflow API Idea",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A valid problem statement"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)

    def _build_basic_graph_definition(self, *, name: str, slug: str):
        graph_program = Program.objects.create(
            title=name,
            slug=slug,
            description=name,
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        definition_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": f"{name} Workflow", "program": str(graph_program.id), "code": f"{slug}-workflow"},
            format="json",
        )
        definition_id = definition_response.data["data"]["id"]
        start_node = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "Start", "code": "start", "node_type": "start", "is_initial": True},
            format="json",
        ).data["data"]
        review_node = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "Review", "code": "review", "node_type": "review_task"},
            format="json",
        ).data["data"]
        end_node = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "End", "code": "end", "node_type": "end", "is_terminal": True},
            format="json",
        ).data["data"]
        self.client.post(f"/api/workflow-nodes/{review_node['id']}/actions/", {"key": "approve", "label": "Approve"}, format="json")
        self.client.post(
            f"/api/workflow-definitions/{definition_id}/transitions/",
            {"from_node": start_node["id"], "to_node": review_node["id"], "priority": 1, "is_default": True},
            format="json",
        )
        self.client.post(
            f"/api/workflow-definitions/{definition_id}/transitions/",
            {"from_node": review_node["id"], "to_node": end_node["id"], "action_key": "approve", "priority": 1, "is_default": True},
            format="json",
        )
        return {
            "program": graph_program,
            "definition_id": definition_id,
            "start_node": start_node,
            "review_node": review_node,
            "end_node": end_node,
        }

    def _publish_and_activate(self, definition_id: str):
        publish_response = self.client.post(f"/api/workflow-definitions/{definition_id}/publish/", {}, format="json")
        activate_response = self.client.post(f"/api/workflow-definitions/{definition_id}/activate/", {}, format="json")
        self.assertEqual(publish_response.status_code, 200)
        self.assertEqual(activate_response.status_code, 200)

    def _start_graph_instance(self, definition_id: str, payload_json: dict | None = None):
        response = self.client.post(
            "/api/workflow-instances/start/",
            {
                "workflow_definition": definition_id,
                "entity_type": "submission",
                "entity_id": str(self.submission.id),
                "payload_json": payload_json or {},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data["data"]["id"]

    def test_innovator_can_view_safe_workflow_state_and_history(self):
        self.client.force_authenticate(self.innovator)

        workflow_response = self.client.get(f"/api/submissions/{self.submission.id}/workflow/")
        history_response = self.client.get(f"/api/submissions/{self.submission.id}/workflow/history/")

        self.assertEqual(workflow_response.status_code, 200)
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(workflow_response.data["data"]["current_step"], "Intake")
        self.assertEqual(workflow_response.data["data"]["submission_status"], "submitted")
        self.assertNotIn("performed_by_name", history_response.data["data"][0])
        self.assertNotIn("comment", history_response.data["data"][0])

    def test_officer_can_manage_workflow_definitions_and_activate_custom_definition(self):
        custom_program = Program.objects.create(
            title="Definition Program",
            slug="definition-program",
            description="Definition Program",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        self.client.force_authenticate(self.officer)

        create_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Custom Workflow", "program": str(custom_program.id)},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        definition_id = create_response.data["data"]["id"]

        step_payloads = [
            {
                "name": "Intake",
                "code": "intake",
                "order": 1,
                "role_required": "innovation_officer",
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": "submitted",
                "requires_assignment": False,
                "minimum_assignments": 0,
                "requires_evaluation": False,
                "minimum_evaluations": 0,
                "is_active": True,
            },
            {
                "name": "Decision",
                "code": "decision",
                "order": 2,
                "role_required": "innovation_officer",
                "actions_allowed": ["approve", "reject", "return"],
                "submission_status": "approved",
                "requires_assignment": False,
                "minimum_assignments": 0,
                "requires_evaluation": False,
                "minimum_evaluations": 0,
                "is_active": True,
            },
        ]
        for payload in step_payloads:
            step_response = self.client.post(f"/api/workflow-definitions/{definition_id}/steps/", payload, format="json")
            self.assertEqual(step_response.status_code, 201)

        activate_response = self.client.post(f"/api/workflow-definitions/{definition_id}/activate/", {}, format="json")
        self.assertEqual(activate_response.status_code, 200)
        self.assertTrue(WorkflowDefinition.objects.get(id=definition_id).is_active)

    def test_updating_active_definition_in_use_creates_safe_version_copy(self):
        definition = self.submission.workflow_instance.workflow_definition
        self.client.force_authenticate(self.officer)

        response = self.client.patch(
            f"/api/workflow-definitions/{definition.id}/",
            {"name": "Updated In Safe Copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["data"]["versioned_copy_created"])
        definition.refresh_from_db()
        self.assertNotEqual(definition.name, "Updated In Safe Copy")
        self.assertEqual(WorkflowDefinition.objects.filter(program=self.program).count(), 2)

    def test_judge_cannot_manage_workflow_definitions(self):
        self.client.force_authenticate(self.judge)
        response = self.client.get("/api/workflow-definitions/")
        self.assertEqual(response.status_code, 403)

    def test_officer_can_build_graph_definition_validate_publish_and_activate(self):
        graph_program = Program.objects.create(
            title="Graph Program",
            slug="graph-program",
            description="Graph Program",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        self.client.force_authenticate(self.officer)

        create_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Graph Workflow", "program": str(graph_program.id), "code": "graph-workflow"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        definition_id = create_response.data["data"]["id"]

        start_response = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "Start", "code": "start", "node_type": "start", "is_initial": True},
            format="json",
        )
        review_response = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "Review", "code": "review", "node_type": "review_task"},
            format="json",
        )
        end_response = self.client.post(
            f"/api/workflow-definitions/{definition_id}/nodes/",
            {"name": "End", "code": "end", "node_type": "end", "is_terminal": True},
            format="json",
        )
        self.assertEqual(start_response.status_code, 201)
        self.assertEqual(review_response.status_code, 201)
        self.assertEqual(end_response.status_code, 201)

        review_node_id = review_response.data["data"]["id"]
        self.client.post(
            f"/api/workflow-nodes/{review_node_id}/actions/",
            {"key": "approve", "label": "Approve"},
            format="json",
        )
        self.client.post(
            f"/api/workflow-definitions/{definition_id}/transitions/",
            {
                "from_node": start_response.data["data"]["id"],
                "to_node": review_node_id,
                "priority": 1,
                "is_default": True,
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-definitions/{definition_id}/transitions/",
            {
                "from_node": review_node_id,
                "to_node": end_response.data["data"]["id"],
                "action_key": "approve",
                "priority": 1,
                "is_default": True,
            },
            format="json",
        )

        validate_response = self.client.post(f"/api/workflow-definitions/{definition_id}/validate/", {}, format="json")
        publish_response = self.client.post(f"/api/workflow-definitions/{definition_id}/publish/", {}, format="json")
        activate_response = self.client.post(f"/api/workflow-definitions/{definition_id}/activate/", {}, format="json")

        self.assertEqual(validate_response.status_code, 200)
        self.assertTrue(validate_response.data["data"]["valid"])
        self.assertEqual(publish_response.status_code, 200)
        self.assertEqual(activate_response.status_code, 200)
        definition = WorkflowDefinition.objects.get(id=definition_id)
        self.assertEqual(definition.status, WorkflowDefinition.STATUS_ACTIVE)
        self.assertTrue(definition.is_active)

    def test_officer_can_create_assignment_policy_and_bind_it_to_node(self):
        graph_program = Program.objects.create(
            title="Binding Program",
            slug="binding-program",
            description="Binding Program",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        self.client.force_authenticate(self.officer)
        definition = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Binding Workflow", "program": str(graph_program.id), "code": "binding-workflow"},
            format="json",
        ).data["data"]
        node = self.client.post(
            f"/api/workflow-definitions/{definition['id']}/nodes/",
            {"name": "Judge Review", "code": "judge_review", "node_type": "review_task"},
            format="json",
        ).data["data"]

        policy_response = self.client.post(
            "/api/assignment-policies/",
            {"name": "Judge Role Policy", "code": "judge-role-policy", "policy_type": "role_based", "config_json": {"role_codes": ["judge"]}},
            format="json",
        )
        self.assertEqual(policy_response.status_code, 201)

        bind_response = self.client.post(
            f"/api/workflow-nodes/{node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 2,
                "maximum_assignees": 3,
                "execution_mode": "parallel_minimum",
                "minimum_completions_required": 2,
            },
            format="json",
        )
        self.assertEqual(bind_response.status_code, 200)
        self.assertEqual(bind_response.data["data"]["assignment_policy_name"], "Judge Role Policy")
        self.assertEqual(AssignmentPolicy.objects.count(), 1)

    def test_officer_can_create_reusable_form_bind_to_node_and_start_graph_instance(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Runtime Graph Program", slug="runtime-graph-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        program_id = graph["program"].id

        section_response = self.client.post(
            f"/api/programs/{program_id}/form-sections/",
            {"title": "Decision", "code": "decision", "ordering": 1},
            format="json",
        )
        self.assertEqual(section_response.status_code, 201)
        field_response = self.client.post(
            f"/api/programs/form-sections/{section_response.data['id']}/fields/",
            {"key": "decision_note", "label": "Decision Note", "field_type": "textarea", "required": True, "ordering": 1},
            format="json",
        )
        self.assertEqual(field_response.status_code, 201)
        form_response = self.client.get(f"/api/programs/{program_id}/form/")
        self.assertEqual(form_response.status_code, 200)
        form_id = form_response.data["id"]

        bind_form_response = self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-form/",
            {"form_definition": form_id, "binding_type": "review", "mode": "editable", "required_on_entry": True},
            format="json",
        )
        self.assertEqual(bind_form_response.status_code, 200)

        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id, payload_json={"decision_note": "Initial payload"})

        first_detail = self.client.get(f"/api/workflow-instances/{instance_id}/")
        self.assertEqual(first_detail.status_code, 200)
        self.assertEqual(first_detail.data["data"]["current_node_detail"]["code"], "start")

        advance_response = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "", "payload_json": {"decision_note": "Moved to review"}},
            format="json",
        )
        self.assertEqual(advance_response.status_code, 200)

        final_response = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve", "comment": "Approved in graph runtime"},
            format="json",
        )
        self.assertEqual(final_response.status_code, 200)
        instance = WorkflowInstance.objects.get(id=instance_id)
        self.assertEqual(instance.status, WorkflowInstance.STATUS_COMPLETED)
        history_response = self.client.get(f"/api/workflow-instances/{instance_id}/history/")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(len(history_response.data["data"]["transition_logs"]), 2)

    def test_node_exit_is_blocked_when_required_form_is_incomplete(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Form Guard Program", slug="form-guard-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        program_id = graph["program"].id

        section_response = self.client.post(
            f"/api/programs/{program_id}/form-sections/",
            {"title": "Review", "code": "review", "ordering": 1},
            format="json",
        )
        self.client.post(
            f"/api/programs/form-sections/{section_response.data['id']}/fields/",
            {"key": "review_note", "label": "Review Note", "field_type": "textarea", "required": True, "ordering": 1},
            format="json",
        )
        form_response = self.client.get(f"/api/programs/{program_id}/form/")
        self.assertEqual(form_response.status_code, 200)
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-form/",
            {"form_definition": form_response.data["id"], "binding_type": "review", "mode": "editable", "required_on_exit": True},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")

        blocked = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("errors", blocked.data)
        self.assertIn("node_exit_guard", blocked.data["errors"])
        self.assertIn("forms", blocked.data["errors"]["node_exit_guard"])

        allowed = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve", "payload_json": {"review_note": "Ready to exit"}},
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)

    def test_assignment_instances_are_created_and_block_node_exit_until_completed(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Assignment Guard Program", slug="assignment-guard-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]

        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Specific Judge Policy",
                "code": "specific-judge-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 1,
                "maximum_assignees": 1,
                "execution_mode": "parallel_all",
                "minimum_completions_required": 1,
            },
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        move_to_review = self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        self.assertEqual(move_to_review.status_code, 200)

        instance = WorkflowInstance.objects.get(id=instance_id)
        active_node_instance = instance.node_instances.get(status="active", node__code="review")
        assignments = AssignmentInstance.objects.filter(node_instance=active_node_instance)
        self.assertEqual(assignments.count(), 1)
        self.assertEqual(assignments.first().assignee_user_id, self.judge.id)

        blocked = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("errors", blocked.data)
        self.assertIn("assignments", blocked.data["errors"]["node_exit_guard"])

        accept_response = self.client.post(f"/api/assignment-instances/{assignments.first().id}/accept/", {}, format="json")
        self.assertEqual(accept_response.status_code, 200)
        complete_response = self.client.post(
            f"/api/assignment-instances/{assignments.first().id}/complete/",
            {"note": "Review completed"},
            format="json",
        )
        self.assertEqual(complete_response.status_code, 200)
        allowed = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve"},
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)

    def test_role_based_assignment_resolution_creates_assignment_instances(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Role Assignment Program", slug="role-assignment-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]

        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Judge Role Runtime Policy",
                "code": "judge-role-runtime-policy",
                "policy_type": "role_based",
                "config_json": {"role_codes": ["judge"]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 1,
                "maximum_assignees": 2,
                "execution_mode": "parallel_any",
                "minimum_completions_required": 1,
            },
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")

        history = self.client.get(f"/api/workflow-instances/{instance_id}/history/")
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data["data"]["assignment_instances"]), 1)
        self.assertEqual(str(history.data["data"]["assignment_instances"][0]["assignee_user"]), str(self.judge.id))

    def test_assigned_user_can_accept_and_complete_own_graph_assignment(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Assignment Action Program", slug="assignment-action-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Single Judge Policy",
                "code": "single-judge-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 1,
                "maximum_assignees": 1,
                "execution_mode": "parallel_any",
                "minimum_completions_required": 1,
            },
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        self.client.force_authenticate(self.judge)
        accept = self.client.post(f"/api/assignment-instances/{assignment.id}/accept/", {}, format="json")
        self.assertEqual(accept.status_code, 200)
        self.assertEqual(accept.data["data"]["status"], AssignmentInstance.STATUS_ACCEPTED)
        complete = self.client.post(
            f"/api/assignment-instances/{assignment.id}/complete/",
            {"note": "Completed by judge", "metadata_json": {"score": 4}},
            format="json",
        )
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.data["data"]["status"], AssignmentInstance.STATUS_COMPLETED)

    def test_other_normal_user_cannot_complete_someone_elses_graph_assignment(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Unauthorized Program", slug="unauthorized-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Unauthorized Single Judge Policy",
                "code": "unauthorized-single-judge-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {"assignment_policy": policy_response.data["data"]["id"], "minimum_assignees": 1, "maximum_assignees": 1},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        self.client.force_authenticate(self.other_innovator)
        complete = self.client.post(f"/api/assignment-instances/{assignment.id}/complete/", {"note": "Not mine"}, format="json")
        self.assertEqual(complete.status_code, 404)

    def test_officer_can_cancel_and_reassign_graph_assignment(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Reassign Program", slug="reassign-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Officer Reassign Policy",
                "code": "officer-reassign-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {"assignment_policy": policy_response.data["data"]["id"], "minimum_assignees": 1, "maximum_assignees": 1},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        reassign = self.client.post(
            f"/api/assignment-instances/{assignment.id}/reassign/",
            {"new_assignee": str(self.officer.id), "reason": "Officer takeover"},
            format="json",
        )
        self.assertEqual(reassign.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, AssignmentInstance.STATUS_CANCELLED)
        replacement = AssignmentInstance.objects.get(id=reassign.data["data"]["id"])
        self.assertEqual(replacement.assignee_user_id, self.officer.id)

        cancel = self.client.post(
            f"/api/assignment-instances/{replacement.id}/cancel/",
            {"reason": "No longer needed"},
            format="json",
        )
        self.assertEqual(cancel.status_code, 200)
        replacement.refresh_from_db()
        self.assertEqual(replacement.status, AssignmentInstance.STATUS_CANCELLED)

    def test_completed_assignment_cannot_be_completed_again_and_list_detail_endpoints_work(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="List Detail Program", slug="list-detail-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "List Detail Judge Policy",
                "code": "list-detail-judge-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {"assignment_policy": policy_response.data["data"]["id"], "minimum_assignees": 1, "maximum_assignees": 1},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        self.client.force_authenticate(self.judge)
        self.client.post(f"/api/assignment-instances/{assignment.id}/accept/", {}, format="json")
        first_complete = self.client.post(f"/api/assignment-instances/{assignment.id}/complete/", {"note": "done"}, format="json")
        self.assertEqual(first_complete.status_code, 200)

        second_complete = self.client.post(f"/api/assignment-instances/{assignment.id}/complete/", {"note": "again"}, format="json")
        self.assertEqual(second_complete.status_code, 400)

        list_response = self.client.get("/api/assignment-instances/?mine=true")
        detail_response = self.client.get(f"/api/assignment-instances/{assignment.id}/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(len(list_response.data["data"]), 1)
        self.assertEqual(detail_response.data["data"]["status"], AssignmentInstance.STATUS_COMPLETED)
        self.assertGreaterEqual(len(detail_response.data["data"]["action_logs"]), 2)

    def test_assigned_user_can_decline_and_decline_does_not_block_exit(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Decline Program", slug="decline-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Decline Judge Policy",
                "code": "decline-judge-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {"assignment_policy": policy_response.data["data"]["id"], "minimum_assignees": 1, "maximum_assignees": 1},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        self.client.force_authenticate(self.judge)
        decline = self.client.post(
            f"/api/assignment-instances/{assignment.id}/decline/",
            {"reason": "Conflict"},
            format="json",
        )
        self.assertEqual(decline.status_code, 200)
        self.assertEqual(decline.data["data"]["status"], AssignmentInstance.STATUS_DECLINED)

        self.client.force_authenticate(self.officer)
        proceed = self.client.post(
            f"/api/workflow-instances/{instance_id}/actions/",
            {"action_key": "approve"},
            format="json",
        )
        self.assertEqual(proceed.status_code, 200)

    def test_cannot_decline_after_completion(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Decline After Complete Program", slug="decline-after-complete-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Decline After Complete Policy",
                "code": "decline-after-complete-policy",
                "policy_type": "specific_user",
                "config_json": {"user_ids": [str(self.judge.id)]},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {"assignment_policy": policy_response.data["data"]["id"], "minimum_assignees": 1, "maximum_assignees": 1},
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")
        assignment = AssignmentInstance.objects.get(node_instance__workflow_instance_id=instance_id, assignee_user=self.judge)

        self.client.force_authenticate(self.judge)
        self.client.post(f"/api/assignment-instances/{assignment.id}/accept/", {}, format="json")
        self.client.post(f"/api/assignment-instances/{assignment.id}/complete/", {"note": "done"}, format="json")
        decline = self.client.post(f"/api/assignment-instances/{assignment.id}/decline/", {"reason": "late"}, format="json")
        self.assertEqual(decline.status_code, 400)

    def test_user_can_claim_role_based_assignment_and_second_user_cannot_claim_it(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Claim Program", slug="claim-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Claim Judge Policy",
                "code": "claim-judge-policy",
                "policy_type": "role_based",
                "config_json": {"role_codes": ["judge"], "claim_required": True},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 1,
                "maximum_assignees": 1,
                "execution_mode": "parallel_any",
                "minimum_completions_required": 1,
            },
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")

        self.client.force_authenticate(self.judge)
        claimable_list = self.client.get("/api/assignment-instances/")
        self.assertEqual(claimable_list.status_code, 200)
        self.assertEqual(len(claimable_list.data["data"]), 1)
        assignment_id = claimable_list.data["data"][0]["id"]
        claim = self.client.post(f"/api/assignment-instances/{assignment_id}/claim/", {}, format="json")
        self.assertEqual(claim.status_code, 200)
        self.assertEqual(claim.data["data"]["status"], AssignmentInstance.STATUS_ACCEPTED)
        self.assertEqual(str(claim.data["data"]["assignee_user"]), str(self.judge.id))
        self.assertIsNotNone(claim.data["data"]["claimed_at"])

        self.client.force_authenticate(self.other_innovator)
        second_claim = self.client.post(f"/api/assignment-instances/{assignment_id}/claim/", {}, format="json")
        self.assertEqual(second_claim.status_code, 404)

    def test_workflow_proceeds_after_claim_and_completion(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Claim Complete Program", slug="claim-complete-program")
        definition_id = graph["definition_id"]
        review_node = graph["review_node"]
        policy_response = self.client.post(
            "/api/assignment-policies/",
            {
                "name": "Claim Complete Policy",
                "code": "claim-complete-policy",
                "policy_type": "role_based",
                "config_json": {"role_codes": ["judge"], "claim_required": True},
            },
            format="json",
        )
        self.client.post(
            f"/api/workflow-nodes/{review_node['id']}/bind-assignment-policy/",
            {
                "assignment_policy": policy_response.data["data"]["id"],
                "minimum_assignees": 1,
                "maximum_assignees": 1,
                "execution_mode": "parallel_any",
                "minimum_completions_required": 1,
            },
            format="json",
        )
        self._publish_and_activate(definition_id)
        instance_id = self._start_graph_instance(definition_id)
        self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": ""}, format="json")

        self.client.force_authenticate(self.officer)
        blocked = self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": "approve"}, format="json")
        self.assertEqual(blocked.status_code, 400)

        self.client.force_authenticate(self.judge)
        assignment = self.client.get("/api/assignment-instances/").data["data"][0]
        self.client.post(f"/api/assignment-instances/{assignment['id']}/claim/", {}, format="json")
        self.client.post(f"/api/assignment-instances/{assignment['id']}/complete/", {"note": "claimed and done"}, format="json")

        self.client.force_authenticate(self.officer)
        proceed = self.client.post(f"/api/workflow-instances/{instance_id}/actions/", {"action_key": "approve"}, format="json")
        self.assertEqual(proceed.status_code, 200)

    def test_workflow_instance_list_can_filter_by_workflow_definition(self):
        self.client.force_authenticate(self.officer)
        graph_one = self._build_basic_graph_definition(name="Filter Program One", slug="filter-program-one")
        graph_two = self._build_basic_graph_definition(name="Filter Program Two", slug="filter-program-two")
        self._publish_and_activate(graph_one["definition_id"])
        self._publish_and_activate(graph_two["definition_id"])

        instance_one = self._start_graph_instance(graph_one["definition_id"], payload_json={"tag": "one"})
        instance_two = self._start_graph_instance(graph_two["definition_id"], payload_json={"tag": "two"})

        filtered = self.client.get(f"/api/workflow-instances/?workflow_definition={graph_one['definition_id']}")
        self.assertEqual(filtered.status_code, 200)
        returned_ids = {item["id"] for item in filtered.data["data"]}
        self.assertIn(str(instance_one), returned_ids)
        self.assertNotIn(str(instance_two), returned_ids)

    def test_workflow_definition_list_can_filter_by_program(self):
        self.client.force_authenticate(self.officer)
        graph_one = self._build_basic_graph_definition(name="Program Filter One", slug="program-filter-one")
        graph_two = self._build_basic_graph_definition(name="Program Filter Two", slug="program-filter-two")

        response = self.client.get(f"/api/workflow-definitions/?program={graph_one['program'].id}")
        self.assertEqual(response.status_code, 200)
        returned_ids = {item["id"] for item in response.data["data"]}
        self.assertIn(graph_one["definition_id"], returned_ids)
        self.assertNotIn(graph_two["definition_id"], returned_ids)

    def test_workflow_definition_create_and_detail_expose_program_linkage(self):
        self.client.force_authenticate(self.officer)
        graph_program = Program.objects.create(
            title="Program Linked Workflow Program",
            slug="program-linked-workflow-program",
            description="Program linked workflow program",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )

        create_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Program Linked Workflow", "program": str(graph_program.id), "code": "program-linked-workflow"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(str(create_response.data["data"]["program"]), str(graph_program.id))
        self.assertEqual(create_response.data["data"]["program_detail"]["id"], str(graph_program.id))
        self.assertEqual(create_response.data["data"]["program_detail"]["title"], graph_program.title)

        detail_response = self.client.get(f"/api/workflow-definitions/{create_response.data['data']['id']}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(str(detail_response.data["data"]["program"]), str(graph_program.id))
        self.assertEqual(detail_response.data["data"]["program_detail"]["slug"], graph_program.slug)

    def test_program_detail_exposes_active_and_versioned_workflow_linkage(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Program Detail Workflow Program", slug="program-detail-workflow-program")
        self._publish_and_activate(graph["definition_id"])

        draft_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Program Detail Workflow Draft", "program": str(graph["program"].id), "code": "program-detail-workflow-draft"},
            format="json",
        )
        self.assertEqual(draft_response.status_code, 201)

        program_response = self.client.get(f"/api/programs/{graph['program'].id}/")
        self.assertEqual(program_response.status_code, 200)
        self.assertEqual(program_response.data["active_workflow_definition"]["id"], graph["definition_id"])
        workflow_definition_ids = {item["id"] for item in program_response.data["workflow_definitions"]}
        self.assertIn(graph["definition_id"], workflow_definition_ids)
        self.assertIn(draft_response.data["data"]["id"], workflow_definition_ids)

    def test_activating_new_workflow_keeps_one_active_workflow_per_program(self):
        self.client.force_authenticate(self.officer)
        graph = self._build_basic_graph_definition(name="Activation Program", slug="activation-program")
        self._publish_and_activate(graph["definition_id"])

        second_response = self.client.post(
            "/api/workflow-definitions/",
            {"name": "Activation Program Workflow Two", "program": str(graph["program"].id), "code": "activation-program-two"},
            format="json",
        )
        self.assertEqual(second_response.status_code, 201)
        second_id = second_response.data["data"]["id"]
        self.client.post(
            f"/api/workflow-definitions/{second_id}/steps/",
            {
                "name": "Intake",
                "code": "intake",
                "order": 1,
                "role_required": "innovation_officer",
                "actions_allowed": ["approve"],
                "submission_status": "submitted",
                "requires_assignment": False,
                "minimum_assignments": 0,
                "requires_evaluation": False,
                "minimum_evaluations": 0,
                "is_active": True,
            },
            format="json",
        )
        self.client.post(f"/api/workflow-definitions/{second_id}/publish/", {}, format="json")
        activate_response = self.client.post(f"/api/workflow-definitions/{second_id}/activate/", {}, format="json")
        self.assertEqual(activate_response.status_code, 200)

        active_ids = set(
            WorkflowDefinition.objects.filter(program=graph["program"], is_active=True).values_list("id", flat=True)
        )
        self.assertEqual(len(active_ids), 1)
        self.assertIn(WorkflowDefinition.objects.get(id=second_id).id, active_ids)

    def test_seed_command_creates_programs_and_linked_workflows(self):
        Program.objects.exclude(id=self.program.id).delete()
        call_command("seed_ceda_portal")
        call_command("seed_ceda_portal")

        self.assertTrue(Program.objects.exists())
        self.assertTrue(WorkflowDefinition.objects.filter(program__isnull=False).exists())
        self.assertTrue(Program.objects.filter(workflow_definitions__isnull=False).distinct().exists())

    def test_seed_command_suppresses_email_output_by_default(self):
        Program.objects.exclude(id=self.program.id).delete()
        stdout = StringIO()

        call_command("seed_ceda_portal", stdout=stdout)

        output = stdout.getvalue()
        self.assertIn("Seeding with email delivery suppressed.", output)
        self.assertIn("CEDA Innovation Portal seed data created successfully.", output)
        self.assertNotIn("Subject: New assignment", output)

    def test_schema_uses_correct_request_serializers_for_nodes_and_transitions(self):
        # The schema is for administrators only (config/urls.py).
        admin = User.objects.create_user(email="schema-admin@example.com", password="StrongPass123")
        RoleService.assign_roles(admin, [RoleType.ADMINISTRATOR])
        self.client.force_authenticate(admin)
        response = self.client.get(reverse("schema"))
        self.assertEqual(response.status_code, 200)
        schema = yaml.safe_load(response.content.decode("utf-8"))

        node_ref = schema["paths"]["/api/workflow-definitions/{id}/nodes/"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"]
        transition_ref = schema["paths"]["/api/workflow-definitions/{id}/transitions/"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"]

        self.assertTrue(node_ref.endswith("/WorkflowNodeWriteRequest"))
        self.assertTrue(transition_ref.endswith("/WorkflowTransitionWriteRequest"))

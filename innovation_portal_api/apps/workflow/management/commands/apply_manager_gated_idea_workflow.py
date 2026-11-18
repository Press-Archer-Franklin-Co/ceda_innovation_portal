from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction

from apps.core.constants import AssignmentRoleType, RoleType, SubmissionStatus
from apps.evaluation.models import MarkingCriteria, StageEvaluationConfig
from apps.programs.models import Program
from apps.workflow.models import (
    NodeAction,
    WorkflowDefinition,
    WorkflowNode,
    WorkflowStep,
    WorkflowTransition,
)


class Command(BaseCommand):
    help = "Apply the manager-gated CEDA idea workflow configuration."

    STEP_DEFS = [
        {
            "name": "Submitted",
            "code": "submitted",
            "order": 1,
            "role_required": RoleType.INNOVATOR,
            "actions_allowed": ["submit"],
            "submission_status": SubmissionStatus.SUBMITTED,
            "requires_assignment": False,
            "assignment_role": "",
            "minimum_assignments": 0,
            "requires_evaluation": False,
            "minimum_evaluations": 0,
            "minimum_completions_required": 1,
            "due_in_hours": 0,
        },
        {
            "name": "Innovation Officer Review",
            "code": "officer_review",
            "order": 2,
            "role_required": RoleType.INNOVATION_OFFICER,
            "actions_allowed": ["approve", "score_submitted"],
            "submission_status": SubmissionStatus.SCREENING,
            "requires_assignment": True,
            "assignment_role": AssignmentRoleType.OFFICER,
            "minimum_assignments": 1,
            "requires_evaluation": True,
            "minimum_evaluations": 1,
            "minimum_completions_required": 1,
            "due_in_hours": 72,
        },
        {
            "name": "Innovation Manager Review",
            "code": "innovation_manager_review",
            "order": 3,
            "role_required": RoleType.INNOVATION_MANAGER,
            "actions_allowed": ["approve", "send_back", "return", "reject"],
            "submission_status": SubmissionStatus.UNDER_REVIEW,
            "requires_assignment": True,
            "assignment_role": AssignmentRoleType.MANAGER,
            "minimum_assignments": 1,
            "requires_evaluation": False,
            "minimum_evaluations": 0,
            "execution_mode": WorkflowStep.EXECUTION_PARALLEL_MINIMUM,
            "minimum_completions_required": 1,
            "due_in_hours": 48,
        },
        {
            "name": "Evaluation Committee Review",
            "code": "committee_review",
            "order": 4,
            "role_required": RoleType.JUDGE,
            "actions_allowed": ["approve", "score_submitted"],
            "submission_status": SubmissionStatus.JUDGING_REVIEW,
            "requires_assignment": True,
            "assignment_role": AssignmentRoleType.SPECIALIST,
            "minimum_assignments": 0,
            "requires_evaluation": True,
            "minimum_evaluations": 1,
            "minimum_completions_required": 1,
            "due_in_hours": 120,
        },
        {
            "name": "Manager Review After Committee",
            "code": "committee_manager_review",
            "order": 5,
            "role_required": RoleType.INNOVATION_MANAGER,
            "actions_allowed": ["approve", "send_back", "return", "reject"],
            "submission_status": SubmissionStatus.SHORTLISTED,
            "requires_assignment": True,
            "assignment_role": AssignmentRoleType.MANAGER,
            "minimum_assignments": 1,
            "requires_evaluation": False,
            "minimum_evaluations": 0,
            "execution_mode": WorkflowStep.EXECUTION_PARALLEL_MINIMUM,
            "minimum_completions_required": 1,
            "due_in_hours": 48,
        },
        {
            "name": "Final Decision",
            "code": "final_decision",
            "order": 6,
            "role_required": RoleType.INNOVATION_MANAGER,
            "actions_allowed": ["approve", "incubate", "reject"],
            "submission_status": SubmissionStatus.SHORTLISTED,
            "requires_assignment": False,
            "assignment_role": "",
            "minimum_assignments": 0,
            "requires_evaluation": False,
            "minimum_evaluations": 0,
            "minimum_completions_required": 1,
            "due_in_hours": 48,
        },
        {
            "name": "Incubation",
            "code": "incubation",
            "order": 7,
            "role_required": RoleType.INNOVATION_MANAGER,
            "actions_allowed": ["complete_incubation"],
            "submission_status": SubmissionStatus.APPROVED,
            "requires_assignment": False,
            "assignment_role": "",
            "minimum_assignments": 0,
            "requires_evaluation": False,
            "minimum_evaluations": 0,
            "minimum_completions_required": 1,
            "due_in_hours": 0,
        },
    ]

    NODE_DEFS = {
        "submitted": ("Submitted", WorkflowNode.TYPE_START, 0, 0, True, False),
        "officer_review": ("Innovation Officer Review", WorkflowNode.TYPE_REVIEW_TASK, 220, 0, False, False),
        "innovation_manager_review": ("Innovation Manager Review", WorkflowNode.TYPE_APPROVAL_TASK, 440, 0, False, False),
        "committee_review": ("Evaluation Committee Review", WorkflowNode.TYPE_REVIEW_TASK, 660, 0, False, False),
        "committee_manager_review": ("Manager Review After Committee", WorkflowNode.TYPE_APPROVAL_TASK, 880, 0, False, False),
        "final_decision": ("Final Decision", WorkflowNode.TYPE_DECISION, 1100, 0, False, False),
        "incubation": ("Incubation", WorkflowNode.TYPE_USER_TASK, 1320, 0, False, False),
        "returned": ("Returned to Innovator", WorkflowNode.TYPE_USER_TASK, 440, 180, False, False),
        "approved": ("Approved", WorkflowNode.TYPE_END, 1540, -90, False, True),
        "rejected": ("Rejected", WorkflowNode.TYPE_END, 1540, 90, False, True),
    }

    TRANSITIONS = [
        ("submitted", "officer_review", "submit", "Submit for officer review", 1, True),
        ("officer_review", "innovation_manager_review", "approve", "Officer score ready for manager review", 1, False),
        ("innovation_manager_review", "committee_review", "approve", "Manager approves officer outcome", 1, False),
        ("innovation_manager_review", "officer_review", "send_back", "Manager sends back to officer", 2, False),
        ("innovation_manager_review", "returned", "return", "Manager returns to submitter", 3, False),
        ("innovation_manager_review", "rejected", "reject", "Manager rejects after officer review", 4, False),
        ("committee_review", "committee_manager_review", "approve", "Committee score ready for manager review", 1, False),
        ("committee_manager_review", "final_decision", "approve", "Manager approves committee outcome", 1, False),
        ("committee_manager_review", "committee_review", "send_back", "Manager sends back to committee", 2, False),
        ("committee_manager_review", "returned", "return", "Manager returns after committee", 3, False),
        ("committee_manager_review", "rejected", "reject", "Manager rejects after committee", 4, False),
        ("returned", "officer_review", "resubmit", "Resubmit after corrections", 1, True),
        ("final_decision", "approved", "approve", "Approve", 1, False),
        ("final_decision", "incubation", "incubate", "Send to incubation", 2, False),
        ("final_decision", "rejected", "reject", "Reject", 3, False),
        ("incubation", "approved", "complete_incubation", "Complete incubation", 1, True),
    ]

    ACTION_LABELS = {
        "submit": "Submit",
        "approve": "Approve Outcome",
        "send_back": "Send Back for Re-review",
        "return": "Return to Submitter",
        "reject": "Reject",
        "resubmit": "Resubmit",
        "incubate": "Send to Incubation",
        "complete_incubation": "Complete Incubation",
        "score_submitted": "Submit Score",
    }

    def add_arguments(self, parser):
        parser.add_argument("--program-id", default="", help="Optional program UUID.")
        parser.add_argument("--program-title", default="CEDA Idea Submission", help="Program title fallback.")

    @transaction.atomic
    def handle(self, *args, **options):
        program = self._get_program(options)
        workflow = (
            WorkflowDefinition.objects
            .select_for_update()
            .filter(program=program, is_active=True)
            .order_by("-version")
            .first()
        )
        if not workflow:
            workflow = WorkflowDefinition.objects.create(
                program=program,
                name="CEDA Idea Submission Review",
                code="ceda-idea-review",
                description="Manager-gated idea review workflow.",
                status=WorkflowDefinition.STATUS_ACTIVE,
                version=1,
                is_current=True,
                is_active=True,
            )

        WorkflowStep.objects.filter(workflow_definition=workflow).update(order=models.F("order") + 100)
        desired_codes = {item["code"] for item in self.STEP_DEFS}
        WorkflowStep.objects.filter(workflow_definition=workflow).exclude(code__in=desired_codes).update(is_active=False)

        steps = {}
        for step_def in self.STEP_DEFS:
            step, _ = WorkflowStep.objects.update_or_create(
                workflow_definition=workflow,
                code=step_def["code"],
                defaults={**step_def, "is_active": True},
            )
            steps[step.code] = step

        nodes = self._upsert_nodes(workflow)
        self._upsert_actions(nodes)
        self._upsert_transitions(workflow, nodes)
        self._upsert_stage_configs(steps)

        workflow.description = (
            "Manager-gated flow: one officer criteria review, manager approval, "
            "invited committee review, manager approval, final decision."
        )
        workflow.is_active = True
        workflow.is_current = True
        workflow.status = WorkflowDefinition.STATUS_ACTIVE
        workflow.save(update_fields=["description", "is_active", "is_current", "status", "updated_at"])

        self.stdout.write(self.style.SUCCESS(f"Applied manager-gated workflow to {program.title}."))

    def _get_program(self, options):
        if options["program_id"]:
            try:
                return Program.objects.get(id=options["program_id"])
            except Program.DoesNotExist as exc:
                raise CommandError("Program not found.") from exc
        program = Program.objects.filter(title__iexact=options["program_title"]).first()
        if not program:
            program = Program.objects.filter(title__icontains="idea").order_by("-created_at").first()
        if not program:
            raise CommandError("No idea program found.")
        return program

    def _upsert_nodes(self, workflow):
        nodes = {}
        WorkflowNode.objects.filter(workflow_definition=workflow).update(is_initial=False)
        for code, (name, node_type, x, y, initial, terminal) in self.NODE_DEFS.items():
            node, _ = WorkflowNode.objects.update_or_create(
                workflow_definition=workflow,
                code=code,
                defaults={
                    "name": name,
                    "node_type": node_type,
                    "position_x": x,
                    "position_y": y,
                    "is_initial": initial,
                    "is_terminal": terminal,
                    "is_active": True,
                },
            )
            nodes[code] = node
        WorkflowNode.objects.filter(workflow_definition=workflow).exclude(code__in=nodes.keys()).update(is_active=False, is_initial=False)
        return nodes

    def _upsert_actions(self, nodes):
        for node in nodes.values():
            NodeAction.objects.filter(node=node).update(is_active=False)
        for from_code, _to_code, action, _label, _priority, _default in self.TRANSITIONS:
            node = nodes[from_code]
            NodeAction.objects.update_or_create(
                node=node,
                key=action,
                defaults={
                    "label": self.ACTION_LABELS.get(action, action.replace("_", " ").title()),
                    "requires_comment": action in {"return", "reject", "send_back"},
                    "is_terminal_action": False,
                    "is_active": True,
                },
            )

    def _upsert_transitions(self, workflow, nodes):
        WorkflowTransition.objects.filter(workflow_definition=workflow).update(is_active=False)
        for from_code, to_code, action, label, priority, is_default in self.TRANSITIONS:
            WorkflowTransition.objects.update_or_create(
                workflow_definition=workflow,
                from_node=nodes[from_code],
                action_key=action,
                priority=priority,
                defaults={
                    "to_node": nodes[to_code],
                    "label": label,
                    "is_default": is_default,
                    "is_active": True,
                },
            )

    def _upsert_stage_configs(self, steps):
        criteria = MarkingCriteria.objects.filter(is_active=True, items__isnull=False).order_by("-updated_at").first()
        if not criteria:
            self.stdout.write(self.style.WARNING("No active marking criteria found; workflow updated without criteria links."))
            return

        officer_config, _ = StageEvaluationConfig.objects.get_or_create(workflow_step=steps["officer_review"])
        officer_config.marking_criteria = criteria
        officer_config.rubric = None
        officer_config.required_reviewer_count = 1
        officer_config.review_mode = StageEvaluationConfig.REVIEW_MODE_FIXED_COUNT
        officer_config.review_window_hours = 0
        officer_config.minimum_reviews_required = 1
        officer_config.maximum_reviews_allowed = 1
        officer_config.aggregation_method = StageEvaluationConfig.AGGREGATION_AVERAGE
        officer_config.threshold_reject_below = 40
        officer_config.threshold_pass_above = 70
        officer_config.save()

        committee_config, _ = StageEvaluationConfig.objects.get_or_create(workflow_step=steps["committee_review"])
        committee_config.marking_criteria = criteria
        committee_config.rubric = None
        committee_config.required_reviewer_count = 1
        committee_config.review_mode = StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
        committee_config.review_window_hours = 48
        committee_config.minimum_reviews_required = 1
        committee_config.maximum_reviews_allowed = 20
        committee_config.aggregation_method = StageEvaluationConfig.AGGREGATION_AVERAGE
        committee_config.threshold_reject_below = 40
        committee_config.threshold_pass_above = 70
        committee_config.save()

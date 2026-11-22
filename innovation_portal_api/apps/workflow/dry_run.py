"""Copilot and the Workflow builder: test a workflow with sample answers, without saving anything.

The walk uses the real condition and transition services (RuleEvaluationService, TransitionResolverService) with a
stand-in instance, inside a transaction that is always rolled back. It sends no notifications and makes no tasks.
"""

from __future__ import annotations

from types import SimpleNamespace

from django.db import transaction
from rest_framework.exceptions import ValidationError

MAX_STEPS = 100


def _entry(name, code, who, decision, why) -> dict:
    """One stage on the path. stage/who/decision, plus step/outcome/why for the AI lane (R-68)."""
    return {"stage": name, "code": code, "step": code, "who": who, "decision": decision, "outcome": decision or "finished", "why": why}


def _problem(path: str, message: str) -> dict:
    return {"path": path, "message": message}


def _why(transition, condition_result, chosen: bool) -> str:
    how = "you chose it" if chosen else "the first decision"
    if transition.condition_expression and condition_result not in ("default",):
        return f"{how}; the condition matched these answers"
    if condition_result == "default":
        return f"{how}; no condition matched, so the default way"
    return how


def _who(node) -> str:
    binding = getattr(node, "assignment_binding", None)
    if binding is not None:
        return binding.assignment_policy.name
    who = (node.metadata_json or {}).get("who") or {}
    return who.get("label") or who.get("role") or ""


class WorkflowDryRunService:
    @classmethod
    def run(cls, definition, *, answers: dict, actor=None) -> dict:
        answers = dict(answers or {})
        decisions = answers.get("decisions") or {}
        with transaction.atomic():
            try:
                if definition.nodes.filter(is_active=True).exists():
                    return cls._graph(definition, answers, decisions)
                return cls._steps(definition, decisions)
            finally:
                transaction.set_rollback(True)

    @staticmethod
    def _graph(definition, answers, decisions) -> dict:
        from apps.workflow.services import TransitionResolverService

        instance = SimpleNamespace(id="dry-run", entity_type="submission", entity_id="dry-run", workflow_definition=definition)
        node = definition.nodes.filter(is_active=True, is_initial=True).first()
        path, problems = [], []
        if node is None:
            return {"path": path, "problems": [_problem("start", "The workflow has no start.")], "finished": None}
        seen: dict[str, int] = {}
        for _ in range(MAX_STEPS):
            if node.is_terminal or node.node_type == "end":
                path.append(_entry(node.name, node.code, "", None, "the end"))
                return {"path": path, "problems": problems, "finished": node.code}
            seen[node.code] = seen.get(node.code, 0) + 1
            if seen[node.code] > 3:
                problems.append(_problem(node.code, f"The workflow goes round in a loop at \"{node.name}\"."))
                break
            actions = list(node.actions.filter(is_active=True).order_by("created_at").values_list("key", flat=True))
            decision = str(decisions.get(node.code) or (actions[0] if actions else ""))
            if decisions.get(node.code) and decision not in actions:
                problems.append(_problem(node.code, f"\"{node.name}\" has no decision \"{decision}\"."))
                break
            try:
                transition, detail = TransitionResolverService.resolve(instance=instance, node=node, action_key=decision, payload=answers)
            except ValidationError:
                if node.node_type != "start":
                    path.append(_entry(node.name, node.code, _who(node), decision or None, "no way forward"))
                problems.append(_problem(node.code, f"Dead end: \"{node.name}\" has no way forward for \"{decision or 'next'}\" with these answers."))
                break
            if node.node_type != "start":
                path.append(_entry(node.name, node.code, _who(node), decision or None, _why(transition, detail.get("condition_result"), bool(decisions.get(node.code)))))
            node = transition.to_node
        else:
            problems.append(_problem("", "The walk stopped after 100 stages."))
        return {"path": path, "problems": problems, "finished": None}

    @staticmethod
    def _steps(definition, decisions) -> dict:
        """Ordered-step workflows: each step in order; a reject ends it."""
        path, problems = [], []
        steps = list(definition.steps.filter(is_active=True).order_by("order"))
        if not steps:
            return {"path": path, "problems": [_problem("steps", "The workflow has no steps.")], "finished": None}
        for step in steps:
            actions = step.actions_allowed or []
            decision = str(decisions.get(step.code) or (actions[0] if actions else ""))
            if not actions:
                problems.append(_problem(step.code, f"Dead end: \"{step.name}\" has no buttons."))
                return {"path": path, "problems": problems, "finished": None}
            if decision not in actions:
                problems.append(_problem(step.code, f"\"{step.name}\" has no decision \"{decision}\"."))
                return {"path": path, "problems": problems, "finished": None}
            path.append(_entry(step.name, step.code, step.role_required, decision, "you chose it" if decisions.get(step.code) else "the first decision"))
            if decision == "reject":
                return {"path": path, "problems": problems, "finished": "rejected"}
        return {"path": path, "problems": problems, "finished": "end"}

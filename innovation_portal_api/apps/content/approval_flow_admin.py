"""S2: administrators set the website approval flow (Website approvals settings)."""

from __future__ import annotations

import logging

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.content.models import ApprovalRequest, ApprovalStep
from apps.content.services import ApprovalService

security_log = logging.getLogger("security.authorization")
LANGUAGES = ("all", "en", "tn")


def flow_payload(flow=None) -> dict:
    flow = flow or ApprovalService.flow()
    steps = []
    for step in flow.steps.select_related("role").order_by("order", "created_at"):
        approver = (
            {"role": step.role.code, "role_name": step.role.name}
            if step.role_id
            else {"capability": step.capability}
        )
        steps.append(
            {
                "id": str(step.id),
                "order": step.order,
                "name": step.name,
                "approver": approver,
                "approvals_needed": step.approvals_needed,
                "language": step.language,
            }
        )
    return {"key": flow.key, "approvers_can_approve_own_work": flow.approvers_can_approve_own_work, "steps": steps}


def _check(document) -> list[dict]:
    from apps.accounts.models import Role
    from apps.core.capabilities import exists

    if not isinstance(document, dict):
        raise ValidationError({"detail": "Send the flow as one object."})
    steps = document.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValidationError({"steps": "Add at least one approval step."})
    if len(steps) > 6:
        raise ValidationError({"steps": "Use at most 6 steps."})
    errors, cleaned = {}, []
    for index, step in enumerate(steps):
        path = f"steps[{index}]"
        if not isinstance(step, dict):
            errors[path] = "Each step must be an object."
            continue
        approver = step.get("approver") or {}
        capability = (approver.get("capability") or "").strip() if isinstance(approver, dict) else ""
        role_code = (approver.get("role") or "").strip() if isinstance(approver, dict) else ""
        if bool(capability) == bool(role_code):
            errors[f"{path}.approver"] = 'Choose who approves: {"capability": "..."} or {"role": "..."}.'
            continue
        role = None
        if capability and not exists(capability):
            errors[f"{path}.approver"] = f"Unknown capability `{capability}`."
            continue
        if role_code:
            role = Role.objects.filter(code=role_code, is_active=True).first()
            if role is None:
                errors[f"{path}.approver"] = f"No active role `{role_code}`."
                continue
        try:
            needed = int(step.get("approvals_needed", 1))
        except (TypeError, ValueError):
            needed = 0
        if not 1 <= needed <= 10:
            errors[f"{path}.approvals_needed"] = "Between 1 and 10 approvals."
        language = step.get("language", "all")
        if language not in LANGUAGES:
            errors[f"{path}.language"] = "Use all, en or tn."
        cleaned.append({"id": step.get("id"), "name": str(step.get("name") or "")[:120], "capability": capability, "role": role, "approvals_needed": needed, "language": language})
    if errors:
        raise ValidationError(errors)
    if not any(step["language"] in ("all", "en") for step in cleaned):
        raise ValidationError({"steps": "At least one step must cover English (All or English), or English changes would go live unchecked."})
    return cleaned


@transaction.atomic
def save_flow(document, *, actor) -> dict:
    flow = ApprovalService.flow()
    before = flow_payload(flow)
    cleaned = _check(document)
    existing = {str(step.id): step for step in flow.steps.all()}
    keep = {str(step["id"]) for step in cleaned if step.get("id") and str(step["id"]) in existing}
    removed = [step_id for step_id in existing if step_id not in keep]
    if removed:
        waiting = [
            approval
            for approval in ApprovalRequest.objects.filter(status=ApprovalRequest.Status.PENDING)
            if set(approval.step_ids or []) & set(removed)
        ]
        if waiting:
            raise ValidationError({"steps": f"{len(waiting)} change(s) are waiting at a step you removed. Approve or send them back first."})
        ApprovalStep.objects.filter(id__in=removed).delete()
    for order, item in enumerate(cleaned, start=1):
        step = existing.get(str(item.get("id"))) if item.get("id") else None
        step = step or ApprovalStep(flow=flow)
        step.order = order
        step.name = item["name"]
        step.capability = item["capability"]
        step.role = item["role"]
        step.approvals_needed = item["approvals_needed"]
        step.language = item["language"]
        step.save()
    if "approvers_can_approve_own_work" in document:
        flow.approvers_can_approve_own_work = bool(document["approvers_can_approve_own_work"])
        flow.save(update_fields=["approvers_can_approve_own_work", "updated_at"])
    after = flow_payload(flow)
    AuditService.log_action(actor=actor, action_type="approval_flow_changed", target=flow, before_state=before, after_state=after)
    security_log.info("permission change approval_flow_changed flow=%s by=%s", flow.key, getattr(actor, "pk", None))
    return after

"""S2: administrators manage roles and the capability matrix (Roles & permissions).

Locks are enforced here, not only in the screens:
- users.manage and settings.manage belong to Administrator only;
- the innovator role never gets staff capabilities;
- system roles cannot be renamed, retired or deleted.
Every change writes an audit entry (before and after) and a security.authorization log line.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Count, Q
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role, RoleCapability, UserRole
from apps.audit.services import AuditService
from apps.core.capabilities import CATALOGUE, GROUPS, NO_STAFF_CAPABILITIES, clear_cache
from apps.core.constants import RoleType

security_log = logging.getLogger("security.authorization")


def role_payload(role: Role, *, holders: int | None = None) -> dict:
    tn = (role.translations or {}).get("tn") or {}
    return {
        "id": str(role.id),
        "code": role.code,
        "name": {"en": role.name, "tn": tn.get("name", "")},
        "description": {"en": role.description, "tn": tn.get("description", "")},
        "is_system": role.is_system,
        "is_active": role.is_active,
        "people_count": holders if holders is not None else UserRole.objects.filter(role=role, is_active=True, user__is_active=True).count(),
        "capabilities": sorted(role.capabilities.values_list("capability", flat=True)),
    }


def lock_reason(role: Role, capability: str) -> str | None:
    """Why this box cannot change for this role, or None if it can."""
    meta = CATALOGUE[capability]
    locked_to = meta.get("locked_to")
    if locked_to:
        if role.code in locked_to:
            return "Administrators always keep this."
        return "Only administrators can have this."
    if role.code in NO_STAFF_CAPABILITIES:
        return "Innovators never get staff permissions."
    return None


def catalogue_payload() -> dict:
    return {
        "groups": list(GROUPS),
        "capabilities": [
            {
                "key": key,
                "group": meta["group"],
                "label": {"en": meta["label"], "tn": meta.get("label_tn", "")},
                "locked_to": list(meta.get("locked_to", ())),
            }
            for key, meta in CATALOGUE.items()
        ],
    }


def matrix_payload(role: Role) -> dict:
    held = set(role.capabilities.values_list("capability", flat=True))
    return {
        "role": role_payload(role),
        "capabilities": [
            {"key": key, "group": meta["group"], "held": key in held, "locked": lock_reason(role, key) is not None, "lock_reason": lock_reason(role, key)}
            for key, meta in CATALOGUE.items()
        ],
    }


def _log(actor, action: str, role: Role, before, after):
    AuditService.log_action(actor=actor, action_type=action, target=role, before_state=before, after_state=after, metadata={"role_code": role.code})
    security_log.info("permission change %s role=%s by=%s before=%s after=%s", action, role.code, getattr(actor, "pk", None), before, after)


class RoleAdminService:
    @staticmethod
    def list_roles() -> list[dict]:
        roles = Role.objects.annotate(
            holders=Count("user_roles", filter=Q(user_roles__is_active=True, user_roles__user__is_active=True), distinct=True)
        ).prefetch_related("capabilities").order_by("-is_system", "name")
        return [role_payload(role, holders=role.holders) for role in roles]

    @staticmethod
    def _texts(data: dict, role: Role) -> None:
        translations = dict(role.translations or {})
        bucket = dict(translations.get("tn") or {})
        for field in ("name", "description"):
            value = data.get(field)
            if value is None:
                continue
            if isinstance(value, str):
                value = {"en": value}
            if "en" in value:
                setattr(role, field, (value.get("en") or "").strip())
            if "tn" in value:
                if value.get("tn"):
                    bucket[field] = value["tn"].strip()
                else:
                    bucket.pop(field, None)
        translations["tn"] = bucket
        role.translations = {lang: values for lang, values in translations.items() if values}

    @classmethod
    @transaction.atomic
    def create(cls, data: dict, *, actor) -> Role:
        role = Role(is_system=False, is_active=True)
        cls._texts(data, role)
        if not role.name:
            raise ValidationError({"name": "Give the role a name."})
        base = slugify(data.get("code") or role.name).replace("-", "_")[:40] or "role"
        if base in RoleType.values:
            base = f"custom_{base}"[:40]
        code, number = base, 2
        while Role.objects.filter(code=code).exists():
            code = f"{base}_{number}"
            number += 1
        role.code = code
        role.save()
        _log(actor, "role_created", role, None, role_payload(role))
        return role

    @classmethod
    @transaction.atomic
    def update(cls, role: Role, data: dict, *, actor) -> Role:
        before = role_payload(role)
        if role.is_system:
            if "name" in data or data.get("is_active") is False:
                raise ValidationError({"detail": "Built-in roles cannot be renamed or retired."})
        else:
            cls._texts(data, role)
            if not role.name:
                raise ValidationError({"name": "Give the role a name."})
            if "is_active" in data:
                role.is_active = bool(data["is_active"])
        if role.is_system and "description" in data:
            cls._texts({"description": data["description"]}, role)
        role.save()
        clear_cache()
        _log(actor, "role_updated", role, before, role_payload(role))
        return role

    @staticmethod
    @transaction.atomic
    def delete(role: Role, *, actor) -> str:
        """Delete a custom role nobody holds; otherwise retire it. Returns "deleted" or "retired"."""
        if role.is_system:
            raise ValidationError({"detail": "Built-in roles cannot be deleted."})
        before = role_payload(role)
        if UserRole.objects.filter(role=role).exists():
            role.is_active = False
            role.save(update_fields=["is_active", "updated_at"])
            _log(actor, "role_retired", role, before, role_payload(role))
            return "retired"
        _log(actor, "role_deleted", role, before, None)
        role.delete()
        return "deleted"

    @staticmethod
    @transaction.atomic
    def set_capabilities(role: Role, capabilities: list[str], *, actor) -> Role:
        wanted = set(capabilities)
        unknown = sorted(wanted - set(CATALOGUE))
        if unknown:
            raise ValidationError({"capabilities": f"Unknown capabilities: {', '.join(unknown)}."})
        held = set(role.capabilities.values_list("capability", flat=True))
        problems = []
        for key in sorted(wanted ^ held):
            reason = lock_reason(role, key)
            if reason:
                problems.append(f"{CATALOGUE[key]['label']}: {reason}")
        if problems:
            raise ValidationError({"capabilities": problems})
        RoleCapability.objects.filter(role=role).exclude(capability__in=wanted).delete()
        for key in sorted(wanted - held):
            RoleCapability.objects.create(role=role, capability=key)
        clear_cache()
        _log(actor, "role_capabilities_changed", role, sorted(held), sorted(wanted))
        return role

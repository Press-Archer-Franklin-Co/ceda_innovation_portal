"""Copilot: what the form builder supports, as plain lists the AI lane can put in its prompt. No AI here."""

from __future__ import annotations


def field_types() -> list[dict]:
    from apps.core.constants import CHOICE_FIELD_TYPES, LAYOUT_FIELD_TYPES, SubmissionFormFieldType

    return [
        {"type": value, "label": label, "has_options": value in CHOICE_FIELD_TYPES, "layout_only": value in LAYOUT_FIELD_TYPES}
        for value, label in SubmissionFormFieldType.choices
    ]


def field_widths() -> list[str]:
    from apps.programs.models import FieldWidth

    return [value for value, _ in FieldWidth.choices]


def validation_rules() -> list[dict]:
    from apps.programs.models import FieldValidationRule

    return [{"rule_type": value, "label": label} for value, label in FieldValidationRule.RuleType.choices]


def condition_operators() -> dict:
    """Show, require or enable a field when other answers match: {"all"|"any": [{"field", "op", "value"}]}."""
    from apps.programs.condition_services import FormConditionService as service

    return {"keys": ["visible_if", "required_if", "enabled_if"], "groups": ["all", "any"], "operators": sorted(service.SIMPLE_OPERATORS)}


def reference_lists() -> list[dict]:
    from apps.reference.models import District, Sector

    out = []
    for name, model in (("sectors", Sector), ("districts", District)):
        rows = model.objects.filter(active=True)[:200]
        out.append({"list": name, "items": [{"id": str(row.id), "slug": row.slug, "name": row.name} for row in rows]})
    return out


def criteria_library() -> list[dict]:
    from apps.evaluation.models import MarkingCriteria

    return [{"id": str(row.id), "title": row.title, "description": row.description} for row in MarkingCriteria.objects.filter(is_active=True).order_by("title")[:100]]


def form_document_shape() -> dict:
    """The shape save_document accepts (PUT /api/forms/{id}/draft/), in short."""
    return {
        "name": {"en": "Form name", "tn": "optional"},
        "languages": ["en", "tn"],
        "steps": [{"title": {"en": "Step title"}, "rows": [{"fields": [{"key": "slug", "type": "text", "label": {"en": "Question"}, "required": True, "width": "full", "options": [], "rules": [{"rule_type": "max_length", "rule_value": "200"}], "visible_if": None}]}]}],
        "loose_fields": [],
    }


def catalogue() -> dict:
    return {
        "field_types": field_types(),
        "field_widths": field_widths(),
        "validation_rules": validation_rules(),
        "conditions": condition_operators(),
        "reference_lists": reference_lists(),
        "criteria_library": criteria_library(),
        "document_shape": form_document_shape(),
    }

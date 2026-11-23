"""Form builder services (B4): draft document, publish, translations, library, export.

Writes go through these services; views only parse requests and shape responses.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from typing import Any, Iterable

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone
from django.utils.module_loading import import_string
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import CHOICE_FIELD_TYPES, LAYOUT_FIELD_TYPES, SubmissionFormFieldType
from apps.programs.condition_services import FormConditionService
from apps.programs.form_schema import (
    DEFAULT_LANGUAGE,
    FIELD_DATA_KEYS,
    FIELD_TEXTS,
    FORM_TEXTS,
    OPTION_TEXTS,
    OTHER_LANGUAGES,
    STEP_TEXTS,
    bilingual,
    build_form_schema,
    iter_schema_fields,
    localize_schema,
    normalize_tips,
)
from apps.programs.models import (
    FieldValidationRule,
    FieldWidth,
    FormSection,
    FormVersion,
    Program,
    SubmissionForm,
    SubmissionFormField,
    SubmissionFormFieldOption,
)

FIELD_TYPES = {choice for choice, _ in SubmissionFormFieldType.choices}
WIDTHS = {choice for choice, _ in FieldWidth.choices}
RULE_TYPES = {choice for choice, _ in FieldValidationRule.RuleType.choices}
CONDITION_KEYS = ("visible_if", "required_if", "enabled_if")
EDITABLE_STATUSES = {SubmissionForm.Status.DRAFT, SubmissionForm.Status.LIVE, SubmissionForm.Status.CLOSED}


def _prefetched(form_queryset):
    return form_queryset.prefetch_related("sections", "fields__options", "fields__field_rules")


def load_form(form_id) -> SubmissionForm:
    return _prefetched(SubmissionForm.objects.filter(id=form_id)).get()


def _set_texts(obj, mapping: dict[str, str], doc: dict, *, errors: list, path: str, max_lengths: dict[str, int] | None = None):
    """Copy ``{"en", "tn"}`` (or plain English strings) from ``doc`` onto ``obj``."""
    translations = dict(obj.translations or {})
    for doc_key, attr in mapping.items():
        if doc_key not in doc:
            continue
        value = doc[doc_key]
        if value is None:
            value = ""
        if isinstance(value, str):
            value = {DEFAULT_LANGUAGE: value}
        if not isinstance(value, dict) or any(lang not in (DEFAULT_LANGUAGE, *OTHER_LANGUAGES) for lang in value):
            errors.append({"path": f"{path}.{doc_key}", "message": 'Enter text as {"en": "...", "tn": "..."} or a plain English string.'})
            continue
        if any(text is not None and not isinstance(text, str) for text in value.values()):
            errors.append({"path": f"{path}.{doc_key}", "message": "Each language's text must be a string."})
            continue
        limit = (max_lengths or {}).get(attr)
        if DEFAULT_LANGUAGE in value:
            english = value.get(DEFAULT_LANGUAGE) or ""
            if limit and len(english) > limit:
                errors.append({"path": f"{path}.{doc_key}", "message": f"English text must be at most {limit} characters."})
                continue
            setattr(obj, attr, english)
        for lang in OTHER_LANGUAGES:
            if lang in value:
                text = value.get(lang) or ""
                if limit and len(text) > limit:
                    errors.append({"path": f"{path}.{doc_key}", "message": f"Text for {lang} must be at most {limit} characters."})
                    continue
                bucket = dict(translations.get(lang) or {})
                if text:
                    bucket[attr] = text
                else:
                    bucket.pop(attr, None)
                translations[lang] = bucket
    obj.translations = {lang: bucket for lang, bucket in translations.items() if bucket}


def _english(value) -> str:
    if isinstance(value, dict):
        return value.get(DEFAULT_LANGUAGE) or ""
    return value or ""


class FormDocumentService:
    """Save the whole draft from one nested document (``PUT /api/forms/{id}/draft/``)."""

    @classmethod
    def validate_document(cls, document: Any) -> list[dict]:
        errors: list[dict] = []
        if not isinstance(document, dict):
            return [{"path": "", "message": "Send the form as one JSON object."}]
        steps = document.get("steps")
        if not isinstance(steps, list):
            errors.append({"path": "steps", "message": "`steps` must be a list."})
            steps = []
        loose = document.get("loose_fields", [])
        if not isinstance(loose, list):
            errors.append({"path": "loose_fields", "message": "`loose_fields` must be a list."})
            loose = []
        languages = document.get("languages")
        if languages is not None and (
            not isinstance(languages, list) or not languages or any(lang not in (DEFAULT_LANGUAGE, *OTHER_LANGUAGES) for lang in languages)
        ):
            errors.append({"path": "languages", "message": "`languages` must be a non-empty list of en and tn."})
        keys: dict[str, str] = {}
        codes: set[str] = set()
        for step_index, step in enumerate(steps):
            path = f"steps[{step_index}]"
            if not isinstance(step, dict):
                errors.append({"path": path, "message": "Each step must be an object."})
                continue
            code = step.get("code") or slugify(_english(step.get("title")))
            if code and code in codes:
                errors.append({"path": f"{path}.code", "message": f"Two steps use the code `{code}`."})
            codes.add(code)
            tips = step.get("tips", [])
            if not isinstance(tips, list) or any(not isinstance(tip, (str, dict)) for tip in tips):
                errors.append({"path": f"{path}.tips", "message": 'Tips must be a list of {"en": "...", "tn": "..."} or plain strings.'})
            rows = step.get("rows", [])
            if not isinstance(rows, list):
                errors.append({"path": f"{path}.rows", "message": "`rows` must be a list."})
                continue
            for row_index, row in enumerate(rows):
                fields = row.get("fields") if isinstance(row, dict) else None
                if not isinstance(fields, list):
                    errors.append({"path": f"{path}.rows[{row_index}]", "message": "Each row must be an object with a `fields` list."})
                    continue
                for field_index, field in enumerate(fields):
                    errors.extend(cls._validate_field(field, f"{path}.rows[{row_index}].fields[{field_index}]", keys))
        for field_index, field in enumerate(loose):
            errors.extend(cls._validate_field(field, f"loose_fields[{field_index}]", keys))
        return errors

    @classmethod
    def _validate_field(cls, field: Any, path: str, keys: dict[str, str]) -> list[dict]:
        if not isinstance(field, dict):
            return [{"path": path, "message": "Each field must be an object."}]
        errors = []
        key = field.get("key")
        if not key or not isinstance(key, str) or slugify(key).replace("-", "_") != key.replace("-", "_") or len(key) > 100:
            errors.append({"path": f"{path}.key", "message": "Each field needs a `key` of letters, numbers, _ or - (at most 100)."})
        elif key in keys:
            errors.append({"path": f"{path}.key", "message": f"The key `{key}` is already used at {keys[key]}."})
        else:
            keys[key] = path
        if field.get("type") not in FIELD_TYPES:
            errors.append({"path": f"{path}.type", "message": f"Unknown field type `{field.get('type')}`."})
        if field.get("width", FieldWidth.FULL) not in WIDTHS:
            errors.append({"path": f"{path}.width", "message": "Width must be quarter, half, three_quarter or full."})
        for condition_key in CONDITION_KEYS:
            try:
                FormConditionService.validate_schema(field.get(condition_key) or {}, path=condition_key)
            except ValidationError as exc:
                errors.append({"path": f"{path}.{condition_key}", "message": _first_message(exc.detail)})
        for data_key in ("validation_rules", "media_config", "default_value", "example_value"):
            if data_key in field and not isinstance(field[data_key], (dict, list, str, int, float, bool, type(None))):
                errors.append({"path": f"{path}.{data_key}", "message": "Must be JSON."})
        options = field.get("options", [])
        if not isinstance(options, list):
            errors.append({"path": f"{path}.options", "message": "`options` must be a list."})
        else:
            values = set()
            for option_index, option in enumerate(options):
                if not isinstance(option, dict) or not str(option.get("value") or "").strip():
                    errors.append({"path": f"{path}.options[{option_index}]", "message": "Each option needs a `value`."})
                    continue
                if option["value"] in values:
                    errors.append({"path": f"{path}.options[{option_index}].value", "message": f"Two options use the value `{option['value']}`."})
                values.add(option["value"])
        rules = field.get("rules", [])
        if not isinstance(rules, list):
            errors.append({"path": f"{path}.rules", "message": "`rules` must be a list."})
        else:
            for rule_index, rule in enumerate(rules):
                if not isinstance(rule, dict) or rule.get("rule_type") not in RULE_TYPES:
                    errors.append({"path": f"{path}.rules[{rule_index}].rule_type", "message": "Unknown rule type."})
        return errors

    @classmethod
    @transaction.atomic
    def save_document(cls, form: SubmissionForm, document: dict, *, actor=None, audit: bool = True) -> dict:
        form = SubmissionForm.objects.select_for_update().get(pk=form.pk)
        if form.status == SubmissionForm.Status.ARCHIVED:
            raise ValidationError({"detail": "This form is archived. Make a copy to change it."})
        errors = cls.validate_document(document)
        if errors:
            raise ValidationError({"errors": errors})

        text_errors: list[dict] = []
        _set_texts(form, FORM_TEXTS, document, errors=text_errors, path="form", max_lengths={"title": 255})
        if document.get("languages"):
            form.languages = list(dict.fromkeys(document["languages"]))

        sections = {str(section.id): section for section in form.sections.all()}
        sections_by_code = {section.code: section for section in sections.values()}
        fields = {str(field.id): field for field in form.fields.all()}
        fields_by_key = {field.key: field for field in fields.values()}

        # Pass 1: decide which existing row each step and field document updates.
        step_plan = []
        for step_index, step in enumerate(document.get("steps") or [], start=1):
            section = sections.get(str(step.get("id") or "")) or sections_by_code.get(step.get("code") or "")
            code = step.get("code") or (section.code if section else "") or slugify(_english(step.get("title")))[:100] or f"step-{step_index}"
            step_plan.append((step_index, step, section, code))
        field_plan = []
        for step_index, step, _section, _code in step_plan:
            for row_index, row in enumerate(step.get("rows") or [], start=1):
                for field_doc in row.get("fields") or []:
                    field_plan.append((step_index, row_index, field_doc))
        for field_doc in document.get("loose_fields") or []:
            field_plan.append((None, 1, field_doc))
        matched_fields = []
        used_field_ids = set()
        for step_index, row_index, field_doc in field_plan:
            field = fields.get(str(field_doc.get("id") or "")) or fields_by_key.get(field_doc["key"])
            if field is not None and str(field.id) in used_field_ids:
                field = None
            if field is not None:
                used_field_ids.add(str(field.id))
            matched_fields.append((step_index, row_index, field_doc, field))
        used_section_ids = {str(section.id) for _i, _s, section, _c in step_plan if section is not None}

        # Delete what the document no longer has, then park renamed keys and codes so
        # swaps cannot hit the (form, key) and (form, code) unique constraints.
        SubmissionFormField.objects.filter(form=form).exclude(id__in=used_field_ids).delete()
        for _s, _r, field_doc, field in matched_fields:
            if field is not None and field.key != field_doc["key"]:
                SubmissionFormField.objects.filter(pk=field.pk).update(key=f"tmp-{field.pk.hex[:20]}")
        for _i, _s, section, code in step_plan:
            if section is not None and section.code != code:
                FormSection.objects.filter(pk=section.pk).update(code=f"tmp-{section.pk.hex[:20]}")

        saved_sections = {}
        for step_index, step, section, code in step_plan:
            section = section or FormSection(form=form)
            section.code = code
            section.ordering = step_index
            section.is_active = bool(step.get("is_active", True))
            _set_texts(section, STEP_TEXTS, step, errors=text_errors, path=f"steps[{step_index - 1}]", max_lengths={"title": 255})
            if "tips" in step:
                section.tips = normalize_tips(step.get("tips"))
            if not section.title:
                section.title = f"Step {step_index}"
            section.save()
            saved_sections[step_index] = section

        ordering_by_section: dict[Any, int] = {}
        for step_index, row_index, field_doc, field in matched_fields:
            section = saved_sections.get(step_index) if step_index else None
            counter_key = step_index or 0
            ordering_by_section[counter_key] = ordering_by_section.get(counter_key, 0) + 1
            field = field or SubmissionFormField(form=form)
            field.section = section
            field.key = field_doc["key"]
            field.field_type = field_doc["type"]
            field.required = bool(field_doc.get("required", False)) and field_doc["type"] not in LAYOUT_FIELD_TYPES
            field.is_challenge_question = bool(field_doc.get("is_challenge_question", False))
            field.width = field_doc.get("width") or FieldWidth.FULL
            field.row = row_index
            field.ordering = ordering_by_section[counter_key]
            field.is_active = bool(field_doc.get("is_active", True))
            field.link_url = field_doc.get("link_url") or ""
            for data_key in FIELD_DATA_KEYS:
                if data_key in field_doc:
                    setattr(field, data_key, field_doc.get(data_key) or {})
            _set_texts(field, FIELD_TEXTS, field_doc, errors=text_errors, path=f"fields.{field.key}", max_lengths={"label": 255, "placeholder": 255})
            field.save()
            cls._save_options(field, field_doc.get("options") or [], text_errors)
            cls._save_rules(field, field_doc.get("rules") or [])

        FormSection.objects.filter(form=form).exclude(id__in=[section.id for section in saved_sections.values()]).delete()
        if text_errors:
            raise ValidationError({"errors": text_errors})

        form.version += 1
        form.save()
        if audit:
            AuditService.log_action(
                actor=actor,
                action_type="form_draft_saved",
                target=form,
                after_state={"version": form.version},
                metadata={"steps": len(saved_sections), "fields": len(matched_fields)},
            )
        return build_form_schema(load_form(form.id))

    @staticmethod
    def _save_options(field: SubmissionFormField, options: list[dict], text_errors: list):
        existing = {str(option.id): option for option in field.options.all()}
        by_value = {option.value: option for option in existing.values()}
        keep = []
        for index, option_doc in enumerate(options, start=1):
            option = existing.get(str(option_doc.get("id") or "")) or by_value.get(option_doc["value"]) or SubmissionFormFieldOption(field=field)
            option.value = str(option_doc["value"])[:120]
            option.ordering = index
            texts = {"label": option_doc.get("label", option_doc["value"])}
            if "description" in option_doc:
                texts["description"] = option_doc["description"]
            _set_texts(option, OPTION_TEXTS, texts, errors=text_errors, path=f"fields.{field.key}.options[{index - 1}]", max_lengths={"label": 120, "description": 255})
            if not option.label:
                option.label = option.value
            option.save()
            keep.append(option.id)
        field.options.exclude(id__in=keep).delete()

    @staticmethod
    def _save_rules(field: SubmissionFormField, rules: list[dict]):
        field.field_rules.all().delete()
        FieldValidationRule.objects.bulk_create(
            [
                FieldValidationRule(
                    field=field,
                    rule_type=rule["rule_type"],
                    rule_value=str(rule.get("rule_value", ""))[:255],
                    error_message=str(rule.get("error_message") or "")[:255],
                )
                for rule in rules
            ]
        )


def _first_message(detail) -> str:
    if isinstance(detail, dict):
        for value in detail.values():
            return _first_message(value)
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    return str(detail)


@dataclass
class Problem:
    code: str
    message: str
    step: str | None = None
    field: str | None = None
    option: str | None = None
    language: str | None = None

    def as_dict(self) -> dict:
        return {key: value for key, value in self.__dict__.items() if value is not None}


class FormPublishService:
    @classmethod
    def problems(cls, form: SubmissionForm) -> list[dict]:
        """Everything that stops a form from being published. Empty means it can be published."""
        schema = build_form_schema(form, include_inactive=False)
        languages = [lang for lang in (form.languages or [DEFAULT_LANGUAGE]) if lang in OTHER_LANGUAGES]
        problems: list[Problem] = []
        keys = {field["key"] for _step, field in iter_schema_fields(schema)}

        if not schema["name"][DEFAULT_LANGUAGE].strip():
            problems.append(Problem("missing_name", "Give the form a name."))
        answerable = [field for _step, field in iter_schema_fields(schema) if field["type"] not in LAYOUT_FIELD_TYPES]
        if not answerable:
            problems.append(Problem("no_questions", "Add at least one question."))

        texts: list[tuple[dict, Problem]] = [(schema["name"], Problem("missing_translation", "Form name", language=None))]
        if schema["description"][DEFAULT_LANGUAGE].strip():
            texts.append((schema["description"], Problem("missing_translation", "Form description")))
        for step in schema["steps"]:
            texts.append((step["title"], Problem("missing_translation", "Step title", step=step["code"])))
            if step["description"][DEFAULT_LANGUAGE].strip():
                texts.append((step["description"], Problem("missing_translation", "Step description", step=step["code"])))
            for tip_number, tip in enumerate(step.get("tips") or [], start=1):
                texts.append((tip, Problem("missing_translation", f"Step tip {tip_number}", step=step["code"])))
        for step, field in iter_schema_fields(schema):
            step_code = step["code"] if step else None
            label_en = field["label"][DEFAULT_LANGUAGE].strip()
            if not label_en and field["type"] != SubmissionFormFieldType.PARAGRAPH:
                problems.append(Problem("missing_label", f"The question `{field['key']}` has no label.", step=step_code, field=field["key"]))
            if field["type"] == SubmissionFormFieldType.PARAGRAPH and not (label_en or field["help_text"][DEFAULT_LANGUAGE].strip()):
                problems.append(Problem("missing_label", f"The paragraph `{field['key']}` has no text.", step=step_code, field=field["key"]))
            if field["type"] in CHOICE_FIELD_TYPES and not field["options"]:
                problems.append(Problem("missing_options", f"`{_english(field['label']) or field['key']}` needs at least one option.", step=step_code, field=field["key"]))
            for condition_key in CONDITION_KEYS:
                condition = field.get(condition_key)
                if not condition:
                    continue
                try:
                    FormConditionService.validate_schema(condition, path=condition_key)
                except ValidationError as exc:
                    problems.append(Problem("bad_condition", f"{condition_key}: {_first_message(exc.detail)}", step=step_code, field=field["key"]))
                    continue
                for ref in sorted(FormConditionService.referenced_fields(condition) - keys):
                    problems.append(
                        Problem("unknown_condition_field", f"{condition_key} points at `{ref}`, which is not a question in this form.", step=step_code, field=field["key"])
                    )
                if field["key"] in FormConditionService.referenced_fields(condition):
                    problems.append(Problem("self_condition", f"{condition_key} cannot depend on the question itself.", step=step_code, field=field["key"]))
            for text_key in FIELD_TEXTS:
                if field[text_key][DEFAULT_LANGUAGE].strip():
                    texts.append((field[text_key], Problem("missing_translation", f"Question {text_key.replace('_', ' ')}", step=step_code, field=field["key"])))
            for option in field["options"]:
                texts.append((option["label"], Problem("missing_translation", "Option label", step=step_code, field=field["key"], option=option["value"])))
                if option["description"][DEFAULT_LANGUAGE].strip():
                    texts.append((option["description"], Problem("missing_translation", "Option description", step=step_code, field=field["key"], option=option["value"])))

        for lang in languages:
            for value, template in texts:
                if (value.get(DEFAULT_LANGUAGE) or "").strip() and not (value.get(lang) or "").strip():
                    problems.append(
                        Problem(
                            "missing_translation",
                            f"{template.message} has no {_LANGUAGE_NAMES.get(lang, lang)} text.",
                            step=template.step,
                            field=template.field,
                            option=template.option,
                            language=lang,
                        )
                    )
        return [problem.as_dict() for problem in problems]

    @classmethod
    @transaction.atomic
    def publish(cls, form: SubmissionForm, *, actor) -> tuple[FormVersion | None, list[dict]]:
        form = SubmissionForm.objects.select_for_update().get(pk=form.pk)
        if form.status == SubmissionForm.Status.ARCHIVED:
            return None, [{"code": "archived", "message": "This form is archived. Make a copy to publish it."}]
        if form.is_template:
            return None, [{"code": "template", "message": "Templates are not published. Start a form from this template instead."}]
        form = load_form(form.id)
        problems = cls.problems(form)
        if problems:
            return None, problems
        number = (form.versions.aggregate(top=Max("number"))["top"] or 0) + 1
        version = FormVersion.objects.create(
            form=form,
            number=number,
            schema=build_form_schema(form, include_inactive=False),
            published_at=timezone.now(),
            published_by=actor,
        )
        if form.status == SubmissionForm.Status.DRAFT:
            form.status = SubmissionForm.Status.LIVE
            form.save(update_fields=["status", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="form_published",
            target=form,
            after_state={"version_number": number, "status": form.status},
        )
        return version, []

    @staticmethod
    def published_document(form: SubmissionForm, lang: str) -> dict | None:
        version = form.latest_version
        if version is None:
            return None
        document = localize_schema(version.schema, lang)
        document["version"] = {"id": str(version.id), "number": version.number, "published_at": version.published_at.isoformat()}
        return document


_LANGUAGE_NAMES = {"tn": "Setswana", "en": "English"}


# --- Translations -----------------------------------------------------------


class TranslationProvider:
    """Interface for a machine translation service. Configure with
    ``settings.FORM_TRANSLATION_PROVIDER = "dotted.path.to.Provider"``."""

    def translate(self, texts: list[str], *, source: str, target: str) -> list[str]:  # pragma: no cover - interface
        raise NotImplementedError


class TranslationProviderNotConfigured(Exception):
    pass


def get_translation_provider() -> TranslationProvider:
    path = getattr(settings, "FORM_TRANSLATION_PROVIDER", "") or ""
    if not path:
        # Copilot B3: the AI Copilot suggests Setswana when its `translate` feature can answer.
        from apps.assistant import translation

        if translation.available():
            return translation.AIFormTranslator()
        raise TranslationProviderNotConfigured
    return import_string(path)()


def _target_texts(obj, attr: str) -> dict[str, str]:
    if attr.startswith("tips."):
        tips = normalize_tips(obj.tips)
        index = int(attr.split(".")[1]) - 1
        return tips[index] if index < len(tips) else {DEFAULT_LANGUAGE: "", **{lang: "" for lang in OTHER_LANGUAGES}}
    return bilingual(obj, attr)


def _save_tip(section, number: int, row: dict):
    tips = normalize_tips(section.tips)
    tip = tips[number - 1]
    for lang in (DEFAULT_LANGUAGE, *OTHER_LANGUAGES):
        if lang in row:
            if row[lang] is not None and not isinstance(row[lang], str):
                raise ValidationError({"rows": f"`{row['key']}`: text for {lang} must be a string."})
            tip[lang] = row[lang] or ""
    section.tips = tips


class FormTranslationService:
    """Every translatable text of a form as rows, for the Setswana screen (3.5b)."""

    @staticmethod
    def _targets(form: SubmissionForm) -> list[tuple[str, str, Any, str]]:
        """(key, where, object, attribute) for every text, in screen order."""
        targets = [("form.name", "Form name", form, "title"), ("form.description", "Form description", form, "description")]
        sections = sorted(form.sections.all(), key=lambda item: (item.ordering, item.title))
        fields = sorted(form.fields.all(), key=lambda item: (item.row, item.ordering, item.key))
        for step_number, section in enumerate(sections, start=1):
            where = f"Step {step_number} · {section.title}"
            targets.append((f"step.{section.code}.title", f"{where} › title", section, "title"))
            targets.append((f"step.{section.code}.description", f"{where} › description", section, "description"))
            for tip_number, _tip in enumerate(normalize_tips(section.tips), start=1):
                targets.append((f"step.{section.code}.tips.{tip_number}", f"{where} › tip {tip_number}", section, f"tips.{tip_number}"))
            for field in (item for item in fields if item.section_id == section.id):
                targets.extend(FormTranslationService._field_targets(field, where))
        for field in (item for item in fields if item.section_id is None):
            targets.extend(FormTranslationService._field_targets(field, "Not in a step"))
        return targets

    @staticmethod
    def _field_targets(field, where: str):
        name = field.label or field.key
        result = [(f"field.{field.key}.{attr}", f"{where} › {name} › {attr.replace('_', ' ')}", field, attr) for attr in FIELD_TEXTS.values()]
        for option in sorted(field.options.all(), key=lambda item: item.ordering):
            result.append((f"option.{field.key}.{option.value}.label", f"{where} › {name} › option {option.value}", option, "label"))
            result.append((f"option.{field.key}.{option.value}.description", f"{where} › {name} › option {option.value} description", option, "description"))
        return result

    @classmethod
    def rows(cls, form: SubmissionForm, *, lang: str = "tn") -> list[dict]:
        rows = []
        for key, where, obj, attr in cls._targets(form):
            texts = _target_texts(obj, attr)
            if not texts[DEFAULT_LANGUAGE].strip() and not texts.get(lang, "").strip():
                continue
            rows.append(
                {
                    "key": key,
                    "where": where,
                    "en": texts[DEFAULT_LANGUAGE],
                    lang: texts.get(lang, ""),
                    "missing": bool(texts[DEFAULT_LANGUAGE].strip()) and not texts.get(lang, "").strip(),
                }
            )
        return rows

    @classmethod
    @transaction.atomic
    def save_rows(cls, form: SubmissionForm, rows: list[dict], *, actor) -> list[dict]:
        if form.status == SubmissionForm.Status.ARCHIVED:
            raise ValidationError({"detail": "This form is archived. Make a copy to change it."})
        if not isinstance(rows, list) or not rows:
            raise ValidationError({"rows": "Send a non-empty list of rows."})
        targets = {key: (obj, attr) for key, _where, obj, attr in cls._targets(form)}
        unknown = [str(row.get("key")) for row in rows if not isinstance(row, dict) or row.get("key") not in targets]
        if unknown:
            raise ValidationError({"rows": f"Unknown keys: {', '.join(unknown)}."})
        touched = {}
        for row in rows:
            obj, attr = targets[row["key"]]
            if attr.startswith("tips."):
                _save_tip(obj, int(attr.split(".")[1]), row)
                touched[(type(obj), obj.pk)] = obj
                continue
            translations = dict(obj.translations or {})
            for lang in (DEFAULT_LANGUAGE, *OTHER_LANGUAGES):
                if lang not in row:
                    continue
                text = row[lang]
                if text is not None and not isinstance(text, str):
                    raise ValidationError({"rows": f"`{row['key']}`: text for {lang} must be a string."})
                text = text or ""
                if lang == DEFAULT_LANGUAGE:
                    setattr(obj, attr, text)
                else:
                    bucket = dict(translations.get(lang) or {})
                    if text:
                        bucket[attr] = text
                    else:
                        bucket.pop(attr, None)
                    translations[lang] = bucket
            obj.translations = {lang: bucket for lang, bucket in translations.items() if bucket}
            touched[(type(obj), obj.pk)] = obj
        for obj in touched.values():
            obj.save()
        form.refresh_from_db()
        form.version += 1
        form.save(update_fields=["version", "updated_at"])
        AuditService.log_action(actor=actor, action_type="form_translations_saved", target=form, metadata={"rows": len(rows)})
        return cls.rows(load_form(form.id))

    @classmethod
    def suggest(cls, form: SubmissionForm, *, keys: Iterable[str] | None = None, lang: str = "tn") -> list[dict]:
        """Suggested text for missing rows. Never saved; staff review and save with PUT."""
        provider = get_translation_provider()
        wanted = set(keys or [])
        rows = [row for row in cls.rows(form, lang=lang) if row["missing"] and (not wanted or row["key"] in wanted)]
        if not rows:
            return []
        suggestions = provider.translate([row["en"] for row in rows], source=DEFAULT_LANGUAGE, target=lang)
        # needs_review: a suggestion is never final; a person checks it before saving (Copilot B3).
        return [{"key": row["key"], "en": row["en"], "suggested": suggestion, "needs_review": True} for row, suggestion in zip(rows, suggestions)]

    @staticmethod
    def request_review(form: SubmissionForm, *, role: str, actor, note: str = "") -> int:
        from apps.accounts.models import User
        from apps.notifications.services import NotificationService

        reviewers = User.objects.filter(is_active=True, user_roles__role__code=role, user_roles__is_active=True).distinct()
        missing = sum(1 for row in FormTranslationService.rows(form) if row["missing"])
        message = f'Please check the Setswana text of the form "{form.title}". {missing} text(s) still have no Setswana.'
        if note:
            message = f"{message}\n\n{note}"
        count = 0
        for reviewer in reviewers:
            NotificationService.notify(
                user=reviewer,
                notification_type="form_translation_review",
                title="Translation review requested",
                message=message,
            )
            count += 1
        AuditService.log_action(actor=actor, action_type="form_translation_review_requested", target=form, metadata={"role": role, "notified": count})
        return count


# --- Library: list, create, templates, duplicate, archive, attach ---------------------


def strip_ids(document: dict) -> dict:
    """A copy of a form document with every id removed, for creating a new form from it."""
    copy = json.loads(json.dumps(document))
    copy.pop("id", None)
    for step in copy.get("steps") or []:
        step.pop("id", None)
    for _step, field in iter_schema_fields(copy):
        field.pop("id", None)
        for option in field.get("options") or []:
            option.pop("id", None)
    return copy


class FormLibraryService:
    @staticmethod
    def annotated(queryset=None):
        queryset = queryset if queryset is not None else SubmissionForm.objects.all()
        return queryset.annotate(
            question_count=Count(
                "fields",
                filter=Q(fields__is_active=True) & ~Q(fields__field_type__in=list(LAYOUT_FIELD_TYPES)),
                distinct=True,
            ),
            step_count=Count("sections", filter=Q(sections__is_active=True), distinct=True),
            answer_count=Count("fields__responses__submission", distinct=True),
        ).prefetch_related("programs", "sections", "fields", "versions")

    @staticmethod
    def status_counts(queryset) -> dict[str, int]:
        found = dict(queryset.values_list("status").annotate(total=Count("id")).values_list("status", "total"))
        counts = {choice: found.get(choice, 0) for choice, _ in SubmissionForm.Status.choices}
        counts["all"] = sum(total for status, total in counts.items() if status != SubmissionForm.Status.ARCHIVED)
        return counts

    @staticmethod
    def layout_preview(form, *, rows: int = 4) -> list[list[str]]:
        """Widths of the first rows of active fields, e.g. [["half", "half"], ["full"]], for the card picture."""
        sections = sorted((section for section in form.sections.all() if section.is_active), key=lambda item: (item.ordering, item.title))
        fields = [field for field in form.fields.all() if field.is_active]
        preview: list[list[str]] = []
        for section in sections:
            section_fields = sorted((field for field in fields if field.section_id == section.id), key=lambda item: (item.row, item.ordering))
            current_row, widths = None, []
            for field in section_fields:
                if field.row != current_row and widths:
                    preview.append(widths)
                    widths = []
                    if len(preview) >= rows:
                        return preview
                current_row = field.row
                widths.append(field.width or "full")
            if widths:
                preview.append(widths)
                if len(preview) >= rows:
                    return preview
        return preview

    @staticmethod
    def summary(form) -> dict | None:
        """Short description of a programme's form (R-10c)."""
        if form is None:
            return None
        version = form.latest_version
        totals = form.fields.filter(is_active=True).exclude(field_type__in=list(LAYOUT_FIELD_TYPES)).aggregate(
            questions=Count("id"), challenge=Count("id", filter=Q(is_challenge_question=True))
        )
        return {
            "form_id": str(form.id),
            "name": form.title,
            "status": form.status,
            "version_number": version.number if version else None,
            "step_count": form.sections.filter(is_active=True).count(),
            "question_count": totals["questions"],
            "challenge_question_count": totals["challenge"],
            "estimated_minutes": (form.template_meta or {}).get("estimated_minutes"),
        }

    @staticmethod
    @transaction.atomic
    def create(*, start: str, name: str, actor, source: SubmissionForm | None = None, program: Program | None = None, languages=None) -> SubmissionForm:
        form = SubmissionForm.objects.create(
            title=name,
            code=slugify(name)[:120] or "form",
            languages=list(languages or (source.languages if source else None) or ["en", "tn"]),
            status=SubmissionForm.Status.DRAFT,
            created_by=actor,
        )
        if source is not None:
            document = strip_ids(build_form_schema(load_form(source.id)))
            document["name"] = {**document["name"], DEFAULT_LANGUAGE: name}
            if start == "template" and document["name"].get("tn") == bilingual(source, "title").get("tn"):
                document["name"].pop("tn", None)
            document["languages"] = form.languages
            FormDocumentService.save_document(form, document, actor=actor, audit=False)
            form.refresh_from_db()
            form.version = 1
            form.save(update_fields=["version", "updated_at"])
        else:
            FormSection.objects.create(form=form, title="Step 1", code="step-1", ordering=1)
        if program is not None:
            program.form = form
            program.save(update_fields=["form", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="form_created",
            target=form,
            after_state={"status": form.status},
            metadata={"start": start, "source_id": str(source.id) if source else None, "program_id": str(program.id) if program else None},
        )
        return form

    @staticmethod
    @transaction.atomic
    def archive(form: SubmissionForm, *, actor) -> SubmissionForm:
        from apps.core.constants import ProgramStatus

        # Prompt 31: a form that people can still fill in stays. Archive it once nobody can enter with it.
        if any(program.is_general_intake for program in form.programs.all()):
            raise ValidationError({"form": {"code": "general_ideas", "detail": "This is the general idea form. Choose another general idea form first."}})
        using = [p.title for p in form.programs.filter(status=ProgramStatus.PUBLISHED) if p.is_submission_open()]
        if using:
            raise ValidationError({"form": {"code": "in_use", "detail": f"{', '.join(using)} still takes entries with this form. Close that challenge or give it another form first."}})
        before = form.status
        form.status = SubmissionForm.Status.ARCHIVED
        form.save(update_fields=["status", "updated_at"])
        AuditService.log_action(actor=actor, action_type="form_archived", target=form, before_state={"status": before}, after_state={"status": form.status})
        return form

    @staticmethod
    @transaction.atomic
    def attach_to_program(program: Program, form: SubmissionForm, *, actor, general_ideas_setting: bool = False) -> Program:
        if program.is_general_intake and not general_ideas_setting:
            raise ValidationError({"form_id": {"code": "general_ideas", "detail": "Change the general idea form in Forms, under General idea form."}})
        if form.is_template:
            raise ValidationError({"form_id": "Templates cannot be used directly. Start a form from the template first."})
        if form.status == SubmissionForm.Status.ARCHIVED:
            raise ValidationError({"form_id": "This form is archived."})
        if form.latest_version is None:
            raise ValidationError({"form_id": "Publish the form before using it in a challenge."})
        before = str(program.form_id) if program.form_id else None
        program.form = form
        program.save(update_fields=["form", "updated_at"])
        AuditService.log_action(
            actor=actor,
            action_type="program_form_attached",
            target=program,
            before_state={"form_id": before},
            after_state={"form_id": str(form.id), "version_number": form.latest_version.number},
        )
        return program


# --- CSV export -----------------------------------------------------------------------


class FormResponseExport:
    BASE_COLUMNS = ["submission_id", "reference_number", "programme", "submitted_at", "form_version"]

    @staticmethod
    def _cell(value) -> str:
        if value is None:
            return ""
        if isinstance(value, list):
            return "; ".join(FormResponseExport._cell(item) for item in value)
        if isinstance(value, dict):
            if set(value) <= {"value"}:
                return FormResponseExport._cell(value.get("value"))
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        return str(value)

    @classmethod
    def rows(cls, form: SubmissionForm):
        """Yield CSV lines: a header, then one row per submission with one column per field key."""
        from apps.submissions.models import Submission, SubmissionResponse

        field_keys = [
            field.key
            for field in sorted(form.fields.all(), key=lambda item: ((item.section.ordering if item.section_id else 10**6), item.row, item.ordering))
            if field.field_type not in LAYOUT_FIELD_TYPES
        ]
        submissions = (
            Submission.objects.filter(Q(form_version__form=form) | Q(responses__form_field__form=form))
            .exclude(submitted_at__isnull=True)
            .distinct()
            .select_related("program", "form_version")
            .prefetch_related("responses__form_field")
            .order_by("submitted_at", "reference_number")
        )
        # Keys answered with fields that were later removed still get a column.
        extra = (
            SubmissionResponse.objects.filter(submission__in=submissions, form_field__isnull=True)
            .exclude(field_key_snapshot="")
            .values_list("field_key_snapshot", flat=True)
            .distinct()
        )
        columns = field_keys + sorted(set(extra) - set(field_keys))
        buffer = io.StringIO()
        writer = csv.writer(buffer)

        def flush():
            data = buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
            return data

        writer.writerow(cls.BASE_COLUMNS + columns)
        yield flush()
        for submission in submissions.iterator(chunk_size=200):
            answers = {}
            for response in submission.responses.all():
                key = response.field_key_snapshot or (response.form_field.key if response.form_field_id else "")
                if key:
                    answers[key] = response.value
            writer.writerow(
                [
                    str(submission.id),
                    submission.reference_number,
                    submission.program.title,
                    submission.submitted_at.isoformat() if submission.submitted_at else "",
                    submission.form_version.number if submission.form_version_id else submission.form_version_number,
                ]
                + [cls._cell(answers.get(key)) for key in columns]
            )
            yield flush()


def create_draft_form_from_document(document: dict, *, title: str = "", actor, program=None):
    """Copilot: the same as apps.programs.services.create_draft_form_from_document (the AI lane imports it from here)."""
    from apps.programs.services import create_draft_form_from_document as create

    return create(document, title=title, actor=actor, program=program)

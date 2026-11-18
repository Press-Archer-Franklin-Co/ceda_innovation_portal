from __future__ import annotations

from rest_framework.exceptions import ValidationError


class FormConditionService:
    """Evaluate and validate JSON condition groups for CEDA form behavior.

    Supported leaf operators:
    - equals
    - not_equals
    - in
    - not_in
    - exists
    - not_exists
    - greater_than
    - less_than
    - greater_than_or_equal
    - less_than_or_equal
    - contains
    - not_contains

    Supported group operators:
    - AND
    - OR
    """

    LEAF_OPERATORS = {
        "equals",
        "not_equals",
        "in",
        "not_in",
        "exists",
        "not_exists",
        "greater_than",
        "less_than",
        "greater_than_or_equal",
        "less_than_or_equal",
        "contains",
        "not_contains",
    }
    GROUP_OPERATORS = {"AND", "OR"}

    @classmethod
    def validate_schema(cls, definition, *, path="condition"):
        if not definition:
            return
        if isinstance(definition, list):
            for index, item in enumerate(definition):
                cls.validate_schema(item, path=f"{path}[{index}]")
            return
        if not isinstance(definition, dict):
            raise ValidationError({path: "Conditions must be JSON objects or arrays."})
        operator = definition.get("operator")
        conditions = definition.get("conditions")
        if conditions is not None:
            if str(operator or "AND").upper() not in cls.GROUP_OPERATORS:
                raise ValidationError({path: "Condition groups must use AND or OR operators."})
            if not isinstance(conditions, list) or not conditions:
                raise ValidationError({path: "Condition groups must include a non-empty conditions list."})
            for index, item in enumerate(conditions):
                cls.validate_schema(item, path=f"{path}.conditions[{index}]")
            return
        field_key = definition.get("field")
        op = str(operator or "equals").lower()
        if not field_key:
            raise ValidationError({path: "Leaf conditions must define `field`."})
        if op not in cls.LEAF_OPERATORS:
            raise ValidationError({path: f"Unsupported condition operator `{op}`."})
        if op not in {"exists", "not_exists"} and "value" not in definition:
            raise ValidationError({path: f"Condition operator `{op}` requires `value`."})

    @classmethod
    def evaluate(cls, definition, values: dict, *, debug: bool = False):
        cls.validate_schema(definition)
        result, debug_data = cls._evaluate_node(definition, values, path="condition")
        if debug:
            return {
                "result": result,
                "evaluated_conditions": debug_data["evaluated_conditions"],
                "failed_conditions": debug_data["failed_conditions"],
            }
        return result

    @classmethod
    def _evaluate_node(cls, definition, values: dict, *, path: str):
        if not definition:
            return False, {"evaluated_conditions": [], "failed_conditions": []}
        if isinstance(definition, list):
            combined_eval = []
            failed = []
            result = True
            for index, item in enumerate(definition):
                child_result, child_debug = cls._evaluate_node(item, values, path=f"{path}[{index}]")
                result = result and child_result
                combined_eval.extend(child_debug["evaluated_conditions"])
                failed.extend(child_debug["failed_conditions"])
            return result, {"evaluated_conditions": combined_eval, "failed_conditions": failed}

        operator = str(definition.get("operator", "equals"))
        conditions = definition.get("conditions")
        if conditions is not None:
            group_operator = operator.upper()
            combined_eval = []
            failed = []
            child_results = []
            for index, item in enumerate(conditions):
                child_result, child_debug = cls._evaluate_node(item, values, path=f"{path}.conditions[{index}]")
                child_results.append(child_result)
                combined_eval.extend(child_debug["evaluated_conditions"])
                failed.extend(child_debug["failed_conditions"])
            result = any(child_results) if group_operator == "OR" else all(child_results)
            combined_eval.append({"path": path, "type": "group", "operator": group_operator, "result": result})
            if not result:
                failed.append({"path": path, "type": "group", "operator": group_operator})
            return result, {"evaluated_conditions": combined_eval, "failed_conditions": failed}

        field_key = definition.get("field")
        actual = values.get(field_key)
        expected = definition.get("value")
        op = str(definition.get("operator", "equals")).lower()
        result = cls._apply_operator(op, actual, expected)
        evaluation = {
            "path": path,
            "type": "leaf",
            "field": field_key,
            "operator": op,
            "expected": expected,
            "actual": actual,
            "result": result,
        }
        failed = [] if result else [evaluation]
        return result, {"evaluated_conditions": [evaluation], "failed_conditions": failed}

    @classmethod
    def _apply_operator(cls, op: str, actual, expected):
        if op == "equals":
            return actual == expected
        if op == "not_equals":
            return actual != expected
        if op == "in":
            return actual in (expected or [])
        if op == "not_in":
            return actual not in (expected or [])
        if op == "exists":
            return actual not in (None, "", [], {})
        if op == "not_exists":
            return actual in (None, "", [], {})
        if op == "greater_than":
            return cls._numeric(actual) > cls._numeric(expected)
        if op == "less_than":
            return cls._numeric(actual) < cls._numeric(expected)
        if op == "greater_than_or_equal":
            return cls._numeric(actual) >= cls._numeric(expected)
        if op == "less_than_or_equal":
            return cls._numeric(actual) <= cls._numeric(expected)
        if op == "contains":
            return cls._contains(actual, expected)
        if op == "not_contains":
            return not cls._contains(actual, expected)
        raise ValidationError({"condition": f"Unsupported condition operator `{op}`."})

    @staticmethod
    def _numeric(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return float("-inf")

    @staticmethod
    def _contains(actual, expected):
        if actual in (None, "", [], {}):
            return False
        if isinstance(actual, dict):
            return expected in actual.values() or expected in actual.keys()
        if isinstance(actual, (list, tuple, set)):
            return expected in actual
        return str(expected) in str(actual)

    @classmethod
    def field_state(cls, field, values: dict, *, debug: bool = False) -> dict:
        override = cls._override_field_state(field, values)
        if override:
            return override
        visible_result = True if not field.visible_if else cls.evaluate(field.visible_if, values, debug=debug)
        enabled_result = True if not field.enabled_if else cls.evaluate(field.enabled_if, values, debug=debug)
        required_result = field.required or (bool(field.required_if) and cls.evaluate(field.required_if, values, debug=debug))
        if not debug:
            return {
                "visible": bool(visible_result),
                "enabled": bool(enabled_result),
                "required": bool(required_result),
            }
        return {
            "visible": bool(visible_result["result"]) if isinstance(visible_result, dict) else bool(visible_result),
            "enabled": bool(enabled_result["result"]) if isinstance(enabled_result, dict) else bool(enabled_result),
            "required": bool(required_result["result"]) if isinstance(required_result, dict) else bool(required_result),
            "debug": {
                "visible": visible_result if isinstance(visible_result, dict) else None,
                "enabled": enabled_result if isinstance(enabled_result, dict) else None,
                "required": required_result if isinstance(required_result, dict) else None,
            },
        }

    @classmethod
    def _override_field_state(cls, field, values: dict):
        key = getattr(field, "key", "")
        if key == "person_type_other":
            show = values.get("person_type") == "other"
            return {"visible": show, "enabled": show, "required": show}
        if key == "age_group":
            return {"visible": False, "enabled": False, "required": False}
        return None

    @staticmethod
    def _derive_age(values: dict) -> int | None:
        from datetime import date, datetime

        raw = values.get("birthday") or values.get("date_of_birth") or values.get("age_group")
        if not raw:
            return None
        if isinstance(raw, date):
            dob = raw
        else:
            try:
                dob = datetime.fromisoformat(str(raw)).date()
            except ValueError:
                return None
        today = date.today()
        years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return years

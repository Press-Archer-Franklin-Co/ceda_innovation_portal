from typing import Any


def weighted_score(raw_score: float, weight: float, max_score: float) -> float:
    if max_score <= 0:
        return 0
    return round((raw_score / max_score) * weight, 2)


def merge_dicts(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    merged.update(extra)
    return merged

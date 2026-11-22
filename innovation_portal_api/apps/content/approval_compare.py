"""U9 (3.25): the live version and the proposed version of a website change, side by side.

Both sides are flattened into fields: [{key, group, label, live, proposed, changed}]. Texts stay {"en", "tn"} so the
screen's English / Setswana switch picks the language. live is null for something new (nothing is live yet).
"""

from __future__ import annotations

LABELS = {
    "highlighted_words": "Small label",
    "headline": "Headline",
    "text": "Supporting text",
    "photo": "Photo",
    "primary_button": "Main button",
    "secondary_button": "Second button",
    "show_watermark": "Watermark",
    "show_quick_start": "Quick start box",
    "max_items": "How many to show",
    "only_open": "Only open challenges",
    "excerpt": "Summary",
    "body": "Text",
    "cover": "Cover photo",
    "intro": "Introduction",
    "page_sections": "Sections",
    "schedule_items": "Schedule",
    "prize_items": "Prizes",
    "job_title": "Job title",
    "full_name": "Name",
    "publish_at": "Publish at",
    "unpublish_at": "Take down at",
}

LEAF_KEYS = {"url", "media_id", "asset_id", "id"}


def _label(name: str) -> str:
    return LABELS.get(name) or name.replace("_", " ").strip().capitalize()


def _is_leaf(value) -> bool:
    if not isinstance(value, (dict, list)):
        return True
    if isinstance(value, dict):
        return not value or set(value) <= {"en", "tn"} or bool(LEAF_KEYS & set(value))
    return all(not isinstance(item, (dict, list)) for item in value)


def flatten(value, prefix: str = "", label: str = "") -> dict[str, tuple[str, object]]:
    """{path: (label, leaf value)}"""
    out: dict[str, tuple[str, object]] = {}
    if _is_leaf(value):
        if prefix:
            out[prefix] = (label or prefix, value)
        return out
    if isinstance(value, dict):
        for name, item in value.items():
            if name in ("id", "order"):
                continue
            path = f"{prefix}.{name}" if prefix else name
            out.update(flatten(item, path, f"{label} · {_label(name)}" if label else _label(name)))
        return out
    for index, item in enumerate(value, start=1):
        path = f"{prefix}[{index}]"
        out.update(flatten(item, path, f"{label} {index}" if label else str(index)))
    return out


def fields(live: dict | None, proposed: dict) -> list[dict]:
    live_flat = flatten(live or {})
    new_flat = flatten(proposed or {})
    out = []
    for path in dict.fromkeys([*new_flat, *live_flat]):
        label, new_value = new_flat.get(path, (live_flat.get(path, (path, None))[0], None))
        old_value = live_flat.get(path, (label, None))[1] if live is not None else None
        out.append({"key": path, "label": label, "live": old_value, "proposed": new_value, "changed": live is None or old_value != new_value})
    return out


# Live and proposed documents per kind of target ------------------------------------------------------------------


def _page(page, approval):
    from apps.content.sections import SECTION_TYPES

    def doc(sections):
        return {f"{item.get('type')}#{item.get('id') or n}": {"_type": item.get("type"), "enabled": item.get("enabled", True), **(item.get("settings") or {})} for n, item in enumerate(sections or [])}

    version = page.live_version()
    live = doc(version.sections) if version else None
    proposed = doc((approval.payload or {}).get("sections"))

    def relabel(rows):
        for row in rows:
            section_key = row["key"].split(".", 1)[0]
            kind = section_key.split("#", 1)[0]
            row["group"] = SECTION_TYPES.get(kind, {}).get("label", kind)
            row["label"] = row["label"].split(" · ", 1)[1] if " · " in row["label"] else row["label"]
        return [row for row in rows if not row["key"].endswith("._type")]

    return live, proposed, relabel


def _post(post, approval):
    from apps.content.b6_serializers import PostSerializer

    payload = approval.payload or {}
    keep = ("title", "excerpt", "body", "type", "cover", "translations", "publish_at", "unpublish_at", "event_starts_at", "event_place")
    current = {name: value for name, value in PostSerializer(post).data.items() if name in keep}
    if payload.get("kind") == "edit":
        changes = payload.get("changes") or {}
        return {name: current.get(name) for name in changes}, dict(changes), None
    return None, current, None


def _policy(page, approval):
    from apps.content.policies import live_content

    return (live_content(page) if page.published_at else None), (approval.payload or {}).get("content") or {}, None


def _hackathon(detail, approval):
    from apps.content.hackathon_page import live_document

    return live_document(detail), (approval.payload or {}).get("hackathon_page") or {}, None


def _quote(card, approval):
    doc = {"full_name": card.full_name, "job_title": card.job_title, "quote": card.quote, "translations": card.translations}
    return (doc if card.approved_at else None), doc, None


def compare(approval) -> dict:
    """{title, change_type: new|edit, live_label, proposed_label, fields: [...], changed: [keys]}"""
    from apps.content.models import ContentItem, LeadershipCard, Page, PolicyPage

    target = approval.target
    relabel = None
    if isinstance(target, Page):
        live, proposed, relabel = _page(target, approval)
    elif isinstance(target, ContentItem):
        live, proposed, relabel = _post(target, approval)
    elif isinstance(target, PolicyPage):
        live, proposed, relabel = _policy(target, approval)
    elif target.__class__.__name__ == "HackathonDetail":
        live, proposed, relabel = _hackathon(target, approval)
    elif isinstance(target, LeadershipCard):
        live, proposed, relabel = _quote(target, approval)
    else:
        payload = {key: value for key, value in (approval.payload or {}).items() if key != "kind"}
        live, proposed = None, payload
    rows = fields(live, proposed)
    if relabel:
        rows = relabel(rows)
    else:
        for row in rows:
            row["group"] = ""
    changed = [row["key"] for row in rows if row["changed"]]
    groups = list(dict.fromkeys(row["group"] for row in rows if row["changed"] and row["group"]))
    return {
        "change_type": "new" if live is None else "edit",
        "changed_groups": groups,
        "fields": rows,
        "changed": changed,
    }


def change_type(approval) -> str:
    """new | edit, without building the whole comparison (for the list)."""
    from apps.content.models import ContentItem, LeadershipCard, Page, PolicyPage

    target = approval.target
    if isinstance(target, Page):
        return "edit" if target.live_version() else "new"
    if isinstance(target, ContentItem):
        return "edit" if (approval.payload or {}).get("kind") == "edit" else "new"
    if isinstance(target, PolicyPage):
        return "edit" if target.published_at else "new"
    if isinstance(target, LeadershipCard):
        return "edit" if target.approved_at else "new"
    if target.__class__.__name__ == "HackathonDetail":
        return "edit"
    return "new"

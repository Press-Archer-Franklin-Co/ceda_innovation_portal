"""Similar published ideas and public stories (screen 2.3).

`find_similar_ideas` is the only entry point, so a smarter method (for example
embeddings) can replace the PostgreSQL text search later without touching the API.

What is searched (public material only):
- WinnerSpotlight: ideas CEDA has published as winners (project name, description).
- ContentItem with category "success_story" and status "published".

Results carry title, year and place only. Applicant details (names, contact
details, team names, submission ids, answers) are never returned.
"""
from __future__ import annotations

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector, TrigramSimilarity
from django.db.models import F, FloatField, Value
from django.db.models.functions import Coalesce, Greatest

from apps.core.i18n import get_text

MAX_RESULTS = 5
MIN_SCORE = 0.08
SECTOR_BOOST = 0.1


def _query_text(text: str) -> str:
    return " ".join((text or "").split())[:500]


def _scored(queryset, *, text: str, title_field: str, body_field: str):
    query = SearchQuery(text, search_type="websearch", config="english")
    vector = SearchVector(title_field, weight="A", config="english") + SearchVector(body_field, weight="B", config="english")
    return queryset.annotate(
        title_similarity=TrigramSimilarity(title_field, text),
        body_similarity=TrigramSimilarity(body_field, text),
        rank=Coalesce(SearchRank(vector, query), Value(0.0), output_field=FloatField()),
    ).annotate(
        score=Greatest(F("title_similarity"), F("body_similarity") * 0.8, F("rank"), output_field=FloatField())
    )


def _place_for_spotlight(spotlight, lang: str) -> str:
    submission = spotlight.submission
    if not submission or not submission.innovator_id:
        return ""
    profile = getattr(submission.innovator, "innovator_profile", None)
    if profile and profile.district_id:
        return get_text(profile.district.name, lang)
    return ""


def find_similar_ideas(*, text: str, sector=None, lang: str = "en", limit: int = MAX_RESULTS) -> list[dict]:
    """Up to `limit` public ideas or stories similar to `text`, best first."""
    from apps.content.models import ContentItem, WinnerSpotlight

    text = _query_text(text)
    if len(text) < 3:
        return []

    candidates: list[tuple[float, dict]] = []

    spotlights = _scored(
        WinnerSpotlight.objects.select_related("submission__innovator__innovator_profile__district", "program"),
        text=text,
        title_field="project_name",
        body_field="description",
    ).filter(score__gte=MIN_SCORE).order_by("-score")[: limit * 2]
    for item in spotlights:
        score = float(item.score)
        if sector is not None and item.submission_id and item.submission.sector_id == sector.id:
            score += SECTOR_BOOST
        candidates.append(
            (
                score,
                {
                    "kind": "published_idea",
                    "title": item.project_name,
                    "year": item.year,
                    "place": _place_for_spotlight(item, lang),
                },
            )
        )

    stories = _scored(
        ContentItem.objects.filter(status="published", category="success_story"),
        text=text,
        title_field="title",
        body_field="excerpt",
    ).filter(score__gte=MIN_SCORE).order_by("-score")[: limit * 2]
    for item in stories:
        published = item.published_at or item.created_at
        candidates.append(
            (
                float(item.score),
                {
                    "kind": "story",
                    "title": item.title,
                    "year": published.year if published else None,
                    "place": "",
                },
            )
        )

    candidates.sort(key=lambda pair: pair[0], reverse=True)
    results = []
    seen_titles = set()
    for _, item in candidates:
        key = item["title"].strip().lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        results.append(item)
        if len(results) >= limit:
            break
    return results

"""AI Copilot reads: similar-ideas shortlist, usage, the 3.34b overview and the status for the screens."""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, Greatest
from django.db.models import FloatField, Value

from apps.assistant import gateway
from apps.assistant.models import FEATURE_DEFAULTS, AssistantSettings, Feature, UsageRecord
from apps.platform_config.flags import is_enabled

SHORTLIST_SIZE = 10
CANDIDATE_POOL = 60
MIN_SCORE = 0.12
STOPWORDS = frozenset(
    "about after again their there these those which while where would could should other people using through because between "
    "botswana idea ideas project business small local community products product service services market create help make".split()
)

# TODO tn-review: the Setswana text below is a first draft by the ai lane; a Setswana speaker at CEDA must check it.
PRIVACY_NOTE = {
    "en": [
        "Only the text a feature needs is sent to the AI service.",
        "ID numbers, phone numbers, emails and bank details are removed first. Names are sent only if you switch that on below.",
        "Other innovators never see an idea that is not theirs. Similar ideas are shown only to officers who may already open both.",
        "The AI suggests. People decide. It never scores, approves or publishes.",
        "Every call is recorded with who asked.",
    ],
    "tn": [
        "Ke mokwalo o karolo e o tlhokang fela o o romelwang kwa tirelong ya AI.",
        "Dinomore tsa boitshupo, dinomore tsa mogala, di-email le dintlha tsa banka di tlosiwa pele. Maina a romelwa fela fa o tshuba seo fa tlase.",
        "Baitlhami ba bangwe ga ba ke ba bona kakanyo e e seng ya bone. Dikakanyo tse di tshwanang di bontshiwa batlhankedi ba ba setseng ba ka bula tsoopedi fela.",
        "AI e a akantsha. Batho ba a swetsa. Ga e ke e tshwaya, e dumela kgotsa e phasalatsa.",
        "Pitso nngwe le nngwe e kwalwa le gore ke mang a botsitseng.",
    ],
}

FEATURE_LABELS = {
    "draft_check": ("Idea coach (innovators)", "Mokaedi wa dikakanyo (baitlhami)"),
    "document_review": ("Document review", "Tshekatsheko ya dikwalo"),
    "hints": ("Officer summary and document highlights", "Kakaretso ya motlhankedi le dintlha tsa dikwalo"),
    "related": ("Similar ideas", "Dikakanyo tse di tshwanang"),
    "idea_profile": ("Idea profiles for matching", "Ditlhaloso tsa dikakanyo go tshwantsha"),
    "guide": ("Need help guide", "Kaedi ya Ke tlhoka thuso"),
    "builder_draft": ("Draft a form or workflow", "Kwala foromo kgotsa tsamaiso ya ntlha"),
    "translate": ("Setswana suggestions", "Dikakantsho tsa Setswana"),
    "help": ("Help with the portal", "Thuso ka potale"),
    "web_chat": ("Website help chat first answer", "Karabo ya ntlha mo puisanong ya thuso"),
}


# -- A5 shortlist ------------------------------------------------------------------------------------


def _keywords(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]{4,}", (text or "").lower()) if word not in STOPWORDS}


def _profile_words(profile) -> set[str]:
    if profile is None:
        return set()
    return _keywords(" ".join([profile.summary_en, *profile.keywords_en, *profile.keywords_tn]))


def _fits(outputs, inputs) -> bool:
    """One idea's outputs match the other's inputs (for example sorghum grain and a sorghum mill)."""
    words_out = _keywords(" ".join(outputs or []))
    words_in = _keywords(" ".join(inputs or []))
    return bool(words_out & words_in)


def related_shortlist(*, submission, user, profile=None) -> list:
    """Up to SHORTLIST_SIZE other ideas this officer may open, most alike first.

    The pool comes from SubmissionSelector.for_user, so an idea the officer cannot open is never
    shortlisted, sent to the AI or shown. Matching uses the English profiles, so a Setswana idea
    meets an English one; ideas with no profile yet fall back to their titles.
    """
    from apps.assistant.profiles import idea_text
    from apps.submissions.selectors import SubmissionSelector

    visible = (
        SubmissionSelector.for_user(user)
        .exclude(pk=submission.pk)
        .exclude(current_status="draft")
        .select_related("sector", "district", "idea_profile")
    )
    query_text = (profile.search_text if profile is not None and profile.search_text else submission.title)[:500]
    pool = list(
        visible.annotate(
            similarity=Greatest(
                TrigramSimilarity("title", submission.title),
                Coalesce(TrigramSimilarity("idea_profile__search_text", query_text), Value(0.0)),
                output_field=FloatField(),
            )
        )
        .filter(Q(similarity__gte=0.05) | Q(sector_id=submission.sector_id) if submission.sector_id else Q(similarity__gte=0.05))
        .order_by("-similarity", "-submitted_at")[:CANDIDATE_POOL]
    )
    mine = _profile_words(profile) | _keywords(idea_text(submission))
    scored = []
    for other in pool:
        other_profile = getattr(other, "idea_profile", None)
        theirs = _profile_words(other_profile) | _keywords(idea_text(other))
        overlap = len(mine & theirs) / max(len(mine), 1)
        score = float(getattr(other, "similarity", 0) or 0) + min(overlap, 1.0) * 0.6
        if profile is not None and other_profile is not None and (_fits(profile.outputs, other_profile.inputs) or _fits(other_profile.outputs, profile.inputs)):
            score += 0.3
        if submission.sector_id and other.sector_id == submission.sector_id:
            score += 0.1
        if submission.district_id and other.district_id == submission.district_id:
            score += 0.05
        if score >= MIN_SCORE:
            scored.append((score, other))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [other for _, other in scored[:SHORTLIST_SIZE]]


# -- usage (3.34b) -----------------------------------------------------------------------------------


def usage_rows() -> list[dict]:
    """This month, per feature and per provider: calls, tokens in and out, cost and failures."""
    rows = (
        UsageRecord.objects.filter(created_at__gte=gateway.month_start())
        .values("feature", "provider")
        .annotate(
            calls=Count("id", filter=Q(ok=True)),
            failed=Count("id", filter=Q(ok=False) & ~Q(outcome__in=["switched_off", "feature_off"])),
            tokens_in=Coalesce(Sum("input_tokens"), 0) + Coalesce(Sum("cache_read_tokens"), 0) + Coalesce(Sum("cache_write_tokens"), 0),
            tokens_out=Coalesce(Sum("output_tokens"), 0),
            cost=Sum("cost_usd"),
        )
        .order_by("feature", "provider")
    )
    return [
        {
            "feature": row["feature"],
            "provider": row["provider"],
            "calls": row["calls"],
            "failed": row["failed"],
            "tokens_in": row["tokens_in"],
            "tokens_out": row["tokens_out"],
            "cost_usd": str((row["cost"] or Decimal("0")).quantize(Decimal("0.01"))),
        }
        for row in rows
        if row["calls"] or row["failed"]
    ]


def usage_report() -> dict:
    assistant_settings = AssistantSettings.load()
    spend = gateway.month_spend()
    limit = assistant_settings.monthly_limit_usd
    return {
        "month": {
            "from": gateway.month_start().date().isoformat(),
            "spend_usd": str(spend.quantize(Decimal("0.01"))),
            "limit_usd": str(limit),
            "left_usd": str(max(limit - spend, Decimal("0")).quantize(Decimal("0.01"))),
            "calls": UsageRecord.objects.filter(created_at__gte=gateway.month_start(), ok=True).count(),
        },
        "rows": usage_rows(),
        "recent_problems": [
            {"at": record.created_at.isoformat(), "feature": record.feature, "provider": record.provider, "outcome": record.outcome, "detail": record.error_detail}
            for record in UsageRecord.objects.filter(ok=False).exclude(outcome__in=["switched_off", "feature_off"]).order_by("-created_at")[:10]
        ],
    }


def usage_csv() -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Feature", "Service", "Calls", "Failed", "Tokens in", "Tokens out", "Cost (US dollars)"])
    for row in usage_rows():
        writer.writerow([FEATURE_LABELS.get(row["feature"], (row["feature"],))[0], row["provider"] or "none", row["calls"], row["failed"], row["tokens_in"], row["tokens_out"], row["cost_usd"]])
    return out.getvalue()


# -- 3.34b overview ----------------------------------------------------------------------------------


def _key_hint(connection) -> str:
    """The last 4 characters of the key ("…4f2a"), the only part ever shown."""
    from apps.platform_config.crypto import decrypt_secrets

    try:
        key = decrypt_secrets(connection.secrets_encrypted).get("api_key", "")
    except Exception:
        return ""
    return key[-4:] if len(key) >= 12 else ""


def overview(language: str = "en") -> dict:
    """Services, keys in use, the service for each feature, switches, spend and the privacy note."""
    from apps.platform_config.models import IntegrationConnection

    assistant_settings = AssistantSettings.load()
    connections = list(IntegrationConnection.objects.filter(kind=gateway.AI_KIND).order_by("provider", "-is_active", "-updated_at"))
    routes = {}
    for feature in FEATURE_DEFAULTS:
        route = gateway.resolve_route(feature, assistant_settings)
        routes[feature] = (
            {"provider": route.provider_key, "connection": route.connection_id, "connection_name": route.connection_name, "model": route.model}
            if route
            else None
        )
    flag_on = is_enabled(gateway.FLAG)
    active_now = [row for row in connections if row.is_active and (row.config or {}).get("environment", "test") == assistant_settings.keys_in_use]
    if not connections:
        state = "needs_setup"
    elif not active_now:
        state = "no_active_key"
    elif not flag_on:
        state = "switched_off"
    elif assistant_settings.monthly_limit_usd <= 0 or gateway.month_spend() >= assistant_settings.monthly_limit_usd:
        state = "limit_reached"
    else:
        state = "ready"
    tn = language == "tn"
    return {
        "state": state,
        "helper_on": flag_on,
        "keys_in_use": assistant_settings.keys_in_use,
        "services": [
            {
                "id": str(row.pk),
                "provider": row.provider,
                "name": row.name,
                "environment": (row.config or {}).get("environment", "test"),
                "model": (row.config or {}).get("model", ""),
                "is_active": row.is_active,
                "status": row.status,
                "key_ending": _key_hint(row),
                "last_tested_at": row.last_tested_at.isoformat() if row.last_tested_at else None,
                "last_test_ok": bool((row.last_test_result or {}).get("ok")) if row.last_test_result else None,
                "used_by": sorted(feature for feature, route in routes.items() if route and route["connection"] == str(row.pk)),
            }
            for row in connections
        ],
        "features": [
            {
                "key": feature,
                "label": FEATURE_LABELS[feature][1 if tn else 0],
                "on": assistant_settings.feature_on(feature),
                "route": routes[feature],
                "chosen": (assistant_settings.routes or {}).get(feature),
            }
            for feature in FEATURE_DEFAULTS
        ],
        "monthly_limit_usd": str(assistant_settings.monthly_limit_usd),
        "send_names": assistant_settings.send_names,
        "guests_can_use_guide": assistant_settings.guests_can_use_guide,
        "privacy_note": PRIVACY_NOTE["tn" if tn else "en"],
        "integrations_path": "/staff/admin/platform?tab=ai",
    }


# -- A7 status for the screens -----------------------------------------------------------------------


def status_for(user, requested_language: str | None = None) -> dict:
    """Which features are on for this person (or guest) right now. Never raises."""
    from apps.assistant import language as lang_mod
    from apps.core.capabilities import user_has

    signed_in = bool(user and getattr(user, "is_authenticated", False))
    language = lang_mod.resolve(user=user if signed_in else None, requested=requested_language)
    features = {key: False for key in FEATURE_DEFAULTS}
    try:
        assistant_settings = AssistantSettings.load()
        base_reason = gateway.unavailable_reason(Feature.HELP, assistant_settings, check_route=False)
        if base_reason in ("", "feature_off"):
            def can(feature: str) -> bool:
                return gateway.unavailable_reason(feature, assistant_settings) == ""

            features["guide"] = can("guide") and (signed_in or assistant_settings.guests_can_use_guide)
            features["help"] = can("help") and signed_in
            features["web_chat"] = can("web_chat")
            if signed_in:
                features["draft_check"] = can("draft_check")
                features["document_review"] = can("document_review")
                if user_has(user, "assistant.hints"):
                    features["hints"] = can("hints")
                    features["related"] = can("related") and not _judge_only(user)
                if user_has(user, "forms.manage"):
                    features["translate"] = can("translate")
    except Exception:
        features = {key: False for key in FEATURE_DEFAULTS}
    answer = {"available": any(features.values()), "features": features, "language": language}
    if signed_in and user_has(user, "assistant.manage"):
        try:
            answer["setup"] = {"state": overview(language)["state"], "integrations_path": "/staff/admin/platform?tab=ai"}
        except Exception:
            answer["setup"] = {"state": "needs_setup", "integrations_path": "/staff/admin/platform?tab=ai"}
    return answer


def _judge_only(user) -> bool:
    """Similar ideas are for officers who may open many ideas, not for judges (A5)."""
    from apps.core.capabilities import user_has

    return not user_has(user, "entries.search")

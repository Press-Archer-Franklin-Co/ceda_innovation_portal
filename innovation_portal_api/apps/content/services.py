"""Website content services (B6 part 1): home page sections, approvals, posts, partners, scheduling."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db import transaction
from django.db.models import F, Max, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import AuditService
from apps.content.models import ApprovalRequest, ContentItem, LeadershipCard, Page, PageSection, PageVersion, Partner, SiteSettings, WinnerSpotlight
from apps.content.sections import DEFAULT_ORDER, SECTION_TYPES, SettingsError, default_settings, localize, normalize_settings
from apps.core.constants import ProgramStatus, RoleType
from apps.core.i18n import get_text

HOME = "home"
HOME_CACHE_KEY = "content:public-home:{lang}"
HOME_CACHE_SECONDS = 60
APPROVER_ROLES = [RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR]
LANGS = ("en", "tn")


def clear_home_cache():
    cache.delete_many([HOME_CACHE_KEY.format(lang=lang) for lang in LANGS])


def _iso(value):
    return value.isoformat() if value else None


def media_payload(asset, request=None) -> dict | None:
    if asset is None:
        return None

    def url(field):
        if not field:
            return None
        return request.build_absolute_uri(field.url) if request else field.url

    return {
        "id": str(asset.id),
        "kind": asset.kind,
        "url": url(asset.file),
        "monochrome_url": url(asset.monochrome_file),
        "captions_url": url(asset.captions_file),
        "duration_seconds": asset.duration_seconds,
        "width": asset.width,
        "height": asset.height,
        "alt_text": asset.alt_text,
    }


def bilingual(obj, attr) -> dict:
    tn = ((obj.translations or {}).get("tn") or {}).get(attr, "")
    return {"en": getattr(obj, attr, "") or "", "tn": tn if isinstance(tn, str) else ""}


def text_in(obj, attr, lang) -> str:
    texts = bilingual(obj, attr)
    return texts[lang] if lang in texts and texts[lang].strip() else texts["en"]


# --- Approvals -----------------------------------------------------------------------------


class ApprovalService:
    """S2: website changes go through the content approval flow (Website approvals settings).

    Each step names who may approve it (a capability or a role), how many approvals it needs and
    which language it covers. A change waits only for the steps whose language it touches, in any
    order, and goes live when every one of them has enough approvals. People who can approve a
    step may approve their own change when the flow allows it. Send back works from any step.
    """

    FLOW_KEY = "content"

    # Flow and steps ----------------------------------------------------------------------

    @classmethod
    def flow(cls):
        from apps.content.models import ApprovalFlow, ApprovalStep

        flow, created = ApprovalFlow.objects.get_or_create(key=cls.FLOW_KEY, defaults={"approvers_can_approve_own_work": True})
        if created or not flow.steps.exists():
            ApprovalStep.objects.get_or_create(flow=flow, order=1, defaults={"name": "Approval", "capability": "content.approve", "approvals_needed": 1, "language": "all"})
        return flow

    @staticmethod
    def qualifies(user, step) -> bool:
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if step.role_id:
            return user.roles.filter(id=step.role_id, is_active=True, user_roles__is_active=True).exists()
        if step.capability:
            from apps.core.capabilities import user_has

            return user_has(user, step.capability)
        return False

    @staticmethod
    def approvers(step):
        from apps.accounts.models import User
        from apps.core.capabilities import roles_for

        users = User.objects.filter(is_active=True)
        if step.role_id:
            return users.filter(user_roles__role_id=step.role_id, user_roles__is_active=True).distinct()
        if step.capability:
            return users.filter(user_roles__role__code__in=roles_for(step.capability), user_roles__is_active=True, user_roles__role__is_active=True).distinct()
        return users.none()

    @staticmethod
    def languages_touched(target, payload: dict | None = None) -> list[str]:
        """English always; Setswana when the change has any Setswana text."""

        def has_tn(value) -> bool:
            if isinstance(value, dict):
                if isinstance(value.get("tn"), str) and value["tn"].strip() and set(value) <= {"en", "tn"}:
                    return True
                return any(has_tn(item) for item in value.values())
            if isinstance(value, list):
                return any(has_tn(item) for item in value)
            return False

        tn = False
        if payload:
            tn = has_tn(payload)
        translations = getattr(target, "translations", None)
        if isinstance(translations, dict):
            tn = tn or any(isinstance(text, str) and text.strip() for text in (translations.get("tn") or {}).values())
        return ["en", "tn"] if tn else ["en"]

    @classmethod
    def needed_steps(cls, approval):
        from apps.content.models import ApprovalStep

        steps = {str(step.id): step for step in ApprovalStep.objects.filter(id__in=approval.step_ids or []).select_related("role")}
        return [steps[step_id] for step_id in approval.step_ids or [] if step_id in steps]

    @staticmethod
    def approvals_for(approval, step) -> int:
        return approval.decisions.filter(step=step).count()

    @classmethod
    def waiting_steps(cls, approval):
        return [step for step in cls.needed_steps(approval) if cls.approvals_for(approval, step) < step.approvals_needed]

    @classmethod
    def steps_user_can_approve(cls, user, approval):
        if approval.status != ApprovalRequest.Status.PENDING or not user or not user.is_authenticated:
            return []
        flow = cls.flow()
        if approval.requested_by_id == user.id and not flow.approvers_can_approve_own_work:
            return []
        decided = set(approval.decisions.filter(decided_by=user).values_list("step_id", flat=True))
        return [step for step in cls.waiting_steps(approval) if step.id not in decided and cls.qualifies(user, step)]

    @classmethod
    def can_approve(cls, user, approval) -> bool:
        return bool(cls.steps_user_can_approve(user, approval))

    @classmethod
    def can_decide(cls, user, approval) -> bool:
        """May approve a waiting step, or send the change back from one."""
        if cls.can_approve(user, approval):
            return True
        if approval.status != ApprovalRequest.Status.PENDING:
            return False
        return any(cls.qualifies(user, step) for step in cls.waiting_steps(approval)) and approval.requested_by_id != getattr(user, "id", None)

    @classmethod
    def is_any_approver(cls, user) -> bool:
        return any(cls.qualifies(user, step) for step in cls.flow().steps.all())

    @staticmethod
    def open_for(target):
        return ApprovalRequest.objects.filter(
            content_type=ContentType.objects.get_for_model(target), object_id=str(target.pk), status=ApprovalRequest.Status.PENDING
        )

    # Requests ----------------------------------------------------------------------------

    @classmethod
    def create(cls, target, *, actor, summary: str, payload: dict | None = None, publish_at=None) -> ApprovalRequest:
        # A new request replaces an older open one for the same thing.
        cls.open_for(target).update(status=ApprovalRequest.Status.WITHDRAWN, decided_at=timezone.now())
        flow = cls.flow()
        languages = cls.languages_touched(target, payload)
        steps = [step for step in flow.steps.select_related("role").order_by("order") if step.language == "all" or step.language in languages]
        roles = set()
        from apps.core.capabilities import roles_for

        for step in steps:
            roles |= {step.role.code} if step.role_id else set(roles_for(step.capability) if step.capability else ())
        approval = ApprovalRequest.objects.create(
            content_type=ContentType.objects.get_for_model(target),
            object_id=str(target.pk),
            summary=summary[:255],
            payload=payload or {},
            requested_by=actor,
            approver_roles=sorted(roles),
            publish_at=publish_at,
            languages=languages,
            step_ids=[str(step.id) for step in steps],
        )
        AuditService.log_action(actor=actor, action_type="content_approval_requested", target=approval, metadata={"summary": approval.summary, "languages": languages})
        cls._notify(approval, steps, exclude=actor)
        return approval

    @classmethod
    def _notify(cls, approval, steps, *, exclude=None):
        from apps.notifications.services import NotificationService

        notified = set()
        for step in steps:
            for person in cls.approvers(step):
                if person.pk in notified or (exclude is not None and person.pk == exclude.pk):
                    continue
                notified.add(person.pk)
                NotificationService.notify(
                    user=person,
                    notification_type="content_approval",
                    title="Website change waiting for you",
                    message=f"{approval.summary}. Please approve it or send it back.",
                )

    @classmethod
    @transaction.atomic
    def decide(cls, approval: ApprovalRequest, *, actor, approve: bool, comment: str = "") -> ApprovalRequest:
        approval = ApprovalRequest.objects.select_for_update().get(pk=approval.pk)
        if approval.status != ApprovalRequest.Status.PENDING:
            raise ValidationError({"detail": f"This request is already {approval.status}."})
        if not approve:
            if not cls.can_decide(actor, approval):
                raise PermissionDenied("You cannot send this change back.")
            if not comment.strip():
                raise ValidationError({"comment": "Say why, so the author can fix it."})
            return cls._finish(approval, actor=actor, approve=False, comment=comment)
        steps = cls.steps_user_can_approve(actor, approval)
        if not steps:
            raise PermissionDenied("You cannot approve this change.")
        from apps.content.models import ApprovalDecision

        for step in steps:
            ApprovalDecision.objects.create(request=approval, step=step, step_order=step.order, decided_by=actor, own_work=approval.requested_by_id == actor.id)
            AuditService.log_action(
                actor=actor,
                action_type="content_step_approved",
                target=approval,
                metadata={"step": step.name or str(step.order), "language": step.language, "own_work": approval.requested_by_id == actor.id},
            )
        if cls.waiting_steps(approval):
            approval.comment = comment or approval.comment
            approval.save(update_fields=["comment", "updated_at"])
            return approval
        return cls._finish(approval, actor=actor, approve=True, comment=comment)

    @classmethod
    def _finish(cls, approval, *, actor, approve: bool, comment: str):
        approval.status = ApprovalRequest.Status.APPROVED if approve else ApprovalRequest.Status.REJECTED
        approval.comment = comment
        approval.decided_by = actor
        approval.decided_at = timezone.now()
        approval.save()
        target = approval.target
        if isinstance(target, Page):
            if approve:
                PageService.publish(target, approval.payload.get("sections") or [], actor=actor, go_live_at=approval.publish_at, approval=approval)
        elif isinstance(target, ContentItem):
            if (approval.payload or {}).get("kind") == "edit":
                # A change to a live post: apply it when approved; sending it back leaves the live post alone.
                if approve:
                    PostService.apply_edit(target, approval.payload.get("changes") or {})
            else:
                PostService.apply_decision(target, approve=approve, publish_at=approval.publish_at)
        elif isinstance(target, LeadershipCard) and approve:
            LeadershipCard.objects.filter(pk=target.pk).update(approved_at=timezone.now())
            clear_home_cache()
        AuditService.log_action(
            actor=actor,
            action_type="content_approved" if approve else "content_rejected",
            target=approval,
            after_state={"status": approval.status},
            metadata={"summary": approval.summary, "comment": comment},
        )
        return approval

    @classmethod
    def payload(cls, approval: ApprovalRequest, user=None) -> dict:
        target_type = approval.content_type.model
        steps = []
        for step in cls.needed_steps(approval):
            count = cls.approvals_for(approval, step)
            steps.append(
                {
                    "id": str(step.id),
                    "name": step.name,
                    "language": step.language,
                    "approver": {"role": step.role.code, "role_name": step.role.name} if step.role_id else {"capability": step.capability},
                    "approvals_needed": step.approvals_needed,
                    "approvals": count,
                    "done": count >= step.approvals_needed,
                }
            )
        data = {
            "id": str(approval.id),
            "target_type": {"contentitem": "post", "page": "page", "leadershipcard": "quote"}.get(target_type, target_type),
            "target_id": approval.object_id,
            "summary": approval.summary,
            "status": approval.status,
            "publish_at": _iso(approval.publish_at),
            "requested_by": (approval.requested_by.full_name or approval.requested_by.email) if approval.requested_by else None,
            "requested_at": _iso(approval.created_at),
            "approver_roles": approval.approver_roles,
            "kind": (approval.payload or {}).get("kind") or "publish",
            "languages": approval.languages or ["en"],
            "steps": steps,
            "comment": approval.comment,
            "decided_by": (approval.decided_by.full_name or approval.decided_by.email) if approval.decided_by else None,
            "decided_at": _iso(approval.decided_at),
        }
        if user is not None:
            data["can_approve"] = cls.can_approve(user, approval)
            data["can_send_back"] = cls.can_decide(user, approval)
        return data


# --- Home page -------------------------------------------------------------------------------


class PageService:
    @staticmethod
    def home() -> Page:
        """The home page, with its default sections made exactly once (R-28).

        Two first requests at the same time used to both make the defaults (two banners).
        The page row is locked and the check repeated after the lock, so only one request
        makes them; Page.slug is unique, so only one page exists.
        """
        page, _ = Page.objects.get_or_create(slug=HOME, defaults={"title": "Home"})
        if page.sections.exists():
            return page
        with transaction.atomic():
            page = Page.objects.select_for_update().get(pk=page.pk)
            if not page.sections.exists():
                for order, section_type in enumerate(DEFAULT_ORDER):
                    PageSection.objects.create(page=page, type=section_type, order=order, enabled=True, settings=default_settings(section_type))
        return page

    @staticmethod
    def draft_sections(page: Page) -> list[dict]:
        return [
            {"id": str(section.id), "type": section.type, "enabled": section.enabled, "settings": section.settings}
            for section in page.sections.order_by("order", "created_at")
        ]

    @staticmethod
    def draft_document(page: Page) -> dict:
        live = page.live_version()
        return {
            "page": page.slug,
            "draft_version": page.draft_version,
            "live_version": live.number if live else None,
            "pending_approval": ApprovalService.open_for(page).exists(),
            "sections": PageService.draft_sections(page),
        }

    @staticmethod
    def validate_sections(sections) -> list[dict]:
        """Check and normalize a list of sections; raises ValidationError({"errors": [...]})."""
        if not isinstance(sections, list) or not sections:
            raise ValidationError({"errors": [{"path": "sections", "message": "Send the list of sections."}]})
        errors, result = [], []
        for index, section in enumerate(sections):
            path = f"sections[{index}]"
            if not isinstance(section, dict):
                errors.append({"path": path, "message": "Each section must be an object."})
                continue
            section_type = section.get("type")
            spec = SECTION_TYPES.get(section_type)
            if spec is None:
                errors.append({"path": f"{path}.type", "message": f"Unknown section type `{section_type}`."})
                continue
            enabled = section.get("enabled", True)
            if not isinstance(enabled, bool):
                errors.append({"path": f"{path}.enabled", "message": "Must be true or false."})
                enabled = True
            if spec.get("fixed_first") and index != 0:
                errors.append({"path": path, "message": f"The {spec['label'].lower()} must stay first."})
            if spec.get("can_disable", True) is False and not enabled:
                errors.append({"path": f"{path}.enabled", "message": f"The {spec['label'].lower()} cannot be switched off."})
            try:
                settings = normalize_settings(section_type, section.get("settings"), path=f"{path}.settings")
            except SettingsError as exc:
                errors.extend(exc.errors)
                continue
            result.append({"id": section.get("id"), "type": section_type, "enabled": enabled, "settings": settings})
        first = sections[0] if isinstance(sections[0], dict) else {}
        fixed = [key for key, spec in SECTION_TYPES.items() if spec.get("fixed_first")]
        if first.get("type") not in fixed:
            errors.append({"path": "sections[0]", "message": "The banner must be the first section."})
        if sum(1 for section in sections if isinstance(section, dict) and section.get("type") in fixed) > 1:
            errors.append({"path": "sections", "message": "There can be only one banner."})
        if errors:
            raise ValidationError({"errors": errors})
        return result

    @classmethod
    @transaction.atomic
    def save_draft(cls, page: Page, sections, *, actor) -> dict:
        page = Page.objects.select_for_update().get(pk=page.pk)
        normalized = cls.validate_sections(sections)
        existing = {str(section.id): section for section in page.sections.all()}
        keep = []
        for order, item in enumerate(normalized):
            section = existing.get(str(item.get("id") or "")) or PageSection(page=page)
            section.type, section.order, section.enabled, section.settings = item["type"], order, item["enabled"], item["settings"]
            section.save()
            keep.append(section.id)
        page.sections.exclude(id__in=keep).delete()
        page.draft_version += 1
        page.save(update_fields=["draft_version", "updated_at"])
        AuditService.log_action(actor=actor, action_type="page_draft_saved", target=page, after_state={"draft_version": page.draft_version})
        return cls.draft_document(page)

    @classmethod
    def submit(cls, page: Page, *, actor, publish_at=None) -> ApprovalRequest:
        sections = cls.validate_sections(cls.draft_sections(page))
        for section in sections:
            section["id"] = str(section["id"]) if section.get("id") else None
        when = f" for {publish_at:%d %b %Y %H:%M}" if publish_at else ""
        return ApprovalService.create(page, actor=actor, summary=f"Home page changes{when}", payload={"sections": sections}, publish_at=publish_at)

    @staticmethod
    def publish(page: Page, sections: list[dict], *, actor, go_live_at=None, approval=None) -> PageVersion:
        number = (page.versions.aggregate(top=Max("number"))["top"] or 0) + 1
        version = PageVersion.objects.create(
            page=page, number=number, sections=sections, go_live_at=go_live_at or timezone.now(), published_by=actor, approval=approval
        )
        clear_home_cache()
        return version

    # Rendering ---------------------------------------------------------------------------

    @classmethod
    def render(cls, sections: list[dict], *, lang: str, request=None) -> list[dict]:
        rendered = []
        for section in sections:
            if not section.get("enabled", True):
                continue
            resolver = SECTION_RESOLVERS.get(section["type"])
            settings = section.get("settings") or {}
            rendered.append(
                {
                    "id": section.get("id"),
                    "type": section["type"],
                    "settings": localize(settings, lang),
                    "data": resolver(settings, lang, request) if resolver else None,
                }
            )
        return rendered

    @classmethod
    def public_home(cls, *, lang: str, request=None) -> dict:
        key = HOME_CACHE_KEY.format(lang=lang)
        cached = cache.get(key)
        if cached is not None:
            return cached
        page = Page.objects.filter(slug=HOME).first()
        live = page.live_version() if page else None
        payload = {
            "version": live.number if live else None,
            "published_at": _iso(live.go_live_at) if live else None,
            "language": lang,
            "sections": cls.render(live.sections, lang=lang, request=request) if live else [],
        }
        cache.set(key, payload, HOME_CACHE_SECONDS)
        return payload


# --- Section data ------------------------------------------------------------------------------


def _sector(sector, lang):
    return {"id": str(sector.id), "slug": sector.slug, "name": get_text(sector.name, lang)}


def challenge_card(program, lang: str) -> dict:
    """The challenge card shape shared by the home page (R-2a). B5 reuses these names for its public list."""
    now = timezone.now()
    opens, closes = program.submission_opens_at, program.submission_closes_at
    days_left = max(0, (closes - now).days) if closes and closes > now else 0
    progress = None
    if opens and closes and closes > opens:
        progress = round(min(1.0, max(0.0, (now - opens) / (closes - opens))), 3)
    if program.status == ProgramStatus.CLOSED or (closes and closes < now):
        state = "closed"
    elif opens and opens > now:
        state = "upcoming"
    else:
        state = "open"
    summary = (program.description or "").strip().split("\n")[0]
    return {
        "id": str(program.id),
        "slug": program.slug,
        "title": program.title,
        "status": state,
        "summary": summary[:200],
        "support_headline": (program.metadata or {}).get("support_headline", "") if isinstance(program.metadata, dict) else "",
        "sectors": [_sector(sector, lang) for sector in program.sectors.all()],
        "opens_at": _iso(opens),
        "closes_at": _iso(closes),
        "days_left": days_left,
        "window_progress": progress,
    }


def _challenges(settings, lang, request):
    from apps.programs.models import Program

    queryset = Program.objects.filter(is_public=True, is_general_intake=False, status=ProgramStatus.PUBLISHED).prefetch_related("sectors")
    now = timezone.now()
    if settings.get("only_open", True):
        queryset = queryset.filter(Q(closes_at__gte=now) | Q(closes_at__isnull=True, closing_date__gte=now))
    queryset = queryset.order_by("closing_date")[: settings.get("max_items", 3)]
    return {"items": [challenge_card(program, lang) for program in queryset]}


def _partners(settings, lang, request):
    items = PartnerService.public(placement="home")[: settings.get("max_items", 12)]
    return {"items": [PartnerService.payload(partner, request) for partner in items]}


def _quotes(settings, lang, request):
    now = timezone.now()
    cards = (
        LeadershipCard.objects.filter(is_active=True)
        .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
        .filter(Q(end_at__isnull=True) | Q(end_at__gt=now))
        .exclude(is_official=True, approved_at__isnull=True)
        .order_by("sort_order", "created_at")[: settings.get("max_items", 5)]
    )

    def photo(card):
        if not card.photo:
            return None
        return request.build_absolute_uri(card.photo.url) if request else card.photo.url

    return {
        "rotation_seconds": SiteSettings.get().quote_rotation_seconds,
        "items": [
            {"id": str(card.id), "name": card.full_name, "job_title": card.job_title, "committee_role": card.committee_role, "quote": text_in(card, "quote", lang), "photo_url": photo(card)}
            for card in cards
        ],
    }


def _news_flash(settings, lang, request):
    posts = PostService.public_queryset().filter(show_in_news_flash=True)[: settings.get("max_items", 5)]
    return {"items": [PostService.card(post, lang, request) for post in posts]}


def _bulletin(settings, lang, request):
    now = timezone.now()
    posts = (
        PostService.public_queryset()
        .filter(show_on_bulletin=True)
        .order_by(F("pinned_until").desc(nulls_last=True), "-published_at")
    )
    items = sorted(posts[:50], key=lambda post: (not post.is_pinned, -(post.published_at or now).timestamp()))
    return {"items": [PostService.card(post, lang, request) for post in items[: settings.get("max_items", 6)]]}


def _sectors(settings, lang, request):
    from apps.reference.models import Sector

    wanted = [item.get("sector") for item in settings.get("items") or []]
    by_key = {}
    for sector in Sector.objects.filter(active=True):
        by_key[str(sector.id)] = sector
        by_key[sector.slug] = sector
    items = []
    for item in settings.get("items") or []:
        sector = by_key.get(item.get("sector"))
        if sector is None:
            continue
        items.append({"sector": _sector(sector, lang), "example": localize(item.get("example"), lang), "icon": item.get("icon") or ""})
    if not wanted:  # nothing chosen yet: every active sector, without examples
        items = [{"sector": _sector(sector, lang), "example": "", "icon": ""} for sector in Sector.objects.filter(active=True).order_by("ordering")]
    return {"items": items}


def _stories(settings, lang, request):
    from apps.content.part2_services import StoryService

    limit = settings.get("max_items", 3)
    stories = list(StoryService.public_queryset().filter(is_featured=True, shows_on__contains=["home"])[:limit])
    if stories:
        return {"items": [dict(StoryService.card(story, lang, request), kind="story") for story in stories]}
    # No stories yet: featured winners stand in.
    winners = WinnerSpotlight.objects.filter(is_featured=True).select_related("program").order_by("-year", "position")[:limit]

    def photo(item):
        if not item.photo:
            return None
        return request.build_absolute_uri(item.photo.url) if request else item.photo.url

    return {
        "items": [
            {"id": str(item.id), "kind": "winner", "name": item.team_name, "business": item.project_name, "quote": item.description[:200], "photo_url": photo(item), "program": item.program.title, "year": item.year}
            for item in winners
        ]
    }


def _hero(settings, lang, request):
    """U7: the banner's cut-out photo, or None (then the banner looks as before)."""
    from apps.content import hero_photo
    from apps.content.models import HeroPhoto

    photo_settings = settings.get("photo") or {}
    asset = photo_settings.get("asset")
    photo = HeroPhoto.objects.filter(id=asset).first() if asset else None
    if photo is None:
        return {"photo": None}
    return {"photo": hero_photo.payload(photo, size=photo_settings.get("size"), alt=photo_settings.get("alt"), request=request)}


SECTION_RESOLVERS = {
    "hero_banner": _hero,
    "partners_strip": _partners,
    "challenges": _challenges,
    "leadership_quotes": _quotes,
    "news_flash": _news_flash,
    "bulletin_board": _bulletin,
    "sectors": _sectors,
    "stories": _stories,
}


# --- Posts --------------------------------------------------------------------------------------


class PostService:
    @staticmethod
    def public_queryset():
        now = timezone.now()
        return (
            ContentItem.objects.filter(status="published")
            .filter(Q(published_at__isnull=True) | Q(published_at__lte=now))
            .filter(Q(unpublish_at__isnull=True) | Q(unpublish_at__gt=now))
            .select_related("cover")
        )

    @staticmethod
    def cover(post, request=None) -> dict | None:
        if post.cover_id:
            return media_payload(post.cover, request)
        if post.image:
            url = request.build_absolute_uri(post.image.url) if request else post.image.url
            from apps.content.serializers import _is_video

            return {"id": None, "kind": "video" if _is_video(post.image) else "image", "url": url, "monochrome_url": None, "captions_url": None, "duration_seconds": None, "width": None, "height": None, "alt_text": {"en": "", "tn": ""}}
        return None

    @classmethod
    def card(cls, post, lang: str, request=None) -> dict:
        cover = cls.cover(post, request)
        return {
            "id": str(post.id),
            "slug": post.slug,
            "type": post.type,
            "title": text_in(post, "title", lang),
            "excerpt": text_in(post, "excerpt", lang),
            "cover": cover,
            "duration_seconds": cover.get("duration_seconds") if cover else None,
            "published_at": _iso(post.published_at),
            "is_new": post.is_new,
            "is_pinned": post.is_pinned,
            "tags": post.tags or [],
            "event_starts_at": _iso(post.event_starts_at),
            "event_place": post.event_place,
            "newsletter_issue": post.newsletter_issue,
            "read_time": post.read_time,
        }

    @staticmethod
    def shows_on(post) -> list[str]:
        places = []
        if post.show_in_news_flash:
            places.append("news_flash")
        if post.show_on_bulletin:
            places.append("bulletin_board")
        if post.is_highlighted:
            places.append("highlights")
        places.append("news_page")
        return places

    @staticmethod
    def related(post, limit: int = 3):
        queryset = PostService.public_queryset().exclude(pk=post.pk)
        tags = [tag for tag in (post.tags or []) if isinstance(tag, str)]
        tag_q = Q()
        for tag in tags:
            tag_q |= Q(tags__contains=[tag])
        same = list(queryset.filter(Q(type=post.type) | tag_q).order_by("-published_at")[:limit])
        return same

    @staticmethod
    def count_view(post):
        from apps.content.models import PostMonthlyViews

        ContentItem.objects.filter(pk=post.pk).update(view_count=F("view_count") + 1)
        month = timezone.localdate().replace(day=1)
        updated = PostMonthlyViews.objects.filter(post=post, month=month).update(count=F("count") + 1)
        if not updated:
            from django.db import IntegrityError

            try:
                with transaction.atomic():
                    PostMonthlyViews.objects.create(post=post, month=month, count=1)
            except IntegrityError:  # another view made the row first
                PostMonthlyViews.objects.filter(post=post, month=month).update(count=F("count") + 1)

    @staticmethod
    def monthly_view_counts() -> dict:
        """views_this_month and views_last_month over all posts (R-29 a)."""
        from django.db.models import Sum

        from apps.content.models import PostMonthlyViews

        this_month = timezone.localdate().replace(day=1)
        last_month = (this_month - timezone.timedelta(days=1)).replace(day=1)
        totals = dict(PostMonthlyViews.objects.filter(month__in=[this_month, last_month]).values_list("month").annotate(total=Sum("count")).values_list("month", "total"))
        return {"views_this_month": totals.get(this_month, 0), "views_last_month": totals.get(last_month, 0)}

    @staticmethod
    def went_live(post, *, actor=None):
        """Called whenever a post goes live: sends it to subscribers once if asked (R-29 b)."""
        if not post.send_to_subscribers or post.blasts.exists():
            return None
        from apps.content.part2_services import SubscriptionService

        return SubscriptionService.blast(post, actor=actor)

    @staticmethod
    def propose_edit(post, changes: dict, *, actor, summary: str) -> "ApprovalRequest":
        """R-29 c: a change to a live post waits for approval; the live post stays as it is."""
        return ApprovalService.create(post, actor=actor, summary=summary, payload={"kind": "edit", "changes": changes})

    @staticmethod
    def apply_edit(post, changes: dict):
        from apps.content.b6_serializers import PostSerializer

        serializer = PostSerializer(post, data=changes, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        clear_home_cache()
        return post

    @staticmethod
    def submit(post, *, actor, publish_at=None) -> ApprovalRequest:
        post.clean_post_fields()
        post.status = "pending_approval"
        post.publish_at = publish_at or post.publish_at
        post.save()
        when = f" (publish {post.publish_at:%d %b %Y %H:%M})" if post.publish_at else ""
        return ApprovalService.create(post, actor=actor, summary=f"{post.get_type_display()}: {post.title}{when}", publish_at=post.publish_at)

    @staticmethod
    def apply_decision(post, *, approve: bool, publish_at=None):
        if not approve:
            post.status = "draft"
        elif publish_at and publish_at > timezone.now():
            post.status = "scheduled"
            post.publish_at = publish_at
        else:
            post.status = "published"
            post.published_at = post.published_at or timezone.now()
        post.save()
        clear_home_cache()
        if post.status == "published":
            PostService.went_live(post)

    @staticmethod
    def unpublish(post, *, actor):
        before = post.status
        post.status = "archived"
        post.save()
        clear_home_cache()
        AuditService.log_action(actor=actor, action_type="post_unpublished", target=post, before_state={"status": before}, after_state={"status": post.status})

    @staticmethod
    def pin(post, *, actor, until):
        post.pinned_until = until
        post.save()
        clear_home_cache()
        AuditService.log_action(actor=actor, action_type="post_pinned", target=post, after_state={"pinned_until": _iso(until)})

    @staticmethod
    def duplicate(post, *, actor):
        copy = ContentItem.objects.get(pk=post.pk)
        copy.pk = None
        copy.id = None
        copy.slug = None
        copy._state.adding = True
        copy.title = f"Copy of {post.title}"[:255]
        copy.status = "draft"
        copy.published_at = None
        copy.publish_at = None
        copy.pinned_until = None
        copy.is_highlighted = False
        copy.highlight_priority = None
        copy.view_count = 0
        copy.author = actor
        copy.save()
        AuditService.log_action(actor=actor, action_type="post_duplicated", target=copy, metadata={"source_id": str(post.id)})
        return copy


# --- Partners -----------------------------------------------------------------------------------


class PartnerService:
    @staticmethod
    def public(*, placement: str = "home", program_id=None):
        now = timezone.now()
        queryset = (
            Partner.objects.filter(is_active=True)
            .filter(Q(show_from__isnull=True) | Q(show_from__lte=now))
            .filter(Q(show_until__isnull=True) | Q(show_until__gt=now))
            .select_related("logo")
        )
        if placement == "home":
            queryset = queryset.filter(show_on_home=True)
        elif placement == "program":
            queryset = queryset.filter(programs__id=program_id) if program_id else queryset.none()
        return queryset.order_by("tier_rank", "order", "name").distinct()

    @staticmethod
    def payload(partner, request=None) -> dict:
        return {
            "id": str(partner.id),
            "name": partner.name,
            "short_label": partner.short_label,
            "tier": partner.tier,
            "url": partner.url,
            "logo": media_payload(partner.logo, request),
        }


# --- Scheduling ---------------------------------------------------------------------------------


def publish_due_content(now=None) -> dict:
    """Run every 5 minutes: publish scheduled posts, take down expired ones, retire ended quotes."""
    now = now or timezone.now()
    published = 0
    for post in ContentItem.objects.filter(status="scheduled", publish_at__lte=now):
        post.status = "published"
        post.published_at = post.publish_at or now
        post.save()
        PostService.went_live(post)
        published += 1
    retired = 0
    for post in ContentItem.objects.filter(status="published", unpublish_at__lte=now):
        post.status = "archived"
        post.save()
        retired += 1
    quotes = LeadershipCard.objects.filter(is_active=True, end_at__lte=now).update(is_active=False)
    pages_live = PageVersion.objects.filter(go_live_at__lte=now, go_live_at__gt=now - timezone.timedelta(minutes=10)).exists()
    if published or retired or quotes or pages_live:
        clear_home_cache()
    return {"published": published, "retired": retired, "quotes_retired": quotes, "page_went_live": pages_live}

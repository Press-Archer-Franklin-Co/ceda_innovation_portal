from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.db.models import F
from django.utils import timezone
from rest_framework import filters, generics, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.capabilities import user_has
from apps.core.permissions import HasCapability
from apps.programs.access import ProgramAccessService

from .models import ContentItem, HackathonDetail, HackathonMedia, LeadershipCard, SiteSettings, WinnerSpotlight
from .serializers import (
    ContentItemListSerializer,
    ContentItemSerializer,
    HackathonDetailSerializer,
    HackathonMediaSerializer,
    LeadershipCardSerializer,
    SiteSettingsSerializer,
    WinnerSpotlightSerializer,
)


class ContentItemViewSet(ModelViewSet):
    """
    News / announcement content items.

    Public:  GET /api/content/           — published items only
             GET /api/content/{id}/      — published item detail
             GET /api/content/highlights/ — up to 5 highlighted published items
    Staff:   POST / PATCH / DELETE (needs the content.edit capability)
    """

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "excerpt", "tags"]
    ordering_fields = ["published_at", "created_at", "category", "highlight_priority"]
    ordering = ["-published_at"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = ContentItem.objects.select_related("author")
        if not self.request.user.is_authenticated or not (
            self.request.user.is_staff or getattr(self.request.user, "is_officer", False)
        ):
            qs = qs.filter(status="published")
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return ContentItemListSerializer
        return ContentItemSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "highlights"):
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]

    def perform_create(self, serializer):
        published_at = serializer.validated_data.get("published_at")
        if published_at is None and serializer.validated_data.get("status") == "published":
            published_at = timezone.now()
        try:
            serializer.save(author=self.request.user, published_at=published_at)
        except DjangoValidationError as exc:
            raise DRFValidationError(detail=list(exc.messages))

    def perform_update(self, serializer):
        instance = self.get_object()
        published_at = serializer.validated_data.get("published_at", instance.published_at)
        if published_at is None and serializer.validated_data.get("status") == "published":
            published_at = timezone.now()
        try:
            serializer.save(published_at=published_at)
        except DjangoValidationError as exc:
            raise DRFValidationError(detail=list(exc.messages))

    @action(detail=False, methods=["get"], permission_classes=[AllowAny], url_path="highlights")
    def highlights(self, request):
        """Return up to 5 highlighted, published content items for the homepage."""
        items = ContentItem.objects.filter(
            status="published", is_highlighted=True
        ).order_by(F("highlight_priority").asc(nulls_last=True), "-published_at")[:5]
        serializer = ContentItemListSerializer(items, many=True, context={"request": request})
        return Response(serializer.data)


class HackathonDetailViewSet(ModelViewSet):
    """
    Rich content for a specific hackathon program.

    Public:  GET /api/content/hackathons/           — published details
             GET /api/content/hackathons/{id}/      — single hackathon detail
    Staff:   POST / PATCH / DELETE (needs the content.edit capability)
    """

    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.OrderingFilter]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = HackathonDetail.objects.select_related("program").prefetch_related("media")
        if not self.request.user.is_authenticated or not (
            self.request.user.is_staff or getattr(self.request.user, "is_officer", False)
        ):
            qs = qs.filter(is_published=True)
            qs = ProgramAccessService.exclude_hidden(qs, self.request.user, prefix="program__")
        program_id = self.request.query_params.get("program")
        if program_id:
            qs = qs.filter(program_id=program_id)
        return qs

    def get_serializer_class(self):
        return HackathonDetailSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]

    def perform_create(self, serializer):
        program_id = self.request.data.get("program")
        if not program_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"program": ["This field is required."]})
        from apps.programs.models import Program
        try:
            program = Program.objects.get(id=program_id)
        except Program.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"program": ["Program not found."]})
        serializer.save(program=program)


class HackathonMediaViewSet(ModelViewSet):
    """Upload / manage media files for a hackathon detail."""

    serializer_class = HackathonMediaSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return HackathonMedia.objects.select_related("hackathon_detail")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]


class SiteSettingsView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/content/site-settings/  — public, returns hero video URL + muted flag
    PATCH /api/content/site-settings/ — staff only, accepts multipart (hero_video file)
    """
    serializer_class = SiteSettingsSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]

    def get_object(self):
        return SiteSettings.get()

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.data.get("hero_video_clear") in (True, "true", "1"):
            if instance.hero_video:
                instance.hero_video.delete(save=False)
                instance.hero_video = None
                instance.save(update_fields=["hero_video"])
            return Response(self.get_serializer(instance).data)
        if "hero_video" in request.FILES and instance.hero_video:
            instance.hero_video.delete(save=False)
        before = dict(self.get_serializer(instance).data)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        after = dict(serializer.data)
        # U9: every settings change is in the audit log with before and after (changed fields only).
        changed = [name for name in after if before.get(name) != after.get(name)]
        if changed:
            from apps.audit.services import AuditService

            AuditService.log_raw_action(
                actor=request.user, action_type="platform_site_settings_updated", target_model="SiteSettings", target_id=str(instance.pk),
                before_state={name: before.get(name) for name in changed}, after_state={name: after.get(name) for name in changed}, label="Site settings",
            )
        return Response(serializer.data)


class LeadershipCardViewSet(ModelViewSet):
    """
    Leadership / executive testimonial cards for the homepage carousel.

    Public:   GET /api/content/leadership/         — active cards in sort order
    Staff:    POST / PATCH / DELETE (needs the content.edit capability)
    Reorder:  POST /api/content/leadership/reorder/ — [{id, sort_order}, ...]
    """

    serializer_class = LeadershipCardSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.OrderingFilter]
    ordering = ["sort_order", "created_at"]

    def get_queryset(self):
        qs = LeadershipCard.objects.select_related("created_by")
        if not self.request.user.is_authenticated or not (
            self.request.user.is_staff or getattr(self.request.user, "is_officer", False)
        ):
            now = timezone.now()
            qs = qs.filter(is_active=True).filter(
                models.Q(start_at__isnull=True) | models.Q(start_at__lte=now)
            ).filter(
                models.Q(end_at__isnull=True) | models.Q(end_at__gt=now)
            ).exclude(is_official=True, approved_at__isnull=True)
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]

    def perform_create(self, serializer):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        try:
            card = serializer.save(created_by=self.request.user)
        except DjangoValidationError as exc:
            raise DRFValidationError(detail=list(exc.messages))
        self._ask_approval_if_official(card, changed=True)

    def _ask_approval_if_official(self, card, *, changed):
        """B6 part 2: an official's quote shows only after approval; a changed quote needs it again."""
        if not card.is_official or not changed:
            return
        from apps.content.services import ApprovalService, clear_home_cache

        LeadershipCard.objects.filter(pk=card.pk).update(approved_at=None)
        ApprovalService.create(card, actor=self.request.user, summary=f"Quote from {card.full_name}")
        clear_home_cache()

    def perform_update(self, serializer):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        instance = self.get_object()
        if "photo" in self.request.FILES and instance.photo:
            instance.photo.delete(save=False)
        before = (instance.quote, instance.translations, instance.is_official, instance.full_name)
        try:
            card = serializer.save()
        except DjangoValidationError as exc:
            raise DRFValidationError(detail=list(exc.messages))
        self._ask_approval_if_official(card, changed=before != (card.quote, card.translations, card.is_official, card.full_name))

    def perform_destroy(self, instance):
        if instance.photo:
            instance.photo.delete(save=False)
        instance.delete()

    @action(detail=False, methods=["post"], permission_classes=[HasCapability.of("content.edit")], url_path="reorder")
    def reorder(self, request):
        """
        Bulk-update sort_order.  Body: [{"id": "<uuid>", "sort_order": <int>}, ...]
        """
        items = request.data
        if not isinstance(items, list):
            return Response({"detail": "Expected a list."}, status=status.HTTP_400_BAD_REQUEST)
        for item in items:
            try:
                LeadershipCard.objects.filter(id=item["id"]).update(sort_order=int(item["sort_order"]))
            except (KeyError, ValueError, TypeError):
                return Response({"detail": "Each item must have 'id' and 'sort_order'."}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset()
        return Response(LeadershipCardSerializer(qs, many=True, context={"request": request}).data)


class WinnerSpotlightViewSet(ModelViewSet):
    """
    Featured winners.

    Public:  GET /api/content/winners/          — all winners (optionally ?featured=true)
    Staff:   POST / PATCH / DELETE (needs the content.edit capability)
    """

    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.OrderingFilter]
    ordering = ["-year", "position"]

    def get_queryset(self):
        qs = WinnerSpotlight.objects.select_related("program")
        if not user_has(self.request.user, "content.edit"):
            qs = ProgramAccessService.exclude_hidden(qs, self.request.user, prefix="program__")
        featured = self.request.query_params.get("featured")
        if featured and featured.lower() == "true":
            qs = qs.filter(is_featured=True)
        program_id = self.request.query_params.get("program")
        if program_id:
            qs = qs.filter(program_id=program_id)
        year = self.request.query_params.get("year")
        if year:
            qs = qs.filter(year=year)
        return qs

    def get_serializer_class(self):
        return WinnerSpotlightSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasCapability.of("content.edit")()]


class PublicStatsView(generics.GenericAPIView):
    """Live public stats for the homepage — no auth required."""
    permission_classes = [AllowAny]

    def get(self, request):
        from apps.programs.models import Program
        from apps.accounts.models import User
        from django.db.models import Q

        settings = SiteSettings.get()

        innovators = User.objects.filter(
            is_active=True, roles__code="innovator"
        ).distinct().count()
        if innovators == 0:
            innovators = User.objects.filter(is_active=True, is_staff=False).count()

        challenges = Program.objects.exclude(status__in=["draft"]).exclude(program_type__code="idea").count()

        stats = [
            {
                "key": "innovators",
                "label": "Registered Innovators",
                "value": f"{innovators:,}",
                "description": "Active members on the platform",
            },
            {
                "key": "challenges",
                "label": "Challenges Hosted",
                "value": str(challenges),
                "description": "Innovation programs run to date",
            },
        ]

        if settings.prize_money_label:
            stats.append({
                "key": "prize_money",
                "label": "Prize Money Awarded",
                "value": settings.prize_money_label,
                "description": "Total prizes distributed",
            })

        if settings.solutions_deployed:
            stats.append({
                "key": "solutions",
                "label": "Solutions Deployed",
                "value": str(settings.solutions_deployed),
                "description": "Ideas turned into real products",
            })

        return Response({"stats": stats})

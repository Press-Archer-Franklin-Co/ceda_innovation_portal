"""B6 part 2 endpoints: stories and consent, subscriptions and blasts, site search."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.content.b6_serializers import BilingualAttrField
from apps.content.b6_views import PublicContentThrottle, _lang
from apps.content.models import ContentItem, Story, Subscriber
from apps.content.part2_services import StoryService, SubscriptionService, site_search
from apps.core.api import api_success
from apps.core.permissions import IPRateThrottle, IsOfficerOrAdmin
from apps.media_library.models import MediaAsset

STAFF_TAGS = ["Website content"]
PUBLIC_TAGS = ["Website content (public)"]


class SubscribeThrottle(IPRateThrottle):
    scope = "subscribe"


class StorySerializer(serializers.ModelSerializer):
    quote = BilingualAttrField("quote", max_length=200, required=False)
    business = BilingualAttrField("business", max_length=255, required=False)
    place = BilingualAttrField("place", max_length=255, required=False)
    cover_id = serializers.PrimaryKeyRelatedField(source="cover", queryset=MediaAsset.objects.filter(kind__in=["image", "video"]), required=False, allow_null=True)

    class Meta:
        model = Story
        fields = (
            "id", "person_name", "business", "place", "sector", "quote", "stats", "cover_id", "shows_on", "program", "user", "submission",
            "is_featured", "status", "consent_status", "consent_requested_at", "consent_decided_at", "published_at", "created_at", "updated_at",
        )
        read_only_fields = ("id", "consent_status", "consent_requested_at", "consent_decided_at", "published_at", "created_at", "updated_at")

    def validate_shows_on(self, value):
        if not isinstance(value, list) or any(item not in Story.PLACES for item in value):
            raise serializers.ValidationError(f"Use some of: {', '.join(Story.PLACES)}.")
        return list(dict.fromkeys(value))

    def validate_stats(self, value):
        if not isinstance(value, list) or len(value) > 4 or any(not isinstance(item, dict) or "value" not in item for item in value):
            raise serializers.ValidationError('Up to 4 results like {"value": "40", "label": {"en": "jobs", "tn": "..."}}.')
        return value

    def _apply(self, instance, validated):
        translations = dict(instance.translations or {})
        for key in list(validated):
            if key.startswith("__text__"):
                attr, value = key[len("__text__"):], validated.pop(key)
                if "en" in value:
                    setattr(instance, attr, value.get("en") or "")
                if "tn" in value:
                    bucket = dict(translations.get("tn") or {})
                    if value.get("tn"):
                        bucket[attr] = value["tn"]
                    else:
                        bucket.pop(attr, None)
                    translations["tn"] = bucket
        instance.translations = {lang: bucket for lang, bucket in translations.items() if bucket}
        for key, value in validated.items():
            setattr(instance, key, value)
        return StoryService.save(instance, actor=self.context["request"].user)

    def create(self, validated_data):
        return self._apply(Story(created_by=self.context["request"].user), validated_data)

    def update(self, instance, validated_data):
        return self._apply(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["can_publish"] = not instance.user_id or instance.consent_status == Story.Consent.GIVEN
        return data


@extend_schema(tags=STAFF_TAGS)
class StoryViewSet(viewsets.ModelViewSet):
    """Stories (3.11). At most 3 featured. A story about a portal user needs their consent to publish."""

    permission_classes = [IsOfficerOrAdmin]
    serializer_class = StorySerializer
    queryset = Story.objects.select_related("sector", "program", "cover", "user")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        story = serializer.save()
        return api_success(data=self.get_serializer(story).data, status_code=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=kwargs.pop("partial", False))
        serializer.is_valid(raise_exception=True)
        return api_success(data=self.get_serializer(serializer.save()).data)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return api_success(data=None, message="Story deleted.")

    @extend_schema(summary="Ask the person in the story for consent", request=None)
    @action(detail=True, methods=["post"], url_path="consent-request")
    def consent_request(self, request, pk=None):
        story = StoryService.request_consent(self.get_object(), actor=request.user)
        return api_success(data=self.get_serializer(story).data, message="Consent requested.")


class ConsentAnswerSerializer(serializers.Serializer):
    agree = serializers.BooleanField()


class MyConsentListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Innovator"], summary="Stories CEDA asked to share about me", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        stories = Story.objects.filter(user=request.user).exclude(consent_status__in=[Story.Consent.NOT_NEEDED, Story.Consent.NOT_ASKED])
        lang = _lang(request)
        return api_success(
            data=[{"id": str(story.id), "status": story.consent_status, "requested_at": story.consent_requested_at, "story": StoryService.card(story, lang, request)} for story in stories]
        )


class MyConsentAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Innovator"], summary="Say yes or no to sharing a story about me", request=ConsentAnswerSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, story_id):
        story = get_object_or_404(Story, id=story_id, user=request.user)
        serializer = ConsentAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        story = StoryService.record_consent(story, user=request.user, agree=serializer.validated_data["agree"])
        return api_success(data={"id": str(story.id), "status": story.consent_status})


class PublicStoryListView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="Published stories",
        parameters=[OpenApiParameter("featured", OpenApiTypes.BOOL), OpenApiParameter("shows_on", OpenApiTypes.STR, enum=list(Story.PLACES)), OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        queryset = StoryService.public_queryset()
        if str(request.query_params.get("featured", "")).lower() in {"1", "true", "yes"}:
            queryset = queryset.filter(is_featured=True)
        place = request.query_params.get("shows_on")
        if place:
            queryset = queryset.filter(shows_on__contains=[place])
        lang = _lang(request)
        return api_success(data=[StoryService.card(story, lang, request) for story in queryset[:50]])


# --- Subscriptions --------------------------------------------------------------------------


class SubscribeSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32, help_text="For WhatsApp updates.")
    topics = serializers.ListField(child=serializers.ChoiceField(choices=Subscriber.TOPICS), required=False)
    language = serializers.ChoiceField(choices=("en", "tn"), required=False, default="en")


class PublicSubscribeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SubscribeThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Sign up for updates", description="Email needs confirming (double opt-in). The answer is the same whether or not the address was already signed up.", request=SubscribeSerializer, responses={201: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        SubscriptionService.subscribe(email=data.get("email", ""), phone=data.get("phone", ""), topics=data.get("topics"), language=data.get("language", "en"))
        message = "Check your email to confirm." if data.get("email") else "You are signed up."
        return api_success(data={"confirm_by_email": bool(data.get("email"))}, message=message, status_code=status.HTTP_201_CREATED)


class PublicConfirmSubscriptionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SubscribeThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Confirm an email sign-up", responses=OpenApiTypes.OBJECT)
    def get(self, request, token):
        subscriber = SubscriptionService.confirm(token)
        if subscriber is None:
            return api_success(data={"confirmed": False}, message="This link is not valid.", status_code=status.HTTP_404_NOT_FOUND)
        return api_success(data={"confirmed": True}, message="You will get CEDA updates.")


class PublicUnsubscribeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SubscribeThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Stop updates", responses=OpenApiTypes.OBJECT)
    def get(self, request, token):
        subscriber = SubscriptionService.unsubscribe(token)
        if subscriber is None:
            return api_success(data={"unsubscribed": False}, message="This link is not valid.", status_code=status.HTTP_404_NOT_FOUND)
        return api_success(data={"unsubscribed": True}, message="You will not get more updates.")


class SubscriberCountsView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=STAFF_TAGS, summary="Subscribers by channel", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=SubscriptionService.counts())


class PostBlastView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=STAFF_TAGS, summary="Send a published post to subscribers now", description="Email goes out in the background; WhatsApp is recorded as pending until a provider exists.", request=None, responses={202: OpenApiTypes.OBJECT})
    def post(self, request, post_id):
        post = get_object_or_404(ContentItem, id=post_id)
        blast = SubscriptionService.blast(post, actor=request.user)
        return api_success(data={"id": str(blast.id), "whatsapp_pending": blast.whatsapp_pending}, message="Sending.", status_code=status.HTTP_202_ACCEPTED)


# --- Search -----------------------------------------------------------------------------------


class PublicSearchView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="Search the site (1.3)",
        description="{q, total, groups: {challenges, stories, posts, help}}, at most 4 each. Searches with no results are logged for staff.",
        parameters=[OpenApiParameter("q", OpenApiTypes.STR, required=True), OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=site_search(request.query_params.get("q", ""), lang=_lang(request)))

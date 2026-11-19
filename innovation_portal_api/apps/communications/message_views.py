"""B3 message endpoints. Applicants see only their own threads; internal notes never appear."""

from django.http import Http404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.communications.messaging import MessagingService, message_payload
from apps.communications.models import Message, MessageThread
from apps.core.api import api_success
from apps.core.permissions import IsOfficerOrAdmin


class ApplicantMessageSerializer(serializers.Serializer):
    body = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    attachments = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=5, help_text="MediaAsset ids you uploaded (photo, voice note, video, document).")


class OfficerMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    reply_by = serializers.DateField(required=False, allow_null=True, help_text="Makes this a question with a reply-by date.")
    attachments = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=5)


def _my_idea(user, idea_id):
    """The signed-in person's submission or draft with this id, else 404 (never 403, so ids do not leak)."""
    from apps.submissions.models import ApplicationDraft, Submission

    submission = Submission.objects.filter(id=idea_id, innovator=user).first()
    if submission is not None:
        return submission
    draft = ApplicationDraft.objects.filter(id=idea_id, innovator=user).first()
    if draft is not None:
        return draft
    raise Http404


def _thread_payload(target, *, applicant: bool, request) -> dict:
    thread = getattr(target, "message_thread", None)
    messages = thread.messages.select_related("author").prefetch_related("attachments") if thread else Message.objects.none()
    question = thread.open_question if thread else None
    return {
        "idea_id": str(target.id),
        "open_question": message_payload(question, viewer_is_applicant=applicant, request=request) if question else None,
        "results": [message_payload(message, viewer_is_applicant=applicant, request=request) for message in messages],
    }


class MyIdeaMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Messages"], summary="Messages about one of my ideas (2.4)", responses=OpenApiTypes.OBJECT)
    def get(self, request, idea_id):
        target = _my_idea(request.user, idea_id)
        return api_success(data=_thread_payload(target, applicant=True, request=request))

    @extend_schema(
        tags=["Messages"],
        summary="Reply to CEDA about one of my ideas",
        description="Text and/or attachments you uploaded (POST /api/media/ first; voice notes as audio, WebM is fine). Answers the open question.",
        request=ApplicantMessageSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request, idea_id):
        target = _my_idea(request.user, idea_id)
        serializer = ApplicantMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = MessagingService.applicant_message(target, author=request.user, body=serializer.validated_data.get("body", ""), attachments=serializer.validated_data.get("attachments"))
        return api_success(data=message_payload(message, viewer_is_applicant=True, request=request), message="Sent.", status_code=status.HTTP_201_CREATED)


class MyIdeaMessagesReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Messages"], summary="Mark CEDA's messages about this idea as read", request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, idea_id):
        target = _my_idea(request.user, idea_id)
        thread = getattr(target, "message_thread", None)
        updated = MessagingService.mark_read(thread, applicant=True) if thread else 0
        return api_success(data={"updated": updated})


class MyRecentMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Messages"], summary="Latest message per idea and the total unread (2.2 side panel)", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from django.db.models import Q

        results, total_unread = [], 0
        threads = MessageThread.objects.filter(Q(submission__innovator=request.user) | Q(draft__innovator=request.user)).select_related("submission", "draft")
        for thread in threads:
            latest = thread.messages.select_related("author").prefetch_related("attachments").order_by("-created_at").first()
            if latest is None:
                continue
            unread = thread.messages.filter(read_by_applicant_at__isnull=True).exclude(author_role=Message.AuthorRole.APPLICANT).count()
            total_unread += unread
            target = thread.submission or thread.draft
            results.append(
                {
                    "idea_id": str(target.id),
                    "reference": target.reference_number,
                    "title": target.title,
                    "unread": unread,
                    "has_open_question": bool(thread.open_question_id),
                    "latest": message_payload(latest, viewer_is_applicant=True, request=request),
                }
            )
        results.sort(key=lambda item: item["latest"]["created_at"], reverse=True)
        return api_success(data={"total_unread": total_unread, "results": results})


class SubmissionMessagesView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    def _submission(self, submission_id):
        from apps.submissions.models import Submission

        submission = Submission.objects.filter(id=submission_id).select_related("innovator").first()
        if submission is None:
            raise Http404
        return submission

    @extend_schema(tags=["Messages"], summary="Messages with the applicant (3.3)", responses=OpenApiTypes.OBJECT)
    def get(self, request, submission_id):
        submission = self._submission(submission_id)
        thread = getattr(submission, "message_thread", None)
        if thread:
            MessagingService.mark_read(thread, applicant=False)
        return api_success(data=_thread_payload(submission, applicant=False, request=request))

    @extend_schema(
        tags=["Messages"],
        summary="Message the applicant",
        description="With reply_by it is a question: the applicant is asked to answer by then, and the submission moves to "
        "'more information needed' when its current step allows returning it. Sent on the applicant's chosen channels.",
        request=OfficerMessageSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request, submission_id):
        submission = self._submission(submission_id)
        serializer = OfficerMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        message = MessagingService.officer_message(submission, author=request.user, body=data["body"], reply_by=data.get("reply_by"), attachments=data.get("attachments"))
        submission.refresh_from_db()
        payload = message_payload(message, viewer_is_applicant=False, request=request)
        payload["submission_status"] = submission.current_status
        return api_success(data=payload, message="Sent.", status_code=status.HTTP_201_CREATED)

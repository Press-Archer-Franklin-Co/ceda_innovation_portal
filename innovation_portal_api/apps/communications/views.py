from rest_framework import generics, status
from rest_framework.response import Response

from apps.accounts.models import User
from apps.communications.models import CommunicationLog
from apps.communications.serializers import CommunicationLogSerializer
from apps.communications.services import CommunicationService
from apps.submissions.models import Submission


class SendCommunicationView(generics.GenericAPIView):
    serializer_class = CommunicationLogSerializer

    def post(self, request):
        submission = Submission.objects.filter(id=request.data.get("related_submission")).first()
        recipient = User.objects.get(id=request.data["recipient"])
        log = CommunicationService.log_communication(
            recipient=recipient,
            channel=request.data["channel"],
            body=request.data["rendered_body"],
            subject=request.data.get("subject", ""),
            sent_by=request.user,
            submission=submission,
            program=submission.program if submission else None,
        )
        return Response(self.get_serializer(log).data, status=status.HTTP_201_CREATED)


class CommunicationLogListView(generics.ListAPIView):
    serializer_class = CommunicationLogSerializer

    def get_queryset(self):
        return CommunicationLog.objects.all().order_by("-created_at")


class SubmissionCommunicationListView(generics.ListAPIView):
    serializer_class = CommunicationLogSerializer

    def get_queryset(self):
        return CommunicationLog.objects.filter(related_submission_id=self.kwargs["submission_id"]).order_by("-created_at")

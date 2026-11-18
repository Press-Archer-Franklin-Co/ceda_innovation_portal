from django.http import Http404
from rest_framework import generics
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema

from apps.submissions.models import Submission
from apps.tracking.serializers import PublicSubmissionTrackingSerializer


@extend_schema(
    tags=["Tracking"],
    summary="Track submission by reference number",
    description="Returns current status, timestamps, and full status history for a known submission reference number.",
)
class SubmissionTrackingView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicSubmissionTrackingSerializer
    lookup_field = "reference_number"
    lookup_url_kwarg = "reference_number"

    def get_queryset(self):
        return Submission.objects.filter(reference_number__gt="").select_related("workflow_instance__current_step").prefetch_related("workflow_instance__action_logs__step", "workflow_instance__action_logs__performed_by")

    def get_object(self):
        reference_number = self.kwargs[self.lookup_url_kwarg]
        submission = (
            self.get_queryset()
            .filter(reference_number=reference_number)
            .order_by("-submitted_at", "-created_at")
            .first()
        )
        if submission is None:
            raise Http404
        self.check_object_permissions(self.request, submission)
        return submission

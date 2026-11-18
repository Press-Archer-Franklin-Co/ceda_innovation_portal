from rest_framework import generics, status
from rest_framework.response import Response

from apps.core.permissions import IsOfficerOrAdmin
from apps.screening.models import ScreeningReview
from apps.screening.serializers import ScreeningReviewSerializer
from apps.screening.services import ScreeningService
from apps.submissions.models import Submission


class ScreeningCreateView(generics.GenericAPIView):
    serializer_class = ScreeningReviewSerializer
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = ScreeningService.perform_screening(submission=submission, actor=request.user, data=serializer.validated_data)
        return Response(ScreeningReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class ScreeningListView(generics.ListAPIView):
    serializer_class = ScreeningReviewSerializer
    permission_classes = [IsOfficerOrAdmin]

    def get_queryset(self):
        return ScreeningReview.objects.filter(submission_id=self.kwargs["submission_id"]).order_by("-created_at")

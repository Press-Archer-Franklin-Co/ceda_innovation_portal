import mimetypes

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils.http import content_disposition_header
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import DocumentType
from apps.documents.models import SubmissionDocument
from apps.documents.permissions import CanAccessDocument
from apps.documents.serializers import SubmissionDocumentSerializer
from apps.documents.services import DocumentService
from apps.programs.access import ProgramAccessService
from apps.core.api import api_success
from apps.submissions.models import ApplicationDraft
from apps.submissions.selectors import SubmissionSelector


class SubmissionDocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = SubmissionDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        accessible_submissions = SubmissionSelector.for_user(self.request.user)
        submission = get_object_or_404(accessible_submissions, id=self.kwargs["submission_id"])
        return SubmissionDocument.objects.filter(
            submission=submission,
            is_active=True,
            is_current=True,
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if request.query_params.get("grouped") == "true":
            ctx = {"request": request}
            grouped = {
                key: SubmissionDocumentSerializer(items, many=True, context=ctx).data
                for key, items in DocumentService.grouped_documents(queryset).items()
            }
            return api_success(data={"grouped_by_field": grouped})
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        accessible_submissions = SubmissionSelector.for_user(self.request.user)
        submission = get_object_or_404(accessible_submissions, id=self.kwargs["submission_id"])
        upload = self.request.FILES.get("file")
        DocumentService.create_document(
            serializer=serializer,
            actor=self.request.user,
            submission=submission,
            upload=upload,
            replace_document_id=self.request.data.get("replace_document_id"),
        )


class DraftDocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = SubmissionDocumentSerializer
    permission_classes = [IsAuthenticated]

    def _get_draft(self):
        return get_object_or_404(ApplicationDraft, id=self.kwargs["draft_id"], innovator=self.request.user)

    def get_queryset(self):
        draft = self._get_draft()
        return SubmissionDocument.objects.filter(application_draft=draft)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if request.query_params.get("grouped") == "true":
            ctx = {"request": request}
            grouped = {
                key: SubmissionDocumentSerializer(items, many=True, context=ctx).data
                for key, items in DocumentService.grouped_documents(queryset).items()
            }
            return api_success(data={"grouped_by_field": grouped})
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        draft = self._get_draft()
        ProgramAccessService.assert_can_enter(draft.program, self.request.user)
        upload = self.request.FILES.get("file")
        DocumentService.create_document(
            serializer=serializer,
            actor=self.request.user,
            application_draft=draft,
            upload=upload,
            replace_document_id=self.request.data.get("replace_document_id"),
        )


class SubmissionDocumentDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = SubmissionDocumentSerializer
    queryset = SubmissionDocument.objects.all()
    permission_classes = [IsAuthenticated, CanAccessDocument]

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        target = document.submission or document.application_draft or document
        from apps.audit.services import AuditService

        AuditService.log_action(
            actor=request.user if request.user.is_authenticated else None,
            action_type="document_deleted",
            target=target,
            metadata={"document_id": str(document.id), "field_key": document.field_key},
        )
        return super().destroy(request, *args, **kwargs)


class SubmissionDocumentDownloadView(APIView):
    """Authenticated, access-controlled document view/download."""

    permission_classes = [IsAuthenticated, CanAccessDocument]

    def get(self, request, pk):
        document = get_object_or_404(SubmissionDocument, pk=pk, is_active=True)
        self.check_object_permissions(request, document)

        disposition = "inline" if request.query_params.get("disposition") == "inline" else "attachment"
        filename = document.original_filename or "document"

        if document.document_type == DocumentType.URL:
            if not document.external_url:
                raise Http404("Document has no external URL.")
            self._log_view(request, document, disposition)
            return HttpResponseRedirect(document.external_url)

        if not document.has_local_copy:
            raise Http404("Document has no file.")

        content_type = document.mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        self._log_view(request, document, disposition)

        prefix = settings.DOCUMENT_X_ACCEL_REDIRECT_PREFIX
        if prefix:
            response = HttpResponse(content_type=content_type)
            response["X-Accel-Redirect"] = f"{prefix.rstrip('/')}/{document.file.name}"
        else:
            response = FileResponse(document.file.open("rb"), content_type=content_type)
        response["Content-Disposition"] = content_disposition_header(disposition == "attachment", filename)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response

    @staticmethod
    def _log_view(request, document, disposition):
        from apps.audit.services import AuditService

        AuditService.log_action(
            actor=request.user,
            action_type="document_viewed",
            target=document.submission or document.application_draft or document,
            metadata={
                "document_id": str(document.id),
                "disposition": disposition,
            },
        )


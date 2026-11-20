"""Standalone forms (/api/forms/, B4): list, create, draft document, publish, translations, export."""

from django.db.models import Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.i18n import normalize_language
from apps.core.permissions import HasCapability, IPRateThrottle
from apps.programs.form_builder import (
    FormDocumentService,
    FormLibraryService,
    FormPublishService,
    FormResponseExport,
    FormTranslationService,
    TranslationProviderNotConfigured,
    load_form,
)
from apps.programs.form_schema import build_form_schema
from apps.programs.form_serializers import (
    AttachFormSerializer,
    DuplicateFormSerializer,
    FormCreateSerializer,
    FormDocumentSerializer,
    FormListItemSerializer,
    FormTemplateSerializer,
    FormUpdateSerializer,
    FormVersionSummarySerializer,
    TranslationReviewRequestSerializer,
    TranslationsWriteSerializer,
    TranslationSuggestSerializer,
)
from apps.programs.models import Program, SubmissionForm

TAGS = ["Forms"]


class PublishedFormThrottle(IPRateThrottle):
    scope = "form_published"


def _form(form_id) -> SubmissionForm:
    return get_object_or_404(SubmissionForm, id=form_id)


def _detail(form: SubmissionForm) -> dict:
    form = FormLibraryService.annotated(SubmissionForm.objects.filter(id=form.id)).get()
    return FormListItemSerializer(form).data


class FormListCreateView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="List forms",
        description="Forms list (3.4): {results: [...], counts: {all, draft, live, closed, archived}}. "
        "counts follow the search but not the status filter (for the tabs; all leaves out archived). "
        "Templates are left out unless is_template=true.",
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, enum=[choice for choice, _ in SubmissionForm.Status.choices]),
            OpenApiParameter("search", OpenApiTypes.STR, description="Matches the form name or a linked programme title."),
            OpenApiParameter("is_template", OpenApiTypes.BOOL),
        ],
        responses=inline_serializer(
            "FormList",
            fields={"results": FormListItemSerializer(many=True), "counts": serializers.DictField(child=serializers.IntegerField())},
        ),
    )
    def get(self, request):
        queryset = SubmissionForm.objects.filter(is_template=str(request.query_params.get("is_template", "")).lower() in {"1", "true", "yes"})
        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = SubmissionForm.objects.filter(
                id__in=queryset.filter(Q(title__icontains=search) | Q(program__title__icontains=search)).values("id")
            )
        counts = FormLibraryService.status_counts(queryset)
        status_value = request.query_params.get("status")
        if status_value:
            queryset = queryset.filter(status=status_value)
        else:
            queryset = queryset.exclude(status=SubmissionForm.Status.ARCHIVED)
        queryset = FormLibraryService.annotated(queryset).order_by("-updated_at")
        return api_success(data={"results": FormListItemSerializer(queryset, many=True).data, "counts": counts})

    @extend_schema(
        tags=TAGS,
        summary="Create a form",
        description="Start from a template, from scratch (one empty step) or as a copy of another form. "
        "With program_id the new form is linked to that programme straight away.",
        request=FormCreateSerializer,
        responses={201: FormListItemSerializer, 400: OpenApiResponse(description="Validation error")},
    )
    def post(self, request):
        serializer = FormCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        form = FormLibraryService.create(
            start=data["start"],
            name=data["name"],
            actor=request.user,
            source=data["source"],
            program=data["program"],
            languages=data.get("languages"),
        )
        return api_success(data=_detail(form), message="Form created.", status_code=status.HTTP_201_CREATED)


class FormTemplateListView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(tags=TAGS, summary="List form templates", responses=FormTemplateSerializer(many=True))
    def get(self, request):
        queryset = FormLibraryService.annotated(SubmissionForm.objects.filter(is_template=True).exclude(status=SubmissionForm.Status.ARCHIVED)).order_by("title")
        return api_success(data=FormTemplateSerializer(queryset, many=True).data)


class FormDetailView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(tags=TAGS, summary="Get a form's summary", responses=FormListItemSerializer)
    def get(self, request, form_id):
        return api_success(data=_detail(_form(form_id)))

    @extend_schema(
        tags=TAGS,
        summary="Rename a form, change its languages, or open/close it",
        request=FormUpdateSerializer,
        responses=FormListItemSerializer,
    )
    def patch(self, request, form_id):
        form = _form(form_id)
        serializer = FormUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if form.status == SubmissionForm.Status.ARCHIVED:
            return Response({"success": False, "message": "This form is archived.", "errors": {"detail": "This form is archived."}}, status=400)
        if "status" in data and form.latest_version is None:
            return Response({"success": False, "message": "Publish the form first.", "errors": {"status": "Publish the form first."}}, status=400)
        before = {"title": form.title, "languages": form.languages, "status": form.status}
        if "name" in data:
            form.title = data["name"]
        if "languages" in data:
            form.languages = data["languages"]
        if "status" in data:
            form.status = data["status"]
        form.save()
        AuditService.log_action(
            actor=request.user,
            action_type="form_updated",
            target=form,
            before_state=before,
            after_state={"title": form.title, "languages": form.languages, "status": form.status},
        )
        return api_success(data=_detail(form))


class FormDraftView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Get the whole draft form as one document",
        description="Steps (sections), rows, fields, options, rules, conditions and every text as {en, tn}.",
        responses=FormDocumentSerializer,
    )
    def get(self, request, form_id):
        form = load_form(_form(form_id).id)
        return api_success(data={**build_form_schema(form), "status": form.status, "version": form.version})

    @extend_schema(
        tags=TAGS,
        summary="Save the whole draft form",
        description="Takes the same document GET returns and saves it in one transaction: creates, updates, "
        "reorders and deletes steps, fields and options. Items are matched by id, then by step code or field key. "
        "Plain strings are taken as English. Errors come back as a list of {path, message}.",
        request=FormDocumentSerializer,
        responses={200: FormDocumentSerializer, 400: OpenApiResponse(description="{errors: [{path, message}]}")},
    )
    def put(self, request, form_id):
        form = _form(form_id)
        document = FormDocumentService.save_document(form, request.data, actor=request.user)
        form.refresh_from_db()
        return api_success(data={**document, "status": form.status, "version": form.version}, message="Draft saved.")


class FormPublishView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Publish the draft as a new version",
        description="Checks the draft first: every question has a label, every choice question has options, "
        "conditions point at questions in this form, and every text has Setswana when tn is one of the form's "
        "languages. If anything is wrong nothing is published and the problems are returned.",
        request=None,
        responses={
            201: FormVersionSummarySerializer,
            400: inline_serializer(
                "FormPublishProblems",
                fields={"problems": serializers.ListField(child=serializers.DictField(), help_text="{code, message, step?, field?, option?, language?}")},
            ),
        },
    )
    def post(self, request, form_id):
        version, problems = FormPublishService.publish(_form(form_id), actor=request.user)
        if problems:
            return Response(
                {"success": False, "message": "The form was not published.", "errors": {"problems": problems}, "problems": problems},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return api_success(data=FormVersionSummarySerializer(version).data, message="Form published.", status_code=status.HTTP_201_CREATED)


class FormPublishCheckView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="List what would stop the draft from being published",
        responses=inline_serializer("FormPublishCheck", fields={"problems": serializers.ListField(child=serializers.DictField())}),
    )
    def get(self, request, form_id):
        return api_success(data={"problems": FormPublishService.problems(load_form(_form(form_id).id))})


class FormVersionListView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(tags=TAGS, summary="List a form's published versions", responses=FormVersionSummarySerializer(many=True))
    def get(self, request, form_id):
        versions = _form(form_id).versions.select_related("published_by").order_by("-number")
        return api_success(data=FormVersionSummarySerializer(versions, many=True).data)


class PublishedFormView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublishedFormThrottle]

    @extend_schema(
        tags=TAGS,
        summary="Get the published form for applicants",
        description="The latest published version in one language (English when a text has no translation). "
        "Draft changes are never shown. 404 when the form was never published, is archived, or is a template.",
        parameters=[OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])],
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiResponse(description="Not published")},
    )
    def get(self, request, form_id):
        form = get_object_or_404(SubmissionForm.objects.exclude(status=SubmissionForm.Status.ARCHIVED).exclude(is_template=True), id=form_id)
        lang = normalize_language(request.query_params.get("lang")) or "en"
        if lang == "all":
            lang = "en"
        document = FormPublishService.published_document(form, lang)
        if document is None:
            return Response({"success": False, "message": "This form has not been published.", "errors": {"detail": "Not published."}}, status=404)
        return api_success(data=document)


class FormTranslationsView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="List every text of a form with its Setswana",
        description="One row per text: key, where it appears, en, tn and missing (English but no Setswana).",
        responses=inline_serializer(
            "FormTranslationRow",
            many=True,
            fields={
                "key": serializers.CharField(),
                "where": serializers.CharField(),
                "en": serializers.CharField(),
                "tn": serializers.CharField(),
                "missing": serializers.BooleanField(),
            },
        ),
    )
    def get(self, request, form_id):
        rows = FormTranslationService.rows(load_form(_form(form_id).id))
        return api_success(data={"rows": rows, "missing_count": sum(1 for row in rows if row["missing"])})

    @extend_schema(
        tags=TAGS,
        summary="Save a batch of translations",
        description='{"rows": [{"key": "field.idea_name.label", "tn": "..."}]}. en may be sent too. Saves to the draft.',
        request=TranslationsWriteSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, form_id):
        serializer = TranslationsWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = load_form(_form(form_id).id)
        rows = FormTranslationService.save_rows(form, serializer.validated_data["rows"], actor=request.user)
        return api_success(data={"rows": rows, "missing_count": sum(1 for row in rows if row["missing"])}, message="Translations saved.")


class FormTranslationSuggestView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Suggest Setswana for missing texts",
        description="Suggestions only; nothing is saved. 501 when no translation provider is configured.",
        request=TranslationSuggestSerializer,
        responses={200: OpenApiTypes.OBJECT, 501: OpenApiResponse(description="No translation provider configured")},
    )
    def post(self, request, form_id):
        serializer = TranslationSuggestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = load_form(_form(form_id).id)
        try:
            suggestions = FormTranslationService.suggest(form, keys=serializer.validated_data.get("keys"))
        except TranslationProviderNotConfigured:
            message = "Automatic Setswana suggestions are not set up on this server. Type the Setswana text, or ask a reviewer."
            return Response({"success": False, "message": message, "errors": {"detail": message, "code": "translation_provider_not_configured"}}, status=501)
        return api_success(data={"suggestions": suggestions})


class FormTranslationReviewView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Ask reviewers to check a form's Setswana",
        request=TranslationReviewRequestSerializer,
        responses=inline_serializer("FormTranslationReview", fields={"notified": serializers.IntegerField()}),
    )
    def post(self, request, form_id):
        serializer = TranslationReviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = load_form(_form(form_id).id)
        count = FormTranslationService.request_review(
            form,
            role=serializer.validated_data["role"],
            actor=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        return api_success(data={"notified": count}, message=f"{count} reviewer(s) notified.")


class FormDuplicateView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(tags=TAGS, summary="Copy a form into a new draft", request=DuplicateFormSerializer, responses={201: FormListItemSerializer})
    def post(self, request, form_id):
        source = _form(form_id)
        serializer = DuplicateFormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data.get("name") or f"Copy of {source.title}"[:255]
        form = FormLibraryService.create(start="copy", name=name, actor=request.user, source=source)
        return api_success(data=_detail(form), message="Form copied.", status_code=status.HTTP_201_CREATED)


class FormArchiveView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Archive a form",
        description="Archived forms are hidden from the list and cannot be edited or published. "
        "Programmes already using it keep their link and published version.",
        request=None,
        responses=FormListItemSerializer,
    )
    def post(self, request, form_id):
        form = FormLibraryService.archive(_form(form_id), actor=request.user)
        return api_success(data=_detail(form), message="Form archived.")


class CSVRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data if isinstance(data, (bytes, str)) else b""


class FormResponsesExportView(APIView):
    permission_classes = [HasCapability.of("forms.manage")]
    renderer_classes = [CSVRenderer, JSONRenderer]

    @extend_schema(
        tags=TAGS,
        summary="Download every submission's answers as CSV",
        description="One row per submitted entry, one column per question key (plus keys of removed questions).",
        parameters=[OpenApiParameter("format", OpenApiTypes.STR, enum=["csv"])],
        responses={(200, "text/csv"): OpenApiTypes.BINARY},
    )
    def get(self, request, form_id):
        form = load_form(_form(form_id).id)
        response = StreamingHttpResponse(FormResponseExport.rows(form), content_type="text/csv; charset=utf-8")
        filename = slugify(form.title) or "form"
        response["Content-Disposition"] = f'attachment; filename="{filename}-responses.csv"'
        AuditService.log_action(actor=request.user, action_type="form_responses_exported", target=form)
        return response

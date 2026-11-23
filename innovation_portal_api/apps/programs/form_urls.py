from django.urls import path

from apps.programs.form_views import (
    FormArchiveView,
    GeneralIdeaFormView,
    FormDetailView,
    FormDraftView,
    FormDuplicateView,
    FormListCreateView,
    FormPublishCheckView,
    FormPublishView,
    FormResponsesExportView,
    FormReviewRolesView,
    FormTemplateListView,
    FormTranslationReviewView,
    FormTranslationsView,
    FormTranslationSuggestView,
    FormVersionListView,
    PublishedFormView,
)

urlpatterns = [
    path("", FormListCreateView.as_view(), name="form-list"),
    path("templates/", FormTemplateListView.as_view(), name="form-templates"),
    path("general-ideas/", GeneralIdeaFormView.as_view(), name="form-general-ideas"),
    path("review-roles/", FormReviewRolesView.as_view(), name="form-review-roles"),
    path("<uuid:form_id>/", FormDetailView.as_view(), name="form-detail"),
    path("<uuid:form_id>/draft/", FormDraftView.as_view(), name="form-draft"),
    path("<uuid:form_id>/publish/", FormPublishView.as_view(), name="form-publish"),
    path("<uuid:form_id>/publish-check/", FormPublishCheckView.as_view(), name="form-publish-check"),
    path("<uuid:form_id>/versions/", FormVersionListView.as_view(), name="form-versions"),
    path("<uuid:form_id>/published/", PublishedFormView.as_view(), name="form-published"),
    path("<uuid:form_id>/translations/", FormTranslationsView.as_view(), name="form-translations"),
    path("<uuid:form_id>/translations/suggest/", FormTranslationSuggestView.as_view(), name="form-translations-suggest"),
    path("<uuid:form_id>/translations/request-review/", FormTranslationReviewView.as_view(), name="form-translations-review"),
    path("<uuid:form_id>/duplicate/", FormDuplicateView.as_view(), name="form-duplicate"),
    path("<uuid:form_id>/archive/", FormArchiveView.as_view(), name="form-archive"),
    path("<uuid:form_id>/responses/export/", FormResponsesExportView.as_view(), name="form-responses-export"),
]

from rest_framework.permissions import BasePermission

from apps.submissions.selectors import SubmissionSelector


class CanAccessDocument(BasePermission):
    """A document is visible to whoever can see its parent submission or draft.

    Reuses SubmissionSelector.for_user (owner, or officer/admin/assigned staff)
    instead of a bespoke per-document ACL, since a document has no owner of its
    own — it inherits visibility from the submission/draft it belongs to.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        if obj.submission_id:
            return SubmissionSelector.for_user(request.user).filter(pk=obj.submission_id).exists()
        if obj.application_draft_id:
            return obj.application_draft.innovator_id == request.user.id
        return False

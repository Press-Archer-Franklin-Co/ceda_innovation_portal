"""Staff search (B5): reference numbers, idea titles and applicant names or emails."""

from django.db.models import Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.constants import RoleType
from apps.core.permissions import HasRolePermission

GROUP_LIMIT = 10


class IsFullAccessStaff(HasRolePermission):
    """Staff who can see every submission (judges and specialists only see their own)."""

    allowed_roles = {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR}


def _matching_people(q):
    from apps.accounts.models import User

    name_q = Q()
    for part in q.split():
        name_q &= Q(first_name__icontains=part) | Q(last_name__icontains=part)
    return User.objects.filter(name_q).values("id")


class StaffSearchView(APIView):
    permission_classes = [IsFullAccessStaff]

    @extend_schema(
        tags=["Staff search"],
        summary="Search ideas and people",
        description="{ideas: [...], people: [...]}, at most 10 each. Needs at least 2 characters.",
        parameters=[OpenApiParameter("q", OpenApiTypes.STR, required=True)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        from apps.accounts.models import User
        from apps.submissions.models import Submission

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return api_success(data={"q": q, "ideas": [], "people": []})
        name_q = Q()
        for part in q.split():
            name_q &= Q(first_name__icontains=part) | Q(last_name__icontains=part)
        ideas = (
            Submission.objects.filter(
                Q(reference_number__icontains=q)
                | Q(title__icontains=q)
                | Q(guest_name__icontains=q)
                | Q(innovator__email__icontains=q)
                | Q(innovator__in=_matching_people(q))
            )
            .exclude(submitted_at__isnull=True)
            .select_related("program", "innovator")
            .order_by("-submitted_at")[:GROUP_LIMIT]
        )
        people = User.objects.filter(Q(email__icontains=q) | Q(phone_number__icontains=q) | name_q).order_by("first_name", "last_name")[:GROUP_LIMIT]
        return api_success(
            data={
                "q": q,
                "ideas": [
                    {
                        "id": str(item.id),
                        "reference": item.reference_number,
                        "title": item.title,
                        "status": item.current_status,
                        "program": item.program.title,
                        "applicant": (item.innovator.full_name or item.innovator.email) if item.innovator_id else item.guest_name,
                        "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
                    }
                    for item in ideas
                ],
                "people": [
                    {"id": str(user.id), "name": user.full_name, "email": user.email, "phone_number": user.phone_number, "roles": list(user.roles.values_list("code", flat=True))}
                    for user in people
                ],
            }
        )

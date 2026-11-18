from django.db.models import Prefetch, Q

from apps.core.constants import RoleType
from apps.submissions.models import Submission

FULL_ACCESS_ROLES = [
    RoleType.INNOVATION_OFFICER,
    RoleType.INNOVATION_MANAGER,
    RoleType.ADMINISTRATOR,
]

ASSIGNED_ACCESS_ROLES = [
    RoleType.JUDGE,
    RoleType.INNOVATION_ANALYST,
    RoleType.STAFF_MEMBER,
    RoleType.SPECIALIST,
    RoleType.EXO,
    RoleType.MENTOR,
]


class SubmissionSelector:
    @staticmethod
    def for_user(user):
        if user.is_superuser or user.roles.filter(
            code__in=FULL_ACCESS_ROLES, user_roles__is_active=True
        ).exists():
            return Submission.objects.select_related("program", "innovator", "team").all()
        if user.roles.filter(code__in=ASSIGNED_ACCESS_ROLES, user_roles__is_active=True).exists():
            return Submission.objects.filter(
                Q(assignments__assignee=user)
            ).distinct().select_related("program", "innovator")
        return Submission.objects.filter(innovator=user).select_related("program", "team")

    @staticmethod
    def innovator_submissions(user):
        return Submission.objects.filter(innovator=user).select_related("program")

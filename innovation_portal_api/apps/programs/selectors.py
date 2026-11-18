from apps.core.constants import ProgramStatus
from apps.programs.access import ProgramAccessService
from apps.programs.models import Program


class ProgramSelector:
    @staticmethod
    def public_programs(user=None):
        queryset = Program.objects.filter(
            status__in=[ProgramStatus.PUBLISHED, ProgramStatus.CLOSED],
            is_public=True,
        ).select_related("program_type")
        return ProgramAccessService.exclude_hidden(queryset, user)

    @staticmethod
    def officer_programs(user):
        return Program.objects.filter(owner=user).select_related("program_type")

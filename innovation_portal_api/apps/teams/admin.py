from django.contrib import admin

from apps.teams.models import Team, TeamInvitation, TeamMember

admin.site.register(Team)
admin.site.register(TeamMember)
admin.site.register(TeamInvitation)

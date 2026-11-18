from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class Team(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_teams")
    program = models.ForeignKey("programs.Program", on_delete=models.SET_NULL, null=True, blank=True, related_name="teams")
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=["owner"]), models.Index(fields=["program"])]

    def __str__(self) -> str:
        return self.name


class TeamMember(UUIDModel, TimeStampedModel):
    ROLE_CHOICES = (("lead", "Lead"), ("member", "Member"))
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="team_memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="member")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("team", "user")
        indexes = [models.Index(fields=["team", "user"])]


class TeamInvitation(UUIDModel, TimeStampedModel):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_team_invitations")
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, default="pending")

    class Meta:
        indexes = [models.Index(fields=["email", "status"])]

import secrets

from rest_framework import serializers

from apps.accounts.models import User
from apps.teams.models import Team, TeamInvitation, TeamMember


class TeamMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = TeamMember
        fields = ("id", "user", "user_email", "role", "is_active")
        read_only_fields = ("is_active",)


class TeamSerializer(serializers.ModelSerializer):
    members = TeamMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = ("id", "name", "description", "program", "owner", "is_active", "members")
        read_only_fields = ("owner", "is_active")

    def create(self, validated_data):
        team = Team.objects.create(owner=self.context["request"].user, **validated_data)
        TeamMember.objects.get_or_create(team=team, user=team.owner, defaults={"role": "lead"})
        return team


class AddTeamMemberSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=TeamMember.ROLE_CHOICES, default="member")

    def validate(self, attrs):
        user = User.objects.get(id=attrs["user_id"])
        team = self.context["team"]
        if TeamMember.objects.filter(team=team, user=user).exists():
            raise serializers.ValidationError("User is already a member of this team.")
        attrs["user"] = user
        return attrs


class TeamInvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamInvitation
        fields = ("id", "email", "status")

    def create(self, validated_data):
        return TeamInvitation.objects.create(
            team=self.context["team"],
            invited_by=self.context["request"].user,
            token=secrets.token_hex(16),
            **validated_data,
        )

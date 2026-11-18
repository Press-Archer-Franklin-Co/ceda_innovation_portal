from rest_framework import generics, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.teams.models import Team, TeamMember
from apps.teams.serializers import AddTeamMemberSerializer, TeamInvitationSerializer, TeamMemberSerializer, TeamSerializer


class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer

    def get_queryset(self):
        user = self.request.user
        return Team.objects.filter(owner=user).prefetch_related("members__user")

    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        team = self.get_object()
        serializer = AddTeamMemberSerializer(data=request.data, context={"team": team})
        serializer.is_valid(raise_exception=True)
        member = TeamMember.objects.create(team=team, user=serializer.validated_data["user"], role=serializer.validated_data["role"])
        return Response(TeamMemberSerializer(member).data, status=201)

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<member_id>[^/.]+)")
    def remove_member(self, request, pk=None, member_id=None):
        team = self.get_object()
        TeamMember.objects.filter(team=team, id=member_id).delete()
        return Response(status=204)

    @action(detail=True, methods=["post"], url_path="invite")
    def invite(self, request, pk=None):
        team = self.get_object()
        serializer = TeamInvitationSerializer(data=request.data, context={"team": team, "request": request})
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()
        return Response(TeamInvitationSerializer(invitation).data, status=201)

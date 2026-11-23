"""Prompt 29: the list of flows (archive, restore, which connections use a flow)."""

from apps.channels.models import Journey
from tests.api.test_channels_api import BASE, ChannelsTestCase, data


class FlowListTests(ChannelsTestCase):
    def test_list_shows_connections_and_hides_archived(self):
        connection = self.add_ussd(name="Mascom *123#")
        rows = {row["name"]: row for row in data(self.client.get(f"{BASE}/journeys/"))}
        self.assertEqual(rows["CEDA Innovation (USSD)"]["connection_names"], ["Mascom *123#"])
        self.assertFalse(rows["CEDA Innovation (WhatsApp)"]["is_archived"])
        self.assertTrue(connection)

    def test_archive_and_restore(self):
        journey = self.whatsapp_journey
        response = self.client.patch(f"{BASE}/journeys/{journey.id}/", {"name": journey.name, "is_archived": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        names = [row["name"] for row in data(self.client.get(f"{BASE}/journeys/"))]
        self.assertNotIn(journey.name, names)
        archived = [row["name"] for row in data(self.client.get(f"{BASE}/journeys/", {"archived": "1"}))]
        self.assertEqual(archived, [journey.name])
        self.client.patch(f"{BASE}/journeys/{journey.id}/", {"name": journey.name, "is_archived": False}, format="json")
        self.assertFalse(Journey.objects.get(pk=journey.pk).is_archived)
        # Archiving changes nothing about the steps or the published version.
        self.assertEqual(Journey.objects.get(pk=journey.pk).version, journey.version)

    def test_a_flow_an_active_connection_runs_cannot_be_archived(self):
        connection = self.add_ussd()
        self.check_and_activate(connection["id"])
        response = self.client.patch(f"{BASE}/journeys/{self.ussd_journey.id}/", {"name": self.ussd_journey.name, "is_archived": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Journey.objects.get(pk=self.ussd_journey.pk).is_archived)

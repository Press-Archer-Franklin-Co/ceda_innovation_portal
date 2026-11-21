from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.platform_config.models import IntegrationConnection


@receiver(post_save, sender=IntegrationConnection, dispatch_uid="channels_connection_row")
def ensure_channel_row(sender, instance, created, **kwargs):
    """Every USSD or WhatsApp connection gets its channel settings and webhook token,
    however it was added (channels screens or Platform settings > Integrations)."""
    if kwargs.get("raw") or instance.kind not in IntegrationConnection.MULTI_ACTIVE_KINDS:
        return
    from apps.channels.models import ChannelConnection

    ChannelConnection.objects.get_or_create(connection=instance)

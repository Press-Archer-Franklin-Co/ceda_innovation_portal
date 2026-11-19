from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.platform_config.flags import clear_flag_cache
from apps.platform_config.models import FeatureFlag, IntegrationConnection


@receiver([post_save, post_delete], sender=FeatureFlag)
def _feature_flag_changed(sender, **kwargs):
    clear_flag_cache()


@receiver([post_save, post_delete], sender=IntegrationConnection)
def _connection_changed(sender, instance, **kwargs):
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    IntegrationRuntimeSelector.clear_cache(instance.kind)

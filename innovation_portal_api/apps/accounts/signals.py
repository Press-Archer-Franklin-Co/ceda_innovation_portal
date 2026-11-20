"""S2: the capability map is cached; any change to roles or their capabilities clears it."""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.accounts.models import Role, RoleCapability


@receiver([post_save, post_delete], sender=Role)
@receiver([post_save, post_delete], sender=RoleCapability)
def clear_capability_cache(sender, **kwargs):
    from apps.core.capabilities import clear_cache

    clear_cache()

from apps.platform_config.providers.base import REGISTRY, get_provider_class, providers_for  # noqa: F401

# Importing the modules registers their providers.
from apps.platform_config.providers import sms, sso, ussd, whatsapp  # noqa: F401,E402

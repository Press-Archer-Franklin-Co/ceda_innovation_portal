from rest_framework.throttling import UserRateThrottle


class PlatformAdminThrottle(UserRateThrottle):
    scope = "platform_admin"


class PlatformTestThrottle(UserRateThrottle):
    """Tests reach external providers and may send real SMS, so they are rate-limited harder."""

    scope = "platform_test"

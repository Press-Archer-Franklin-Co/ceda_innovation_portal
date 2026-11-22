from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class ChannelWebhookThrottle(SimpleRateThrottle):
    """Per connection, not per address: an aggregator sends every caller from one address."""

    scope = "channel_webhook"
    rate = "600/minute"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": (view.kwargs.get("token") or "")[:64]}


class ChannelAdminThrottle(UserRateThrottle):
    scope = "channels_admin"
    rate = "120/minute"


class ChannelTestThrottle(UserRateThrottle):
    """Connection tests may send a real WhatsApp message."""

    scope = "channels_test"
    rate = "10/minute"


class ChannelPublicThrottle(SimpleRateThrottle):
    scope = "channels_public"
    rate = "60/minute"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}

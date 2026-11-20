"""OpenAPI helpers: document the {success, message, data} wrapper that api_success() sends."""

from drf_spectacular.utils import inline_serializer
from rest_framework import serializers

_cache: dict[str, serializers.Serializer] = {}


def envelope(name: str, data) -> serializers.Serializer:
    """A schema for api_success(data=...): {success, message, data}. `data` is a serializer instance or field."""
    if name not in _cache:
        _cache[name] = inline_serializer(
            name,
            fields={"success": serializers.BooleanField(), "message": serializers.CharField(), "data": data},
        )
    return _cache[name]

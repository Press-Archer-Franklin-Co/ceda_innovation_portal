"""Helpers for tests that need a feature switch in a given state.

Flags are cached outside the database transaction a test runs in, so always change them
through these helpers: they clear the cache again when the test ends.
"""

from apps.platform_config.flags import clear_flag_cache
from apps.platform_config.models import FeatureFlag


def set_features(testcase, **values: bool) -> None:
    for key, enabled in values.items():
        FeatureFlag.objects.filter(key=key).update(enabled=enabled)
    clear_flag_cache()
    testcase.addCleanup(clear_flag_cache)


def reset_platform_caches(testcase) -> None:
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    clear_flag_cache()
    IntegrationRuntimeSelector.clear_cache()
    testcase.addCleanup(clear_flag_cache)
    testcase.addCleanup(IntegrationRuntimeSelector.clear_cache)

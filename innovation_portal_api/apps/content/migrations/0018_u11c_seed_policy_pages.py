"""U11C: seed the five policy pages with the text the public site showed before, so none is empty."""

from django.db import migrations
from django.utils import timezone

from apps.content.policy_seed import POLICY_SEED


def seed(apps, schema_editor):
    PolicyPage = apps.get_model("content", "PolicyPage")
    now = timezone.now()
    for key, content in POLICY_SEED.items():
        PolicyPage.objects.get_or_create(
            key=key,
            defaults={"title": content["title"], "intro": content["intro"], "sections": content["sections"], "published_at": now},
        )


class Migration(migrations.Migration):

    dependencies = [("content", "0017_u11c_policy_page")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

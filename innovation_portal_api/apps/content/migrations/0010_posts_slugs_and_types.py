"""Existing news items get a unique slug and a post type mapped from their old category.

category is kept (the older /api/content/news/ endpoints still read and write it).
Reverse does nothing: 0009's reverse drops both columns.
"""

from django.db import migrations
from django.utils.text import slugify

CATEGORY_TO_TYPE = {
    "announcement": "notice",
    "challenge_update": "news",
    "winners": "result",
    "partnership": "news",
    "success_story": "news",
}


def forwards(apps, schema_editor):
    ContentItem = apps.get_model("content", "ContentItem")
    used = set(ContentItem.objects.exclude(slug__isnull=True).values_list("slug", flat=True))
    for item in ContentItem.objects.order_by("created_at"):
        base = (slugify(item.title) or "post")[:200]
        slug, number = base, 2
        while slug in used:
            slug = f"{base}-{number}"
            number += 1
        used.add(slug)
        ContentItem.objects.filter(pk=item.pk).update(slug=item.slug or slug, type=CATEGORY_TO_TYPE.get(item.category, "news"))


class Migration(migrations.Migration):
    dependencies = [("content", "0009_b6_home_posts_partners")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]

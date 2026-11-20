"""Put existing FAQs in a default English group on the help page (B6 part 2).

Reverse removes the default group (the FAQs stay, without a group).
"""

from django.db import migrations

DEFAULT_GROUP = "General questions"


def forwards(apps, schema_editor):
    FAQ = apps.get_model("support", "FAQ")
    FAQGroup = apps.get_model("support", "FAQGroup")
    if not FAQ.objects.exists():
        return
    group, _ = FAQGroup.objects.get_or_create(name=DEFAULT_GROUP, defaults={"ordering": 1})
    FAQ.objects.filter(group__isnull=True).update(group=group)
    for faq in FAQ.objects.filter(placements=[]):
        faq.placements = ["program"] if faq.program_id else ["help"]
        faq.save(update_fields=["placements"])


def backwards(apps, schema_editor):
    apps.get_model("support", "FAQGroup").objects.filter(name=DEFAULT_GROUP).delete()


class Migration(migrations.Migration):
    dependencies = [("support", "0004_b6_part2")]

    operations = [migrations.RunPython(forwards, backwards)]

"""R-28: clean up home pages where two first requests both made the default sections.

The race left two banners (and two of every default section), so every save was refused.
Only pages with more than one banner are touched: for each section type, the oldest
section stays and copies made within a minute of the page's first section are removed.
Sections staff added later are never removed. Reverse does nothing.
"""

from datetime import timedelta

from django.db import migrations


def remove_duplicates(apps, schema_editor):
    Page = apps.get_model("content", "Page")
    PageSection = apps.get_model("content", "PageSection")
    for page in Page.objects.all():
        sections = list(PageSection.objects.filter(page=page).order_by("created_at", "id"))
        if sum(1 for section in sections if section.type == "hero_banner") <= 1:
            continue
        first = sections[0].created_at
        seen = set()
        for section in sections:
            if section.type in seen and section.created_at - first <= timedelta(minutes=1):
                section.delete()
                continue
            seen.add(section.type)
        # Close the gaps in the order.
        for order, section in enumerate(PageSection.objects.filter(page=page).order_by("order", "created_at")):
            if section.order != order:
                PageSection.objects.filter(pk=section.pk).update(order=order)


class Migration(migrations.Migration):
    dependencies = [("content", "0011_b6_part2")]

    operations = [migrations.RunPython(remove_duplicates, migrations.RunPython.noop)]

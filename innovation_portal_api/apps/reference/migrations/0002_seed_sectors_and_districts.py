"""Seed the sector and district pick lists.

Reversible: the reverse step deletes only the rows this migration added (by slug).
Setswana names are left blank on purpose so they fall back to English until a
Setswana speaker fills them in (the missing_translations helper lists them).
"""

from django.db import migrations

SECTORS = [
    ("agriculture", "Agriculture"),
    ("retail-trade", "Retail & trade"),
    ("manufacturing", "Manufacturing"),
    ("tourism-hospitality", "Tourism & hospitality"),
    ("services", "Services"),
    ("creative", "Creative"),
    ("community", "Community"),
    ("other", "Other"),
]

# The ten administrative districts, then the town and city councils that the
# national census reports as districts of their own.
DISTRICTS = [
    ("central", "Central"),
    ("chobe", "Chobe"),
    ("ghanzi", "Ghanzi"),
    ("kgalagadi", "Kgalagadi"),
    ("kgatleng", "Kgatleng"),
    ("kweneng", "Kweneng"),
    ("north-east", "North-East"),
    ("north-west", "North-West"),
    ("south-east", "South-East"),
    ("southern", "Southern"),
    ("gaborone", "Gaborone"),
    ("francistown", "Francistown"),
    ("lobatse", "Lobatse"),
    ("selebi-phikwe", "Selebi-Phikwe"),
    ("jwaneng", "Jwaneng"),
    ("orapa", "Orapa"),
    ("sowa-town", "Sowa Town"),
]


def _seed(model, rows):
    for index, (slug, english) in enumerate(rows, start=1):
        model.objects.update_or_create(
            slug=slug,
            defaults={"name": {"en": english, "tn": ""}, "ordering": index * 10, "active": True},
        )


def seed(apps, schema_editor):
    _seed(apps.get_model("reference", "Sector"), SECTORS)
    _seed(apps.get_model("reference", "District"), DISTRICTS)


def unseed(apps, schema_editor):
    apps.get_model("reference", "Sector").objects.filter(slug__in=[slug for slug, _ in SECTORS]).delete()
    apps.get_model("reference", "District").objects.filter(slug__in=[slug for slug, _ in DISTRICTS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]

import uuid

import apps.core.i18n
from django.db import migrations, models


def _fields():
    return [
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
        ("updated_at", models.DateTimeField(auto_now=True)),
        ("name", models.JSONField(default=apps.core.i18n.translated_default, validators=[apps.core.i18n.validate_translated_text])),
        ("slug", models.SlugField(max_length=80, unique=True)),
        ("ordering", models.PositiveIntegerField(db_index=True, default=0)),
        ("active", models.BooleanField(db_index=True, default=True)),
    ]


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="District",
            fields=_fields(),
            options={"verbose_name": "district", "ordering": ("ordering", "slug"), "abstract": False},
        ),
        migrations.CreateModel(
            name="Sector",
            fields=_fields(),
            options={"verbose_name": "sector", "ordering": ("ordering", "slug"), "abstract": False},
        ),
    ]

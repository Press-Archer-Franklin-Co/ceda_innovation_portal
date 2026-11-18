from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_user_mfa_profile_and_challenge"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["first_name", "last_name", "email"], name="user_sort_idx"),
        ),
    ]

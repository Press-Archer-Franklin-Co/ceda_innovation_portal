from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0020_u10_challenge_entry"),
    ]

    operations = [
        migrations.AddField(
            model_name="program",
            name="show_names_on_results",
            field=models.BooleanField(
                default=True,
                help_text="1.10: the public results page names winners and shortlisted entries. Off: idea titles only.",
            ),
        ),
    ]

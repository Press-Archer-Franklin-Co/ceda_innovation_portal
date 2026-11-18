from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0005_add_hackathon_program_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="submissionformfield",
            name="link_url",
            field=models.URLField(
                blank=True,
                max_length=500,
                help_text="Optional URL shown on boolean (checkbox) fields — e.g. a link to a T&C document.",
            ),
        ),
    ]

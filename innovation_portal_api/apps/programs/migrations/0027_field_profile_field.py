from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("programs", "0026_pitch_sessions")]

    operations = [
        migrations.AddField(
            model_name="submissionformfield",
            name="profile_field",
            field=models.CharField(
                blank=True,
                max_length=30,
                help_text="Fill from the signed-in person's profile (prompt 37): first_name, last_name, full_name, phone, email, district, "
                "organisation, gender, age_group or omang. Empty: by field type (phone, email, district, Omang ID). \"none\": never.",
            ),
        ),
    ]

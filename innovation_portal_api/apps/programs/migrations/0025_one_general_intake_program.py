from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("programs", "0024_challenge_forms_and_general_idea")]

    operations = [
        migrations.AddConstraint(
            model_name="program",
            constraint=models.UniqueConstraint(condition=models.Q(("is_general_intake", True)), fields=("is_general_intake",), name="uq_one_general_intake_program"),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("submissions", "0014_response_order")]

    operations = [
        migrations.AddField(model_name="applicationdraft", name="guest_email", field=models.EmailField(blank=True, max_length=254)),
        migrations.AddField(model_name="applicationdraft", name="guest_email_verified_at", field=models.DateTimeField(blank=True, null=True)),
    ]

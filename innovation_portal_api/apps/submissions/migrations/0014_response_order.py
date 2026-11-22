from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("submissions", "0013_return_requests")]

    operations = [
        migrations.AlterModelOptions(name="submissionresponse", options={"ordering": ("created_at", "id")}),
    ]

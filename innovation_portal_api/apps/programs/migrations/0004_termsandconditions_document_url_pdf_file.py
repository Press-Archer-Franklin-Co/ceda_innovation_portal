from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0003_program_closes_at_program_evaluation_closes_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='termsandconditions',
            name='document_url',
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='termsandconditions',
            name='pdf_file',
            field=models.FileField(blank=True, null=True, upload_to='terms/'),
        ),
        migrations.AlterField(
            model_name='termsandconditions',
            name='content',
            field=models.TextField(blank=True),
        ),
    ]

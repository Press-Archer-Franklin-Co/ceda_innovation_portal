
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='submissionform',
            name='code',
            field=models.SlugField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='submissionform',
            name='version',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='default_value',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='enabled_if',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='example_value',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='media_config',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='placeholder',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='required_if',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='visible_if',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name='FieldValidationRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('rule_type', models.CharField(choices=[('min_length', 'Min Length'), ('max_length', 'Max Length'), ('min_value', 'Min Value'), ('max_value', 'Max Value'), ('regex', 'Regex'), ('file_type', 'File Type'), ('file_size_mb', 'File Size MB'), ('exact_length', 'Exact Length'), ('required_extension', 'Required Extension')], max_length=40)),
                ('rule_value', models.CharField(max_length=255)),
                ('error_message', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('field', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='field_rules', to='programs.submissionformfield')),
            ],
            options={
                'ordering': ('field', 'rule_type'),
            },
        ),
        migrations.CreateModel(
            name='FormSection',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('code', models.SlugField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='programs.submissionform')),
            ],
            options={
                'ordering': ('ordering', 'title'),
                'unique_together': {('form', 'code')},
            },
        ),
        migrations.AddField(
            model_name='submissionformfield',
            name='section',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='fields', to='programs.formsection'),
        ),
    ]

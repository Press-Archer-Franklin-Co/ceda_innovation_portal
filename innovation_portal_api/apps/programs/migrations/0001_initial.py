
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ChallengeTheme',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255, unique=True)),
                ('description', models.TextField(blank=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ProgramType',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('code', models.CharField(choices=[('idea', 'Idea'), ('hackathon', 'Hackathon'), ('challenge_call', 'Challenge Call')], max_length=50, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='TermsAndConditions',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('content', models.TextField()),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Program',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('title', models.CharField(max_length=255)),
                ('slug', models.SlugField(max_length=280, unique=True)),
                ('description', models.TextField()),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('published', 'Published'), ('closed', 'Closed'), ('archived', 'Archived')], db_index=True, default='draft', max_length=30)),
                ('opening_date', models.DateTimeField()),
                ('closing_date', models.DateTimeField()),
                ('screening_start', models.DateTimeField(blank=True, null=True)),
                ('screening_end', models.DateTimeField(blank=True, null=True)),
                ('judging_start', models.DateTimeField(blank=True, null=True)),
                ('judging_end', models.DateTimeField(blank=True, null=True)),
                ('event_date', models.DateTimeField(blank=True, null=True)),
                ('max_team_size', models.PositiveIntegerField(blank=True, null=True)),
                ('is_public', models.BooleanField(default=False)),
                ('allow_team_submission', models.BooleanField(default=True)),
                ('allow_individual_submission', models.BooleanField(default=True)),
                ('published_at', models.DateTimeField(blank=True, null=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='owned_programs', to=settings.AUTH_USER_MODEL)),
                ('program_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='programs', to='programs.programtype')),
                ('terms_and_conditions', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='programs.termsandconditions')),
            ],
        ),
        migrations.CreateModel(
            name='EligibilityRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='eligibility_rules', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ProgramTimeline',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=120)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='timelines', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='SubmissionForm',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('active', models.BooleanField(default=True)),
                ('program', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='submission_form', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='SubmissionFormField',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('label', models.CharField(max_length=255)),
                ('key', models.SlugField(max_length=100)),
                ('field_type', models.CharField(choices=[('text', 'Text'), ('textarea', 'Textarea'), ('number', 'Number'), ('date', 'Date'), ('email', 'Email'), ('phone', 'Phone'), ('boolean', 'Boolean'), ('select', 'Select'), ('multiselect', 'Multiselect'), ('file', 'File'), ('url', 'URL')], max_length=30)),
                ('help_text', models.TextField(blank=True)),
                ('required', models.BooleanField(default=False)),
                ('validation_rules', models.JSONField(blank=True, default=dict)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fields', to='programs.submissionform')),
            ],
            options={
                'ordering': ('ordering',),
                'unique_together': {('form', 'key')},
            },
        ),
        migrations.CreateModel(
            name='SubmissionFormFieldOption',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('label', models.CharField(max_length=120)),
                ('value', models.CharField(max_length=120)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('field', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='options', to='programs.submissionformfield')),
            ],
            options={
                'ordering': ('ordering',),
            },
        ),
        migrations.CreateModel(
            name='ProgramStage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=120)),
                ('code', models.CharField(max_length=80)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stages', to='programs.program')),
            ],
            options={
                'ordering': ('ordering',),
                'unique_together': {('program', 'code')},
            },
        ),
        migrations.AddIndex(
            model_name='program',
            index=models.Index(fields=['status', 'program_type'], name='programs_pr_status_9e1720_idx'),
        ),
        migrations.AddIndex(
            model_name='program',
            index=models.Index(fields=['opening_date', 'closing_date'], name='programs_pr_opening_cfdacd_idx'),
        ),
    ]


import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0001_initial'),
        ('submissions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Assignment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('role_type', models.CharField(choices=[('judge', 'Judge'), ('mentor', 'Mentor'), ('reviewer', 'Reviewer')], max_length=20)),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('deadline', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('assigned', 'Assigned'), ('accepted', 'Accepted'), ('declined', 'Declined'), ('completed', 'Completed'), ('reassigned', 'Reassigned')], default='assigned', max_length=20)),
                ('assigned_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignments_created', to=settings.AUTH_USER_MODEL)),
                ('assignee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='submissions.submission')),
            ],
        ),
        migrations.CreateModel(
            name='AssignmentAcceptance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('accepted', models.BooleanField(default=False)),
                ('responded_at', models.DateTimeField(auto_now_add=True)),
                ('response_note', models.TextField(blank=True)),
                ('assignment', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='acceptance', to='assignments.assignment')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ConflictOfInterestDeclaration',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('conflict_details', models.TextField()),
                ('resolved', models.BooleanField(default=False)),
                ('assignment', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='conflict_declaration', to='assignments.assignment')),
                ('declared_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='MentorAssignment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mentor_assignments_created', to=settings.AUTH_USER_MODEL)),
                ('mentor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mentorships', to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mentor_assignments', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ReviewPanel',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review_panels', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='assignment',
            name='panel',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignments', to='assignments.reviewpanel'),
        ),
        migrations.AddConstraint(
            model_name='assignment',
            constraint=models.UniqueConstraint(condition=models.Q(('status__in', ['assigned', 'accepted'])), fields=('submission', 'assignee', 'role_type'), name='uq_active_assignment'),
        ),
    ]

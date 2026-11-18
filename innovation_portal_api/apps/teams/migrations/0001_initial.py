
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Team',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='owned_teams', to=settings.AUTH_USER_MODEL)),
                ('program', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='teams', to='programs.program')),
            ],
        ),
        migrations.CreateModel(
            name='TeamInvitation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('email', models.EmailField(max_length=254)),
                ('token', models.CharField(max_length=64, unique=True)),
                ('status', models.CharField(default='pending', max_length=20)),
                ('invited_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_team_invitations', to=settings.AUTH_USER_MODEL)),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitations', to='teams.team')),
            ],
        ),
        migrations.CreateModel(
            name='TeamMember',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('role', models.CharField(choices=[('lead', 'Lead'), ('member', 'Member')], default='member', max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('team', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='teams.team')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_memberships', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name='team',
            index=models.Index(fields=['owner'], name='teams_team_owner_i_7dde75_idx'),
        ),
        migrations.AddIndex(
            model_name='team',
            index=models.Index(fields=['program'], name='teams_team_program_97300e_idx'),
        ),
        migrations.AddIndex(
            model_name='teaminvitation',
            index=models.Index(fields=['email', 'status'], name='teams_teami_email_74e450_idx'),
        ),
        migrations.AddIndex(
            model_name='teammember',
            index=models.Index(fields=['team', 'user'], name='teams_teamm_team_id_2f6292_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='teammember',
            unique_together={('team', 'user')},
        ),
    ]

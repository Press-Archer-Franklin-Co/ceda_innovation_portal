import uuid
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assignments", "0004_assignment_traceability"),
        ("submissions", "0001_initial"),
        ("workflow", "0013_workflowstep_optional_role_status"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SpecialistInvitation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("invitee_email", models.EmailField(max_length=254)),
                ("invitee_name", models.CharField(max_length=255)),
                ("message", models.TextField(blank=True)),
                ("token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("status", models.CharField(
                    choices=[
                        ("pending", "Pending"),
                        ("accepted", "Accepted"),
                        ("completed", "Completed"),
                        ("expired", "Expired"),
                        ("revoked", "Revoked"),
                    ],
                    default="pending",
                    max_length=20,
                )),
                ("expires_at", models.DateTimeField()),
                ("accepted_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="specialist_invitations_accepted",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("assignment", models.OneToOneField(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="specialist_invitation",
                    to="assignments.assignment",
                )),
                ("invited_by", models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="specialist_invitations_sent",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("submission", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="specialist_invitations",
                    to="submissions.submission",
                )),
                ("workflow_step", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="specialist_invitations",
                    to="workflow.workflowstep",
                )),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]

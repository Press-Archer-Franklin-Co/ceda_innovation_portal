
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0010_assignmentinstance_cancelled_at_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='assignmentinstance',
            name='claimed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='assignmentinstance',
            name='claimed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='claimed_graph_assignment_instances', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='assignmentinstance',
            name='status',
            field=models.CharField(choices=[('available', 'Available'), ('pending', 'Pending'), ('accepted', 'Accepted'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('declined', 'Declined')], default='pending', max_length=20),
        ),
        migrations.AlterField(
            model_name='assignmentinstanceactionlog',
            name='action',
            field=models.CharField(choices=[('claimed', 'Claimed'), ('accepted', 'Accepted'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('reassigned', 'Reassigned'), ('declined', 'Declined')], max_length=30),
        ),
    ]

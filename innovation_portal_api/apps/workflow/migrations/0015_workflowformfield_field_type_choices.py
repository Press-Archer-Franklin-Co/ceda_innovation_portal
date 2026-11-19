# Only the new form field types (B4). The other workflow model changes listed in
# tests/known_migration_drift.txt are left for their own migration.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("workflow", "0014_workflowstep_order_constraint_deferrable")]

    operations = [
        migrations.AlterField(
            model_name="workflowformfield",
            name="field_type",
            field=models.CharField(choices=[('text', 'Text'), ('textarea', 'Textarea'), ('number', 'Number'), ('date', 'Date'), ('email', 'Email'), ('phone', 'Phone'), ('boolean', 'Boolean'), ('select', 'Select'), ('multiselect', 'Multiselect'), ('file', 'File'), ('url', 'URL'), ('radio', 'Radio (one choice)'), ('checkboxes', 'Checkboxes'), ('yes_no', 'Yes or no'), ('district', 'District'), ('omang_id', 'Omang ID'), ('media', 'Photo or video'), ('heading', 'Heading (layout only)'), ('paragraph', 'Paragraph (layout only)')], max_length=30),
        ),
    ]

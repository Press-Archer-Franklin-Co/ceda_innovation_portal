from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("workflow", "0013_workflowstep_optional_role_status"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE workflow_workflowstep
                    DROP CONSTRAINT uq_workflow_step_order_per_definition;
                ALTER TABLE workflow_workflowstep
                    ADD CONSTRAINT uq_workflow_step_order_per_definition
                    UNIQUE (workflow_definition_id, "order")
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
                ALTER TABLE workflow_workflowstep
                    DROP CONSTRAINT uq_workflow_step_order_per_definition;
                ALTER TABLE workflow_workflowstep
                    ADD CONSTRAINT uq_workflow_step_order_per_definition
                    UNIQUE (workflow_definition_id, "order");
            """,
        )
    ]

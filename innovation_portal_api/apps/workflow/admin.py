from django.contrib import admin

from apps.workflow.models import WorkflowActionLog, WorkflowDefinition, WorkflowInstance, WorkflowStep


class WorkflowStepInline(admin.TabularInline):
    model = WorkflowStep
    extra = 0


@admin.register(WorkflowDefinition)
class WorkflowDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "program", "version", "is_active", "created_at")
    list_filter = ("is_active",)
    inlines = [WorkflowStepInline]

    def has_delete_permission(self, request, obj=None):
        if obj and (obj.instances.exists() or (obj.is_active and obj.instances.exists())):
            return False
        return super().has_delete_permission(request, obj=obj)


@admin.register(WorkflowInstance)
class WorkflowInstanceAdmin(admin.ModelAdmin):
    list_display = ("submission", "workflow_definition", "current_step", "status", "completed_at")
    list_filter = ("status", "workflow_definition")


@admin.register(WorkflowActionLog)
class WorkflowActionLogAdmin(admin.ModelAdmin):
    list_display = ("workflow_instance", "step", "action", "performed_by", "timestamp")
    list_filter = ("action",)

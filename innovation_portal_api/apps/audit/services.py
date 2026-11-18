from apps.audit.models import ActivityLog, AuditLog


class AuditService:
    @staticmethod
    def log_action(actor, action_type: str, target, before_state=None, after_state=None, metadata=None):
        AuditLog.objects.create(
            actor=actor,
            action_type=action_type,
            target_model=target.__class__.__name__,
            target_id=str(target.pk),
            before_state=before_state or {},
            after_state=after_state or {},
            metadata=metadata or {},
        )

    @staticmethod
    def log_raw_action(*, actor, action_type: str, target_model: str, target_id: str, before_state=None, after_state=None, metadata=None):
        AuditLog.objects.create(
            actor=actor,
            action_type=action_type,
            target_model=target_model,
            target_id=target_id,
            before_state=before_state or {},
            after_state=after_state or {},
            metadata=metadata or {},
        )

    @staticmethod
    def log_activity(actor, action_type: str, description: str, submission=None):
        ActivityLog.objects.create(actor=actor, action_type=action_type, description=description, submission=submission)

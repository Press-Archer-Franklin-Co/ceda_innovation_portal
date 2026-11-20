from celery import shared_task


@shared_task
def run_export(export_id):
    """B7: make a dashboard export (CSV or PDF)."""
    from apps.analytics.exports import run

    return str(run(export_id).status)

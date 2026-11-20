"""B7 exports: the dashboard numbers as CSV or PDF (fpdf2), made by a Celery job."""

from __future__ import annotations

import csv
import io
import json

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.analytics.dashboard import REPORTS, parse_filters
from apps.analytics.models import AnalyticsExport


def _rows(name: str, data: dict) -> list[list]:
    """Flatten one report into [section, item, value] rows."""
    rows = []

    def walk(prefix, value):
        if isinstance(value, dict):
            for key, item in value.items():
                walk(f"{prefix}.{key}" if prefix else key, item)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                label = item.get("code") or item.get("slug") or item.get("channel") or item.get("period_start") if isinstance(item, dict) else None
                walk(f"{prefix}.{label or index}", item)
        else:
            rows.append([name, prefix, "" if value is None else value])

    walk("", data)
    return rows


def build(export: AnalyticsExport) -> tuple[bytes, str]:
    filters = parse_filters(export.filters or {})
    names = list(REPORTS) if export.report == "all" else [export.report]
    results = {name: REPORTS[name](filters, export.requested_by) for name in names}
    rows = [row for name, data in results.items() for row in _rows(name, data)]
    stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
    if export.format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["report", "item", "value"])
        writer.writerows(rows)
        return buffer.getvalue().encode("utf-8"), f"ceda-{export.report}-{stamp}.csv"
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "CEDA Innovation Portal: dashboard numbers", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, f"Made {timezone.localtime():%d %b %Y %H:%M}. Filters: {json.dumps(filters.as_dict())}", new_x="LMARGIN", new_y="NEXT")
    current = None
    for report, item, value in rows:
        if report != current:
            pdf.ln(3)
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 7, report.title(), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 9)
            current = report
        text = f"{item}: {value}".encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output()), f"ceda-{export.report}-{stamp}.pdf"


def request_export(*, user, report: str, fmt: str, filters: dict) -> AnalyticsExport:
    if report not in AnalyticsExport.REPORTS:
        raise ValidationError({"report": f"Use one of: {', '.join(AnalyticsExport.REPORTS)}."})
    if fmt not in AnalyticsExport.FORMATS:
        raise ValidationError({"format": "Use csv or pdf."})
    parse_filters(filters or {})  # refuse bad filters now, not in the job
    export = AnalyticsExport.objects.create(requested_by=user, report=report, format=fmt, filters=filters or {})
    transaction.on_commit(lambda: _queue(export.id))
    return export


def _queue(export_id):
    from django.conf import settings

    from apps.analytics.tasks import run_export

    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return run(export_id)
    try:
        run_export.delay(str(export_id))
    except Exception:  # no broker: make it now
        run(export_id)


def run(export_id) -> AnalyticsExport:
    export = AnalyticsExport.objects.select_related("requested_by").get(id=export_id)
    if export.status == AnalyticsExport.Status.READY:
        return export
    AnalyticsExport.objects.filter(pk=export.pk).update(status=AnalyticsExport.Status.RUNNING)
    try:
        content, name = build(export)
        export.file.save(name, ContentFile(content), save=False)
        export.status = AnalyticsExport.Status.READY
        export.error = ""
    except Exception as exc:
        export.status = AnalyticsExport.Status.FAILED
        export.error = str(exc)[:500]
    export.finished_at = timezone.now()
    export.save()
    return export

import json
import re
import tempfile
import zipfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone

from apps.accounts.models import Role
from apps.assignments.models import Assignment, SpecialistInvitation
from apps.audit.models import ActivityLog, AuditLog
from apps.communications.models import CommunicationLog, Notification
from apps.core.constants import SubmissionStatus
from apps.documents.models import SubmissionDocument
from apps.evaluation.models import ReviewCycle, ScoreSheet
from apps.events.models import AttendanceRecord, Event
from apps.programs.models import Program
from apps.submissions.models import ApplicationDraft, Submission
from apps.support.models import SupportRequest
from apps.workflow.models import TaskExecution, WorkflowActionLog, WorkflowInstance


DEFAULT_RECIPIENTS = ("ngongoregol@ceda.co.bw", "matihan@ceda.co.bw")
EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _normalise_recipient(value: str) -> str:
    value = value.strip().strip(",;")
    if not value:
        return ""
    if "@" not in value:
        return f"{value}@{getattr(settings, 'DEFAULT_LOGIN_EMAIL_DOMAIN', 'ceda.bw')}"
    local, domain = value.rsplit("@", 1)
    if domain.lower() == "ceda":
        return f"{local}@ceda.co.bw"
    return value


def _cell_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str)
    return value


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _sheet_xml(rows):
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, raw in enumerate(row, start=1):
            value = _cell_value(raw)
            ref = f"{_column_name(column_index)}{row_index}"
            style = ' s="1"' if row_index == 1 else ""
            if value == "":
                cells.append(f'<c r="{ref}"{style}/>')
            elif isinstance(value, bool):
                cells.append(f'<c r="{ref}" t="b"{style}><v>{1 if value else 0}</v></c>')
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(f'<c r="{ref}"{style}><v>{value}</v></c>')
            else:
                text = escape(str(value), {'"': "&quot;"})
                preserve = ' xml:space="preserve"' if str(value).strip() != str(value) else ""
                cells.append(f'<c r="{ref}" t="inlineStr"{style}><is><t{preserve}>{text}</t></is></c>')
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        '</worksheet>'
    )


def _safe_sheet_name(name: str, used: set[str]) -> str:
    cleaned = re.sub(r"[\[\]\:\*\?\/\\]", " ", name).strip()[:31] or "Sheet"
    candidate = cleaned
    suffix = 1
    while candidate in used:
        token = f" {suffix}"
        candidate = f"{cleaned[:31 - len(token)]}{token}"
        suffix += 1
    used.add(candidate)
    return candidate


def write_xlsx(path: Path, sheets: list[tuple[str, list[list]]]) -> None:
    used_names = set()
    named_sheets = [(_safe_sheet_name(name, used_names), rows or [["No data"]]) for name, rows in sheets]
    workbook_sheets = []
    rels = []
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    for index, (name, _) in enumerate(named_sheets, start=1):
        escaped_name = escape(name, {'"': "&quot;"})
        workbook_sheets.append(f'<sheet name="{escaped_name}" sheetId="{index}" r:id="rId{index}"/>')
        rels.append(
            f'<Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{index}.xml"/>'
        )
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    rels.append(
        f'<Relationship Id="rId{len(named_sheets) + 1}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
    )

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(workbook_sheets)}</sheets></workbook>'
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rels)}</Relationships>'
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}</Types>'
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/></Relationships>'
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        '</styleSheet>'
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", content_types_xml)
        workbook.writestr("_rels/.rels", root_rels_xml)
        workbook.writestr("xl/workbook.xml", workbook_xml)
        workbook.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        workbook.writestr("xl/styles.xml", styles_xml)
        for index, (_, rows) in enumerate(named_sheets, start=1):
            workbook.writestr(f"xl/worksheets/sheet{index}.xml", _sheet_xml(rows))


class Command(BaseCommand):
    help = "Generate and optionally email the complete CEDA Innovation Portal website insight report as an Excel workbook."

    def add_arguments(self, parser):
        parser.add_argument(
            "--recipient",
            action="append",
            dest="recipients",
            help="Recipient email address. May be passed more than once or as a comma-separated list.",
        )
        parser.add_argument("--output", help="Output .xlsx path. Defaults to MEDIA_ROOT/reports/website_insight_report_<date>.xlsx")
        parser.add_argument("--no-email", action="store_true", help="Generate the workbook without sending email.")
        parser.add_argument("--subject", default="CEDA Innovation Portal Website Insight Report")

    def handle(self, *args, **options):
        recipients = self._recipients(options.get("recipients"))
        generated_at = timezone.now()
        output = Path(options["output"]) if options.get("output") else Path(settings.MEDIA_ROOT) / "reports" / f"website_insight_report_{generated_at:%Y%m%d_%H%M%S}.xlsx"

        sheets = self._build_sheets(generated_at)
        write_xlsx(output, sheets)
        self.stdout.write(self.style.SUCCESS(f"Generated report: {output}"))

        if not options["no_email"]:
            if not recipients:
                raise CommandError("At least one recipient is required.")
            self._send_email(output, recipients, options["subject"], generated_at)
            self.stdout.write(self.style.SUCCESS(f"Emailed report to: {', '.join(recipients)}"))

    def _recipients(self, raw_recipients):
        if not raw_recipients:
            return list(DEFAULT_RECIPIENTS)
        recipients = []
        for item in raw_recipients:
            for part in item.split(","):
                recipient = _normalise_recipient(part)
                if recipient and recipient not in recipients:
                    recipients.append(recipient)
        return recipients

    def _build_sheets(self, generated_at):
        User = get_user_model()
        submitted_filter = ~Q(current_status=SubmissionStatus.DRAFT)
        interacted_users = User.objects.filter(Q(application_drafts__isnull=False) | Q(submissions__isnull=False)).distinct()
        submitted_users = User.objects.filter(submissions__current_status__isnull=False).exclude(submissions__current_status=SubmissionStatus.DRAFT).distinct()

        summary = [
            ["Metric", "Value", "Notes"],
            ["Generated at", timezone.localtime(generated_at), settings.TIME_ZONE],
            ["Registered users", User.objects.count(), "All portal accounts"],
            ["Active users", User.objects.filter(is_active=True).count(), ""],
            ["Public/applicant users", User.objects.filter(is_staff=False).count(), ""],
            ["Staff users", User.objects.filter(is_staff=True).count(), ""],
            ["People who interacted with portal", interacted_users.count(), "Registered users with at least one application draft or submission"],
            ["People who submitted", submitted_users.count(), "Unique applicants with non-draft submissions"],
            ["Application drafts created", ApplicationDraft.objects.count(), ""],
            ["Drafts still in progress", ApplicationDraft.objects.filter(status=ApplicationDraft.STATUS_DRAFT).count(), ""],
            ["Submitted applications", Submission.objects.filter(submitted_filter).count(), "Non-draft submissions"],
            ["Total submission records", Submission.objects.count(), ""],
            ["Programs", Program.objects.count(), ""],
            ["Public programs", Program.objects.filter(is_public=True).count(), ""],
            ["Documents uploaded/linked", SubmissionDocument.objects.count(), ""],
            ["Support requests", SupportRequest.objects.count(), ""],
            ["Notifications", Notification.objects.count(), ""],
            ["Email/SMS/internal communication logs", CommunicationLog.objects.count(), ""],
        ]

        methodology = [
            ["Item", "Detail"],
            ["Interaction definition", "User has created an application draft and/or submission."],
            ["Anonymous traffic", "The portal database does not currently store anonymous page views or visitor sessions."],
            ["Submission traffic", "Calculated from Submission.submitted_at and current_status."],
            ["Recipient normalization", "Addresses ending @ceda are treated as @ceda.co.bw."],
        ]

        user_summary = [
            ["Metric", "Value"],
            ["Registered users", User.objects.count()],
            ["Email verified", User.objects.filter(email_verified=True).count()],
            ["Email not verified", User.objects.filter(email_verified=False).count()],
            ["Password primary auth", User.objects.filter(primary_auth_method=User.PrimaryAuthMethod.PASSWORD).count()],
            ["Google primary auth", User.objects.filter(primary_auth_method=User.PrimaryAuthMethod.GOOGLE).count()],
            ["GitHub primary auth", User.objects.filter(primary_auth_method=User.PrimaryAuthMethod.GITHUB).count()],
            ["Microsoft primary auth", User.objects.filter(primary_auth_method=User.PrimaryAuthMethod.MICROSOFT).count()],
            ["No primary auth recorded", User.objects.filter(primary_auth_method="").count()],
        ]

        role_rows = [["Role code", "Role name", "Users"]]
        role_rows.extend(
            [row["user_roles__role__code"] or "No role", row["user_roles__role__name"] or "No role", row["total"]]
            for row in User.objects.values("user_roles__role__code", "user_roles__role__name").annotate(total=Count("id", distinct=True)).order_by("user_roles__role__code")
        )
        role_rows.append(["Configured roles", Role.objects.count(), ""])

        user_registrations = [["Month", "Users registered"]]
        user_registrations.extend(
            [row["month"], row["total"]]
            for row in User.objects.annotate(month=TruncMonth("created_at")).values("month").annotate(total=Count("id")).order_by("month")
        )

        submission_overview = [
            ["Metric", "Value"],
            ["Total submissions", Submission.objects.count()],
            ["Submitted/non-draft submissions", Submission.objects.filter(submitted_filter).count()],
            ["Unique submitters", submitted_users.count()],
            ["Average submissions per submitter", round(Submission.objects.filter(submitted_filter).count() / submitted_users.count(), 2) if submitted_users.count() else 0],
            ["Team submissions", Submission.objects.filter(team__isnull=False).count()],
            ["Individual submissions", Submission.objects.filter(team__isnull=True).count()],
        ]

        status_rows = [["Submission status", "Total"]]
        status_rows.extend(
            [row["current_status"], row["total"]]
            for row in Submission.objects.values("current_status").annotate(total=Count("id")).order_by("current_status")
        )

        program_rows = [["Program", "Type", "Status", "Public", "Opens", "Closes", "Submissions", "Submitted", "Unique applicants"]]
        program_rows.extend(
            [
                row["program__title"],
                row["program__program_type__code"],
                row["program__status"],
                row["program__is_public"],
                row["program__opens_at"] or row["program__opening_date"],
                row["program__closes_at"] or row["program__closing_date"],
                row["total"],
                row["submitted"],
                row["unique_applicants"],
            ]
            for row in Submission.objects.values(
                "program__title",
                "program__program_type__code",
                "program__status",
                "program__is_public",
                "program__opens_at",
                "program__opening_date",
                "program__closes_at",
                "program__closing_date",
            )
            .annotate(total=Count("id"), submitted=Count("id", filter=submitted_filter), unique_applicants=Count("innovator_id", distinct=True))
            .order_by("program__title")
        )

        monthly_traffic = [["Month", "Submitted applications", "Unique applicants"]]
        monthly_traffic.extend(
            [row["month"], row["total"], row["unique_applicants"]]
            for row in Submission.objects.filter(submitted_filter)
            .exclude(submitted_at=None)
            .annotate(month=TruncMonth("submitted_at"))
            .values("month")
            .annotate(total=Count("id"), unique_applicants=Count("innovator_id", distinct=True))
            .order_by("month")
        )

        daily_traffic = [["Day", "Submitted applications", "Unique applicants"]]
        daily_traffic.extend(
            [row["day"], row["total"], row["unique_applicants"]]
            for row in Submission.objects.filter(submitted_filter)
            .exclude(submitted_at=None)
            .annotate(day=TruncDate("submitted_at"))
            .values("day")
            .annotate(total=Count("id"), unique_applicants=Count("innovator_id", distinct=True))
            .order_by("day")
        )

        draft_rows = [["Draft status", "Drafts", "Unique users"]]
        draft_rows.extend(
            [row["status"], row["total"], row["unique_users"]]
            for row in ApplicationDraft.objects.values("status").annotate(total=Count("id"), unique_users=Count("innovator_id", distinct=True)).order_by("status")
        )

        workflow_rows = [["Workflow status", "Current step", "Current node", "Total"]]
        workflow_rows.extend(
            [row["status"], row["current_step__name"] or "", row["current_node__name"] or "", row["total"]]
            for row in WorkflowInstance.objects.values("status", "current_step__name", "current_node__name").annotate(total=Count("id")).order_by("status", "current_step__name")
        )

        task_rows = [["Task status", "Workflow step", "Total", "Overdue"]]
        now = timezone.now()
        task_rows.extend(
            [row["status"], row["workflow_step__name"], row["total"], row["overdue"]]
            for row in TaskExecution.objects.values("status", "workflow_step__name")
            .annotate(total=Count("id"), overdue=Count("id", filter=Q(due_at__lt=now, completed_at__isnull=True)))
            .order_by("status", "workflow_step__name")
        )

        assignment_rows = [["Role type", "Status", "Total"]]
        assignment_rows.extend(
            [row["role_type"], row["status"], row["total"]]
            for row in Assignment.objects.values("role_type", "status").annotate(total=Count("id")).order_by("role_type", "status")
        )

        review_rows = [["Metric", "Value"]]
        review_rows.extend(
            [
                ["Review cycles", ReviewCycle.objects.count()],
                ["Open review cycles", ReviewCycle.objects.filter(status=ReviewCycle.STATUS_OPEN).count()],
                ["Completed review cycles", ReviewCycle.objects.filter(status=ReviewCycle.STATUS_COMPLETED).count()],
                ["Score sheets", ScoreSheet.objects.count()],
                ["Final/submitted score sheets", ScoreSheet.objects.filter(is_final=True).count()],
            ]
        )

        document_rows = [["Document type", "Category", "Documents", "Total MB"]]
        document_rows.extend(
            [row["document_type"], row["category__name"] or "", row["total"], round((row["bytes"] or 0) / (1024 * 1024), 2)]
            for row in SubmissionDocument.objects.values("document_type", "category__name")
            .annotate(total=Count("id"), bytes=Sum("size_bytes"))
            .order_by("document_type", "category__name")
        )

        support_rows = [["Status", "Request type", "Total"]]
        support_rows.extend(
            [row["status"], row["request_type"], row["total"]]
            for row in SupportRequest.objects.values("status", "request_type").annotate(total=Count("id")).order_by("status", "request_type")
        )

        communication_rows = [["Channel", "Status", "Total"]]
        communication_rows.extend(
            [row["channel"], row["status"], row["total"]]
            for row in CommunicationLog.objects.values("channel", "status").annotate(total=Count("id")).order_by("channel", "status")
        )

        audit_rows = [["Action type", "Target model", "Total"]]
        audit_rows.extend(
            [row["action_type"], row["target_model"], row["total"]]
            for row in AuditLog.objects.values("action_type", "target_model").annotate(total=Count("id")).order_by("-total", "action_type")[:100]
        )

        activity_rows = [["Action type", "Total"]]
        activity_rows.extend(
            [row["action_type"], row["total"]]
            for row in ActivityLog.objects.values("action_type").annotate(total=Count("id")).order_by("-total", "action_type")
        )

        event_rows = [["Metric", "Value"]]
        event_rows.extend(
            [
                ["Events", Event.objects.count()],
                ["Attendance records", AttendanceRecord.objects.count()],
            ]
        )

        specialist_rows = [["Status", "Invitations"]]
        specialist_rows.extend(
            [row["status"], row["total"]]
            for row in SpecialistInvitation.objects.values("status").annotate(total=Count("id")).order_by("status")
        )

        action_rows = [["Workflow action", "Total"]]
        action_rows.extend(
            [row["action"], row["total"]]
            for row in WorkflowActionLog.objects.values("action").annotate(total=Count("id")).order_by("-total", "action")
        )

        return [
            ("Summary", summary),
            ("Methodology", methodology),
            ("Users", user_summary),
            ("Users By Role", role_rows),
            ("User Registrations", user_registrations),
            ("Submission Overview", submission_overview),
            ("Submission Status", status_rows),
            ("Programs", program_rows),
            ("Monthly Traffic", monthly_traffic),
            ("Daily Traffic", daily_traffic),
            ("Drafts", draft_rows),
            ("Workflow Pipeline", workflow_rows),
            ("Workflow Tasks", task_rows),
            ("Workflow Actions", action_rows),
            ("Assignments", assignment_rows),
            ("Reviews", review_rows),
            ("Specialist Invites", specialist_rows),
            ("Documents", document_rows),
            ("Support", support_rows),
            ("Communications", communication_rows),
            ("Audit Top 100", audit_rows),
            ("Activity", activity_rows),
            ("Events", event_rows),
        ]

    def _send_email(self, path: Path, recipients: list[str], subject: str, generated_at):
        body = (
            "Good day,\n\n"
            "Please find attached the complete CEDA Innovation Portal website insight report.\n\n"
            "The report includes registered-user interaction, draft and submission traffic, program status, workflow pipeline, "
            "review activity, documents, support requests, communications, audit/activity summaries, and notes on measurement methodology.\n\n"
            "Note: anonymous page visits are not currently stored in the portal database, so portal interaction is calculated from registered users "
            "who created a draft and/or submitted an application.\n\n"
            f"Generated: {timezone.localtime(generated_at):%Y-%m-%d %H:%M:%S %Z}\n"
        )
        message = EmailMessage(
            subject=subject,
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        message.attach(path.name, path.read_bytes(), EXCEL_CONTENT_TYPE)
        message.send(fail_silently=False)

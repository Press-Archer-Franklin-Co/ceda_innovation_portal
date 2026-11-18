from collections import Counter, defaultdict
from datetime import date, datetime

from django.db.models import Count, F, Q
from django.utils import timezone

from apps.assignments.models import Assignment
from apps.core.constants import AssignmentStatus, SubmissionFormFieldType, SubmissionStatus
from apps.programs.models import Program
from apps.submissions.models import SubmissionResponse
from apps.workflow.models import TaskExecution, WorkflowInstance


class AnalyticsService:
    @staticmethod
    def program_summary(program: Program):
        submissions = program.submissions.all()
        submitted = submissions.exclude(current_status=SubmissionStatus.DRAFT)
        screening_total = submitted.filter(current_status__in=[SubmissionStatus.SCREENING, SubmissionStatus.JUDGING_REVIEW, SubmissionStatus.APPROVED, SubmissionStatus.REJECTED, SubmissionStatus.FINALIST, SubmissionStatus.WINNER, SubmissionStatus.SHORTLISTED]).count()
        screening_pass = submitted.filter(current_status__in=[SubmissionStatus.JUDGING_REVIEW, SubmissionStatus.APPROVED, SubmissionStatus.FINALIST, SubmissionStatus.WINNER, SubmissionStatus.SHORTLISTED]).count()
        judging_assignments = Assignment.objects.filter(submission__program=program, role_type="judge")
        judging_completed = judging_assignments.filter(status=AssignmentStatus.COMPLETED).count()
        return {
            "program_id": str(program.id),
            "program_title": program.title,
            "total_submissions": submissions.count(),
            "draft_submissions": submissions.filter(current_status=SubmissionStatus.DRAFT).count(),
            "submitted_submissions": submitted.count(),
            "screening_pass_rate": round((screening_pass / screening_total) * 100, 2) if screening_total else 0,
            "judging_completion_rate": round((judging_completed / judging_assignments.count()) * 100, 2) if judging_assignments.exists() else 0,
            "finalists": submissions.filter(current_status=SubmissionStatus.FINALIST).count(),
            "winners": submissions.filter(current_status=SubmissionStatus.WINNER).count(),
            "rejected": submissions.filter(current_status=SubmissionStatus.REJECTED).count(),
        }

    @staticmethod
    def pipeline(program: Program):
        rows = WorkflowInstance.objects.filter(submission__program=program).values(
            "current_step__code",
            "current_step__name",
        ).annotate(total=Count("id")).order_by("current_step__name")
        return list(rows)

    @staticmethod
    def reviewer_performance():
        rows = Assignment.objects.filter(role_type="judge").values(
            reviewer_id=F("assignee_id"),
            reviewer_name=F("assignee__first_name"),
        ).annotate(
            tasks_assigned=Count("id"),
            tasks_completed=Count("id", filter=Q(status=AssignmentStatus.COMPLETED)),
        )
        result = []
        for row in rows:
            completed_tasks = TaskExecution.objects.filter(assignment__assignee_id=row["reviewer_id"], status=TaskExecution.STATUS_COMPLETED)
            avg_hours = 0
            if completed_tasks.exists():
                durations = [
                    (task.completed_at - (task.started_at or task.created_at)).total_seconds() / 3600
                    for task in completed_tasks
                    if task.completed_at
                ]
                if durations:
                    avg_hours = round(sum(durations) / len(durations), 2)
            result.append({**row, "avg_completion_hours": avg_hours})
        return result

    @staticmethod
    def bottlenecks():
        return list(
            TaskExecution.objects.filter(status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED]).values(
                "workflow_step__name",
                "workflow_instance__workflow_definition__program__title",
            ).annotate(
                pending_tasks=Count("id"),
                overdue_tasks=Count("id", filter=Q(due_at__lt=timezone.now())),
            ).order_by("-overdue_tasks", "-pending_tasks")
        )

    @staticmethod
    def _unwrap_response_value(value):
        if isinstance(value, dict):
            for key in ("value", "answer", "selected", "files"):
                if key in value:
                    return value[key]
        return value

    @staticmethod
    def _is_answered(value) -> bool:
        value = AnalyticsService._unwrap_response_value(value)
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, set, dict)):
            return bool(value)
        return True

    @staticmethod
    def _as_list(value) -> list:
        value = AnalyticsService._unwrap_response_value(value)
        if value is None or value == "":
            return []
        if isinstance(value, (list, tuple, set)):
            return [v for v in value if v not in (None, "")]
        return [value]

    @staticmethod
    def _label_for_option(field_meta: dict, raw_value) -> str:
        raw = str(raw_value)
        option_map = field_meta.get("option_map", {})
        return option_map.get(raw, raw)

    @staticmethod
    def _parse_date(value):
        value = AnalyticsService._unwrap_response_value(value)
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        if not isinstance(value, str) or not value.strip():
            return None
        raw = value.strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(raw[:10], fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            return None

    @staticmethod
    def _age_from_value(value):
        parsed = AnalyticsService._parse_date(value)
        if parsed:
            today = timezone.localdate()
            return today.year - parsed.year - ((today.month, today.day) < (parsed.month, parsed.day))
        value = AnalyticsService._unwrap_response_value(value)
        try:
            age = int(float(str(value).strip()))
            return age if 0 <= age <= 120 else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _age_band(age: int | None) -> str:
        if age is None:
            return "Unknown"
        if age < 18:
            return "Under 18"
        if age <= 24:
            return "18-24"
        if age <= 34:
            return "25-34"
        if age <= 44:
            return "35-44"
        if age <= 54:
            return "45-54"
        return "55+"

    @staticmethod
    def _looks_like_age_field(field_meta: dict) -> bool:
        haystack = f"{field_meta.get('key', '')} {field_meta.get('label', '')}".lower()
        return any(token in haystack for token in ("date_of_birth", "birth", "dob", "age"))

    @staticmethod
    def _field_bucket(field_meta: dict, total_submissions: int, responses: list) -> dict:
        field_type = field_meta.get("field_type") or ""
        answered_responses = [r for r in responses if AnalyticsService._is_answered(r.value)]
        answered_count = len({r.submission_id for r in answered_responses})
        missing_count = max(0, total_submissions - answered_count)
        result = {
            "key": field_meta.get("key"),
            "label": field_meta.get("label") or field_meta.get("key"),
            "field_type": field_type,
            "section": field_meta.get("section") or "Other",
            "is_current": field_meta.get("is_current", False),
            "answered_count": answered_count,
            "missing_count": missing_count,
            "answer_rate": round((answered_count / total_submissions) * 100, 2) if total_submissions else 0,
            "total_submissions": total_submissions,
            "options": [],
            "metrics": {},
        }

        if field_type in {SubmissionFormFieldType.SELECT, SubmissionFormFieldType.BOOLEAN}:
            counts = Counter()
            for response in answered_responses:
                for item in AnalyticsService._as_list(response.value):
                    counts[str(item)] += 1
            result["options"] = [
                {
                    "value": value,
                    "label": AnalyticsService._label_for_option(field_meta, value),
                    "count": count,
                    "percentage": round((count / answered_count) * 100, 2) if answered_count else 0,
                    "is_archived_option": value not in field_meta.get("option_map", {}) and bool(field_meta.get("option_map")),
                }
                for value, count in counts.most_common()
            ]
        elif field_type == SubmissionFormFieldType.MULTISELECT:
            counts = Counter()
            selections_total = 0
            for response in answered_responses:
                for item in AnalyticsService._as_list(response.value):
                    counts[str(item)] += 1
                    selections_total += 1
            result["options"] = [
                {
                    "value": value,
                    "label": AnalyticsService._label_for_option(field_meta, value),
                    "count": count,
                    "percentage": round((count / answered_count) * 100, 2) if answered_count else 0,
                    "selection_share": round((count / selections_total) * 100, 2) if selections_total else 0,
                    "is_archived_option": value not in field_meta.get("option_map", {}) and bool(field_meta.get("option_map")),
                }
                for value, count in counts.most_common()
            ]
            result["metrics"]["selections_total"] = selections_total
            result["metrics"]["average_selections_per_answer"] = round(selections_total / answered_count, 2) if answered_count else 0
        elif field_type in {SubmissionFormFieldType.DATE, SubmissionFormFieldType.NUMBER} and AnalyticsService._looks_like_age_field(field_meta):
            ages = [AnalyticsService._age_from_value(response.value) for response in answered_responses]
            valid_ages = [age for age in ages if age is not None]
            counts = Counter(AnalyticsService._age_band(age) for age in ages)
            band_order = ["Under 18", "18-24", "25-34", "35-44", "45-54", "55+", "Unknown"]
            result["options"] = [
                {
                    "value": band,
                    "label": band,
                    "count": counts.get(band, 0),
                    "percentage": round((counts.get(band, 0) / answered_count) * 100, 2) if answered_count else 0,
                }
                for band in band_order
                if counts.get(band, 0)
            ]
            result["metrics"]["average_age"] = round(sum(valid_ages) / len(valid_ages), 1) if valid_ages else None
            result["metrics"]["min_age"] = min(valid_ages) if valid_ages else None
            result["metrics"]["max_age"] = max(valid_ages) if valid_ages else None
        elif field_type == SubmissionFormFieldType.FILE:
            file_count = 0
            for response in answered_responses:
                items = AnalyticsService._as_list(response.value)
                file_count += len(items) if items else 1
            result["metrics"]["file_count"] = file_count
            result["metrics"]["average_files_per_answer"] = round(file_count / answered_count, 2) if answered_count else 0
        elif field_type in {SubmissionFormFieldType.TEXT, SubmissionFormFieldType.TEXTAREA, SubmissionFormFieldType.EMAIL, SubmissionFormFieldType.PHONE, SubmissionFormFieldType.URL}:
            lengths = []
            for response in answered_responses:
                value = AnalyticsService._unwrap_response_value(response.value)
                text = value if isinstance(value, str) else str(value)
                lengths.append(len(text.strip()))
            result["metrics"]["average_length"] = round(sum(lengths) / len(lengths), 1) if lengths else 0
            result["metrics"]["short_answers"] = sum(1 for length in lengths if length < 20)

        return result

    @staticmethod
    def form_response_analytics(program: Program, *, params=None):
        params = params or {}
        submissions = program.submissions.all()

        include_drafts = str(params.get("include_drafts", "")).lower() == "true"
        status_filter = params.get("status")
        date_from = params.get("date_from")
        date_to = params.get("date_to")

        if not include_drafts:
            submissions = submissions.exclude(current_status=SubmissionStatus.DRAFT)
        if status_filter:
            submissions = submissions.filter(current_status=status_filter)
        if date_from:
            submissions = submissions.filter(submitted_at__date__gte=date_from)
        if date_to:
            submissions = submissions.filter(submitted_at__date__lte=date_to)

        submission_ids = list(submissions.values_list("id", flat=True))
        total_submissions = len(submission_ids)
        responses = (
            SubmissionResponse.objects
            .filter(submission_id__in=submission_ids)
            .select_related("form_field", "form_field__section")
            .order_by("field_key_snapshot", "created_at")
        )

        current_fields = {}
        current_order = {}
        try:
            form = program.submission_form
            fields = form.fields.filter(is_active=True).select_related("section").prefetch_related("options").order_by("section__ordering", "ordering", "label")
            for index, field in enumerate(fields):
                key = field.key
                current_order[key] = index
                current_fields[key] = {
                    "key": key,
                    "label": field.label,
                    "field_type": field.field_type,
                    "section": field.section.title if field.section_id else "Other",
                    "is_current": True,
                    "option_map": {str(option.value): option.label for option in field.options.all()},
                }
        except Exception:
            form = None

        grouped = defaultdict(list)
        snapshot_meta = {}
        for response in responses:
            key = response.form_field.key if response.form_field_id else response.field_key_snapshot
            key = key or response.field_key_snapshot or "unknown"
            grouped[key].append(response)
            if key not in snapshot_meta:
                snapshot_meta[key] = {
                    "key": key,
                    "label": response.form_field.label if response.form_field_id else response.field_label_snapshot,
                    "field_type": response.form_field.field_type if response.form_field_id else response.field_type_snapshot,
                    "section": response.form_field.section.title if response.form_field_id and response.form_field.section_id else "Archived / removed fields",
                    "is_current": False,
                    "option_map": {},
                }

        fields_payload = []
        all_keys = set(current_fields) | set(grouped)
        for key in all_keys:
            meta = current_fields.get(key) or snapshot_meta.get(key) or {"key": key, "label": key, "field_type": "", "section": "Archived / removed fields", "is_current": False, "option_map": {}}
            fields_payload.append(AnalyticsService._field_bucket(meta, total_submissions, grouped.get(key, [])))

        fields_payload.sort(key=lambda item: (
            0 if item["is_current"] else 1,
            current_order.get(item["key"], 10_000),
            item["section"],
            item["label"] or item["key"],
        ))

        sections = []
        section_map = {}
        for field in fields_payload:
            name = field["section"] or ("Current form" if field["is_current"] else "Archived / removed fields")
            if not field["is_current"]:
                name = "Archived / removed fields"
            bucket = section_map.setdefault(name, {"section": name, "fields": []})
            bucket["fields"].append(field)
        sections = list(section_map.values())

        return {
            "program_id": str(program.id),
            "program_title": program.title,
            "form_id": str(form.id) if form else None,
            "form_version": form.version if form else None,
            "total_submissions": total_submissions,
            "filters": {
                "include_drafts": include_drafts,
                "status": status_filter or "",
                "date_from": date_from or "",
                "date_to": date_to or "",
            },
            "field_count": len(fields_payload),
            "archived_field_count": len([field for field in fields_payload if not field["is_current"]]),
            "sections": sections,
        }

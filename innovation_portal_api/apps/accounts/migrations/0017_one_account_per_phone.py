"""One person, one account: every saved phone in E.164, and guest records attached to the account that proved the phone.

Reports (never merges) two active accounts that end up with the same number: one audit entry per number, masked.
Reverse does nothing: the normal form is still the same number, and claimed records stay with their owner.
"""

from collections import defaultdict

from django.db import migrations

from apps.core.phone import mask_phone, try_normalize_phone


def _normalise(model, column):
    changed = 0
    for row in model.objects.exclude(**{column: ""}).only("pk", column).iterator():
        phone = try_normalize_phone(getattr(row, column))
        if phone and phone != getattr(row, column):
            model.objects.filter(pk=row.pk).update(**{column: phone})
            changed += 1
    return changed


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Draft = apps.get_model("submissions", "ApplicationDraft")
    Submission = apps.get_model("submissions", "Submission")
    Consent = apps.get_model("submissions", "ConsentRecord")
    Session = apps.get_model("channels", "JourneySession")
    AuditLog = apps.get_model("audit", "AuditLog")

    counts = {
        "accounts": _normalise(User, "phone_number"),
        "drafts": _normalise(Draft, "guest_phone"),
        "submissions": _normalise(Submission, "guest_phone"),
        "consents": _normalise(Consent, "guest_phone"),
        "channel_sessions": _normalise(Session, "phone"),
    }

    holders = defaultdict(list)
    for user_id, phone, verified in User.objects.filter(is_active=True).exclude(phone_number="").values_list("id", "phone_number", "phone_verified"):
        holders[phone].append((user_id, verified))
    duplicates = 0
    claimed = {"drafts": 0, "submissions": 0}
    for phone, people in holders.items():
        if len(people) > 1:
            duplicates += 1
            AuditLog.objects.create(
                action_type="phone_duplicate_found", target_model="User", target_id=str(people[0][0]),
                metadata={"phone": mask_phone(phone), "accounts": [str(user_id) for user_id, _ in people]}, item_label="Same phone on two accounts",
            )
            continue
        user_id, verified = people[0]
        if not verified:
            continue  # only a typed number: it proves nothing
        for draft in Draft.objects.filter(innovator__isnull=True, guest_phone=phone, guest_phone_verified_at__isnull=False):
            if not draft.is_general_idea and draft.status == "draft" and Draft.objects.filter(innovator_id=user_id, program_id=draft.program_id, status="draft").exists():
                continue
            Draft.objects.filter(pk=draft.pk).update(innovator_id=user_id)
            claimed["drafts"] += 1
            AuditLog.objects.create(action_type="guest_records_claimed", target_model="ApplicationDraft", target_id=str(draft.pk), after_state={"innovator": str(user_id)}, metadata={"phone": mask_phone(phone), "source": "migration"})
        for submission_id in list(Submission.objects.filter(innovator__isnull=True, guest_phone=phone).values_list("pk", flat=True)):
            Submission.objects.filter(pk=submission_id).update(innovator_id=user_id)
            claimed["submissions"] += 1
            AuditLog.objects.create(action_type="guest_records_claimed", target_model="Submission", target_id=str(submission_id), after_state={"innovator": str(user_id)}, metadata={"phone": mask_phone(phone), "source": "migration"})
    if any(counts.values()) or duplicates or any(claimed.values()):
        print(f"\n  one account per phone: normalised {counts}; same number on two accounts: {duplicates}; claimed {claimed}")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_u9_staff_admin"),
        ("audit", "0003_u9_staff_admin"),
        ("channels", "0005_whatsapp_example_files_and_send"),
        ("submissions", "0012_r54_entry_panel_feedback"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]

"""3.8 headline editor: the banner's comma-separated `highlighted_words` become `headline_marks`.

Converts the draft rows, every published page version and the home page snapshots waiting in approvals.
Nothing else changes, so the live home page looks the same after the migration.
"""

from django.db import migrations


def _upgrade_sections(sections):
    from apps.content.sections import upgrade_hero_settings

    changed = False
    for section in sections or []:
        if isinstance(section, dict) and section.get("type") == "hero_banner" and isinstance(section.get("settings"), dict):
            if "highlighted_words" in section["settings"]:
                section["settings"] = upgrade_hero_settings(section["settings"])
                changed = True
    return changed


def forwards(apps, schema_editor):
    from apps.content.sections import upgrade_hero_settings

    PageSection = apps.get_model("content", "PageSection")
    PageVersion = apps.get_model("content", "PageVersion")
    ApprovalRequest = apps.get_model("content", "ApprovalRequest")

    for row in PageSection.objects.filter(type="hero_banner"):
        if isinstance(row.settings, dict) and "highlighted_words" in row.settings:
            row.settings = upgrade_hero_settings(row.settings)
            row.save(update_fields=["settings"])
    for version in PageVersion.objects.all():
        if _upgrade_sections(version.sections):
            version.save(update_fields=["sections"])
    for approval in ApprovalRequest.objects.all():
        payload = approval.payload
        if isinstance(payload, dict) and _upgrade_sections(payload.get("sections")):
            approval.save(update_fields=["payload"])


class Migration(migrations.Migration):
    dependencies = [("content", "0022_own_approval_default_on")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]

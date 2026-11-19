"""Seed feature switches with today's behaviour as the default.

Reversible: the reverse step deletes only the flags added here. The values are copied
here on purpose so later changes to the code-side definitions do not rewrite history.
"""

from django.db import migrations

FLAGS = [
    # key, label, description, group, enabled, is_public, coming_soon
    ("password_sign_in", "Email and password sign-in", "People can sign in and register with an email address and password.", "sign_in", True, True, False),
    ("code_sign_in", "Sign-in with a code", "People can sign in with a one-time code sent to their phone or email.", "sign_in", True, True, False),
    ("staff_sso", "CEDA staff single sign-on", "Staff can sign in with their CEDA account. Needs an active, tested SSO connection.", "sign_in", False, True, False),
    ("guest_quick_start", "2-minute guest start", "People can start an idea before creating an account.", "ideas", True, True, False),
    ("similar_ideas", "Similar ideas", "Show similar ideas while someone writes theirs.", "ideas", True, True, False),
    ("public_search", "Website search", "Search box on the public website.", "website", True, True, False),
    ("subscriptions", "Email subscriptions", "Visitors can subscribe to news and new challenges.", "website", True, True, False),
    ("sms_messages", "SMS messages", "Send SMS, including sign-in codes. Needs an active SMS connection.", "messaging", False, False, False),
    ("whatsapp_messages", "WhatsApp messages", "Send WhatsApp messages.", "messaging", False, False, True),
    ("ussd", "USSD", "Let people use the portal from a USSD menu.", "messaging", False, False, True),
    ("translation_suggestions", "Translation suggestions", "Suggest Setswana text for staff to review.", "integrations", False, False, False),
]


def seed(apps, schema_editor):
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    for index, (key, label, description, group, enabled, is_public, coming_soon) in enumerate(FLAGS, start=1):
        FeatureFlag.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "description": description,
                "group": group,
                "enabled": enabled,
                "is_public": is_public,
                "coming_soon": coming_soon,
                "ordering": index * 10,
            },
        )


def unseed(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key__in=[row[0] for row in FLAGS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("platform_config", "0001_initial"),
    ]

    operations = [migrations.RunPython(seed, unseed)]

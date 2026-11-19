"""The four starter templates seeded by migration 0016 (English only; Setswana is added by staff).

``create_template`` takes the model classes as arguments so the migration can pass
historical models.
"""

TEMPLATE_CODES = ("tpl-challenge-entry", "tpl-pitch-an-idea", "tpl-quick-idea", "tpl-event-registration")

_STAGE_OPTIONS = [
    ("idea", "Just an idea", "Not tried yet"),
    ("prototype", "I have a prototype", "Tested with a few people"),
    ("selling", "I am already selling", "Customers are paying"),
]

TEMPLATES = [
    {
        "code": "tpl-challenge-entry",
        "title": "Challenge entry",
        "meta": {"description": "Full entry for an innovation challenge: you, your solution and your documents.", "estimated_minutes": 15, "works_on_ussd": False},
        "steps": [
            {
                "code": "about-you",
                "title": "About you",
                "tips": ["Use the name on your Omang so we can confirm who you are."],
                "rows": [
                    [("first_name", "text", "First name", "half", True), ("last_name", "text", "Last name", "half", True)],
                    [("phone", "phone", "Phone number", "half", True), ("email", "email", "Email address", "half", False)],
                    [("omang", "omang_id", "Omang number", "half", True), ("district", "district", "District", "half", True)],
                ],
            },
            {
                "code": "your-solution",
                "title": "Your solution",
                "tips": ["Say what problem you solve before how you solve it.", "Short sentences are easier for judges to read."],
                "rows": [
                    [("solution_name", "text", "What is your solution called?", "full", True)],
                    [("problem", "textarea", "What problem does it solve?", "full", True)],
                    [("solution", "textarea", "How does it solve it?", "full", True)],
                    [("stage", "radio", "How far along are you?", "full", True)],
                    [("has_company", "yes_no", "Do you have a registered company?", "half", True), ("company_name", "text", "Company name", "half", False)],
                ],
            },
            {
                "code": "documents",
                "title": "Documents",
                "tips": [],
                "rows": [
                    [("pitch_deck", "file", "Pitch deck (PDF)", "full", False)],
                    [("demo", "media", "Photo or short video of your solution", "full", False)],
                ],
            },
        ],
        "options": {"stage": _STAGE_OPTIONS},
        "conditions": {"company_name": {"visible_if": {"all": [{"field": "has_company", "op": "equals", "value": "yes"}]}}},
    },
    {
        "code": "tpl-pitch-an-idea",
        "title": "Pitch an idea",
        "meta": {"description": "A short pitch: the problem, your idea and who it helps.", "estimated_minutes": 8, "works_on_ussd": False},
        "steps": [
            {
                "code": "your-idea",
                "title": "Your idea",
                "tips": ["You can save and come back later."],
                "rows": [
                    [("idea_title", "text", "What is your idea called?", "full", True)],
                    [("problem", "textarea", "What problem does it solve?", "full", True)],
                    [("idea", "textarea", "Describe your idea", "full", True)],
                    [("who_benefits", "textarea", "Who will it help?", "full", False)],
                    [("stage", "radio", "How far along are you?", "full", True)],
                ],
            },
            {
                "code": "about-you",
                "title": "About you",
                "tips": [],
                "rows": [
                    [("full_name", "text", "Your name", "half", True), ("phone", "phone", "Phone number", "half", True)],
                    [("district", "district", "District", "half", True)],
                ],
            },
        ],
        "options": {"stage": _STAGE_OPTIONS},
        "conditions": {},
    },
    {
        "code": "tpl-quick-idea",
        "title": "Quick idea",
        "meta": {"description": "Four short questions. Works on USSD and WhatsApp.", "estimated_minutes": 2, "works_on_ussd": True},
        "steps": [
            {
                "code": "quick-idea",
                "title": "Your idea",
                "tips": [],
                "rows": [
                    [("idea_title", "text", "Your idea in a few words", "full", True)],
                    [("idea_summary", "textarea", "What does it do?", "full", True)],
                    [("district", "district", "District", "half", True), ("phone", "phone", "Phone number", "half", True)],
                ],
            }
        ],
        "options": {},
        "conditions": {},
    },
    {
        "code": "tpl-event-registration",
        "title": "Event registration",
        "meta": {"description": "Sign up for a workshop, bootcamp or pitch day.", "estimated_minutes": 3, "works_on_ussd": False},
        "steps": [
            {
                "code": "registration",
                "title": "Your details",
                "tips": [],
                "rows": [
                    [("full_name", "text", "Full name", "half", True), ("phone", "phone", "Phone number", "half", True)],
                    [("email", "email", "Email address", "half", False), ("organisation", "text", "Organisation or business", "half", False)],
                    [("needs_support", "yes_no", "Do you need any support to attend?", "full", True)],
                    [("support_details", "textarea", "Tell us what you need", "full", False)],
                ],
            }
        ],
        "options": {},
        "conditions": {"support_details": {"visible_if": {"all": [{"field": "needs_support", "op": "equals", "value": "yes"}]}}},
    },
]


def create_template(spec, *, SubmissionForm, FormSection, SubmissionFormField, SubmissionFormFieldOption):
    if SubmissionForm.objects.filter(code=spec["code"], is_template=True).exists():
        return None
    form = SubmissionForm.objects.create(
        title=spec["title"],
        code=spec["code"],
        description=spec["meta"]["description"],
        is_template=True,
        template_meta=spec["meta"],
        languages=["en", "tn"],
        status="draft",
    )
    for step_number, step in enumerate(spec["steps"], start=1):
        section = FormSection.objects.create(
            form=form,
            code=step["code"],
            title=step["title"],
            ordering=step_number,
            tips=[{"en": tip, "tn": ""} for tip in step["tips"]],
        )
        ordering = 0
        for row_number, row in enumerate(step["rows"], start=1):
            for key, field_type, label, width, required in row:
                ordering += 1
                conditions = spec["conditions"].get(key, {})
                field = SubmissionFormField.objects.create(
                    form=form,
                    section=section,
                    key=key,
                    field_type=field_type,
                    label=label,
                    width=width,
                    row=row_number,
                    ordering=ordering,
                    required=required,
                    visible_if=conditions.get("visible_if", {}),
                )
                for option_number, (value, option_label, description) in enumerate(spec["options"].get(key, []), start=1):
                    SubmissionFormFieldOption.objects.create(
                        field=field, value=value, label=option_label, description=description, ordering=option_number
                    )
    return form

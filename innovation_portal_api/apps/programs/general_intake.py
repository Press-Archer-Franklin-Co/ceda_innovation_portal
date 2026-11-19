"""The always-open "General ideas" programme.

Ideas sent without choosing a challenge belong to this programme. It is created
by data migration programs.0012 when the database already has a superuser to
own it, and otherwise the first time it is needed (GeneralIntakeService.program).

FORM_SPEC is plain data so the migration can use it with historical models.
"""
from __future__ import annotations

from datetime import datetime, timezone as dt_timezone

TITLE = "General ideas"
SLUG = "general-ideas"
DESCRIPTION = (
    "Share an idea with CEDA at any time of the year. You do not need to wait for a challenge: "
    "the innovation team reviews every idea and tells you what happens next."
)
OPENS_AT = datetime(2020, 1, 1, tzinfo=dt_timezone.utc)
CLOSES_AT = datetime(2099, 12, 31, 23, 59, tzinfo=dt_timezone.utc)
SYSTEM_OWNER_EMAIL = "general-ideas-owner@system.invalid"

FORM_TITLE = "Share your idea"
FORM_SPEC = [
    {
        "code": "your-idea",
        "title": "Your idea",
        "description": "Tell us what problem you want to solve and how.",
        "fields": [
            {"key": "problem", "label": "What problem does your idea solve?", "field_type": "textarea", "required": True},
            {"key": "solution", "label": "How does your idea solve it?", "field_type": "textarea", "required": True},
            {"key": "who_benefits", "label": "Who will benefit?", "field_type": "textarea", "required": False},
        ],
    },
    {
        "code": "about-you",
        "title": "About you",
        "description": "So that the innovation team can reach you.",
        "fields": [
            {"key": "first_name", "label": "First name", "field_type": "text", "required": True},
            {"key": "last_name", "label": "Last name", "field_type": "text", "required": True},
            {"key": "contact_number", "label": "Phone number", "field_type": "phone", "required": False},
        ],
    },
]


def program_defaults() -> dict:
    return {
        "title": TITLE,
        "description": DESCRIPTION,
        "status": "published",
        "is_public": True,
        "is_general_intake": True,
        "opening_date": OPENS_AT,
        "closing_date": CLOSES_AT,
        "allow_team_submission": False,
        "allow_individual_submission": True,
    }


def build_form(*, program, SubmissionForm, FormSection, SubmissionFormField) -> None:
    """Create the form for `program` if it has none. Works with real or historical models."""
    if SubmissionForm.objects.filter(program=program).exists():
        return
    form = SubmissionForm.objects.create(program=program, title=FORM_TITLE, code="general-ideas")
    field_order = 1
    for section_order, section_spec in enumerate(FORM_SPEC, start=1):
        section = FormSection.objects.create(
            form=form,
            title=section_spec["title"],
            code=section_spec["code"],
            description=section_spec["description"],
            ordering=section_order,
        )
        for field_spec in section_spec["fields"]:
            SubmissionFormField.objects.create(
                form=form,
                section=section,
                key=field_spec["key"],
                label=field_spec["label"],
                field_type=field_spec["field_type"],
                required=field_spec["required"],
                ordering=field_order,
            )
            field_order += 1


class GeneralIntakeService:
    @staticmethod
    def _owner():
        from apps.accounts.models import User

        owner = User.objects.filter(is_superuser=True, is_active=True).order_by("created_at").first()
        if owner:
            return owner
        owner = User.objects.filter(email=SYSTEM_OWNER_EMAIL).first()
        if owner:
            return owner
        # An inactive placeholder: it cannot sign in and only satisfies Program.owner.
        return User.objects.create_user(
            email=SYSTEM_OWNER_EMAIL, password=None, first_name="CEDA", last_name="Innovation Portal", is_active=False
        )

    @classmethod
    def program(cls):
        from django.db import IntegrityError, transaction

        from apps.core.constants import ProgramTypeCode
        from apps.programs.models import FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField

        program = Program.objects.filter(is_general_intake=True).select_related("program_type").order_by("created_at").first()
        if program is None:
            program_type, _ = ProgramType.objects.get_or_create(
                code=ProgramTypeCode.IDEA, defaults={"name": "Idea Submission"}
            )
            try:
                with transaction.atomic():
                    program = Program.objects.create(
                        slug=SLUG, program_type=program_type, owner=cls._owner(), **program_defaults()
                    )
            except IntegrityError:
                # Created by a concurrent request, or the slug is taken by another programme.
                program = Program.objects.filter(is_general_intake=True).first()
                if program is None:
                    program = Program.objects.create(
                        slug=f"{SLUG}-{program_type.code}", program_type=program_type, owner=cls._owner(), **program_defaults()
                    )
        build_form(program=program, SubmissionForm=SubmissionForm, FormSection=FormSection, SubmissionFormField=SubmissionFormField)
        return program

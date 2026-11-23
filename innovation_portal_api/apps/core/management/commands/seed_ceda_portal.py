from contextlib import nullcontext

from django.core.management.base import BaseCommand
from django.test.utils import override_settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.capability.models import CapabilityAssessment, CapabilityScore
from apps.communications.models import MessageTemplate
from apps.core.constants import (
    AssignmentRoleType,
    AssignmentStatus,
    CommunicationChannel,
    ProgramStatus,
    ProgramTypeCode,
    RoleType,
    SubmissionFormFieldType,
    SubmissionStatus,
    SubmissionType,
    TemplateCode,
)
from apps.evaluation.models import EvaluationRound, Rubric, RubricCriterion, ScoreSheet
from apps.evaluation.services import EvaluationService
from apps.profiles.models import InnovatorProfile
from apps.programs.models import FieldValidationRule, FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField, TermsAndConditions
from apps.submissions.draft_services import ApplicationDraftService
from apps.submissions.models import ApplicationDraft
from apps.support.models import FAQ, Guideline
from apps.teams.models import Team, TeamMember
from apps.workflow.services import WorkflowDefinitionService, WorkflowRuntimeService


class Command(BaseCommand):
    help = "Seed CEDA Innovation Portal flow types, programs, forms, workflows, drafts, and submissions."

    IDEA_FORM = {
        "sections": [
            {
                "title": "Idea Overview",
                "code": "idea_overview",
                "fields": [
                    {"label": "Problem Statement", "key": "problem_statement", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True, "rules": [("min_length", "30")]},
                    {"label": "Solution Summary", "key": "solution_summary", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True, "rules": [("min_length", "30")]},
                    {"label": "Expected Impact", "key": "expected_impact", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True},
                    {"label": "Needs Prototype Support", "key": "needs_prototype_support", "field_type": SubmissionFormFieldType.BOOLEAN, "required": False},
                ],
            },
            {
                "title": "Evidence And Media",
                "code": "evidence_media",
                "fields": [
                    {"label": "Prototype Link", "key": "prototype_link", "field_type": SubmissionFormFieldType.URL, "required": False},
                    {
                        "label": "Pitch Deck",
                        "key": "pitch_deck",
                        "field_type": SubmissionFormFieldType.FILE,
                        "required": False,
                        "required_if": {"field": "needs_prototype_support", "operator": "equals", "value": True},
                        "media_config": {"accepted_types": ["application/pdf"], "max_size_mb": 15, "min_files": 1, "max_files": 1},
                        "rules": [("file_type", "application/pdf"), ("file_size_mb", "15"), ("required_extension", ".pdf")],
                    },
                    {
                        "label": "Supporting Image",
                        "key": "supporting_image",
                        "field_type": SubmissionFormFieldType.FILE,
                        "required": False,
                        "media_config": {"accepted_types": ["image/png,image/jpeg"], "max_size_mb": 8},
                        "rules": [("file_size_mb", "8")],
                    },
                ],
            },
        ]
    }
    HACKATHON_FORM = {
        "sections": [
            {
                "title": "Team And Challenge",
                "code": "team_and_challenge",
                "fields": [
                    {"label": "Challenge Theme", "key": "challenge_theme", "field_type": SubmissionFormFieldType.SELECT, "required": True, "options": [("agribusiness", "Agribusiness"), ("manufacturing", "Manufacturing & Value Addition"), ("digital_services", "Digital Services")]},
                    {"label": "Team Story", "key": "team_story", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True, "rules": [("min_length", "20")]},
                    {"label": "Lead Skill Focus", "key": "lead_skill_focus", "field_type": SubmissionFormFieldType.TEXT, "required": True},
                    {"label": "Has Working Prototype", "key": "has_working_prototype", "field_type": SubmissionFormFieldType.BOOLEAN, "required": False},
                ],
            },
            {
                "title": "Solution And Demo",
                "code": "solution_and_demo",
                "fields": [
                    {"label": "Hack Problem", "key": "hack_problem", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True, "rules": [("min_length", "30")]},
                    {"label": "Proposed Solution", "key": "proposed_solution", "field_type": SubmissionFormFieldType.TEXTAREA, "required": True, "rules": [("min_length", "30")]},
                    {"label": "Demo Video Link", "key": "demo_video_link", "field_type": SubmissionFormFieldType.URL, "required": False},
                    {
                        "label": "Architecture Diagram",
                        "key": "architecture_diagram",
                        "field_type": SubmissionFormFieldType.FILE,
                        "required": False,
                        "required_if": {
                            "operator": "AND",
                            "conditions": [
                                {"field": "challenge_theme", "operator": "equals", "value": "agribusiness"},
                                {"field": "has_working_prototype", "operator": "equals", "value": True},
                            ],
                        },
                        "media_config": {"accepted_types": ["application/pdf", "image/png"], "max_size_mb": 10, "min_files": 1, "max_files": 2, "multiple": True},
                        "rules": [("file_size_mb", "10")],
                    },
                ],
            },
        ]
    }

    IDEA_WORKFLOW = [
        {"name": "Intake", "code": "intake", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.SUBMITTED},
        {"name": "Screening", "code": "screening", "order": 2, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.SCREENING},
        {"name": "Judging Review", "code": "judging_review", "order": 3, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.JUDGING_REVIEW, "execution_mode": "parallel_minimum", "minimum_completions_required": 1, "requires_assignment": True, "assignment_role": AssignmentRoleType.JUDGE, "minimum_assignments": 1, "requires_evaluation": True, "minimum_evaluations": 1},
        {"name": "Final Decision", "code": "final_decision", "order": 4, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.APPROVED},
    ]
    HACKATHON_WORKFLOW = [
        {"name": "Intake", "code": "intake", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.SUBMITTED},
        {"name": "Screening", "code": "screening", "order": 2, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.SCREENING},
        {"name": "Judging Review", "code": "judging_review", "order": 3, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.JUDGING_REVIEW, "execution_mode": "parallel_minimum", "minimum_completions_required": 2, "requires_assignment": True, "assignment_role": AssignmentRoleType.JUDGE, "minimum_assignments": 2, "requires_evaluation": True, "minimum_evaluations": 2},
        {"name": "Finalist Selection", "code": "finalist_selection", "order": 4, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.FINALIST},
        {"name": "Winner Decision", "code": "winner_decision", "order": 5, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": SubmissionStatus.WINNER},
    ]

    PROGRAM_SPECS = [
        {"slug": "internal-innovation-idea-2026", "title": "Internal Innovation Idea 2026", "type": ProgramTypeCode.IDEA, "public": False, "team": False},
        {"slug": "customer-experience-idea-call", "title": "Customer Experience Idea Call", "type": ProgramTypeCode.IDEA, "public": True, "team": True},
        {"slug": "enterprise-growth-idea-call", "title": "Enterprise Growth Idea Call", "type": ProgramTypeCode.IDEA, "public": True, "team": True},
        {"slug": "ceda-innovation-hackathon-2026", "title": "CEDA Innovation Hackathon 2026", "type": ProgramTypeCode.HACKATHON, "public": True, "team": True},
        {"slug": "youth-digital-hackathon", "title": "Youth Digital Hackathon", "type": ProgramTypeCode.HACKATHON, "public": True, "team": True},
        {"slug": "agribusiness-innovation-challenge", "title": "Agribusiness Innovation Challenge", "type": ProgramTypeCode.HACKATHON, "public": True, "team": True},
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--emit-emails",
            action="store_true",
            help="Allow seeded notification emails to use the configured email backend instead of suppressing them.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        suppress_emails = not options["emit_emails"]
        email_context = (
            override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
            if suppress_emails
            else nullcontext()
        )
        if suppress_emails:
            self.stdout.write(self.style.NOTICE("Seeding with email delivery suppressed. Use --emit-emails to print/send notifications."))
        with email_context:
            self._run_seed()

    def _run_seed(self):
        RoleService.ensure_default_roles()
        now = timezone.now()

        officer = self._user("innovation.officer@ceda.co.bw", "Keitumetse", "Molefe", [RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR])
        judge_one = self._user("judge.one@ceda.co.bw", "Boikanyo", "Marumo", [RoleType.JUDGE])
        judge_two = self._user("judge.two@ceda.co.bw", "Lorato", "Pheto", [RoleType.JUDGE])
        mentor = self._user("mentor@ceda.co.bw", "Goitse", "Thuto", [RoleType.MENTOR])
        innovator_one = self._user("innovator.one@ceda.co.bw", "Neo", "Kebadile", [RoleType.INNOVATOR])
        innovator_two = self._user("innovator.two@ceda.co.bw", "Amogelang", "Ramatlapeng", [RoleType.INNOVATOR])
        innovator_three = self._user("innovator.three@ceda.co.bw", "Botshelo", "Mokwadi", [RoleType.INNOVATOR])

        self._profile(innovator_one, "Gaborone", ["Agribusiness", "Customer Experience"], ["Product Strategy", "Pitching"])
        self._profile(innovator_two, "Francistown", ["Agritech", "IoT"], ["Engineering", "Embedded Systems"])
        self._profile(innovator_three, "Maun", ["Digital Inclusion", "Public Services"], ["UX Research", "Community Engagement"])

        terms, _ = TermsAndConditions.objects.get_or_create(
            title="CEDA Innovation Portal Standard Terms",
            defaults={"content": "Applicants confirm ownership, accuracy, and acceptance of CEDA innovation programme rules."},
        )

        idea_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea Submission", "description": "Idea submission flows for CEDA innovation calls."})
        hackathon_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon Application", "description": "Hackathon application flows for CEDA programmes."})

        team, _ = Team.objects.get_or_create(
            name="Team Pula Spark",
            owner=innovator_two,
            defaults={"description": "CEDA-aligned cross-functional product team."},
        )
        TeamMember.objects.get_or_create(team=team, user=innovator_two, defaults={"role": "lead"})
        TeamMember.objects.get_or_create(team=team, user=innovator_three, defaults={"role": "member"})

        idea_rubric = self._ensure_rubric("CEDA Idea Evaluation Rubric", idea_type, [("Novelty", 30), ("Feasibility", 25), ("Customer Value", 25), ("Execution Readiness", 20)])
        hack_rubric = self._ensure_rubric("CEDA Hackathon Judging Rubric", hackathon_type, [("Innovation Potential", 30), ("Execution Feasibility", 25), ("Team Capability", 20), ("Market Relevance", 15), ("Pitch Quality", 10)])

        seeded_programs = []
        for spec in self.PROGRAM_SPECS:
            program_type = idea_type if spec["type"] == ProgramTypeCode.IDEA else hackathon_type
            program = Program.objects.update_or_create(
                slug=spec["slug"],
                defaults={
                    "title": spec["title"],
                    "description": f"{spec['title']} for the CEDA Innovation Portal.",
                    "program_type": program_type,
                    "status": ProgramStatus.PUBLISHED,
                    "opening_date": now - timezone.timedelta(days=7),
                    "closing_date": now + timezone.timedelta(days=30),
                    "screening_start": now - timezone.timedelta(days=1),
                    "screening_end": now + timezone.timedelta(days=14),
                    "judging_start": now - timezone.timedelta(days=1),
                    "judging_end": now + timezone.timedelta(days=21),
                    "event_date": now + timezone.timedelta(days=50) if spec["type"] == ProgramTypeCode.HACKATHON else None,
                    "owner": officer,
                    "max_team_size": 6 if spec["team"] else 1,
                    "is_public": spec["public"],
                    "allow_team_submission": spec["team"],
                    "allow_individual_submission": True,
                    "terms_and_conditions": terms,
                    "published_at": now - timezone.timedelta(days=6),
                    "opens_at": now - timezone.timedelta(days=7),
                    "closes_at": now + timezone.timedelta(days=30),
                    "evaluation_opens_at": now - timezone.timedelta(days=1),
                    "evaluation_closes_at": now + timezone.timedelta(days=21),
                    "results_publish_at": now + timezone.timedelta(days=50),
                },
            )[0]
            self._ensure_form(program, self.IDEA_FORM if spec["type"] == ProgramTypeCode.IDEA else self.HACKATHON_FORM)
            round_obj = EvaluationRound.objects.get_or_create(
                program=program,
                name="Primary Review Round",
                defaults={"rubric": idea_rubric if spec["type"] == ProgramTypeCode.IDEA else hack_rubric, "required_judges": 1 if spec["type"] == ProgramTypeCode.IDEA else 2, "variance_threshold": 20},
            )[0]
            self._ensure_workflow(program, self.IDEA_WORKFLOW if spec["type"] == ProgramTypeCode.IDEA else self.HACKATHON_WORKFLOW, evaluation_round=round_obj)
            seeded_programs.append(program)

        for index, program in enumerate(seeded_programs):
            drafter = [innovator_one, innovator_two, innovator_three][index % 3]
            submitter = [innovator_two, innovator_three, innovator_one][index % 3]
            self._seed_active_draft(program, drafter, team if program.program_type.code == ProgramTypeCode.HACKATHON else None)
            submission = self._seed_submitted_example(program, submitter, team if program.program_type.code == ProgramTypeCode.HACKATHON else None)
            if program.program_type.code == ProgramTypeCode.HACKATHON and submission.current_status == SubmissionStatus.JUDGING_REVIEW:
                self._ensure_assignment(
                    submission=submission,
                    assignee=judge_one,
                    role_type=AssignmentRoleType.JUDGE,
                    assigned_by=officer,
                    deadline=now + timezone.timedelta(days=5),
                    accept_note="Accepted for judging.",
                )
                self._ensure_assignment(
                    submission=submission,
                    assignee=judge_two,
                    role_type=AssignmentRoleType.JUDGE,
                    assigned_by=officer,
                    deadline=now + timezone.timedelta(days=5),
                    accept_note="Accepted for judging.",
                )
                round_obj = program.evaluation_rounds.filter(active=True).first()
                criteria = list(round_obj.rubric.criteria.all())
                self._ensure_submitted_scores(
                    submission=submission,
                    judge=judge_one,
                    evaluation_round=round_obj,
                    scores=[{"criterion": item.id, "raw_score": min(item.max_score, 8), "comment": "Strong response"} for item in criteria],
                    overall_comment="Promising hackathon team.",
                )
            if index == 0:
                self._seed_returned_example(program, innovator_one)
                self._seed_idea_decision_examples(program, innovator_three, judge_one)
            if index == 3:
                self._seed_hackathon_outcomes(program, innovator_one, team, judge_one, judge_two, officer)
                self._seed_overdue_parallel_review_example(program, innovator_three, team, judge_one, judge_two, officer)

        assessment = CapabilityAssessment.objects.get_or_create(
            submission=seeded_programs[3].submissions.first(),
            assessed_by=mentor,
            defaults={"notes": "Strong execution potential and teamwork."},
        )[0]
        for dimension, score in {
            "technical_competence": 8.5,
            "innovation_potential": 8.0,
            "teamwork": 9.0,
            "execution": 7.5,
            "leadership": 8.0,
            "pitching": 7.0,
        }.items():
            CapabilityScore.objects.get_or_create(assessment=assessment, dimension=dimension, defaults={"score": score})

        for code, label in TemplateCode.choices:
            MessageTemplate.objects.get_or_create(
                code=code,
                defaults={
                    "name": label,
                    "subject_template": f"CEDA Innovation Portal: {label}",
                    "body_template": "Dear {{ innovator_name }}, there is an update for {{ submission_title }} in {{ program_name }}. Current status: {{ status }}.",
                    "channel": CommunicationChannel.EMAIL,
                    "active": True,
                },
            )

        faq_defaults = {
            "Can I save a CEDA innovation application and return later?": {
                "answer": "Yes. Drafts are stored separately and only become submissions after final submit.",
                "ordering": 1,
            },
            "When does workflow review begin?": {
                "answer": "The workflow starts only after a draft is fully submitted.",
                "ordering": 2,
            },
        }
        for question, defaults in faq_defaults.items():
            qs = FAQ.objects.filter(question=question)
            if qs.exists():
                qs.update(**defaults)
            else:
                FAQ.objects.create(question=question, **defaults)
        Guideline.objects.get_or_create(title="Public Tracking Guide", defaults={"content": "Public tracking shows safe status and stage data only. Internal notes and reviewer assignments are never exposed publicly.", "audience": "innovators"})
        Guideline.objects.get_or_create(title="Workflow Override Guide", defaults={"content": "Force actions and overrides are officer/admin only and always create workflow and audit history.", "audience": "staff"})

        self.stdout.write(self.style.SUCCESS("CEDA Innovation Portal seed data created successfully."))

    def _user(self, email, first_name, last_name, roles):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={"first_name": first_name, "last_name": last_name, "phone_number": "+26770000000"},
        )
        if created:
            user.set_password("StrongPass123!")
            user.save(update_fields=["password"])
        RoleService.assign_roles(user, roles)
        return user

    def _profile(self, user, region, sectors, skills):
        InnovatorProfile.objects.update_or_create(
            user=user,
            defaults={
                "region": region,
                "bio": f"{user.full_name} contributes to CEDA innovation programmes.",
                "sector_interests": sectors,
                "skills": skills,
                "certifications": ["CEDA Innovation Orientation"],
            },
        )

    def _ensure_rubric(self, title, program_type, criteria):
        rubric, _ = Rubric.objects.get_or_create(title=title, program_type=program_type, defaults={"active": True, "version": 1, "total_weight": 100})
        for ordering, (name, weight) in enumerate(criteria, start=1):
            RubricCriterion.objects.get_or_create(
                rubric=rubric,
                name=name,
                defaults={"description": name, "weight": weight, "min_score": 0, "max_score": 10, "ordering": ordering},
            )
        return rubric

    def _ensure_form(self, program, form_spec):
        form, _ = SubmissionForm.objects.update_or_create(
            program=program,
            defaults={"title": f"{program.title} Application Form", "description": f"Application form for {program.title}."},
        )
        for section_order, section_spec in enumerate(form_spec["sections"], start=1):
            section, _ = FormSection.objects.update_or_create(
                form=form,
                code=section_spec["code"],
                defaults={"title": section_spec["title"], "description": section_spec.get("description", ""), "ordering": section_order},
            )
            for field_order, field_spec in enumerate(section_spec["fields"], start=1):
                    defaults = {
                        "section": section,
                        "label": field_spec["label"],
                        "field_type": field_spec["field_type"],
                        "required": field_spec.get("required", False),
                        "placeholder": field_spec.get("placeholder", ""),
                        "help_text": field_spec.get("help_text", ""),
                        "ordering": field_order,
                        "media_config": field_spec.get("media_config", {}),
                    }
                    if "required_if" in field_spec:
                        defaults["required_if"] = field_spec["required_if"]
                    if "visible_if" in field_spec:
                        defaults["visible_if"] = field_spec["visible_if"]
                    if "enabled_if" in field_spec:
                        defaults["enabled_if"] = field_spec["enabled_if"]
                    field, _ = SubmissionFormField.objects.update_or_create(
                        form=form,
                        key=field_spec["key"],
                        defaults=defaults,
                    )
                    for option_order, option in enumerate(field_spec.get("options", []), start=1):
                        field.options.update_or_create(value=option[0], defaults={"label": option[1], "ordering": option_order})
                    for rule_type, rule_value in field_spec.get("rules", []):
                        FieldValidationRule.objects.get_or_create(field=field, rule_type=rule_type, rule_value=str(rule_value))
        # Prompt 31: a challenge takes entries only with a published form, so the seed publishes version 1.
        from apps.programs.general_idea import ensure_published_version

        ensure_published_version(form)
        return form

    def _ensure_workflow(self, program, steps, evaluation_round=None):
        definition = program.workflow_definitions.filter(is_active=True).first()
        if definition:
            return definition
        prepared_steps = []
        for step in steps:
            item = dict(step)
            if item.get("requires_evaluation"):
                item["evaluation_round"] = evaluation_round
            prepared_steps.append(item)
        return WorkflowDefinitionService.create_definition(program=program, name=f"{program.title} Workflow", steps_data=prepared_steps, activate=True)

    def _draft_payload(self, program):
        if program.program_type.code == ProgramTypeCode.IDEA:
            return {
                "problem_statement": "Small agribusinesses lose produce because they lack affordable cold storage close to their farms.",
                "solution_summary": "A shared, solar-powered cold storage service that farmers book through a simple mobile app.",
                "expected_impact": "Less post-harvest loss and higher incomes for farmers.",
                "needs_prototype_support": True,
                "prototype_link": "https://prototype.example.com/ceda-idea",
                "pitch_deck": [{"original_filename": "idea_pitch.pdf", "mime_type": "application/pdf", "size_bytes": 2200000}],
            }
        return {
            "challenge_theme": "agribusiness",
            "team_story": "We combine product, engineering, and research skills to solve a practical CEDA challenge.",
            "lead_skill_focus": "Product and engineering",
            "has_working_prototype": True,
            "hack_problem": "Teams need a stronger offline-first solution for field coordination in low-connectivity areas.",
            "proposed_solution": "A hackathon-ready platform with sync support, escalation routing, and practical service data capture.",
            "demo_video_link": "https://video.example.com/ceda-demo",
            "architecture_diagram": [{"original_filename": "architecture.pdf", "mime_type": "application/pdf", "size_bytes": 1700000}],
        }

    def _seed_active_draft(self, program, innovator, team=None):
        draft = ApplicationDraft.objects.filter(program=program, innovator=innovator, status=ApplicationDraft.STATUS_DRAFT).first()
        if draft:
            return draft
        return ApplicationDraftService.save_draft(
            program=program,
            innovator=innovator,
            submission_type=SubmissionType.IDEA if program.program_type.code == ProgramTypeCode.IDEA else SubmissionType.HACKATHON_APPLICATION,
            title=f"{program.title} Draft",
            draft_data=self._draft_payload(program),
            team=team,
            current_section_code=program.submission_form.sections.order_by("ordering").first().code,
            metadata={"seeded": True},
        )

    def _seed_submitted_example(self, program, innovator, team=None):
        existing = program.submissions.filter(innovator=innovator, title=f"{program.title} Submitted Example").first()
        if existing:
            return existing
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=innovator,
            submission_type=SubmissionType.IDEA if program.program_type.code == ProgramTypeCode.IDEA else SubmissionType.HACKATHON_APPLICATION,
            title=f"{program.title} Submitted Example",
            draft_data=self._draft_payload(program),
            team=team,
            current_section_code=program.submission_form.sections.order_by("ordering").first().code,
            metadata={"seeded": True, "example": "submitted"},
        )
        submission = ApplicationDraftService.submit_draft(draft=draft, actor=innovator)
        WorkflowRuntimeService.perform_action(submission=submission, actor=program.owner, action="approve", comment="Advanced to screening during seeding.")
        if program.program_type.code == ProgramTypeCode.HACKATHON:
            WorkflowRuntimeService.perform_action(submission=submission, actor=program.owner, action="approve", comment="Advanced to judging review during seeding.")
        return submission

    def _ensure_assignment(self, *, submission, assignee, role_type, assigned_by, deadline, accept_note=None):
        assignment = (
            Assignment.objects.filter(
                submission=submission,
                assignee=assignee,
                role_type=role_type,
                status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
            )
            .order_by("-created_at")
            .first()
        )
        if assignment is None:
            assignment = AssignmentService.create_assignment(
                submission=submission,
                assignee=assignee,
                role_type=role_type,
                assigned_by=assigned_by,
                deadline=deadline,
            )
        elif deadline and assignment.deadline != deadline:
            assignment.deadline = deadline
            assignment.save(update_fields=["deadline", "updated_at"])

        if accept_note and assignment.status == AssignmentStatus.ASSIGNED:
            AssignmentService.respond(assignment, assignee, accept=True, note=accept_note)
            assignment.refresh_from_db()
        return assignment

    def _ensure_submitted_scores(self, *, submission, judge, evaluation_round, scores, overall_comment):
        score_sheet = ScoreSheet.objects.filter(
            submission=submission,
            judge=judge,
            evaluation_round=evaluation_round,
            is_final=True,
        ).first()
        if score_sheet is not None:
            return score_sheet

        EvaluationService.save_scores(
            submission=submission,
            judge=judge,
            evaluation_round=evaluation_round,
            scores=scores,
            overall_comment=overall_comment,
        )
        return EvaluationService.submit_scores(submission=submission, judge=judge, evaluation_round=evaluation_round)

    def _seed_returned_example(self, program, innovator):
        existing = program.submissions.filter(title=f"{program.title} Returned Example").first()
        if existing:
            return existing
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=innovator,
            submission_type=SubmissionType.IDEA,
            title=f"{program.title} Returned Example",
            draft_data=self._draft_payload(program),
            current_section_code=program.submission_form.sections.order_by("ordering").first().code,
            metadata={"seeded": True, "example": "returned"},
        )
        submission = ApplicationDraftService.submit_draft(draft=draft, actor=innovator)
        WorkflowRuntimeService.perform_action(submission=submission, actor=program.owner, action="return", comment="Please clarify value proposition.")
        return submission

    def _seed_idea_decision_examples(self, program, innovator, judge):
        approved = program.submissions.filter(title=f"{program.title} Approved Example").first()
        if not approved:
            approved_draft = ApplicationDraftService.save_draft(
                program=program,
                innovator=innovator,
                submission_type=SubmissionType.IDEA,
                title=f"{program.title} Approved Example",
                draft_data=self._draft_payload(program),
                current_section_code=program.submission_form.sections.order_by("ordering").first().code,
                metadata={"seeded": True, "example": "approved"},
            )
            approved = ApplicationDraftService.submit_draft(draft=approved_draft, actor=innovator)
            WorkflowRuntimeService.perform_action(submission=approved, actor=program.owner, action="approve", comment="Screening complete.")
            approved.refresh_from_db()
            if approved.workflow_instance.current_step and not approved.workflow_instance.current_step.requires_assignment:
                WorkflowRuntimeService.perform_action(submission=approved, actor=program.owner, action="approve", comment="Advanced to judging review.")
                approved.refresh_from_db()
            self._ensure_assignment(
                submission=approved,
                assignee=judge,
                role_type=AssignmentRoleType.JUDGE,
                assigned_by=program.owner,
                deadline=timezone.now() + timezone.timedelta(days=3),
                accept_note="Accepted seeded idea review.",
            )
            round_obj = program.evaluation_rounds.filter(active=True).first()
            if round_obj:
                criteria = list(round_obj.rubric.criteria.all())
                self._ensure_submitted_scores(
                    submission=approved,
                    judge=judge,
                    evaluation_round=round_obj,
                    scores=[
                        {
                            "criterion": item.id,
                            "raw_score": min(item.max_score, 8),
                            "comment": "Seeded idea review",
                        }
                        for item in criteria
                    ],
                    overall_comment="Seeded approved idea example.",
                )
            WorkflowRuntimeService.perform_action(submission=approved, actor=program.owner, action="approve", comment="Judging review complete.")
            approved.refresh_from_db()
            if approved.workflow_instance and approved.workflow_instance.status == "running":
                WorkflowRuntimeService.perform_action(submission=approved, actor=program.owner, action="approve", comment="Idea approved.")
        rejected = program.submissions.filter(title=f"{program.title} Rejected Example").first()
        if not rejected:
            rejected_draft = ApplicationDraftService.save_draft(
                program=program,
                innovator=innovator,
                submission_type=SubmissionType.IDEA,
                title=f"{program.title} Rejected Example",
                draft_data=self._draft_payload(program),
                current_section_code=program.submission_form.sections.order_by("ordering").first().code,
                metadata={"seeded": True, "example": "rejected"},
            )
            rejected = ApplicationDraftService.submit_draft(draft=rejected_draft, actor=innovator)
            WorkflowRuntimeService.perform_action(submission=rejected, actor=program.owner, action="reject", comment="Seeded rejected example.")
        return approved, rejected

    def _seed_hackathon_outcomes(self, program, innovator, team, judge_one, judge_two, officer):
        existing = program.submissions.filter(title=f"{program.title} Winner Example").first()
        if existing:
            return existing
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=innovator,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title=f"{program.title} Winner Example",
            draft_data=self._draft_payload(program),
            team=team,
            current_section_code=program.submission_form.sections.order_by("ordering").first().code,
            metadata={"seeded": True, "example": "winner"},
        )
        submission = ApplicationDraftService.submit_draft(draft=draft, actor=innovator)
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Advanced to screening.")
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Shortlisted.")
        self._ensure_assignment(
            submission=submission,
            assignee=judge_one,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=officer,
            deadline=timezone.now() + timezone.timedelta(days=3),
            accept_note="Accepted.",
        )
        self._ensure_assignment(
            submission=submission,
            assignee=judge_two,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=officer,
            deadline=timezone.now() + timezone.timedelta(days=3),
            accept_note="Accepted.",
        )
        round_obj = program.evaluation_rounds.filter(active=True).first()
        criteria = list(round_obj.rubric.criteria.all())
        for judge, score in ((judge_one, 9), (judge_two, 8)):
            self._ensure_submitted_scores(
                submission=submission,
                judge=judge,
                evaluation_round=round_obj,
                scores=[{"criterion": item.id, "raw_score": min(item.max_score, score), "comment": "Seeded judging"} for item in criteria],
                overall_comment="Strong finalist submission.",
            )
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Moved to finalist.")
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Confirmed winner.")
        return submission

    def _seed_overdue_parallel_review_example(self, program, innovator, team, judge_one, judge_two, officer):
        existing = program.submissions.filter(title=f"{program.title} Overdue Parallel Review Example").first()
        if existing:
            return existing
        draft = ApplicationDraftService.save_draft(
            program=program,
            innovator=innovator,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title=f"{program.title} Overdue Parallel Review Example",
            draft_data=self._draft_payload(program),
            team=team,
            current_section_code=program.submission_form.sections.order_by("ordering").first().code,
            metadata={"seeded": True, "example": "overdue_parallel_review"},
        )
        submission = ApplicationDraftService.submit_draft(draft=draft, actor=innovator)
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Advanced to screening.")
        WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Advanced to judging.")
        overdue_deadline = timezone.now() - timezone.timedelta(days=2)
        self._ensure_assignment(
            submission=submission,
            assignee=judge_one,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=officer,
            deadline=overdue_deadline,
            accept_note="Accepted overdue seeded review.",
        )
        self._ensure_assignment(
            submission=submission,
            assignee=judge_two,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=officer,
            deadline=overdue_deadline,
            accept_note="Accepted overdue seeded review.",
        )
        return submission

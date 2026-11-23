"""
seed_idea_submission
====================
Recreates the CEDA Idea Submission program, form, rubric, evaluation round,
and workflow definition to match the old production form and review process.

Run with:
    python manage.py seed_idea_submission
    python manage.py seed_idea_submission --reset   # drop and rebuild

Workflow stages produced:
    1. officer_review     — parallel_minimum, minimum_completions_required=3
    2. committee_review   — parallel_minimum, minimum_completions_required=5
    3. decision           — sequential, innovation_officer
    4. approved / rejected (terminal nodes)
    5. incubation         — sequential (post-approval progression)
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.core.constants import (
    ProgramStatus,
    ProgramTypeCode,
    RoleType,
    SubmissionFormFieldType,
    SubmissionStatus,
)
from apps.evaluation.models import (
    EvaluationRound,
    MarkingCriteria,
    MarkingCriteriaItem,
    Rubric,
    RubricCriterion,
    StageEvaluationConfig,
)
from apps.programs.models import (
    FieldValidationRule,
    FormSection,
    Program,
    ProgramType,
    SubmissionForm,
    SubmissionFormField,
    SubmissionFormFieldOption,
    TermsAndConditions,
)
from apps.workflow.models import (
    AssignmentPolicy,
    NodeAction,
    NodeAssignmentBinding,
    WorkflowDefinition,
    WorkflowNode,
    WorkflowStep,
    WorkflowTransition,
)



TERMS_CONTENT = """
<h2>CEDA Innovation Portal – Terms and Conditions</h2>
<p>By submitting an idea through this portal you agree to the following:</p>
<ul>
  <li>All information provided is truthful and accurate to the best of your knowledge.</li>
  <li>Citizen Entrepreneurial Development Agency (CEDA) reserves the right to verify any
      claims made in the submission.</li>
  <li>Submissions become the property of CEDA for the purposes of review. Intellectual
      Property rights remain with the submitter unless a formal agreement is entered into.</li>
  <li>CEDA may contact you for further clarification or to request additional documentation.</li>
  <li>Submissions that do not meet the minimum requirements may be disqualified.</li>
  <li>All decisions made by the evaluation committee are final.</li>
</ul>
""".strip()

FORM_SECTIONS = [
    {
        "title": "Terms and Conditions",
        "code": "terms_and_conditions",
        "description": "Please read the Terms and Conditions carefully before proceeding.",
        "ordering": 1,
        "fields": [
            {
                "label": "I have read and agree to the Terms and Conditions",
                "key": "terms_accepted",
                "field_type": SubmissionFormFieldType.BOOLEAN,
                "required": True,
                "help_text": (
                    "You must accept the Terms and Conditions to submit your idea. "
                    "CEDA will use your submission data only for evaluation purposes."
                ),
                "ordering": 1,
            },
        ],
    },
    {
        "title": "General Information",
        "code": "general_information",
        "description": "Fill all fields with an asterisk (*) sign.",
        "ordering": 2,
        "fields": [
            {
                "label": "First Name",
                "key": "first_name",
                "field_type": SubmissionFormFieldType.TEXT,
                "required": True,
                "placeholder": "Enter first name",
                "ordering": 1,
                "rules": [("min_length", "2"), ("max_length", "100")],
            },
            {
                "label": "Last Name",
                "key": "last_name",
                "field_type": SubmissionFormFieldType.TEXT,
                "required": True,
                "placeholder": "Enter last name",
                "ordering": 2,
                "rules": [("min_length", "2"), ("max_length", "100")],
            },
            {
                "label": "Country Code",
                "key": "country_code",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 3,
                "options": [
                    ("+267", "Botswana (+267)"),
                    ("+27", "South Africa (+27)"),
                    ("+263", "Zimbabwe (+263)"),
                    ("+264", "Namibia (+264)"),
                    ("+265", "Malawi (+265)"),
                    ("+266", "Lesotho (+266)"),
                    ("+268", "Eswatini (+268)"),
                    ("+260", "Zambia (+260)"),
                    ("+255", "Tanzania (+255)"),
                    ("+254", "Kenya (+254)"),
                    ("+1", "USA/Canada (+1)"),
                    ("+44", "United Kingdom (+44)"),
                    ("+91", "India (+91)"),
                    ("+86", "China (+86)"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "Contact Number",
                "key": "contact_number",
                "field_type": SubmissionFormFieldType.PHONE,
                "required": True,
                "placeholder": "Number",
                "ordering": 4,
                "rules": [("min_length", "7"), ("max_length", "15")],
            },
            {
                "label": "Country",
                "key": "country",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 5,
                "options": [
                    ("BW", "Botswana"),
                    ("ZA", "South Africa"),
                    ("ZW", "Zimbabwe"),
                    ("NA", "Namibia"),
                    ("MW", "Malawi"),
                    ("LS", "Lesotho"),
                    ("SZ", "Eswatini"),
                    ("ZM", "Zambia"),
                    ("TZ", "Tanzania"),
                    ("KE", "Kenya"),
                    ("US", "United States"),
                    ("GB", "United Kingdom"),
                    ("IN", "India"),
                    ("CN", "China"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "ID / Passport Number",
                "key": "id_passport_number",
                "field_type": SubmissionFormFieldType.TEXT,
                "required": True,
                "placeholder": "Enter your ID/Passport Number",
                "ordering": 6,
                "rules": [("min_length", "5"), ("max_length", "30")],
            },
            {
                "label": "Email Address",
                "key": "email_address",
                "field_type": SubmissionFormFieldType.EMAIL,
                "required": True,
                "placeholder": "Email address",
                "help_text": "Kindly use the email address you registered with.",
                "ordering": 7,
            },
            {
                "label": "Person Type",
                "key": "person_type",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 8,
                "options": [
                    ("individual", "Individual"),
                    ("student", "Student"),
                    ("entrepreneur", "Entrepreneur"),
                    ("sme_owner", "SME Owner"),
                    ("corporate_employee", "Corporate Employee"),
                    ("researcher", "Researcher / Academic"),
                    ("ngo", "NGO / Non-Profit"),
                    ("government", "Government Employee"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "Gender",
                "key": "gender",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 9,
                "options": [
                    ("male", "Male"),
                    ("female", "Female"),
                    ("non_binary", "Non-Binary"),
                    ("prefer_not_to_say", "Prefer not to say"),
                ],
            },
            {
                "label": "Age Group",
                "key": "age_group",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 10,
                "options": [
                    ("under_18", "Under 18"),
                    ("18_24", "18 – 24"),
                    ("25_34", "25 – 34"),
                    ("35_44", "35 – 44"),
                    ("45_54", "45 – 54"),
                    ("55_plus", "55 and above"),
                ],
            },
            {
                "label": "LinkedIn Profile",
                "key": "linkedin_link",
                "field_type": SubmissionFormFieldType.URL,
                "required": False,
                "placeholder": "LinkedIn profile URL",
                "ordering": 11,
            },
            {
                "label": "Website / Portfolio",
                "key": "website_link",
                "field_type": SubmissionFormFieldType.URL,
                "required": False,
                "placeholder": "Company or portfolio website",
                "ordering": 12,
            },
        ],
    },
    {
        "title": "Solution Status",
        "code": "solution_status",
        "description": "Fill all fields with an asterisk (*) sign.",
        "ordering": 3,
        "fields": [
            {
                "label": "Maturity Stage",
                "key": "maturity_stage",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 1,
                "options": [
                    ("idea", "Idea / Concept"),
                    ("prototype", "Prototype"),
                    ("mvp", "Minimum Viable Product (MVP)"),
                    ("pilot", "Pilot"),
                    ("market_ready", "Market Ready"),
                    ("growth", "Growth / Scaling"),
                ],
            },
            {
                "label": "Regulatory Status",
                "key": "regulatory_status",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": True,
                "placeholder": "Enter regulatory status details",
                "help_text": (
                    "List agencies (BOB, BIS, CAAB, OS etc.) and locations "
                    "(BW, EU, US etc.) where your solution is or must be regulated."
                ),
                "ordering": 2,
                "rules": [("min_length", "10")],
            },
            {
                "label": "Patents Granted / Applied",
                "key": "patents_granted_applied",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": True,
                "placeholder": "Enter patent details",
                "help_text": (
                    "List patent numbers, status, and countries. "
                    "If no patents, state 'None'."
                ),
                "ordering": 3,
                "rules": [("min_length", "4")],
            },
        ],
    },
    {
        "title": "Solution Overview",
        "code": "solution_overview",
        "description": "Fill all fields with an asterisk (*) sign.",
        "ordering": 4,
        "fields": [
            {
                "label": "Solution Name",
                "key": "solution_name",
                "field_type": SubmissionFormFieldType.TEXT,
                "required": True,
                "placeholder": "Solution name",
                "ordering": 1,
                "rules": [("min_length", "3"), ("max_length", "200")],
            },
            {
                "label": "Focus Area",
                "key": "focus_area",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 2,
                "options": [
                    ("telecoms", "Telecommunications & Connectivity"),
                    ("fintech", "FinTech & Financial Inclusion"),
                    ("agritech", "AgriTech & Food Security"),
                    ("health", "e-Health & MedTech"),
                    ("edtech", "EdTech & Digital Skills"),
                    ("smart_city", "Smart City & Infrastructure"),
                    ("energy", "Environmental & Clean Energy"),
                    ("govtech", "GovTech & Public Services"),
                    ("ecommerce", "eCommerce & Retail"),
                    ("logistics", "Logistics & Supply Chain"),
                    ("media", "Media & Entertainment"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "Innovation Objectives",
                "key": "innovation_objectives",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 3,
                "options": [
                    ("reduce_costs", "Reduce costs"),
                    ("reduce_risk", "Reduce Risk"),
                    ("increase_revenue", "Increase revenue"),
                    ("increase_stakeholder_value", "Increase stakeholder value"),
                ],
            },
            {
                "label": "Problem Statement",
                "key": "problem_statement",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": True,
                "placeholder": "Summary of problem you are trying to solve",
                "ordering": 4,
                "rules": [("min_length", "50"), ("max_length", "2000")],
            },
            {
                "label": "Solution Summary",
                "key": "solution_summary",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": True,
                "placeholder": "Summary / overview of the solution",
                "ordering": 5,
                "rules": [("min_length", "50"), ("max_length", "2000")],
            },
            {
                "label": "Solution Benefits",
                "key": "solution_benefits",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": False,
                "placeholder": "Key benefits",
                "ordering": 6,
                "rules": [("max_length", "1000")],
            },
        ],
    },
    {
        "title": "Type of Innovation",
        "code": "type_of_innovation",
        "description": "All the fields are mandatory.",
        "ordering": 5,
        "fields": [
            {
                "label": "Who are your key partners or suppliers?",
                "key": "key_partners_suppliers",
                "field_type": SubmissionFormFieldType.TEXT,
                "required": True,
                "placeholder": "List your key partners or suppliers",
                "ordering": 1,
                "rules": [("min_length", "5"), ("max_length", "500")],
            },
            {
                "label": "How is your network structured?",
                "key": "network_structure",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 2,
                "options": [
                    ("sole", "Sole / Individual"),
                    ("partnership", "Partnership"),
                    ("consortium", "Consortium"),
                    ("franchise", "Franchise"),
                    ("cooperative", "Cooperative"),
                    ("corporate", "Corporate / Company"),
                    ("ngo", "NGO / Non-Profit"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "How can CEDA support you?",
                "key": "ceda_support_needed",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 3,
                "options": [
                    ("technical_support", "Technical support"),
                    ("sponsorship", "Sponsorship"),
                    ("market_access", "Market Access"),
                    ("training_acceleration", "Training/Acceleration"),
                    ("access_to_resources", "Access to resources"),
                    ("validation_endorsement", "Validation & Endorsement"),
                    ("funding_grants", "Funding/Grants"),
                ],
            },
            {
                "label": "What are the key resources?",
                "key": "key_resources",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 4,
                "options": [
                    ("physical", "Physical"),
                    ("financial", "Financial"),
                    ("intellectual_property", "Intellectual Property (IP)"),
                    ("human", "Human"),
                ],
            },
            {
                "label": "What are your key activities?",
                "key": "key_activities",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 5,
                "options": [
                    ("production", "Production"),
                    ("platform_network", "Platform/Network"),
                    ("problem_solving", "Problem Solving"),
                ],
            },
            {
                "label": "Revenue Streams (How will the business make money?)",
                "key": "revenue_streams",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 6,
                "options": [
                    ("usage_fee", "Usage fee"),
                    ("product_sales", "Product sales"),
                    ("lending", "Lending"),
                    ("brokerage_fees", "Brokerage fees"),
                    ("advertising", "Advertising"),
                    ("subscriptions", "Subscriptions/Ideas"),
                    ("consulting", "Consulting"),
                    ("licensing", "Licensing"),
                    ("franchise", "Franchise"),
                    ("freemium", "Freemium"),
                ],
            },
            {
                "label": "What are your value propositions (Unique selling points)?",
                "key": "value_propositions",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 7,
                "options": [
                    ("interest", "Interest"),
                    ("performance", "Performance"),
                    ("convenience", "Convenience"),
                    ("brand_status", "Brand status"),
                    ("market_domination", "Market domination"),
                    ("cost_reduction", "Cost reduction"),
                    ("accessibility", "Accessibility"),
                    ("product_reliability", "Product Reliability"),
                    ("added_functionality", "Added functionality"),
                    ("customization", "Customization"),
                    ("design", "Design"),
                    ("price", "Price"),
                    ("sustainability", "Sustainability"),
                    ("risk_reduction", "Risk reduction"),
                    ("process_optimization", "Process Optimization"),
                ],
            },
            {
                "label": "Strategies for managing customer relationships",
                "key": "customer_relationship_strategies",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 8,
                "options": [
                    ("surveys_polls", "Surveys & polls"),
                    ("community_engagement", "Community engagement"),
                    ("personalisation", "Personalisation"),
                    ("customer_support", "Customer support"),
                    ("transparency_trust", "Transparency & Trust"),
                    ("follow_ups", "Follow Ups"),
                ],
            },
            {
                "label": "Customer segment?",
                "key": "customer_segment",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "help_text": "Select the one that applies.",
                "ordering": 9,
                "options": [
                    ("demographic", "Demographic"),
                    ("geographic", "Geographic"),
                    ("motivated", "Motivated"),
                    ("behavioural", "Behavioural"),
                    ("needs_based", "Needs based"),
                ],
            },
            {
                "label": "How do you engage with your customers?",
                "key": "customer_engagement",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 10,
                "options": [
                    ("feedback_loops", "Feedback loops"),
                    ("emotional_connection", "Emotional Connection"),
                    ("interactive_content", "Interactive content"),
                    ("customer_journey_mapping", "Customer journey mapping"),
                    ("experience_simplification", "Experience Simplification"),
                ],
            },
            {
                "label": "Channels to reach the customer segment?",
                "key": "customer_channels",
                "field_type": SubmissionFormFieldType.MULTISELECT,
                "required": True,
                "help_text": "Check all that apply.",
                "ordering": 11,
                "options": [
                    ("social_media", "Social media"),
                    ("indirect_channels", "Indirect channels"),
                    ("convenience", "Convenience"),
                    ("digital_banners", "Digital/banners"),
                    ("collaborative", "Collaborative"),
                    ("on_demand", "On-demand"),
                    ("click_collect", "Click & collect"),
                    ("popup_store", "Popup store"),
                    ("multichannel", "Multichannel"),
                ],
            },
        ],
    },
    {
        "title": "Additional Information",
        "code": "additional_information",
        "description": "",
        "ordering": 6,
        "fields": [
            {
                "label": "How would you like to collaborate with us?",
                "key": "collaboration_type",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 1,
                "options": [
                    ("rd_contract", "Research and Development contract"),
                    ("licensing", "Licensing"),
                    ("joint_development", "Joint Development"),
                    ("supply", "Supply"),
                    ("asset_sale", "Asset Sale"),
                ],
            },
            {
                "label": "How did you hear about us?",
                "key": "how_did_you_hear",
                "field_type": SubmissionFormFieldType.SELECT,
                "required": True,
                "ordering": 2,
                "options": [
                    ("social_media", "Social media"),
                    ("ceda_website", "CEDA website"),
                    ("word_of_mouth", "Word of mouth"),
                    ("ceda_staff", "CEDA staff member"),
                    ("event_conference", "Event / Conference"),
                    ("newspaper_radio", "Newspaper / Radio"),
                    ("university_college", "University / College"),
                    ("other", "Other"),
                ],
            },
            {
                "label": "Additional Comments",
                "key": "additional_comments",
                "field_type": SubmissionFormFieldType.TEXTAREA,
                "required": False,
                "placeholder": "Any additional information you would like to share",
                "ordering": 3,
                "rules": [("max_length", "1000")],
            },
        ],
    },
    {
        "title": "Solution Documentation",
        "code": "solution_documentation",
        "description": "Fields marked with * are mandatory.",
        "ordering": 7,
        "fields": [
            {
                "label": "Business Proposal & Supporting Documentation",
                "key": "business_proposal_document",
                "field_type": SubmissionFormFieldType.FILE,
                "required": True,
                "help_text": (
                    "Upload your business proposal and all supporting documentation "
                    "in ONE PDF document only (PDF/Certified Omang Copy, Patents, "
                    "Trademarks, etc.).\n"
                    "NB: Your document submission MUST be a single PDF file."
                ),
                "ordering": 1,
                "media_config": {
                    "accepted_types": ["application/pdf"],
                    "max_size_mb": 25,
                    "min_files": 1,
                    "max_files": 1,
                    "multiple": False,
                },
                "rules": [
                    ("file_type", "application/pdf"),
                    ("file_size_mb", "25"),
                    ("required_extension", ".pdf"),
                ],
            },
        ],
    },
]



COMMITTEE_RUBRIC_CRITERIA = [
    {"name": "Alignment with Values & Ethical Standards", "description": "Desirability: alignment with CEDA values, ethics, and responsible innovation standards.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Market Demand", "description": "Desirability: evidence that users, customers, or internal stakeholders need the proposed idea.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Technical Feasibility", "description": "Feasibility: technical practicality of building or implementing the idea.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Operational Feasibility", "description": "Feasibility: practicality of operating, supporting, and sustaining the idea in CEDA's environment.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Legal and Regulatory Feasibility", "description": "Feasibility: fit with legal, regulatory, compliance, and governance requirements.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Financial Viability", "description": "Viability: financial practicality, affordability, and sustainability of the idea.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Competitive Advantage", "description": "Viability: strength of the idea's differentiation and advantage over existing alternatives.", "weight": 10, "max_score": 10, "comment_required_below": 11},
    {"name": "Risk Assessment", "description": "Viability: clarity and manageability of key implementation, business, and operational risks.", "weight": 10, "max_score": 10, "comment_required_below": 11},
]


class Command(BaseCommand):
    help = "Seed the CEDA Idea Submission program, form, rubric and workflow."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing CEDA Idea Submission program and rebuild from scratch.",
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            if options["reset"]:
                self._reset()
            self._run()
        self.stdout.write(self.style.SUCCESS("✓ CEDA Idea Submission seeded successfully."))


    def _reset(self):
        Program.objects.filter(slug="ceda-idea-submission").delete()
        self.stdout.write("  Deleted existing ceda-idea-submission program.")


    def _run(self):
        admin = User.objects.filter(is_superuser=True).first()
        if not admin:
            raise RuntimeError("No superuser found — run bootstrap_admin first.")

        terms, _ = TermsAndConditions.objects.get_or_create(
            title="CEDA Innovation Portal – Idea Submission Terms",
            defaults={"content": TERMS_CONTENT, "active": True},
        )
        self.stdout.write("  ✓ Terms & Conditions")

        program_type, _ = ProgramType.objects.get_or_create(
            code=ProgramTypeCode.IDEA,
            defaults={"name": "Idea Submission", "description": "Idea submission flows for CEDA innovation calls."},
        )

        now = timezone.now()
        program, created = Program.objects.get_or_create(
            slug="ceda-idea-submission",
            defaults={
                "title": "CEDA Idea Submission",
                "description": (
                    "Submit your innovation idea to CEDA. Selected ideas receive mentorship, "
                    "resources, and potential funding or incubation support."
                ),
                "program_type": program_type,
                # Prompt 31: ordinary ideas go to General ideas only. This programme keeps the old production
                # form, rubric and workflow as a reference, archived and not public.
                "status": ProgramStatus.ARCHIVED,
                "opening_date": now,
                "closing_date": now.replace(year=now.year + 1),
                "owner": admin,
                "is_public": False,
                "allow_individual_submission": True,
                "allow_team_submission": False,
                "terms_and_conditions": terms,
                "published_at": now,
            },
        )
        if created:
            self.stdout.write("  ✓ Program created")
        else:
            self.stdout.write("  ✓ Program already exists — skipping form rebuild")
            if not SubmissionForm.objects.filter(program=program).exists():
                self._build_form(program)
            self._ensure_rubric_and_round(program, program_type)
            self._ensure_workflow(program, admin)
            self._ensure_current_workflow_scorecard(program, admin)
            return

        self._build_form(program)

        self._ensure_rubric_and_round(program, program_type)

        self._ensure_workflow(program, admin)
        self._ensure_current_workflow_scorecard(program, admin)


    def _build_form(self, program):
        form = SubmissionForm.objects.create(
            program=program,
            title="CEDA Idea Submission Form",
            code="ceda-idea-submission-form",
            description="Full idea submission form replicating the CEDA production form.",
            version=1,
            active=True,
        )

        for sec_def in FORM_SECTIONS:
            section = FormSection.objects.create(
                form=form,
                title=sec_def["title"],
                code=sec_def["code"],
                description=sec_def.get("description", ""),
                ordering=sec_def["ordering"],
                is_active=True,
            )
            for fld_def in sec_def["fields"]:
                field = SubmissionFormField.objects.create(
                    form=form,
                    section=section,
                    label=fld_def["label"],
                    key=fld_def["key"],
                    field_type=fld_def["field_type"],
                    required=fld_def.get("required", False),
                    placeholder=fld_def.get("placeholder", ""),
                    help_text=fld_def.get("help_text", ""),
                    media_config=fld_def.get("media_config", {}),
                    ordering=fld_def.get("ordering", 1),
                    is_active=True,
                    required_if=fld_def.get("required_if", {}),
                    visible_if=fld_def.get("visible_if", {}),
                    enabled_if=fld_def.get("enabled_if", {}),
                )

                for i, (value, label) in enumerate(fld_def.get("options", []), start=1):
                    SubmissionFormFieldOption.objects.create(
                        field=field, label=label, value=value, ordering=i,
                    )

                for rule_type, rule_value in fld_def.get("rules", []):
                    FieldValidationRule.objects.create(
                        field=field, rule_type=rule_type, rule_value=rule_value, is_active=True,
                    )

        self.stdout.write(f"  ✓ Form built ({len(FORM_SECTIONS)} sections)")


    def _ensure_rubric_and_round(self, program, program_type):
        rubric, _ = Rubric.objects.get_or_create(
            title="CEDA Idea Evaluation Rubric",
            program_type=program_type,
            defaults={"active": True, "version": 1, "total_weight": 80},
        )
        rubric.active = True
        rubric.total_weight = 80
        rubric.save(update_fields=["active", "total_weight", "updated_at"])

        current_names = [crit["name"] for crit in COMMITTEE_RUBRIC_CRITERIA]
        RubricCriterion.objects.filter(rubric=rubric).exclude(name__in=current_names).delete()
        for i, crit in enumerate(COMMITTEE_RUBRIC_CRITERIA, start=1):
            criterion, _ = RubricCriterion.objects.get_or_create(
                rubric=rubric,
                name=crit["name"],
                defaults={
                    "description": crit["description"],
                    "weight": crit["weight"],
                    "min_score": 0,
                    "max_score": crit["max_score"],
                    "ordering": i,
                },
            )
            criterion.description = crit["description"]
            criterion.weight = crit["weight"]
            criterion.min_score = 0
            criterion.max_score = crit["max_score"]
            criterion.ordering = i
            criterion.save(update_fields=["description", "weight", "min_score", "max_score", "ordering", "updated_at"])

        EvaluationRound.objects.get_or_create(
            program=program,
            name="Evaluation Committee Review",
            defaults={
                "rubric": rubric,
                "required_judges": 5,
                "variance_threshold": 15,
                "active": True,
            },
        )
        self.stdout.write(f"  ✓ Rubric ({len(COMMITTEE_RUBRIC_CRITERIA)} criteria) + EvaluationRound (quorum=5)")

    def _ensure_marking_criteria(self, admin):
        criteria, _ = MarkingCriteria.objects.get_or_create(
            title="Innovation Idea Scorecard",
            defaults={
                "description": "Official CEDA Innovation Idea Scorecard from the legacy Idea Scorecard form. Total score: 80.",
                "is_active": True,
                "created_by": admin,
            },
        )
        criteria.description = "Official CEDA Innovation Idea Scorecard from the legacy Idea Scorecard form. Total score: 80."
        criteria.is_active = True
        if not criteria.created_by_id:
            criteria.created_by = admin
        criteria.save(update_fields=["description", "is_active", "created_by", "updated_at"])

        current_names = [item["name"] for item in COMMITTEE_RUBRIC_CRITERIA]
        MarkingCriteriaItem.objects.filter(criteria=criteria).exclude(name__in=current_names).delete()
        for ordering, item in enumerate(COMMITTEE_RUBRIC_CRITERIA, start=1):
            criterion_item, _ = MarkingCriteriaItem.objects.get_or_create(
                criteria=criteria,
                name=item["name"],
                defaults={
                    "description": item["description"],
                    "min_score": 0,
                    "max_score": item["max_score"],
                    "weight": item["weight"],
                    "ordering": ordering,
                    "comment_required_below": item.get("comment_required_below"),
                },
            )
            criterion_item.description = item["description"]
            criterion_item.min_score = 0
            criterion_item.max_score = item["max_score"]
            criterion_item.weight = item["weight"]
            criterion_item.ordering = ordering
            criterion_item.comment_required_below = item.get("comment_required_below")
            criterion_item.save(update_fields=["description", "min_score", "max_score", "weight", "ordering", "comment_required_below", "updated_at"])
        return criteria

    def _ensure_current_workflow_scorecard(self, program, admin):
        criteria = self._ensure_marking_criteria(admin)
        officer_step = (
            WorkflowStep.objects
            .filter(
                workflow_definition__program=program,
                workflow_definition__is_current=True,
                code="officer_review",
            )
            .first()
        )
        if officer_step:
            officer_config, _ = StageEvaluationConfig.objects.get_or_create(
                workflow_step=officer_step,
                defaults={
                    "marking_criteria": criteria,
                    "required_reviewer_count": 3,
                    "review_mode": StageEvaluationConfig.REVIEW_MODE_FIXED_COUNT,
                    "review_window_hours": 0,
                    "minimum_reviews_required": 1,
                    "maximum_reviews_allowed": None,
                    "aggregation_method": StageEvaluationConfig.AGGREGATION_AVERAGE,
                    "threshold_reject_below": 40,
                    "threshold_pass_above": 70,
                    "blind_scoring": True,
                    "allow_applicant_feedback": True,
                    "created_by": admin,
                },
            )
            officer_config.marking_criteria = criteria
            officer_config.rubric = None
            officer_config.required_reviewer_count = 3
            officer_config.review_mode = StageEvaluationConfig.REVIEW_MODE_FIXED_COUNT
            officer_config.review_window_hours = 0
            officer_config.minimum_reviews_required = 1
            officer_config.maximum_reviews_allowed = None
            officer_config.save(update_fields=[
                "marking_criteria", "rubric", "required_reviewer_count", "review_mode",
                "review_window_hours", "minimum_reviews_required", "maximum_reviews_allowed",
                "updated_at",
            ])

        committee_step = (
            WorkflowStep.objects
            .filter(
                workflow_definition__program=program,
                workflow_definition__is_current=True,
                code="committee_review",
            )
            .first()
        )
        if not committee_step:
            return
        config, _ = StageEvaluationConfig.objects.get_or_create(
            workflow_step=committee_step,
            defaults={
                "marking_criteria": criteria,
                "required_reviewer_count": 5,
                "review_mode": StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW,
                "review_window_hours": 48,
                "minimum_reviews_required": 1,
                "maximum_reviews_allowed": 20,
                "aggregation_method": StageEvaluationConfig.AGGREGATION_AVERAGE,
                "threshold_reject_below": 40,
                "threshold_pass_above": 70,
                "blind_scoring": True,
                "allow_applicant_feedback": True,
                "created_by": admin,
            },
        )
        config.marking_criteria = criteria
        config.rubric = None
        config.required_reviewer_count = 5
        config.review_mode = StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
        config.review_window_hours = 48
        config.minimum_reviews_required = 1
        config.maximum_reviews_allowed = 20
        config.save(update_fields=[
            "marking_criteria", "rubric", "required_reviewer_count", "review_mode",
            "review_window_hours", "minimum_reviews_required", "maximum_reviews_allowed",
            "updated_at",
        ])
        self.stdout.write("  ✓ Current workflow scorecard linked")


    def _ensure_workflow(self, program, admin):
        if WorkflowDefinition.objects.filter(program=program, is_active=True).exists():
            self.stdout.write("  ✓ Active workflow already exists — skipping")
            return

        wf = WorkflowDefinition.objects.create(
            name="CEDA Idea Submission Review",
            code="ceda-idea-review",
            description=(
                "Full review workflow: innovation officer quorum (3) → "
                "committee evaluation quorum (5) → decision → incubation."
            ),
            program=program,
            status=WorkflowDefinition.STATUS_ACTIVE,
            version=1,
            is_current=True,
            is_active=True,
            created_by=admin,
        )


        n_start = WorkflowNode.objects.create(
            workflow_definition=wf, name="Submitted", code="submitted",
            node_type=WorkflowNode.TYPE_START,
            description="Innovator has submitted an idea draft.",
            is_initial=True, is_terminal=False, position_x=0, position_y=0,
        )
        n_officer = WorkflowNode.objects.create(
            workflow_definition=wf, name="Innovation Officer Review", code="officer_review",
            node_type=WorkflowNode.TYPE_REVIEW_TASK,
            description=(
                "Minimum 3 Innovation Officers must independently review the submission. "
                "Each can approve, request more info, or screen out."
            ),
            is_initial=False, is_terminal=False, position_x=200, position_y=0,
        )
        n_committee = WorkflowNode.objects.create(
            workflow_definition=wf, name="Evaluation Committee Review", code="committee_review",
            node_type=WorkflowNode.TYPE_REVIEW_TASK,
            description=(
                "Minimum 5 Evaluation Committee members (judges) must score the submission "
                "using the official rubric before a decision can be made."
            ),
            is_initial=False, is_terminal=False, position_x=400, position_y=0,
        )
        n_returned = WorkflowNode.objects.create(
            workflow_definition=wf, name="Returned to Innovator", code="returned",
            node_type=WorkflowNode.TYPE_USER_TASK,
            description="Submission returned to innovator for additional information or corrections.",
            is_initial=False, is_terminal=False, position_x=200, position_y=150,
        )
        n_decision = WorkflowNode.objects.create(
            workflow_definition=wf, name="Final Decision", code="final_decision",
            node_type=WorkflowNode.TYPE_DECISION,
            description="Senior officer / management makes the final funding / approval decision.",
            is_initial=False, is_terminal=False, position_x=600, position_y=0,
        )
        n_approved = WorkflowNode.objects.create(
            workflow_definition=wf, name="Approved / Funded", code="approved",
            node_type=WorkflowNode.TYPE_END,
            description="Idea approved for funding or incubation support.",
            is_initial=False, is_terminal=True, position_x=800, position_y=-80,
        )
        n_incubation = WorkflowNode.objects.create(
            workflow_definition=wf, name="Incubation", code="incubation",
            node_type=WorkflowNode.TYPE_USER_TASK,
            description="Idea enters the CEDA incubation / acceleration programme.",
            is_initial=False, is_terminal=False, position_x=800, position_y=0,
        )
        n_rejected = WorkflowNode.objects.create(
            workflow_definition=wf, name="Rejected", code="rejected",
            node_type=WorkflowNode.TYPE_END,
            description="Idea not selected.",
            is_initial=False, is_terminal=True, position_x=800, position_y=80,
        )

        NodeAction.objects.create(node=n_officer, key="approve", label="Approve — advance to committee", requires_comment=False, is_active=True)
        NodeAction.objects.create(node=n_officer, key="return", label="Return — request more information", requires_comment=True, is_active=True)
        NodeAction.objects.create(node=n_officer, key="screen_out", label="Screen Out — does not meet criteria", requires_comment=True, is_active=True)

        NodeAction.objects.create(node=n_committee, key="score_submitted", label="Submit Evaluation Score", requires_comment=False, is_active=True)

        NodeAction.objects.create(node=n_returned, key="resubmit", label="Resubmit with updates", requires_comment=False, is_active=True)

        NodeAction.objects.create(node=n_decision, key="approve", label="Approve for Funding", requires_comment=True, is_active=True)
        NodeAction.objects.create(node=n_decision, key="incubate", label="Approve for Incubation", requires_comment=True, is_active=True)
        NodeAction.objects.create(node=n_decision, key="reject", label="Reject", requires_comment=True, is_terminal_action=True, is_active=True)

        NodeAction.objects.create(node=n_incubation, key="complete_incubation", label="Mark Incubation Complete", requires_comment=False, is_active=True)

        officer_policy, _ = AssignmentPolicy.objects.get_or_create(
            code="role-innovation-officer",
            defaults={
                "name": "Innovation Officer Pool",
                "policy_type": AssignmentPolicy.TYPE_ROLE_BASED,
                "config_json": {"role": RoleType.INNOVATION_OFFICER},
                "sla_hours": 72,
                "is_active": True,
            },
        )
        judge_policy, _ = AssignmentPolicy.objects.get_or_create(
            code="role-judge",
            defaults={
                "name": "Judge / Evaluator Pool",
                "policy_type": AssignmentPolicy.TYPE_ROLE_BASED,
                "config_json": {"role": RoleType.JUDGE},
                "sla_hours": 120,
                "is_active": True,
            },
        )
        admin_policy, _ = AssignmentPolicy.objects.get_or_create(
            code="role-administrator",
            defaults={
                "name": "Administrator Pool",
                "policy_type": AssignmentPolicy.TYPE_ROLE_BASED,
                "config_json": {"role": RoleType.ADMINISTRATOR},
                "sla_hours": 48,
                "is_active": True,
            },
        )

        NodeAssignmentBinding.objects.create(
            node=n_officer,
            assignment_policy=officer_policy,
            minimum_assignees=3,
            maximum_assignees=10,
            execution_mode=NodeAssignmentBinding.EXECUTION_PARALLEL_MINIMUM,
            minimum_completions_required=3,
            is_active=True,
        )

        NodeAssignmentBinding.objects.create(
            node=n_committee,
            assignment_policy=judge_policy,
            minimum_assignees=5,
            maximum_assignees=20,
            execution_mode=NodeAssignmentBinding.EXECUTION_PARALLEL_MINIMUM,
            minimum_completions_required=5,
            is_active=True,
        )

        NodeAssignmentBinding.objects.create(
            node=n_decision,
            assignment_policy=admin_policy,
            minimum_assignees=1,
            maximum_assignees=1,
            execution_mode=NodeAssignmentBinding.EXECUTION_SEQUENTIAL,
            minimum_completions_required=1,
            is_active=True,
        )

        from apps.core.constants import AssignmentRoleType

        WorkflowStep.objects.create(
            workflow_definition=wf, name="Submitted", code="submitted",
            order=1, role_required=RoleType.INNOVATOR,
            actions_allowed=["submit"],
            submission_status=SubmissionStatus.SUBMITTED,
            execution_mode=WorkflowStep.EXECUTION_SEQUENTIAL,
            minimum_completions_required=1,
            due_in_hours=0,
            requires_assignment=False, minimum_assignments=0,
            requires_evaluation=False, minimum_evaluations=0,
            is_active=True,
        )
        WorkflowStep.objects.create(
            workflow_definition=wf, name="Innovation Officer Review", code="officer_review",
            order=2, role_required=RoleType.INNOVATION_OFFICER,
            actions_allowed=["approve", "return", "screen_out"],
            submission_status=SubmissionStatus.SCREENING,
            execution_mode=WorkflowStep.EXECUTION_PARALLEL_MINIMUM,
            minimum_completions_required=3,
            due_in_hours=72,
            requires_assignment=True, assignment_role=AssignmentRoleType.REVIEWER,
            minimum_assignments=3,
            requires_evaluation=False, minimum_evaluations=0,
            is_active=True,
        )
        WorkflowStep.objects.create(
            workflow_definition=wf, name="Evaluation Committee Review", code="committee_review",
            order=3, role_required=RoleType.JUDGE,
            actions_allowed=["score_submitted"],
            submission_status=SubmissionStatus.JUDGING_REVIEW,
            execution_mode=WorkflowStep.EXECUTION_PARALLEL_MINIMUM,
            minimum_completions_required=5,
            due_in_hours=120,
            requires_assignment=True, assignment_role=AssignmentRoleType.JUDGE,
            minimum_assignments=5,
            requires_evaluation=True, minimum_evaluations=5,
            is_active=True,
        )
        WorkflowStep.objects.create(
            workflow_definition=wf, name="Final Decision", code="final_decision",
            order=4, role_required=RoleType.ADMINISTRATOR,
            actions_allowed=["approve", "incubate", "reject"],
            submission_status=SubmissionStatus.SHORTLISTED,
            execution_mode=WorkflowStep.EXECUTION_SEQUENTIAL,
            minimum_completions_required=1,
            due_in_hours=48,
            requires_assignment=True, assignment_role=AssignmentRoleType.REVIEWER,
            minimum_assignments=1,
            requires_evaluation=False, minimum_evaluations=0,
            is_active=True,
        )
        WorkflowStep.objects.create(
            workflow_definition=wf, name="Incubation", code="incubation",
            order=5, role_required=RoleType.INNOVATION_OFFICER,
            actions_allowed=["complete_incubation"],
            submission_status=SubmissionStatus.APPROVED,
            execution_mode=WorkflowStep.EXECUTION_SEQUENTIAL,
            minimum_completions_required=1,
            due_in_hours=0,
            requires_assignment=False, minimum_assignments=0,
            requires_evaluation=False, minimum_evaluations=0,
            is_active=True,
        )

        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_start, to_node=n_officer,
            action_key="submit", label="Submit for officer review",
            priority=1, is_default=True, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_officer, to_node=n_committee,
            action_key="approve", label="Advance to committee after 3 officer approvals",
            priority=1, is_active=True,
            condition_expression={"quorum_met": True, "action": "approve"},
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_officer, to_node=n_returned,
            action_key="return", label="Return to innovator for more info",
            priority=1, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_officer, to_node=n_rejected,
            action_key="screen_out", label="Screen out — rejected at officer stage",
            priority=1, is_active=True,
            condition_expression={"quorum_met": True, "action": "screen_out"},
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_returned, to_node=n_officer,
            action_key="resubmit", label="Resubmit after corrections",
            priority=1, is_default=True, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_committee, to_node=n_decision,
            action_key="score_submitted", label="Advance to decision after 5 committee scores",
            priority=1, is_active=True,
            condition_expression={"quorum_met": True, "action": "score_submitted"},
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_decision, to_node=n_approved,
            action_key="approve", label="Approve for funding",
            priority=1, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_decision, to_node=n_incubation,
            action_key="incubate", label="Send to incubation",
            priority=2, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_decision, to_node=n_rejected,
            action_key="reject", label="Reject",
            priority=3, is_active=True,
        )
        WorkflowTransition.objects.create(
            workflow_definition=wf, from_node=n_incubation, to_node=n_approved,
            action_key="complete_incubation", label="Incubation complete — mark approved",
            priority=1, is_default=True, is_active=True,
        )

        self.stdout.write(
            "  ✓ Workflow: 8 nodes, 11 transitions, "
            "officer quorum=3, committee quorum=5"
        )

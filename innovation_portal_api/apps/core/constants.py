from django.db import models


class RoleType(models.TextChoices):
    INNOVATOR = "innovator", "Innovator"
    INNOVATION_OFFICER = "innovation_officer", "Innovation Officer"
    INNOVATION_MANAGER = "innovation_manager", "Innovation Manager"
    INNOVATION_ANALYST = "innovation_analyst", "Innovation Analyst"
    STAFF_MEMBER = "staff_member", "Staff Member"
    JUDGE = "judge", "Judge"
    SPECIALIST = "specialist", "Specialist"
    EXO = "exo", "EXO"
    MENTOR = "mentor", "Mentor"
    ADMINISTRATOR = "administrator", "Administrator"
    MANAGEMENT_VIEWER = "management_viewer", "Management Viewer"


class ProgramTypeCode(models.TextChoices):
    IDEA = "idea", "Idea"
    HACKATHON = "hackathon", "Hackathon"
    CHALLENGE_CALL = "challenge_call", "Challenge Call"
    INNOVATION_CHALLENGE = "innovation_challenge", "Innovation Challenge"


class ProgramAudience(models.TextChoices):
    INTERNAL = "internal", "Internal (CEDA staff only)"
    PUBLIC = "public", "Public (non-CEDA only)"
    BOTH = "both", "Internal and public"


class ProgramStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    CLOSED = "closed", "Closed"
    ARCHIVED = "archived", "Archived"


class SubmissionType(models.TextChoices):
    IDEA = "idea", "Idea"
    HACKATHON_APPLICATION = "hackathon_application", "Hackathon Application"
    INNOVATION_CHALLENGE = "innovation_challenge", "Innovation Challenge Entry"


class SubmissionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    SCREENING = "screening", "Screening"
    JUDGING_REVIEW = "judging_review", "Judging Review"
    UNDER_REVIEW = "under_review", "Under Review"
    REQUIRES_MORE_INFORMATION = "requires_more_information", "Requires More Information"
    RETURNED = "returned", "Returned"
    SCREENED_OUT = "screened_out", "Screened Out"
    SHORTLISTED = "shortlisted", "Shortlisted"
    ASSIGNED_TO_JUDGES = "assigned_to_judges", "Assigned To Judges"
    UNDER_JUDGING = "under_judging", "Under Judging"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    SELECTED_FOR_HACKATHON = "selected_for_hackathon", "Selected For Hackathon"
    FINALIST = "finalist", "Finalist"
    WINNER = "winner", "Winner"
    CLOSED = "closed", "Closed"


class ScreeningOutcome(models.TextChoices):
    ADVANCE = "advance", "Advance"
    REQUIRES_MORE_INFORMATION = "requires_more_information", "Requires More Information"
    SCREENED_OUT = "screened_out", "Screened Out"
    SHORTLISTED = "shortlisted", "Shortlisted"


class AssignmentRoleType(models.TextChoices):
    JUDGE = "judge", "Judge"
    MENTOR = "mentor", "Mentor"
    REVIEWER = "reviewer", "Reviewer"
    SPECIALIST = "specialist", "Specialist"
    OFFICER = "officer", "Officer"
    MANAGER = "manager", "Manager"
    ANALYST = "analyst", "Analyst"
    STAFF = "staff", "Staff"
    EXO = "exo", "EXO"


class AssignmentStatus(models.TextChoices):
    ASSIGNED = "assigned", "Assigned"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    COMPLETED = "completed", "Completed"
    REASSIGNED = "reassigned", "Reassigned"


class ScoreSheetStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    LOCKED = "locked", "Locked"


class FinalDecisionType(models.TextChoices):
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    FINALIST = "finalist", "Finalist"
    WINNER = "winner", "Winner"
    SELECTED_FOR_HACKATHON = "selected_for_hackathon", "Selected For Hackathon"
    CLOSED = "closed", "Closed"


class SubmissionOutcomeType(models.TextChoices):
    SHORTLISTED = "shortlisted", "Shortlisted"
    FINALIST = "finalist", "Finalist"
    WINNER = "winner", "Winner"
    REJECTED = "rejected", "Rejected"
    APPROVED = "approved", "Approved"


class CommunicationChannel(models.TextChoices):
    EMAIL = "email", "Email"
    SMS = "sms", "SMS"
    INTERNAL = "internal", "Internal Notification"
    WHATSAPP = "whatsapp", "WhatsApp"
    USSD = "ussd", "USSD"


class IntakeChannel(models.TextChoices):
    """Where an idea, draft or submission came in from."""

    WEB = "web", "Web"
    WHATSAPP = "whatsapp", "WhatsApp"
    USSD = "ussd", "USSD"
    OFFICE = "office", "CEDA office"


class NotificationType(models.TextChoices):
    """Notification types a user can set channel preferences for."""

    OFFICER_MESSAGE = "officer_message", "Message from an officer"
    STAGE_CHANGE = "stage_change", "Application stage change"
    DEADLINE = "deadline", "Deadline reminder"
    NEW_CHALLENGE = "new_challenge", "New challenge"
    NEWS = "news", "News"
    DIGEST = "digest", "Digest"


class NotificationDeliveryChannel(models.TextChoices):
    """Channels a user can switch on or off per notification type."""

    WEB = "web", "Web (in the portal)"
    WHATSAPP = "whatsapp", "WhatsApp"
    SMS = "sms", "SMS"
    EMAIL = "email", "Email"


class BusinessStage(models.TextChoices):
    IDEA = "idea", "Idea"
    TESTING = "testing", "Testing"
    SELLING = "selling", "Selling"
    GROWING = "growing", "Growing"


class CommunicationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped (no provider configured)"


class TemplateCode(models.TextChoices):
    ACKNOWLEDGEMENT = "acknowledgement", "Acknowledgement"
    CORRECTION_REQUEST = "correction_request", "Correction Request"
    REMINDER = "reminder", "Reminder"
    SHORTLIST = "shortlist", "Shortlist"
    REJECTION = "rejection", "Rejection"
    WINNER = "winner", "Winner"
    GENERAL = "general", "General Announcement"


class DocumentType(models.TextChoices):
    FILE = "file", "File"
    URL = "url", "URL"


class SubmissionFormFieldType(models.TextChoices):
    TEXT = "text", "Text"
    TEXTAREA = "textarea", "Textarea"
    NUMBER = "number", "Number"
    DATE = "date", "Date"
    EMAIL = "email", "Email"
    PHONE = "phone", "Phone"
    BOOLEAN = "boolean", "Boolean"
    SELECT = "select", "Select"
    MULTISELECT = "multiselect", "Multiselect"
    FILE = "file", "File"
    URL = "url", "URL"

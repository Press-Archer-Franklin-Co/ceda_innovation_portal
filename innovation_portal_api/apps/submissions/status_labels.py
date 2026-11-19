"""Plain-language status labels shown to innovators and the public."""

PUBLIC_STATUS_LABELS = {
    "submitted": "Received",
    "screening": "Under screening",
    "judging_review": "Under judging review",
    "under_review": "Under review",
    "requires_more_information": "Action needed from applicant",
    "returned": "Action needed from applicant",
    "shortlisted": "Shortlisted",
    "assigned_to_judges": "In judging queue",
    "under_judging": "Under judging",
    "approved": "Approved",
    "rejected": "Not selected",
    "finalist": "Finalist",
    "winner": "Winner",
    "closed": "Closed",
}

# Submissions waiting for the innovator to answer CEDA.
NEEDS_ACTION_STATUSES = frozenset({"returned", "requires_more_information"})
# A decision has been made; nothing more will happen in the review.
FINISHED_STATUSES = frozenset({"approved", "rejected", "screened_out", "winner", "closed", "selected_for_hackathon"})


def public_status_label(status: str) -> str:
    return PUBLIC_STATUS_LABELS.get(status, (status or "").replace("_", " ").title())

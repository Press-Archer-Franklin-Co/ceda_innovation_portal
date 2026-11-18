import React from 'react'
import { cn } from '../../lib/cn'

const VARIANTS = {
  draft: {
    dot:   'bg-ceda-muted',
    pill:  'bg-status-draft-bg text-status-draft-text',
    label: 'Draft',
  },
  submitted: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-submitted-bg text-status-submitted-text',
    label: 'Submitted',
  },
  screening: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Screening',
  },
  review: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Under Review',
  },
  under_review: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Under Review',
  },
  in_review: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'In Review',
  },
  judging_review: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Judging Review',
  },
  assigned_to_judges: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Assigned To Judges',
  },
  under_judging: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Under Judging',
  },
  shortlisted: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-finalist-bg text-status-finalist-text',
    label: 'Shortlisted',
  },
  finalist: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-finalist-bg text-status-finalist-text',
    label: 'Finalist',
  },
  approved: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Approved',
  },
  winner: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-winner-bg text-status-winner-text',
    label: 'Winner',
  },
  rejected: {
    dot:   'bg-ceda-red',
    pill:  'bg-status-rejected-bg text-status-rejected-text',
    label: 'Rejected',
  },
  requires_more_information: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-pending-bg text-status-pending-text',
    label: 'Requires More Information',
  },
  returned: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-pending-bg text-status-pending-text',
    label: 'Returned',
  },
  selected_for_hackathon: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Selected For Hackathon',
  },
  active: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Active',
  },
  open: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Open',
  },
  closed: {
    dot:   'bg-ceda-muted',
    pill:  'bg-status-draft-bg text-status-draft-text',
    label: 'Closed',
  },
  archived: {
    dot:   'bg-ceda-muted',
    pill:  'bg-status-draft-bg text-status-draft-text',
    label: 'Archived',
  },
  upcoming: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Upcoming',
  },
  published: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Published',
  },
  pending: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-pending-bg text-status-pending-text',
    label: 'Pending',
  },
  assigned: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Assigned',
  },
  claimed: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Claimed',
  },
  in_progress: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'In Progress',
  },
  completed: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Completed',
  },
  cancelled: {
    dot:   'bg-ceda-muted',
    pill:  'bg-status-draft-bg text-status-draft-text',
    label: 'Cancelled',
  },
  not_started: {
    dot:   'bg-ceda-muted',
    pill:  'bg-status-draft-bg text-status-draft-text',
    label: 'Not Started',
  },
  in_evaluation: {
    dot:   'bg-ceda-indigo',
    pill:  'bg-status-review-bg text-status-review-text',
    label: 'Evaluating',
  },
  evaluated: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-active-bg text-status-active-text',
    label: 'Evaluated',
  },
  screened_out: {
    dot:   'bg-ceda-red',
    pill:  'bg-status-rejected-bg text-status-rejected-text',
    label: 'Screened Out',
  },
  info: {
    dot:   'bg-ceda-green',
    pill:  'bg-status-info-bg text-status-info-text',
    label: 'Info',
  },
  returned_for_correction: {
    dot:   'bg-ceda-gold',
    pill:  'bg-status-pending-bg text-status-pending-text',
    label: 'Needs Correction',
  },
}

function humanise(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function StatusPill({ variant, status, label, dot = true, className }) {
  const key    = variant ?? status ?? 'draft'
  const known  = VARIANTS[key]
  const config = known ?? {
    dot:  'bg-ceda-muted',
    pill: 'bg-status-draft-bg text-status-draft-text',
    label: humanise(key),
  }
  const text   = label ?? config.label

  return (
    <span className={cn('badge', config.pill, className)}>
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
      )}
      {text}
    </span>
  )
}

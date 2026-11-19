/**
 * Status words for innovator idea cards, in one place (ceda-ui section 6).
 * TODO(U0): switch to src/lib/status.ts and Badge `status` when they land.
 */
import type { TagTone } from '../ui/Tag'
import type { StringKey } from '../../i18n'
import type { IdeaItem } from '../../types/innovator'

export interface StatusWord {
  key: StringKey
  tone: TagTone
}

const BY_STATUS: Record<string, StatusWord> = {
  draft: { key: 'status.draft', tone: 'neutral' },
  submitted: { key: 'status.submitted', tone: 'blue' },
  screening: { key: 'status.inReview', tone: 'blue' },
  review: { key: 'status.inReview', tone: 'blue' },
  under_review: { key: 'status.inReview', tone: 'blue' },
  in_review: { key: 'status.inReview', tone: 'blue' },
  judging_review: { key: 'status.inReview', tone: 'blue' },
  assigned_to_judges: { key: 'status.inReview', tone: 'blue' },
  under_judging: { key: 'status.inReview', tone: 'blue' },
  in_evaluation: { key: 'status.inReview', tone: 'blue' },
  requires_more_information: { key: 'status.needsInput', tone: 'amber' },
  returned: { key: 'status.needsInput', tone: 'amber' },
  returned_for_correction: { key: 'status.needsInput', tone: 'amber' },
  shortlisted: { key: 'status.shortlisted', tone: 'orange' },
  finalist: { key: 'status.shortlisted', tone: 'orange' },
  selected_for_hackathon: { key: 'status.shortlisted', tone: 'orange' },
  approved: { key: 'status.approved', tone: 'green' },
  evaluated: { key: 'status.approved', tone: 'green' },
  winner: { key: 'status.winner', tone: 'green' },
  rejected: { key: 'status.notTaken', tone: 'red' },
  screened_out: { key: 'status.notTaken', tone: 'red' },
}

// TODO(R-16): finished ideas only send a display label today. These are the
// labels from apps/submissions/status_labels.py; anything else is "Not known".
const FINISHED_LABELS: Record<string, string> = {
  Approved: 'approved',
  Winner: 'winner',
  'Not selected': 'rejected',
}

const NOT_KNOWN: StatusWord = { key: 'status.notKnown', tone: 'unknown' }

export function statusWord(status: string | null | undefined): StatusWord {
  return (status && BY_STATUS[status]) || NOT_KNOWN
}

/** The chip for an idea card. */
export function ideaStatusWord(item: Pick<IdeaItem, 'kind' | 'state' | 'stage'> & { status?: string }): StatusWord {
  if (item.status) return statusWord(item.status)
  switch (item.state) {
    case 'drafts':
      return statusWord('draft')
    case 'needs_action':
      return statusWord('requires_more_information')
    case 'in_review':
      return statusWord('in_review')
    case 'finished':
      return statusWord(FINISHED_LABELS[item.stage])
    default:
      return NOT_KNOWN
  }
}

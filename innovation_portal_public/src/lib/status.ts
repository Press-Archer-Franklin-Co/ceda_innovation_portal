// The CEDA status words (ceda-ui skill, section 6). One mapping for the whole console:
// API value -> one word, its tone and its i18n key. Screens never show a raw API value.
// An unknown or missing value shows "Not known" (dashed chip), never a guessed label.
// Kept in step with innovation_portal_admin/src/lib/status.js.

/** Word key -> tone (a Tag tone) and an optional dot colour. Label comes from i18n `status.<key>`. */
import type { TagTone } from '../components/ui/Tag'

export const STATUS_WORDS: Record<string, { tone: TagTone; dot?: string }> = {
  draft:            { tone: 'neutral' },
  submitted:        { tone: 'blue' },
  in_review:        { tone: 'blue' },
  needs_input:      { tone: 'amber' },
  shortlisted:      { tone: 'orange' },
  approved:         { tone: 'green' },
  winner:           { tone: 'green', dot: 'bg-yellow' },
  not_taken:        { tone: 'red' },
  open:             { tone: 'green' },
  closed:           { tone: 'neutral' },
  upcoming:         { tone: 'blue' },
  published:        { tone: 'green' },
  scheduled:        { tone: 'blue' },
  waiting_approval: { tone: 'amber' },
  archived:         { tone: 'neutral' },
  assigned:         { tone: 'blue' },
  in_progress:      { tone: 'blue' },
  done:             { tone: 'green' },
  // Not in the skill's table; values the API sends today for users, steps and score sheets.
  active:           { tone: 'green' },
  inactive:         { tone: 'neutral' },
  waiting:          { tone: 'neutral' },
  not_started:      { tone: 'neutral' },
  declined:         { tone: 'neutral' },
  reassigned:       { tone: 'neutral' },
  locked:           { tone: 'neutral' },
  cancelled:        { tone: 'neutral' },
  withdrawn:        { tone: 'neutral' },
  unknown:          { tone: 'unknown' },
}

/** API value -> word key. */
export const STATUS_VALUES: Record<string, string> = {
  draft: 'draft',
  submitted: 'submitted',
  screening: 'in_review',
  review: 'in_review',
  under_review: 'in_review',
  in_review: 'in_review',
  judging_review: 'in_review',
  assigned_to_judges: 'in_review',
  under_judging: 'in_review',
  in_evaluation: 'in_review',
  requires_more_information: 'needs_input',
  returned: 'needs_input',
  returned_for_correction: 'needs_input',
  shortlisted: 'shortlisted',
  finalist: 'shortlisted',
  selected_for_hackathon: 'shortlisted',
  approved: 'approved',
  evaluated: 'approved',
  winner: 'winner',
  rejected: 'not_taken',
  screened_out: 'not_taken',
  open: 'open',
  closed: 'closed',
  upcoming: 'upcoming',
  published: 'published',
  live: 'published',
  scheduled: 'scheduled',
  pending_approval: 'waiting_approval',
  archived: 'archived',
  assigned: 'assigned',
  claimed: 'in_progress',
  accepted: 'in_progress',
  in_progress: 'in_progress',
  completed: 'done',
  active: 'active',
  inactive: 'inactive',
  pending: 'waiting',
  not_started: 'not_started',
  declined: 'declined',
  reassigned: 'reassigned',
  locked: 'locked',
  cancelled: 'cancelled',
  withdrawn: 'withdrawn',
}

/** { key, tone, dot, labelKey } for an API value. Booleans and empty values are "Not known". */
export function statusWord(value: unknown): { key: string; tone: TagTone; dot?: string; labelKey: string } {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const key = STATUS_VALUES[raw] ?? 'unknown'
  const word = STATUS_WORDS[key]
  return { key, tone: word.tone, dot: word.dot, labelKey: `status.${key}` }
}

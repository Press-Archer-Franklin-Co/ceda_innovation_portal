/**
 * Status words for innovator idea cards: the API value goes through the
 * shared mapping in src/lib/status.ts (ceda-ui section 6).
 */
import { statusWord as sharedStatusWord } from '../../lib/status'
import type { TagTone } from '../ui/Tag'
import type { StringKey } from '../../i18n'
import type { IdeaItem } from '../../types/innovator'

export interface StatusWord {
  key: StringKey
  tone: TagTone
}

export function statusWord(value: string | null | undefined): StatusWord {
  const word = sharedStatusWord(value)
  return { key: word.labelKey as StringKey, tone: word.tone }
}

// TODO(R-16): finished ideas only send a display label until B3 (which adds
// `status`) is on main. These are the labels from
// apps/submissions/status_labels.py; anything else is "Not known".
const FINISHED_LABELS: Record<string, string> = {
  Approved: 'approved',
  Winner: 'winner',
  'Not selected': 'rejected',
}

/** The API value behind an idea card's chip. */
export function ideaStatusValue(item: Pick<IdeaItem, 'state' | 'stage' | 'status'>): string | undefined {
  if (item.status) return item.status
  switch (item.state) {
    case 'drafts':
      return 'draft'
    case 'needs_action':
      return 'requires_more_information'
    case 'in_review':
      return 'in_review'
    case 'finished':
      return FINISHED_LABELS[item.stage]
    default:
      return undefined
  }
}

export function ideaStatusWord(item: Pick<IdeaItem, 'state' | 'stage' | 'status'>): StatusWord {
  return statusWord(ideaStatusValue(item))
}

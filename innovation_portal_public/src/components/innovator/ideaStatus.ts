/**
 * Status words for innovator ideas: the raw API status goes through the
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

/** The chip for an idea card, from its raw status ("draft" for drafts). */
export function ideaStatusWord(item: Pick<IdeaItem, 'status'>): StatusWord {
  return statusWord(item.status)
}

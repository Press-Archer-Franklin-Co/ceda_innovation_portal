import type { TFunction } from '../../i18n'
import type { HomeMessage, Lang } from '../../types/innovator'
import { statusWord } from './ideaStatus'
import { formatGaboroneDateTime, formatShortDate } from './format'

export interface MessageView {
  key: string
  headline: string
  body: string
  /** One line for the "Also for you" list. */
  line: string
  cta: { to: string; label: string }
}

const ideaPath = (m: HomeMessage) => (m.kind === 'draft' ? `/my-ideas/draft/${m.idea_id}` : `/my-ideas/${m.idea_id}`)

/** 2.1: the words and the one action for a home message, from real data only. */
export function messageView(m: HomeMessage, t: TFunction, lang: Lang): MessageView {
  const base = { key: `${m.type}-${m.idea_id}`, cta: { to: ideaPath(m), label: t('hm.viewIdea') } }
  switch (m.type) {
    case 'changes_requested': {
      const body = m.note ? t('hm.changes.body', { officer: m.officer, title: m.title, note: m.note }) : t('hm.changes.bodyNoNote', { officer: m.officer, title: m.title })
      const fix = m.fix_by ? ` ${t('hm.changes.fixBy', { date: formatShortDate(m.fix_by, lang) })}` : ''
      return { ...base, headline: t('hm.changes.headline'), body: body + fix, line: t('hm.alsoChanges', { title: m.title }), cta: { to: ideaPath(m), label: t('hm.changes.cta') } }
    }
    case 'question': {
      const date = m.reply_by ? formatShortDate(m.reply_by, lang) : ''
      const body = date ? t('home.nextAnswerNamed', { name: m.officer_first_name, title: m.title, date }) : t('home.nextAnswerNoDate', { title: m.title })
      return { ...base, headline: t('home.headlineAction'), body, line: t('hm.alsoQuestion', { name: m.officer_first_name, title: m.title }), cta: { to: `${ideaPath(m)}#messages`, label: t('hm.question.cta', { name: m.officer_first_name }) } }
    }
    case 'draft':
      return { ...base, headline: t('hm.draft.headline'), body: t('hm.draft.body', { title: m.title, percent: m.percent_complete }), line: t('hm.alsoDraft', { title: m.title, percent: m.percent_complete }), cta: { to: ideaPath(m), label: t('hm.draft.cta') } }
    case 'shortlisted':
      return { ...base, headline: t('hm.short.headline'), body: m.challenge ? t('hm.short.body', { title: m.title, challenge: m.challenge }) : t('hm.short.bodyGeneral', { title: m.title }), line: t('hm.alsoShort', { title: m.title }) }
    case 'stage_moved': {
      const stage = t(statusWord(m.status).key)
      return { ...base, headline: t('hm.moved.headline'), body: t('hm.moved.body', { title: m.title, stage }), line: t('hm.alsoMoved', { title: m.title, stage }) }
    }
    case 'event': {
      const date = formatGaboroneDateTime(m.event_date, lang)
      return { ...base, headline: t('hm.event.headline', { challenge: m.challenge }), body: t('hm.event.body', { date, title: m.title }), line: t('hm.alsoEvent', { challenge: m.challenge, date }) }
    }
  }
}

/** Only message types this screen knows; anything new from the API is dropped, not drawn (ceda-user-scope 2.6). */
export const KNOWN_TYPES = ['changes_requested', 'question', 'draft', 'shortlisted', 'stage_moved', 'event']
export function knownMessages(list: HomeMessage[] | undefined): HomeMessage[] {
  return (list ?? []).filter((m) => KNOWN_TYPES.includes(m.type))
}

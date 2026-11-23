import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { MessageCircle } from 'lucide-react'
import { buttonClasses } from '../ui/Button'
import Tag from '../ui/Tag'
import { useI18n } from '../../i18n'
import type { StringKey } from '../../i18n'
import type { IdeaItem } from '../../types/innovator'
import StageBar from './StageBar'
import { ideaStatusWord } from './ideaStatus'
import { formatDate, formatShortDate, relativeTime } from './format'
import { ideaLink } from './links'

const CHANNEL_WORDS: Record<string, StringKey> = {
  web: 'channel.web',
  whatsapp: 'channel.whatsapp',
  ussd: 'channel.ussd',
  office: 'channel.office',
}

/** One idea on My ideas (2.2). Cards that need action get the orange outline. */
export default function IdeaCard({ item }: { item: IdeaItem }) {
  const { t, lang } = useI18n()
  const word = ideaStatusWord(item)
  const needsAction = item.state === 'needs_action'
  const returned = item.status === 'returned'
  const href = ideaLink(item)
  const sector = item.sector?.name

  let meta: string
  let action: string
  if (item.kind === 'draft') {
    meta = [t('ideas.complete', { percent: item.percent_complete }), sector].filter(Boolean).join(' · ')
    action = t('ideas.continue')
  } else if (item.state === 'finished') {
    meta = [item.decided_at ? t('ideas.decision', { date: formatDate(item.decided_at, lang) }) : '', item.has_feedback ? t('ideas.feedback') : '']
      .filter(Boolean)
      .join(' · ')
    action = item.has_feedback ? t('ideas.readFeedback') : t('ideas.open')
  } else {
    meta = [item.submitted_at ? t('ideas.sent', { date: formatShortDate(item.submitted_at, lang) }) : '', sector].filter(Boolean).join(' · ')
    action = returned ? t('trk.fixResend') : needsAction ? t('ideas.reply') : t('ideas.open')
  }

  const channelKey = CHANNEL_WORDS[item.channel ?? '']

  const question = item.open_question?.excerpt
  const officer = item.open_question?.officer_first_name
  const replyBy = item.open_question?.reply_by ?? item.reply_by

  return (
    <article className={clsx('rounded-card border bg-surface p-5', needsAction ? 'border-2 border-accent' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag tone={word.tone}>{t(word.key)}</Tag>
        <span className="text-d-cap text-muted">
          {item.kind === 'draft' ? t('ideas.saved', { when: relativeTime(item.last_change, t, lang) }) : item.reference}
        </span>
      </div>
      <h3 className="mt-3 font-heading text-d-h5 text-text break-words">
        <Link to={href} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
          {item.title}
        </Link>
      </h3>
      {item.kind === 'submission' && <StageBar stages={item.stages} className="mt-4" />}
      {needsAction && (
        <p className="mt-4 flex items-start gap-2 rounded-control bg-accent-soft px-3 py-2.5 text-d-body-s text-text">
          <MessageCircle size={18} aria-hidden className="mt-0.5 shrink-0 text-accent-ink" />
          <span>
            {question ? `${officer ? `${officer}: ` : ''}${question} ` : `${item.needs_action_reason} `}
            {replyBy && <strong>{t('ideas.replyBy', { date: formatShortDate(replyBy, lang) })}</strong>}
          </span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-d-cap text-muted">{[meta, channelKey ? t(channelKey) : ''].filter(Boolean).join(' · ')}</span>
        <Link data-guide="myIdeas.open" to={needsAction && !returned ? `${href}#messages` : href} className={buttonClasses({ variant: needsAction ? 'primary' : 'secondary', size: 'sm' })}>
          {action}
        </Link>
      </div>
    </article>
  )
}

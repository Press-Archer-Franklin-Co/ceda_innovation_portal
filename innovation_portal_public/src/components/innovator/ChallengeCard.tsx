import { Link } from 'react-router-dom'
import { CalendarDays, Trophy } from 'lucide-react'
import { buttonClasses } from '../ui/Button'
import Tag from '../ui/Tag'
import { useI18n, type StringKey } from '../../i18n'
import type { RecommendedChallenge } from '../../types/innovator'
import { daysUntil, formatDate } from './format'
import { challengeLink } from './links'

const STATUS: Record<string, { key: StringKey; tone: 'green' | 'blue' | 'neutral' }> = {
  open: { key: 'challenge.open', tone: 'green' },
  upcoming: { key: 'challenge.upcoming', tone: 'blue' },
  closed: { key: 'challenge.closed', tone: 'neutral' },
}

/**
 * A challenge on the signed-in home (2.1). Shows only what the API sends:
 * summary, support line, status and the entry-window bar arrive with B5 (R-5 e).
 */
export default function ChallengeCard({ challenge }: { challenge: RecommendedChallenge }) {
  const { t, lang } = useI18n()
  const status = challenge.status ? STATUS[challenge.status] : undefined
  const upcoming = challenge.status === 'upcoming'
  const days = upcoming ? null : (challenge.days_left ?? daysUntil(challenge.closes_at))
  const sector = challenge.matched_sectors[0] ?? challenge.sectors[0]
  const progress = challenge.window_progress

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface">
      <span aria-hidden className="h-1.5 bg-primary" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-2">
          {sector && <Tag tone="neutral">{sector.name}</Tag>}
          {status && <Tag tone={status.tone} dot>{t(status.key)}</Tag>}
        </div>
        <h3 className="mt-3 font-heading text-d-h5 text-text">{challenge.title}</h3>
        {challenge.summary && <p className="mt-2 text-d-body-s text-muted line-clamp-3">{challenge.summary}</p>}
        <div className="mt-4 flex flex-col gap-2 text-d-body-s text-text">
          {challenge.support_headline && (
            <p className="flex items-center gap-2">
              <Trophy size={16} aria-hidden className="text-accent" />
              {challenge.support_headline}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-2">
            <CalendarDays size={16} aria-hidden className="text-muted" />
            {upcoming && challenge.opens_at
              ? t('challenge.opens', { date: formatDate(challenge.opens_at, lang) })
              : challenge.closes_at
                ? t('challenge.closes', { date: formatDate(challenge.closes_at, lang) })
                : null}
            {days !== null && days !== undefined && challenge.closes_at && (
              <Tag tone={days < 3 ? 'red' : 'amber'}>{days === 0 ? t('challenge.lastDay') : t('challenge.daysLeft', { count: days })}</Tag>
            )}
          </p>
          {typeof progress === 'number' && (
            <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-border">
              <span className={days !== null && days !== undefined && days < 3 ? 'block h-full bg-primary' : 'block h-full bg-amber'} style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
            </span>
          )}
        </div>
        <Link to={challengeLink(challenge.slug)} className={buttonClasses({ variant: 'secondary', size: 'sm', block: true, className: 'mt-auto pt-0 !mt-5' })}>
          {t('challenge.view')}
        </Link>
      </div>
    </article>
  )
}

import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Lightbulb, Trophy } from 'lucide-react'
import clsx from 'clsx'
import Tag from '../ui/Tag'
import Badge from '../ui/Badge'
import { buttonClasses } from '../ui/Button'
import { useI18n } from '../../i18n'
import { formatDate } from '../../lib/dates'
import type { ChallengeCard as Challenge } from '../../services/publicContent.service'
import { SUBMIT_PATH } from '../../lib/paths'

// Figma 1.1 › Challenges › Challenge card (10:375). Used on the home page and the challenges list (1.7).
// The whole card is a link; on hover it lifts with an orange outline. Top bar: orange when open,
// amber when upcoming. Days left turn red under 3 days.

export const challengePath = (c: Pick<Challenge, 'slug' | 'id'>) => `/challenges/${c.slug || c.id}`

export function DaysLeft({ days, className }: { days: number; className?: string }) {
  const { t } = useI18n()
  if (days <= 0) return <Tag tone="red" className={className}>{t('ch.lastDay')}</Tag>
  return (
    <Tag tone={days < 3 ? 'red' : 'amber'} className={className}>
      {t('ch.daysLeft', { n: days })}
    </Tag>
  )
}

/** showWindow: the entry-window bar (1.7): how much of the window has passed, red under 3 days left. */
export default function ChallengeCard({ challenge, className, showWindow = false }: { challenge: Challenge; className?: string; showWindow?: boolean }) {
  const { t, lang } = useI18n()
  const href = challengePath(challenge)
  const upcoming = challenge.status === 'upcoming'
  const closed = challenge.status === 'closed'
  const sector = challenge.sectors[0]

  return (
    <article
      className={clsx(
        'group relative flex flex-col bg-surface border border-border rounded-card overflow-hidden transition-[box-shadow,border-color,transform] duration-200',
        'hover:border-accent hover:shadow-[0_10px_30px_rgba(46,26,15,0.18)] hover:-translate-y-0.5 focus-within:border-accent',
        className,
      )}
    >
      <span aria-hidden className={clsx('h-[5px] w-full shrink-0', upcoming ? 'bg-amber' : closed ? 'bg-border' : 'bg-accent')} />
      <div className="flex flex-col gap-3 p-5 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {sector && <Tag tone="neutral">{sector.name}</Tag>}
          <Badge status={challenge.status} />
        </div>
        <h3 className="text-d-h4 font-heading text-text">
          {/* The title link covers the whole card (one tab stop, open in a new tab works). */}
          <Link to={href} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:rounded-card">
            {challenge.title}
          </Link>
        </h3>
        {challenge.summary && <p className="text-d-body-s text-muted line-clamp-3">{challenge.summary}</p>}
        <div className="flex flex-col gap-1.5 mt-auto">
          {challenge.support_headline && (
            <p className="flex items-center gap-1.5 text-d-cap text-text">
              <Trophy size={16} aria-hidden className="text-primary shrink-0" />
              {challenge.support_headline}
            </p>
          )}
          <div className="flex items-center gap-1.5 text-d-cap text-muted">
            <CalendarDays size={16} aria-hidden className="shrink-0" />
            <span className="flex-1">
              {upcoming
                ? t('ch.opens', { date: formatDate(challenge.opens_at, lang) })
                : closed
                  ? t('ch.closed', { date: formatDate(challenge.closes_at, lang) })
                  : challenge.closes_at
                    ? t('ch.closes', { date: formatDate(challenge.closes_at, lang) })
                    : ''}
            </span>
            {challenge.status === 'open' && challenge.closes_at && <DaysLeft days={challenge.days_left} />}
            {upcoming && <Badge status="upcoming" />}
            {closed && challenge.has_results && <Tag tone="neutral">{t('ch.resultsOut')}</Tag>}
          </div>
          {showWindow && challenge.status === 'open' && challenge.window_progress !== null && (
            <div
              role="progressbar"
              aria-label={t('ch.window')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(challenge.window_progress * 100)}
              className="h-1.5 w-full rounded-full bg-surface2 overflow-hidden"
            >
              <div className={clsx('h-full rounded-full', challenge.days_left < 3 ? 'bg-primary' : 'bg-amber')} style={{ width: `${Math.round(challenge.window_progress * 100)}%` }} />
            </div>
          )}
        </div>
        {/* Visual only: the card's link handles the click; this keeps Figma's button look. */}
        <span aria-hidden className={buttonClasses({ variant: upcoming || closed ? 'secondary' : 'primary', size: 'sm', block: true, className: 'mt-1 pointer-events-none' })}>
          {upcoming ? t('ch.notify') : closed ? (challenge.has_results ? t('ch.seeResults') : t('ch.seeChallenge')) : t('ch.enter')}
        </span>
      </div>
    </article>
  )
}

/** "No challenge fits your idea?" (Figma 10:455): always shown next to the challenges. */
export function GeneralIdeaCard({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <article className={clsx('flex flex-col gap-3.5 bg-banner text-on-banner rounded-card p-6', className)}>
      <span aria-hidden className="w-11 h-11 rounded-full bg-yellow flex items-center justify-center text-banner-deep">
        <Lightbulb size={22} />
      </span>
      <h3 className="text-d-h4 font-heading">{t('ch.generalTitle')}</h3>
      <p className="text-d-body-s text-banner-muted">{t('ch.generalBody')}</p>
      <Link to={SUBMIT_PATH} className={buttonClasses({ variant: 'accent', size: 'sm', className: 'self-start mt-auto' })}>
        {t('ch.generalCta')}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </article>
  )
}

import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { CalendarDays, Check, CircleAlert, CircleCheck, MessageSquareText } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button, { buttonClasses } from '../../components/ui/Button'
import EmptyState, { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import Tag from '../../components/ui/Tag'
import { useI18n, type StringKey } from '../../i18n'
import { useAsync } from '../../lib/useAsync'
import { formatDate, formatDayMonth } from '../../lib/dates'
import { challengeEntryService, type Attendance, type MyResult as Result, type Outcome } from '../../services/challengeEntry.service'

// U10 screen 2.11 My result (Figma 108:714 website, 108:880 phone). GET /api/programs/public/{slug}/my-result/.
// Opened from My ideas or the notification. ① The result in one word (the shared status words) and the date.
// ② Feedback the team released for this person, never judges' names or raw scores. ③ The next step with one clear
// action. Not taken forward: the same page suggests other challenges and the general idea.

/** Outcome -> the API status value whose shared word the tag shows. */
const STATUS: Record<Exclude<Outcome, 'no_entry'>, string> = {
  winner: 'winner',
  shortlisted: 'shortlisted',
  not_selected: 'rejected',
  waiting: 'in_review',
}

export default function MyResult() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, lang } = useI18n()
  const res = useAsync(() => challengeEntryService.myResult(slug), [slug, lang])
  const r = res.data

  if (res.loading) return <MyResultSkeleton />
  if (res.error || !r) {
    const missing = axios.isAxiosError(res.error) && res.error.response?.status === 404
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        {missing ? (
          <EmptyState title={t('ent.notFound')} body={t('ent.notFoundBody')}>
            <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('ent.allChallenges')}</Link>
          </EmptyState>
        ) : (
          <ErrorState title={t('myr.loadError')} body={t('ent.loadErrorBody')} onRetry={res.reload} retrying={res.fetching} />
        )}
      </div>
    )
  }
  const c = r.challenge
  if (slug !== c.slug) return <Navigate to={`/challenges/${c.slug}/my-result`} replace />

  if (r.outcome === 'no_entry') {
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        <EmptyState title={t('myr.noEntry')} body={t('myr.noEntryBody')}>
          <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('myr.otherChallenges')}</Link>
        </EmptyState>
      </div>
    )
  }

  const outcome = r.outcome
  const done = r.published && outcome !== 'waiting'
  return (
    <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pt-5 lg:pt-10 pb-28 lg:pb-[72px]">
      <nav aria-label={t('chd.breadcrumb')} className="hidden lg:block mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-d-cap text-muted">
          <li><Link to="/my-ideas" className="hover:underline">{t('myr.myIdeas')}</Link></li>
          <li aria-hidden>/</li>
          <li>{r.entry ? <Link to={r.entry.url} className="hover:underline">{r.entry.title}</Link> : c.title}</li>
        </ol>
      </nav>
      <div className="grid gap-4 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="flex flex-col gap-4 lg:gap-5 min-w-0">
          <OutcomeCard r={r} />
          {done && r.feedback && (
            <section aria-labelledby="feedback-title" className="rounded-card border border-border bg-surface p-5 lg:p-6 flex flex-col gap-3">
              <h2 id="feedback-title" className="flex items-center gap-2.5 font-heading text-d-h5 text-text">
                <CircleCheck size={20} aria-hidden className="text-success" />{t('myr.feedbackTitle')}
              </h2>
              <p className="text-d-body-s text-text whitespace-pre-line">{r.feedback}</p>
            </section>
          )}
          {done && r.feedback_points && <FeedbackPoints points={r.feedback_points} />}
          {done && <Scores r={r} />}
        </div>
        <NextStep r={r} />
      </div>
    </div>
  )
}

/** ①: brown card with the status word, the challenge and date, and the result in one line. */
function OutcomeCard({ r }: { r: Result }) {
  const { t, lang } = useI18n()
  const outcome = r.outcome === 'no_entry' ? 'waiting' : r.outcome
  const place = r.position ? t(`res.place.${r.position}` as StringKey) || r.position : ''
  const prize = [r.prize_amount, r.prize_label].filter(Boolean).join(' ')
  let title: ReactNode
  let body = ''
  if (outcome === 'winner') {
    title = highlight(t('myr.headWinner', { word: '{word}' }), t('myr.wordWon'))
    body = t('myr.winnerBody', { place })
  } else if (outcome === 'shortlisted') {
    title = highlight(t('myr.headShortlisted', { word: '{word}' }), t('myr.wordShortlist'))
    body = r.shortlisted_count > 0 && r.entries_count > 0 ? t('myr.oneOf', { count: r.shortlisted_count, total: r.entries_count }) : t('myr.shortlistedBody')
  } else if (outcome === 'not_selected') {
    title = t('myr.notSelected')
    body = t('myr.notSelectedBody')
  } else {
    title = t('myr.waiting')
    body = r.results_publish_at ? t('myr.waitingDate', { when: formatDate(r.results_publish_at, lang) }) : t('myr.waitingBody')
  }
  const wellDone = (outcome === 'winner' || outcome === 'shortlisted') && r.first_name ? ` ${t('myr.wellDone', { name: r.first_name })}` : ''
  const meta = [r.challenge.title, r.published_at ? formatDayMonth(r.published_at, lang) : ''].filter(Boolean).join(' · ')
  return (
    <section aria-labelledby="outcome-title" className="rounded-card bg-banner text-on-banner p-5 lg:px-7 lg:py-7 flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2.5 text-d-cap text-banner-muted">
        <Badge status={STATUS[outcome]} />
        <span>{meta}</span>
      </p>
      <h1 id="outcome-title" className="font-heading font-extrabold text-d-h3 lg:text-[40px] lg:leading-[1.2] break-words">{title}</h1>
      <p className="text-d-body text-banner-muted">{body}{wellDone}</p>
      {outcome === 'winner' && prize && <p><Tag tone="green">{prize}</Tag></p>}
    </section>
  )
}

/** "You are on the {word}!" with the word in yellow. */
function highlight(template: string, word: string): ReactNode {
  const [before, after = ''] = template.split('{word}')
  return <>{before}<span className="text-yellow">{word}</span>{after}</>
}

/** ③: the next step with one clear action. */
function NextStep({ r }: { r: Result }) {
  const { t, lang } = useI18n()
  const message = r.entry ? `${r.entry.url}#messages` : '/my-ideas'
  const done = r.published && r.outcome !== 'waiting'
  return (
    <aside aria-labelledby="next-title" className="rounded-2xl bg-surface2 p-5 lg:p-6 flex flex-col gap-3.5">
      <p className="text-d-over uppercase font-heading text-accent">{t('myr.nextStep')}</p>
      {r.next_step ? (
        <>
          <h2 id="next-title" className="font-heading text-d-h4 text-text">{t('myr.eventTitle')}</h2>
          <p className="flex items-center gap-2.5 text-d-body-s text-text">
            <CalendarDays size={18} aria-hidden className="shrink-0 text-primary" />
            {formatEvent(r.next_step.at, lang)}
          </p>
          {r.attendance?.can_confirm ? (
            <>
              <Attend slug={r.challenge.slug} initial={r.attendance} />
              <Link to={message} className={buttonClasses({ block: true, variant: 'secondary' })}><MessageSquareText size={18} aria-hidden />{t('myr.messageOfficer')}</Link>
            </>
          ) : (
            <Link to={message} className={buttonClasses({ block: true })}><MessageSquareText size={18} aria-hidden />{t('myr.messageOfficer')}</Link>
          )}
          <p className="text-d-cap text-muted">{t('myr.eventHelp')}</p>
        </>
      ) : (
        <>
          <h2 id="next-title" className="font-heading text-d-h4 text-text">{t('myr.next')}</h2>
          <ul className="flex flex-col gap-3">
            {nextKeys(r).map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-d-body-s text-text">
                <CircleCheck size={18} aria-hidden className="text-success shrink-0 mt-0.5" />{t(key)}
              </li>
            ))}
          </ul>
          {r.outcome === 'not_selected' ? (
            <div className="flex flex-col gap-2">
              <Link to="/challenges?status=open" className={buttonClasses({ block: true })}>{t('myr.otherChallenges')}</Link>
              <Link to="/submit" className={buttonClasses({ block: true, variant: 'secondary' })}>{t('ent.generalIdea')}</Link>
            </div>
          ) : (
            <Link to={message} className={buttonClasses({ block: true })}><MessageSquareText size={18} aria-hidden />{t('myr.messageOfficer')}</Link>
          )}
        </>
      )}
      {done && <Link to={`/challenges/${r.challenge.slug}/results`} className="text-d-label-s text-primary hover:underline self-start">{t('myr.allResults')}</Link>}
    </aside>
  )
}

/** ② (Figma 108:786): two cards, what the panel liked (green dots) and what to work on (amber dots). */
export function FeedbackPoints({ points }: { points: { liked: string[]; work_on: string[] } }) {
  const { t } = useI18n()
  const cards = [
    { key: 'liked', title: t('myr.liked'), items: points.liked, Icon: Check, icon: 'text-success', dot: 'bg-success' },
    { key: 'work_on', title: t('myr.workOn'), items: points.work_on, Icon: CircleAlert, icon: 'text-warning', dot: 'bg-warning' },
  ].filter((card) => card.items.length > 0)
  if (!cards.length) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map(({ key, title, items, Icon, icon, dot }) => (
        <section key={key} aria-labelledby={`fb-${key}`} className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-2.5">
          <h2 id={`fb-${key}`} className="flex items-center gap-2 font-heading text-d-h5 text-text">
            <Icon size={18} aria-hidden className={icon} />{title}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-d-body-s text-text">
                <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** ③ (Figma 108:813): "Confirm I will attend", then the answer, which can be changed until the event. */
export function Attend({ slug, initial }: { slug: string; initial: Attendance }) {
  const { t } = useI18n()
  const [answer, setAnswer] = useState<boolean | null>(initial.answer)
  const [saving, setSaving] = useState<boolean | null>(null)
  const [error, setError] = useState(false)
  const save = async (attending: boolean) => {
    setSaving(attending)
    setError(false)
    try {
      const next = await challengeEntryService.attend(slug, attending)
      setAnswer(next.answer)
    } catch {
      setError(true)
    } finally {
      setSaving(null)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {answer === true ? (
        <>
          <p role="status" className="flex items-center gap-2 rounded-control bg-success-soft px-3 py-2.5 text-d-label-s text-success">
            <CircleCheck size={18} aria-hidden className="shrink-0" />{t('myr.attending')}
          </p>
          <Button variant="ghost" size="sm" className="self-start" loading={saving === false} onClick={() => save(false)}>{t('myr.cannotAttend')}</Button>
        </>
      ) : (
        <>
          {answer === false && <p role="status" className="text-d-body-s text-muted">{t('myr.notAttending')}</p>}
          <Button block loading={saving === true} onClick={() => save(true)}>{t('myr.attend')}</Button>
        </>
      )}
      {error && <p role="alert" className="text-d-cap text-danger">{t('myr.attendError')}</p>}
    </div>
  )
}

function nextKeys(r: Result): StringKey[] {
  if (!r.published || r.outcome === 'waiting') return ['myr.waitingBody']
  return r.outcome === 'winner'
    ? ['myr.next.winner1', 'myr.next.winner2', 'myr.next.winner3']
    : ['myr.next.other1', 'myr.next.other2', 'myr.next.other3']
}

/** "Thu 10 Dec 2026, 09:00" */
function formatEvent(iso: string, lang: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const locale = lang === 'tn' ? 'en-BW' : 'en-GB'
  const day = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}, ${time}`
}

/** Only when the challenge shares scores (staff switch, off by default): the average per criterion. */
function Scores({ r }: { r: Result }) {
  const { t } = useI18n()
  if (!r.scores_shared || !r.scores || r.scores.criteria.length === 0) return null
  return (
    <section aria-labelledby="scores-title" className="rounded-card border border-border bg-surface p-5 lg:p-6 flex flex-col gap-4">
      <div>
        <h2 id="scores-title" className="font-heading text-d-h5 text-text">{t('myr.scores')}</h2>
        <p className="text-d-cap text-muted">{t('myr.scoresBody')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {r.scores.criteria.map((cr) => (
          <li key={cr.name}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-d-label-s text-text">{cr.name}</span>
              <span className="text-d-label-s text-text tabular-nums">{cr.score}</span>
            </div>
            <div role="img" aria-label={`${cr.name}: ${cr.score} / 100`} className="h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, cr.score)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MyResultSkeleton() {
  return (
    <div aria-hidden className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 grid lg:grid-cols-[1fr_380px] gap-10">
      <div className="space-y-5"><Skeleton className="h-44 rounded-card" /><Skeleton className="h-36 rounded-card" /></div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

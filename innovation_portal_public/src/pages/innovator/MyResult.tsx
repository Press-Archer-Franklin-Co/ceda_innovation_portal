import { Link, Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { CircleCheck, Clock, FileText, Medal, Sparkles, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buttonClasses } from '../../components/ui/Button'
import EmptyState, { ErrorState } from '../../components/ui/EmptyState'
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton'
import Tag from '../../components/ui/Tag'
import ChallengeFlowHeader from '../../components/challenges/ChallengeFlowHeader'
import { useI18n, type StringKey } from '../../i18n'
import { useAsync } from '../../lib/useAsync'
import { formatDate } from '../../lib/dates'
import { challengeEntryService, type MyResult as Result, type Outcome } from '../../services/challengeEntry.service'

// U10 screen 2.11 My result (Figma 108:714 website, 108:880 phone). GET /api/programs/public/{slug}/my-result/.
// The person's own outcome in one challenge, the score summary only when the challenge shares scores, and what
// happens next. Before results are out it says when they are planned.

const OUTCOME: Record<Exclude<Outcome, 'no_entry'>, { icon: LucideIcon; ring: string }> = {
  winner: { icon: Trophy, ring: 'bg-yellow text-banner-deep' },
  shortlisted: { icon: Medal, ring: 'bg-success-soft text-success' },
  not_selected: { icon: Sparkles, ring: 'bg-surface2 text-muted' },
  waiting: { icon: Clock, ring: 'bg-info-soft text-info' },
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

  return (
    <>
      <ChallengeFlowHeader slug={c.slug} challenge={c.title} titleId="my-result-title" overline={t('myr.over')} title={t('myr.title', { challenge: c.title })} />
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-14 pb-28 lg:pb-16">
        {r.outcome === 'no_entry' ? (
          <EmptyState title={t('myr.noEntry')} body={t('myr.noEntryBody')}>
            <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('myr.otherChallenges')}</Link>
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6 min-w-0">
              <OutcomeCard r={r} />
              {r.published && r.outcome !== 'waiting' && <NextSteps winner={r.outcome === 'winner'} />}
            </div>
            <aside className="flex flex-col gap-6">
              {r.entry && (
                <section aria-labelledby="entry-title" className="rounded-card border border-border bg-surface p-5 flex flex-col gap-2">
                  <h2 id="entry-title" className="text-d-over uppercase font-heading text-muted">{t('myr.entry')}</h2>
                  <p className="text-d-h5 font-heading text-text break-words">{r.entry.title}</p>
                  <p className="text-d-cap text-muted">{[r.entry.reference_number, formatDate(r.entry.submitted_at, lang)].filter(Boolean).join(' · ')}</p>
                  <Link to={r.entry.url} className={buttonClasses({ variant: 'secondary', size: 'sm' })}><FileText size={16} aria-hidden />{t('ent.openEntry')}</Link>
                </section>
              )}
              {r.published && <Scores r={r} />}
              <div className="flex flex-col gap-2">
                {r.published && <Link to={`/challenges/${c.slug}/results`} className={buttonClasses({ variant: 'secondary', block: true })}>{t('myr.allResults')}</Link>}
                <Link to="/challenges" className={buttonClasses({ variant: 'ghost', block: true })}>{t('myr.otherChallenges')}</Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  )
}

function OutcomeCard({ r }: { r: Result }) {
  const { t, lang } = useI18n()
  const outcome = r.outcome === 'no_entry' ? 'waiting' : r.outcome
  const { icon: Icon, ring } = OUTCOME[outcome]
  const place = r.position ? t(`res.place.${r.position}` as StringKey) || r.position : ''
  const copy: Record<typeof outcome, [string, string]> = {
    winner: [t('myr.winner', { place }), t('myr.winnerBody', { place })],
    shortlisted: [t('myr.shortlisted'), t('myr.shortlistedBody')],
    not_selected: [t('myr.notSelected'), t('myr.notSelectedBody')],
    waiting: [t('myr.waiting'), r.results_publish_at ? t('myr.waitingDate', { when: formatDate(r.results_publish_at, lang) }) : t('myr.waitingBody')],
  }
  const [title, body] = copy[outcome]
  const prize = [r.prize_label, r.prize_amount].filter(Boolean).join(' · ')
  return (
    <section aria-labelledby="outcome-title" className={`rounded-card border bg-surface p-6 lg:p-8 flex flex-col gap-4 ${outcome === 'winner' ? 'border-yellow shadow-pop' : 'border-border'}`}>
      <span aria-hidden className={`w-14 h-14 rounded-full flex items-center justify-center ${ring}`}><Icon size={28} /></span>
      <h2 id="outcome-title" className="font-heading text-d-h3 text-text">{title}</h2>
      <p className="text-d-body text-muted">{body}</p>
      {outcome === 'winner' && prize && (
        <p className="flex items-center gap-2"><span className="text-d-label-s text-muted">{t('myr.prize')}</span><Tag tone="green">{prize}</Tag></p>
      )}
      {outcome === 'not_selected' && (
        <div className="flex flex-wrap gap-3 pt-1">
          <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('myr.otherChallenges')}</Link>
          <Link to="/submit" className={buttonClasses({ size: 'sm', variant: 'secondary' })}>{t('ent.generalIdea')}</Link>
        </div>
      )}
    </section>
  )
}

function Scores({ r }: { r: Result }) {
  const { t } = useI18n()
  if (!r.scores_shared) return <p className="text-d-cap text-muted">{t('myr.scoresHidden')}</p>
  if (!r.scores) return null
  return (
    <section aria-labelledby="scores-title" className="rounded-card bg-surface2 p-5 flex flex-col gap-4">
      <div>
        <h2 id="scores-title" className="font-heading text-d-h5 text-text">{t('myr.scores')}</h2>
        <p className="text-d-cap text-muted">{t('myr.scoresBody')}</p>
      </div>
      {r.scores.total !== null && (
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-d-label text-text">{t('myr.total')}</span>
          <span className="font-heading text-d-h3 text-text tabular-nums">{r.scores.total}</span>
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {r.scores.criteria.map((cr) => (
          <li key={cr.name}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-d-label-s text-text">{cr.name}</span>
              <span className="text-d-label-s text-text tabular-nums">{cr.score}</span>
            </div>
            <div role="img" aria-label={`${cr.name}: ${cr.score} / 100`} className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, cr.score)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextSteps({ winner }: { winner: boolean }) {
  const { t } = useI18n()
  const keys: StringKey[] = winner ? ['myr.next.winner1', 'myr.next.winner2', 'myr.next.winner3'] : ['myr.next.other1', 'myr.next.other2', 'myr.next.other3']
  return (
    <section aria-labelledby="next-title" className="rounded-card border border-border bg-surface p-6 flex flex-col gap-4">
      <h2 id="next-title" className="font-heading text-d-h4 text-text">{t('myr.next')}</h2>
      <ol className="flex flex-col gap-3">
        {keys.map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-d-body-s text-text">
            <CircleCheck size={18} aria-hidden className="text-success shrink-0 mt-0.5" />
            {t(key)}
          </li>
        ))}
      </ol>
    </section>
  )
}

function MyResultSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-banner"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-8 space-y-3"><Skeleton className="h-3 w-48 bg-on-banner/10" /><Skeleton className="h-10 w-2/3 bg-on-banner/10" /></div></div>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 grid lg:grid-cols-[1fr_360px] gap-6"><div className="space-y-4"><Skeleton className="h-56 rounded-card" /><SkeletonText lines={3} /></div><Skeleton className="h-48 rounded-card" /></div>
    </div>
  )
}

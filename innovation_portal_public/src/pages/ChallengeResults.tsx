import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { Award, Medal, Trophy, Users } from 'lucide-react'
import clsx from 'clsx'
import { buttonClasses } from '../components/ui/Button'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import Tag from '../components/ui/Tag'
import ChallengeFlowHeader from '../components/challenges/ChallengeFlowHeader'
import { useAuth } from '../context/AuthContext'
import { useI18n, type StringKey } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/dates'
import { challengeEntryService, type Winner } from '../services/challengeEntry.service'

// U10 screen 1.10 Challenge results (Figma 107:794 website, 107:1028 phone). GET /api/programs/public/{slug}/results/.
// Winners and the shortlist show only once the challenge has published its results; before that the page says
// when they are planned. Never shows scores, judges or notes. Signed in: a link to "My result" (2.11).

const PLACE_STYLE: Record<string, string> = {
  '1st': 'bg-yellow text-banner-deep',
  '2nd': 'bg-surface2 text-text',
  '3rd': 'bg-amber/20 text-text',
}

export default function ChallengeResults() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, lang } = useI18n()
  const { isAuthenticated } = useAuth()
  const res = useAsync(() => challengeEntryService.results(slug), [slug, lang])
  const r = res.data

  useEffect(() => {
    if (r) document.title = `${t('res.title', { challenge: r.challenge.title })} · CEDA Innovation`
  }, [r, t])

  if (res.loading) return <ResultsSkeleton />
  if (res.error || !r) {
    const missing = axios.isAxiosError(res.error) && res.error.response?.status === 404
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        {missing ? (
          <EmptyState title={t('ent.notFound')} body={t('ent.notFoundBody')}>
            <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('ent.allChallenges')}</Link>
          </EmptyState>
        ) : (
          <ErrorState title={t('res.loadError')} body={t('ent.loadErrorBody')} onRetry={res.reload} retrying={res.fetching} />
        )}
      </div>
    )
  }
  const c = r.challenge
  if (slug !== c.slug) return <Navigate to={`/challenges/${c.slug}/results`} replace />

  const [top, ...rest] = r.winners
  return (
    <>
      <ChallengeFlowHeader slug={c.slug} challenge={c.title} titleId="results-title" overline={t('res.over')} title={c.title}>
        {r.published && (
          <div className="flex flex-wrap items-center gap-2 text-d-body-s text-banner-muted">
            {r.published_at && <span>{t('res.publishedOn', { when: formatDate(r.published_at, lang) })}</span>}
            {r.entries_count > 0 && <><span aria-hidden>·</span><span>{r.entries_count === 1 ? t('res.entriesOne') : t('res.entries', { count: r.entries_count })}</span></>}
          </div>
        )}
        {r.published && isAuthenticated && (
          <div className="pt-1"><Link to={`/challenges/${c.slug}/my-result`} className={buttonClasses({ variant: 'onDark', size: 'sm' })}>{t('res.myResult')}</Link></div>
        )}
      </ChallengeFlowHeader>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-14 pb-28 lg:pb-16 flex flex-col gap-12">
        {!r.published ? (
          <EmptyState icon={Trophy} title={t('res.notYetTitle')} body={r.results_publish_at ? t('res.notYetDate', { when: formatDate(r.results_publish_at, lang) }) : t('res.notYetBody')}>
            <Link to={`/challenges/${c.slug}`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>{t('ent.backToChallenge')}</Link>
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="winners-title" className="flex flex-col gap-5">
              <h2 id="winners-title" className="font-heading text-d-h3 text-text">{t('res.winners')}</h2>
              {r.winners.length === 0 ? (
                <p className="text-d-body text-muted">{t('res.noWinners')}</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {top && <WinnerCard w={top} featured />}
                  {rest.length > 0 && (
                    <ul className="lg:col-span-1 flex flex-col gap-4">
                      {rest.map((w) => <li key={`${w.position}-${w.title}`}><WinnerCard w={w} /></li>)}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {r.shortlisted.length > 0 && (
              <section aria-labelledby="shortlist-title" className="flex flex-col gap-4">
                <div>
                  <h2 id="shortlist-title" className="font-heading text-d-h3 text-text">{t('res.shortlisted')}</h2>
                  <p className="text-d-body-s text-muted mt-1">{t('res.shortlistedBody')}</p>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {r.shortlisted.map((s, i) => (
                    <li key={`${s.title}-${i}`} className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
                      <Medal size={20} aria-hidden className="text-accent shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-d-label text-text break-words">{s.title}</span>
                        {s.name && <span className="block text-d-cap text-muted">{s.name}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}

function WinnerCard({ w, featured = false }: { w: Winner; featured?: boolean }) {
  const { t } = useI18n()
  const place = t(`res.place.${w.position}` as StringKey) || w.position
  const prize = [w.prize_label, w.prize_amount].filter(Boolean).join(' · ')
  return (
    <article className={clsx('rounded-card border bg-surface overflow-hidden flex flex-col', featured ? 'lg:col-span-2 border-yellow shadow-pop' : 'border-border')}>
      {featured && w.photo_url && <img src={w.photo_url} alt={t('res.photoOf', { name: w.name })} className="w-full h-56 lg:h-72 object-cover" />}
      <div className={clsx('flex flex-col gap-2', featured ? 'p-6 lg:p-8' : 'p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-d-label-s font-heading', PLACE_STYLE[w.position] ?? 'bg-surface2 text-text')}>
            {w.position === '1st' ? <Trophy size={14} aria-hidden /> : <Award size={14} aria-hidden />}
            {place}
          </span>
          {prize && <Tag tone="green">{prize}</Tag>}
        </div>
        <h3 className={clsx('font-heading text-text break-words', featured ? 'text-d-h2' : 'text-d-h5')}>{w.title}</h3>
        <p className="flex items-center gap-1.5 text-d-body-s text-muted">
          {w.members_count > 1 && <Users size={14} aria-hidden />}
          {w.name}{w.members_count > 1 ? ` · ${t('res.members', { count: w.members_count })}` : ''}
        </p>
        {featured && w.description && <p className="text-d-body text-muted whitespace-pre-line">{w.description}</p>}
      </div>
    </article>
  )
}

function ResultsSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-banner"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-8 space-y-3"><Skeleton className="h-3 w-48 bg-on-banner/10" /><Skeleton className="h-10 w-2/3 bg-on-banner/10" /></div></div>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 grid lg:grid-cols-3 gap-5"><Skeleton className="lg:col-span-2 h-80 rounded-card" /><div className="space-y-4"><Skeleton className="h-36 rounded-card" /><Skeleton className="h-36 rounded-card" /></div><SkeletonText lines={3} /></div>
    </div>
  )
}

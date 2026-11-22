import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { ImageIcon, Trophy } from 'lucide-react'
import Badge from '../components/ui/Badge'
import { buttonClasses } from '../components/ui/Button'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { useI18n, type StringKey } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/dates'
import { challengeEntryService, type ChallengeResults as Results, type Winner } from '../services/challengeEntry.service'

// U10 screen 1.10 Challenge results (Figma 107:794 website, 107:1028 phone). GET /api/programs/public/{slug}/results/.
// ① Winners first, with what they won. ② Shortlisted ideas follow. Names show for both unless the challenge turns
// "Show names on the results page" off; then the API sends idea titles only. ③ "How we judged" repeats the criteria
// and weights. Never scores, judges or notes.
// Before results are published the page says when they are planned.

export default function ChallengeResults() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, lang } = useI18n()
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

  return (
    <>
      <Hero r={r} />
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-8 lg:py-16 pb-28 lg:pb-20 flex flex-col gap-10 lg:gap-12">
        {!r.published ? (
          <EmptyState icon={Trophy} title={t('res.notYetTitle')} body={r.results_publish_at ? t('res.notYetDate', { when: formatDate(r.results_publish_at, lang) }) : t('res.notYetBody')}>
            <Link to={`/challenges/${c.slug}`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>{t('ent.backToChallenge')}</Link>
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="winners-title" className="flex flex-col gap-4 lg:gap-6">
              <h2 id="winners-title" className="text-d-over uppercase font-heading text-accent">{t('res.winners')}</h2>
              {r.winners.length === 0 ? (
                <p className="text-d-body text-muted">{t('res.noWinners')}</p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                  {r.winners.map((w) => <li key={`${w.position}-${w.title}`} className="flex"><WinnerCard w={w} /></li>)}
                </ul>
              )}
            </section>

            {r.shortlisted.length > 0 && (
              <section aria-labelledby="shortlist-title" className="flex flex-col gap-4 lg:gap-6">
                <h2 id="shortlist-title" className="text-d-over uppercase font-heading text-accent">{t('res.alsoShortlisted')}</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
                  {r.shortlisted.map((s, i) => (
                    <li key={`${s.title}-${i}`} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-4">
                      <span className="min-w-0 flex flex-col">
                        <span className="text-d-label text-text break-words">{s.title}</span>
                        {(s.name || s.district) && <span className="text-d-cap text-muted">{[s.name, s.district].filter(Boolean).join(' · ')}</span>}
                      </span>
                      <Badge status="shortlisted" className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {r.criteria.length > 0 && <HowWeJudged criteria={r.criteria} />}
          </>
        )}
      </div>
    </>
  )
}

/** Brown hero: "Results · Announced <date>", the challenge name with its first word in yellow, and the counts. */
function Hero({ r }: { r: Results }) {
  const { t, lang } = useI18n()
  const [first, ...rest] = r.challenge.title.split(' ')
  const intro = r.published && r.entries_count > 0
    ? r.districts_count > 1
      ? t('res.intro', { count: r.entries_count, districts: r.districts_count })
      : t('res.introNoDistricts', { count: r.entries_count })
    : ''
  return (
    <section aria-labelledby="results-title" className="bg-banner text-on-banner">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-8 lg:py-14 flex flex-col gap-3 lg:gap-4">
        <p className="flex flex-wrap items-center gap-2.5 text-d-cap text-banner-muted">
          <span className="rounded-full bg-banner-deep px-2.5 py-1 text-d-label-s text-on-banner">{t('res.over')}</span>
          {r.published && r.published_at && <span>{t('res.publishedOn', { when: formatDate(r.published_at, lang) })}</span>}
        </p>
        <h1 id="results-title" className="font-heading font-extrabold text-d-mh1 lg:text-[64px] lg:leading-[1.0] lg:max-w-[820px] break-words">
          <span className="text-yellow">{first}</span>{rest.length > 0 && ` ${rest.join(' ')}`}
        </h1>
        {intro && <p className="text-d-body text-banner-muted">{intro}</p>}
      </div>
    </section>
  )
}

function WinnerCard({ w }: { w: Winner }) {
  const { t } = useI18n()
  const place = t(`res.place.${w.position}` as StringKey) || w.position
  const prize = [w.prize_amount, w.prize_label].filter(Boolean).join(' ')
  const who = [w.members_count > 1 ? `${w.name} (${t('res.members', { count: w.members_count })})` : w.name, w.district].filter(Boolean).join(' · ')
  return (
    <article className="w-full rounded-card border border-border bg-surface overflow-hidden flex flex-col">
      {w.photo_url ? (
        <img src={w.photo_url} alt={t('res.photoOf', { name: w.name })} className="w-full h-40 lg:h-[180px] object-cover" />
      ) : (
        <div className="hidden md:flex w-full h-[180px] bg-surface2 flex-col items-center justify-center gap-2 text-muted">
          <ImageIcon size={24} aria-hidden />
          <span className="text-d-cap">{t('res.imageMissing')}</span>
        </div>
      )}
      <div className="p-5 flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <Badge status="winner" />
          <span className="text-d-label-s text-text">{place}</span>
        </p>
        <h3 className="font-heading text-d-h4 text-text break-words">{w.title}</h3>
        {who && <p className="text-d-body-s text-muted">{who}</p>}
        {prize && <p className="text-d-label text-primary">{prize}</p>}
      </div>
    </article>
  )
}

function HowWeJudged({ criteria }: { criteria: Results['criteria'] }) {
  const { t } = useI18n()
  const top = Math.max(...criteria.map((c) => c.weight), 1)
  return (
    <section aria-labelledby="judged-title" className="grid gap-6 lg:gap-16 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] pt-2">
      <div className="flex flex-col gap-3">
        <h2 id="judged-title" className="font-heading text-d-h3 text-text">{t('res.judgedTitle')}</h2>
        <p className="text-d-body text-muted">{t('res.judgedBody', { count: criteria.length })}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {criteria.map((c) => (
          <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_48px] lg:grid-cols-[200px_minmax(0,1fr)_48px] items-center gap-x-4 gap-y-1.5">
            <span className="text-d-body-s text-text">{c.name}</span>
            <span aria-hidden className="col-span-2 lg:col-span-1 row-start-2 lg:row-start-auto h-2 rounded-full bg-surface2 overflow-hidden">
              {/* Scaled to the largest weight (about 62% full, as in Figma) so the bars compare at a glance; the number is the real share. */}
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((c.weight / top) * 62)}%` }} />
            </span>
            <span className="row-start-1 col-start-2 lg:row-start-auto lg:col-start-auto text-right text-d-body-s text-text tabular-nums">{c.weight}%</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ResultsSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-banner"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-14 space-y-4"><Skeleton className="h-5 w-48 bg-on-banner/10" /><Skeleton className="h-14 w-2/3 bg-on-banner/10" /><Skeleton className="h-4 w-1/2 bg-on-banner/10" /></div></div>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16 grid md:grid-cols-3 gap-6"><Skeleton className="h-80 rounded-card" /><Skeleton className="h-80 rounded-card" /><Skeleton className="h-80 rounded-card" /><SkeletonText lines={3} /></div>
    </div>
  )
}

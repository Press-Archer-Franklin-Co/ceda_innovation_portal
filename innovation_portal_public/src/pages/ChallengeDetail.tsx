import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleCheck, Clock, MapPin, MessageCircle, Sparkles, Trophy, Users } from 'lucide-react'
import clsx from 'clsx'
import Tag from '../components/ui/Tag'
import Badge from '../components/ui/Badge'
import { buttonClasses } from '../components/ui/Button'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import { DaysLeft } from '../components/challenges/ChallengeCard'
import { useShellSettings } from '../components/layout/shellData'
import { useI18n, StringKey, type Lang } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/dates'
import watermarkUrl from '../assets/brand/ceda-watermark.png'
import { publicContent, ChallengeDetail as Detail } from '../services/publicContent.service'

// Screen 1.8 Challenge detail (Figma 14:641 website, 14:962 phone). GET /api/programs/public/{slug}/ (B5).
// Everything needed to decide on one page: the problem, who can enter, support, how entries are judged (with
// weights), dates and FAQs. ① The apply card stays in view while scrolling (phone: a sticky bar). ② Tabs jump to
// sections. ③ FAQs open in place. Never shows judges or scores.

type SectionKey = 'overview' | 'who' | 'support' | 'judge' | 'dates' | 'schedule' | 'updates' | 'faqs'

const longDate = (iso: string | null | undefined, lang: string) =>
  iso ? new Date(iso).toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const shortDateTime = (iso: string | null | undefined, lang: string) =>
  iso ? new Date(iso).toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** Days, hours and minutes until `iso`, ticking every 30 s. */
function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [iso])
  if (!iso) return null
  const ms = Math.max(0, new Date(iso).getTime() - now)
  return { days: Math.floor(ms / 864e5), hours: Math.floor((ms % 864e5) / 36e5), mins: Math.floor((ms % 36e5) / 6e4), done: ms === 0 }
}

function Countdown({ target, label }: { target: string | null; label: string }) {
  const { t } = useI18n()
  const c = useCountdown(target)
  if (!c) return null
  const cells: [number, StringKey][] = [[c.days, 'chd.days'], [c.hours, 'chd.hours'], [c.mins, 'chd.mins']]
  return (
    <div>
      <p className="text-d-over uppercase font-heading text-muted mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-2" role="timer" aria-live="off">
        {cells.map(([n, k]) => (
          <div key={k} className="rounded-control bg-warning-soft text-warning flex flex-col items-center py-2">
            <span className="font-heading font-extrabold text-[26px] leading-8 tabular-nums">{String(n).padStart(2, '0')}</span>
            <span className="text-d-cap">{t(k)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ApplyCard({ c, enterTo }: { c: Detail; enterTo: string }) {
  const { t, lang } = useI18n()
  const settings = useShellSettings()
  const open = c.status === 'open'
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-pop">
      {c.status !== 'closed' && <Countdown target={open ? c.closes_at : c.opens_at} label={open ? t('chd.closeIn') : t('chd.openIn')} />}
      <p className="text-d-label text-text">
        {open ? t('chd.closesAt', { when: longDate(c.closes_at, lang) }) : c.status === 'upcoming' ? t('chd.opensAt', { when: longDate(c.opens_at, lang) }) : t('chd.closedAt', { when: formatDate(c.closes_at, lang) })}
      </p>
      {open && (
        <Link data-guide="challenge.enter" to={enterTo} className={buttonClasses({ block: true })}>
          {t('chd.enter')}
          <ArrowRight size={18} aria-hidden />
        </Link>
      )}
      {c.status === 'closed' && c.results_url && (
        <Link to={c.results_url} className={buttonClasses({ block: true, variant: 'secondary' })}>
          <Trophy size={18} aria-hidden />
          {t('ent.seeResults')}
        </Link>
      )}
      <ul className="flex flex-col gap-2 pt-3 border-t border-border text-d-cap text-muted">
        {open && c.estimated_minutes ? (
          <li className="flex items-start gap-2"><Clock size={14} aria-hidden className="mt-0.5 shrink-0" />{t('chd.minutes', { n: c.estimated_minutes })}</li>
        ) : null}
        {settings.whatsapp_number && (
          <li className="flex items-start gap-2"><MessageCircle size={14} aria-hidden className="mt-0.5 shrink-0" />{t('chd.questions', { number: settings.whatsapp_number })}</li>
        )}
        {c.started_count > 0 && (
          <li className="flex items-start gap-2"><Users size={14} aria-hidden className="mt-0.5 shrink-0" />{c.started_count === 1 ? t('chd.startedOne') : t('chd.started', { n: c.started_count })}</li>
        )}
      </ul>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border last:border-b-0 open:bg-surface2">
      <summary className="flex items-center justify-between gap-3 px-4 py-4 cursor-pointer list-none text-d-h5 font-heading text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown size={18} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-4 pb-4 -mt-1 text-d-body-s text-muted whitespace-pre-line">{a}</p>
    </details>
  )
}

/** "9 Jan, 07:30" for the hackathon schedule and updates. */
function scheduleWhen(iso: string, lang: Lang): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(lang === 'tn' ? 'en-BW' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${formatDate(iso, lang).replace(/ \d{4}$/, '')}, ${time}`
}

export default function ChallengeDetail() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, lang } = useI18n()
  const res = useAsync(() => publicContent.challenge(slug), [slug, lang])
  const [active, setActive] = useState<SectionKey>('overview')
  const c = res.data

  const sections = useMemo(() => {
    if (!c) return [] as SectionKey[]
    const list: SectionKey[] = ['overview']
    if (c.who_can_enter || c.where) list.push('who')
    if (c.support_package.length) list.push('support')
    if (c.judging_criteria.length) list.push('judge')
    if (c.key_dates.length) list.push('dates')
    if (c.hackathon?.schedule.length) list.push('schedule')
    if (c.hackathon?.updates.length) list.push('updates')
    if (c.faqs.length) list.push('faqs')
    return list
  }, [c])

  // Highlight the tab of the section in view.
  useEffect(() => {
    if (!sections.length) return
    const els = sections.map((k) => document.getElementById(`sec-${k}`)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id.replace('sec-', '') as SectionKey)
      },
      { rootMargin: '-140px 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections])

  useEffect(() => {
    if (c) document.title = `${c.title} · CEDA Innovation`
  }, [c])

  if (res.loading) {
    return (
      <div aria-hidden>
        <div className="bg-banner"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 space-y-4"><Skeleton className="h-4 w-60 bg-on-banner/10" /><Skeleton className="h-14 w-3/4 bg-on-banner/10" /><Skeleton className="h-20 w-full bg-on-banner/10" /></div></div>
        <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 grid lg:grid-cols-[1fr_288px] gap-10"><div className="space-y-4"><Skeleton className="h-8 w-1/2" /><SkeletonText lines={6} /></div><Skeleton className="h-[320px] rounded-card" /></div>
      </div>
    )
  }
  if (res.error || !c) {
    const missing = axios.isAxiosError(res.error) && res.error.response?.status === 404
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        {missing ? (
          <EmptyState title={t('chd.notFound')} body={t('chd.notFoundBody')}>
            <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('chd.allChallenges')}</Link>
          </EmptyState>
        ) : (
          <ErrorState title={t('chd.loadError')} body={t('home.loadErrorBody')} onRetry={res.reload} retrying={res.fetching} />
        )}
      </div>
    )
  }

  // U10: Enter goes to this challenge's own flow (1.9 Can you enter?, then its form 2.10), never the general idea form.
  const enterTo = `/challenges/${c.slug}/enter`
  const sector = c.sector ?? c.sectors[0]
  const facts = [
    c.support_headline && { icon: Trophy, label: t('chd.support'), value: c.support_headline },
    c.status === 'upcoming'
      ? c.opens_at && { icon: CalendarDays, label: t('chd.opens'), value: shortDateTime(c.opens_at, lang) }
      : c.closes_at && { icon: CalendarDays, label: c.status === 'closed' ? t('chd.closedOn') : t('chd.closes'), value: shortDateTime(c.closes_at, lang) },
    c.who_can_enter && { icon: Users, label: t('chd.who'), value: c.who_can_enter.split('\n')[0] },
    c.where && { icon: MapPin, label: t('chd.where'), value: c.where.split('\n')[0] },
  ].filter(Boolean) as { icon: typeof Trophy; label: string; value: string }[]
  const now = Date.now()

  return (
    <>
      <section aria-labelledby="challenge-title" className="relative overflow-hidden bg-banner text-on-banner">
        <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none select-none absolute right-[-160px] top-[40px] w-[700px] max-w-none hidden lg:block" />
        <div className="relative max-w-[1200px] mx-auto px-5 lg:px-6 pt-8 lg:pt-10 pb-10 lg:pb-14 flex flex-col gap-4">
          <nav aria-label={t('chd.breadcrumb')}>
            <ol className="flex flex-wrap items-center gap-2 text-d-cap text-banner-muted">
              <li><Link to="/" className="hover:underline">{t('nav.home')}</Link></li>
              <li aria-hidden><ChevronRight size={12} /></li>
              <li><Link to="/challenges" className="hover:underline">{t('nav.challenges')}</Link></li>
              <li aria-hidden><ChevronRight size={12} /></li>
              <li aria-current="page" className="text-on-banner truncate max-w-[220px]">{c.title}</li>
            </ol>
          </nav>
          <div className="flex flex-wrap gap-2">
            {sector && <Tag tone="neutral">{sector.name}</Tag>}
            <Badge status={c.status} />
            {c.status === 'open' && c.closes_at && <DaysLeft days={c.days_left} />}
          </div>
          <h1 id="challenge-title" className="font-heading font-extrabold text-d-mh1 lg:text-d-h1 lg:max-w-[800px]">{c.title}</h1>
          {c.summary && <p className="text-d-body text-banner-muted lg:max-w-[720px]">{c.summary}</p>}
          {facts.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 pt-2 lg:max-w-[900px]">
              {facts.map(({ icon: Icon, label, value }) => (
                <li key={label} className="flex items-center gap-2.5 rounded-card bg-on-banner/10 p-3.5">
                  <Icon size={20} aria-hidden className="text-yellow shrink-0" />
                  <span className="flex flex-col min-w-0">
                    <span className="text-d-cap text-banner-muted">{label}</span>
                    <span className="text-d-label">{value}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pb-28 lg:pb-[72px] lg:grid lg:grid-cols-[1fr_288px] lg:gap-10 xl:gap-12">
        <div className="min-w-0">
          <nav aria-label={t('chd.sections')} className="sticky top-[60px] lg:top-[106px] z-20 bg-bg -mx-5 px-5 lg:mx-0 lg:px-0 border-b border-border">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sections.map((k) => (
                <li key={k} className="shrink-0">
                  <a
                    href={`#sec-${k}`}
                    aria-current={active === k ? 'location' : undefined}
                    className={clsx(
                      'relative inline-flex items-center h-12 px-3 text-[14px] font-heading whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary rounded-control',
                      active === k ? 'text-primary font-bold after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary after:rounded-full' : 'text-text hover:text-primary',
                    )}
                  >
                    {t(`chd.tab.${k}` as StringKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-12 pt-8 [&>section]:scroll-mt-[180px]">
            <section id="sec-overview" aria-labelledby="h-overview">
              <h2 id="h-overview" className="text-d-h3 font-heading text-text mb-3">{t('chd.lookingFor')}</h2>
              {(c.problem_statement || c.description) && <p className="text-d-body text-muted whitespace-pre-line">{c.problem_statement || c.description}</p>}
              {c.what_we_look_for.length > 0 && (
                <ul className="mt-4 flex flex-col gap-3">
                  {c.what_we_look_for.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-d-body-s text-text">
                      <CircleCheck size={18} aria-hidden className="text-success shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {sections.includes('who') && (
              <section id="sec-who" aria-labelledby="h-who">
                <h2 id="h-who" className="text-d-h3 font-heading text-text mb-3">{t('chd.whoTitle')}</h2>
                {c.who_can_enter && <p className="text-d-body text-muted whitespace-pre-line">{c.who_can_enter}</p>}
                {c.where && (
                  <p className="mt-3 flex items-start gap-2 text-d-body-s text-text"><MapPin size={18} aria-hidden className="text-accent shrink-0 mt-0.5" />{c.where}</p>
                )}
              </section>
            )}

            {sections.includes('support') && (
              <section id="sec-support" aria-labelledby="h-support">
                <h2 id="h-support" className="text-d-h3 font-heading text-text mb-4">{t('chd.supportTitle')}</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {c.support_package.map((s, i) => {
                    const Icon = [Trophy, Users, Sparkles][i % 3]
                    return (
                      <li key={i} className="flex flex-col gap-2 rounded-card bg-surface2 p-4">
                        <Icon size={20} aria-hidden className="text-accent" />
                        <span className="text-d-h5 font-heading text-text">{s.amount_label || s.title}</span>
                        {s.amount_label && s.title && <span className="text-d-label-s text-text">{s.title}</span>}
                        {s.description && <span className="text-d-cap text-muted">{s.description}</span>}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {sections.includes('judge') && (
              <section id="sec-judge" aria-labelledby="h-judge">
                <h2 id="h-judge" className="text-d-h3 font-heading text-text mb-1">{t('chd.judgeTitle')}</h2>
                <p className="text-d-body-s text-muted mb-4">{t('chd.judgeNote')}</p>
                <ul className="flex flex-col gap-4">
                  {c.judging_criteria.map((cr, i) => (
                    <li key={i}>
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <span className="text-d-label text-text">{cr.name}</span>
                        <span className="text-d-label-s text-text tabular-nums">{Math.round(cr.weight)}%</span>
                      </div>
                      <div role="img" aria-label={t('chd.weight', { n: Math.round(cr.weight) })} className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, cr.weight)}%` }} />
                      </div>
                      {cr.description && <p className="text-d-cap text-muted mt-1.5">{cr.description}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sections.includes('dates') && (
              <section id="sec-dates" aria-labelledby="h-dates">
                <h2 id="h-dates" className="text-d-h3 font-heading text-text mb-4">{t('chd.datesTitle')}</h2>
                <ol className="flex flex-col gap-3">
                  {c.key_dates.map((d, i) => {
                    const passed = d.starts_at ? new Date(d.starts_at).getTime() <= now : false
                    return (
                      <li key={i} className="grid grid-cols-[16px_96px_1fr] items-center gap-3">
                        <span aria-hidden className={clsx('w-2.5 h-2.5 rounded-full', passed ? 'bg-success' : 'bg-border')} />
                        <span className="text-d-label text-text">{formatDate(d.starts_at, lang).replace(/ \d{4}$/, '') || '–'}</span>
                        <span className="text-d-body-s text-muted">{d.title}</span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            {/* Hackathon challenges: the live hackathon page's schedule and updates (3.36), in the Dates layout. */}
            {sections.includes('schedule') && c.hackathon && (
              <section id="sec-schedule" aria-labelledby="h-schedule">
                <h2 id="h-schedule" className="text-d-h3 font-heading text-text mb-4">{t('chd.scheduleTitle')}</h2>
                <ol className="flex flex-col gap-3">
                  {c.hackathon.schedule.map((item) => {
                    const passed = new Date(item.starts_at).getTime() <= now
                    return (
                      <li key={item.id} className="grid grid-cols-[16px_96px_1fr] items-center gap-3">
                        <span aria-hidden className={clsx('w-2.5 h-2.5 rounded-full', item.now ? 'bg-primary' : passed ? 'bg-success' : 'bg-border')} />
                        <span className="text-d-label text-text">{scheduleWhen(item.starts_at, lang)}</span>
                        <span className={clsx('text-d-body-s', item.now ? 'text-text font-bold' : 'text-muted')}>
                          {item.title}
                          {item.now && <Tag tone="red" className="ml-2 align-middle">{t('chd.now')}</Tag>}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            {sections.includes('updates') && c.hackathon && (
              <section id="sec-updates" aria-labelledby="h-updates">
                <h2 id="h-updates" className="text-d-h3 font-heading text-text mb-4">{t('chd.updatesTitle')}</h2>
                <ul className="flex flex-col gap-3">
                  {c.hackathon.updates.map((u) => (
                    <li key={u.id} className="rounded-card border border-border bg-surface p-4 flex gap-3">
                      {u.photo_url && <img src={u.photo_url} alt="" className="w-20 h-20 rounded-control object-cover shrink-0" loading="lazy" />}
                      <div className="min-w-0">
                        <p className="text-d-cap text-muted">{scheduleWhen(u.created_at, lang)}</p>
                        <p className="text-d-body-s text-text whitespace-pre-line break-words">{u.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sections.includes('faqs') && (
              <section id="sec-faqs" aria-labelledby="h-faqs">
                <h2 id="h-faqs" className="text-d-h3 font-heading text-text mb-4">{t('chd.faqTitle')}</h2>
                <div className="rounded-card border border-border overflow-hidden">
                  {c.faqs.map((f, i) => <Faq key={i} q={f.question} a={f.answer} />)}
                </div>
              </section>
            )}
          </div>
        </div>

        <aside className="hidden lg:flex flex-col gap-6 pt-6">
          <div className="sticky top-[130px] flex flex-col gap-6">
            <ApplyCard c={c} enterTo={enterTo} />
            {c.partners.length > 0 && (
              <div className="rounded-card bg-surface2 p-4">
                <p className="text-d-over uppercase font-heading text-muted mb-3">{t('chd.partners')}</p>
                <ul className="grid grid-cols-3 gap-2">
                  {c.partners.map((p) => (
                    <li key={p.name} className="h-11 rounded-control bg-surface flex items-center justify-center px-2">
                      {p.logo_url ? <img src={p.logo_url} alt={p.name} className="max-h-7 max-w-full object-contain" /> : <span className="text-d-cap text-muted truncate">{p.name}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Phone: the apply card becomes a sticky bar above the tab bar. */}
      {c.status === 'open' && (
        <div className="lg:hidden fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 bg-bg border-t border-border px-5 py-3 flex items-center gap-3 shadow-[0_-6px_20px_rgba(46,26,15,0.08)]">
          <div className="flex-1 min-w-0">
            <p className="text-d-label text-text truncate">{t('chd.closesAt', { when: formatDate(c.closes_at, lang) })}</p>
            <DaysLeft days={c.days_left} className="mt-1" />
          </div>
          <Link data-guide="challenge.enter" to={enterTo} className={buttonClasses({ size: 'sm' })}>{t('chd.enter')}</Link>
        </div>
      )}
    </>
  )
}

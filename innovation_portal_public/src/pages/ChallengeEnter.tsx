import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, Check, CircleAlert, CircleCheck, Clock, Lightbulb, Lock, Trophy, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import Button, { buttonClasses } from '../components/ui/Button'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import EntryBand from '../components/challenges/EntryBand'
import SubscribeCard from '../components/home/SubscribeCard'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate, formatDayMonth } from '../lib/dates'
import { challengeEntryService, type EligibilityResult, type EntryStatus } from '../services/challengeEntry.service'
import { publicContent } from '../services/publicContent.service'
import { parseApiError } from '../utils/apiError'

// U10 screens 1.9 Can you enter? (Figma 106:718 website, 106:914 phone) and 1.9b entry states (106:987, 106:1156).
// GET /api/programs/public/{slug}/entry/ says what Enter leads to. The yes/no questions come from the challenge
// builder (3.6b); once every one is answered they are checked, and "You can enter" opens the challenge's own form
// (2.10), never the general idea form. Anyone who cannot enter sees why and which open challenges suit them.

type Answer = 'yes' | 'no'

export const entryFormPath = (slug: string, draftId: string) => `/challenges/${slug}/entry/${draftId}`

export default function ChallengeEnter() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t, lang } = useI18n()
  const res = useAsync(() => challengeEntryService.status(slug), [slug, lang])
  const s = res.data

  if (res.loading) return <EnterSkeleton />
  if (res.error || !s) {
    const missing = axios.isAxiosError(res.error) && res.error.response?.status === 404
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        {missing ? (
          <EmptyState title={t('ent.notFound')} body={t('ent.notFoundBody')}>
            <Link to="/challenges" className={buttonClasses({ size: 'sm' })}>{t('ent.allChallenges')}</Link>
          </EmptyState>
        ) : (
          <ErrorState title={t('ent.loadError')} body={t('ent.loadErrorBody')} onRetry={res.reload} retrying={res.fetching} />
        )}
      </div>
    )
  }

  const c = s.challenge
  // An old link may carry the challenge id: keep the address readable.
  if (slug !== c.slug) return <Navigate to={`/challenges/${c.slug}/enter`} replace />
  // 1.9b ①: the shared quick sign-in (phone number and code, 2.0) comes back here.
  if (s.state === 'sign_in') return <Navigate to={`/sign-in?next=${encodeURIComponent(`/challenges/${c.slug}/enter`)}`} replace />
  if (s.state === 'form') return <StartForm status={s} />
  if (s.state === 'questions') return <Questions status={s} />
  return (
    <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-12 pb-28 lg:pb-16">
      <div className="max-w-[588px]"><Stopped status={s} /></div>
    </div>
  )
}

/** No questions, or already answered: open (or reuse) the challenge's draft and go to its form. */
function StartForm({ status }: { status: EntryStatus }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [failed, setFailed] = useState<string | null>(null)
  const started = useRef(false)
  const slug = status.challenge.slug

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (status.draft_id) {
      navigate(entryFormPath(slug, status.draft_id), { replace: true })
      return
    }
    challengeEntryService
      .answer(slug, {})
      .then((result) => (result.draft_id ? navigate(entryFormPath(slug, result.draft_id), { replace: true }) : setFailed(t('ent.loadError'))))
      .catch((error) => setFailed(parseApiError(error, t('ent.loadError'))))
  }, [navigate, slug, status.draft_id, t])

  if (failed) {
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-16">
        <ErrorState title={failed} onRetry={() => window.location.reload()} />
      </div>
    )
  }
  return (
    <div className="max-w-[720px] mx-auto px-5 lg:px-6 py-16" aria-busy="true">
      <p role="status" className="text-d-body text-muted">{t('ent.starting')}</p>
      <Skeleton className="mt-4 h-40 w-full rounded-card" />
    </div>
  )
}

/** 1.9: the questions as Yes / No rows, checked as soon as all are answered. */
function Questions({ status }: { status: EntryStatus }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<EligibilityResult | null>(null)
  const [showStop, setShowStop] = useState(false)
  const requestRef = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const c = status.challenge
  const questions = status.questions
  const allAnswered = questions.every((q) => answers[q.id])

  async function check(next: Record<string, Answer>) {
    const request = ++requestRef.current
    setChecking(true)
    try {
      const body = Object.fromEntries(questions.map((q) => [q.id, next[q.id] === 'yes']))
      const answer = await challengeEntryService.answer(c.slug, body)
      if (request !== requestRef.current) return
      setResult(answer)
      if (!answer.eligible) {
        setShowStop(true)
        window.scrollTo({ top: 0 })
        window.setTimeout(() => headingRef.current?.focus(), 0)
      }
    } catch (error) {
      if (request === requestRef.current) toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
    } finally {
      if (request === requestRef.current) setChecking(false)
    }
  }

  function pick(id: string, value: Answer) {
    const next = { ...answers, [id]: value }
    setAnswers(next)
    setResult(null)
    if (questions.every((q) => next[q.id])) check(next)
  }

  if (showStop && result && !result.eligible) {
    return (
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 lg:py-12 pb-28 lg:pb-16">
        <div className="max-w-[588px]">
          <NotEligible result={result} slug={c.slug} headingRef={headingRef} onChange={() => setShowStop(false)} />
        </div>
      </div>
    )
  }

  return (
    <>
      <EntryBand overline={t('ent.over')} title={c.title} titleId="enter-band-title" closesAt={c.closes_at} current={1} />
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pt-6 lg:pt-10 pb-28 lg:pb-[72px] grid gap-10 lg:gap-12 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <section aria-labelledby="enter-title" className="flex flex-col gap-3 lg:gap-4 min-w-0">
          <h2 id="enter-title" className="font-heading text-d-h3 lg:text-d-h2 text-text">{t('ent.title')}</h2>
          <p className="hidden lg:block text-d-body text-muted">{questions.length === 1 ? t('ent.introOne') : t('ent.intro', { count: questions.length })}</p>
          <ol className="flex flex-col gap-3 lg:gap-4">
            {questions.map((q) => (
              <li key={q.id} className="rounded-card border border-border bg-surface px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
                <div className="flex-1 min-w-0">
                  <p id={`q-${q.id}`} className="text-d-label text-text">{q.question}</p>
                  {q.help && <p className="mt-0.5 text-d-cap text-muted">{q.help}</p>}
                </div>
                <YesNo labelledBy={`q-${q.id}`} value={answers[q.id] ?? null} onChange={(v) => pick(q.id, v)} />
              </li>
            ))}
          </ol>
          <div aria-live="polite">
            {allAnswered && checking && !result && (
              <p className="rounded-card bg-surface2 px-[18px] py-4 text-d-body-s text-muted">{t('ent.checking')}</p>
            )}
            {result?.eligible && result.draft_id && (
              <div className="rounded-card bg-success-soft px-4 lg:px-[18px] py-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-3.5">
                <Check size={24} aria-hidden className="hidden lg:block shrink-0 text-success" />
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-d-h5 text-success">{t('ent.canEnter')}</p>
                  <p className="hidden lg:block text-d-body-s text-text">{t('ent.canEnterBody')}</p>
                </div>
                <Button arrow className="w-full lg:w-auto" onClick={() => navigate(entryFormPath(c.slug, result.draft_id as string))}>{t('ent.start')}</Button>
              </div>
            )}
          </div>
        </section>
        <WhatYouNeed headline={c.support_headline ?? ''} />
      </div>
    </>
  )
}

/** Two pill buttons; a radio group to assistive tech. */
function YesNo({ value, onChange, labelledBy }: { value: Answer | null; onChange: (v: Answer) => void; labelledBy: string }) {
  const { t } = useI18n()
  const options: [Answer, string][] = [['yes', t('ent.yes')], ['no', t('ent.no')]]
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-2 lg:flex gap-1.5 shrink-0"
      onKeyDown={(e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault()
          const next: Answer = value === 'yes' ? 'no' : 'yes'
          onChange(next)
          ;(e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus()
        }
      }}>
      {options.map(([v, label]) => {
        const on = value === v
        return (
          <button key={v} type="button" role="radio" aria-checked={on} data-value={v} tabIndex={on || (!value && v === 'yes') ? 0 : -1}
            onClick={() => onChange(v)}
            className={clsx(
              'rounded-full px-4 py-[7px] min-h-[44px] lg:min-h-0 text-d-btn-s font-heading transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              on ? 'bg-primary text-white' : 'border border-border bg-surface text-text hover:bg-surface2',
            )}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** 1.9 right column: what to have ready, and what is up for grabs. */
function WhatYouNeed({ headline }: { headline: string }) {
  const { t } = useI18n()
  const items: [LucideIcon, string][] = [[User, t('ent.need.omang')], [Lightbulb, t('ent.need.idea')], [Clock, t('ent.need.time')]]
  return (
    <aside aria-labelledby="need-title" className="hidden lg:flex rounded-2xl bg-surface2 p-6 flex-col gap-3.5">
      <h2 id="need-title" className="font-heading text-d-h5 text-text">{t('ent.need.title')}</h2>
      <ul className="flex flex-col gap-3.5">
        {items.map(([Icon, text]) => (
          <li key={text} className="flex items-center gap-2.5 text-d-body-s text-text"><Icon size={18} aria-hidden className="shrink-0 text-primary" />{text}</li>
        ))}
      </ul>
      {headline && (
        <div className="rounded-card bg-banner p-3.5 flex flex-col gap-1">
          <p className="text-d-over uppercase font-heading text-yellow">{t('ent.need.prize')}</p>
          <p className="text-d-label text-on-banner">{headline}</p>
        </div>
      )}
    </aside>
  )
}

/** 1.9b ④: the reason in plain words, and open challenges that do fit. */
function NotEligible({ result, slug, headingRef, onChange }: { result: EligibilityResult; slug: string; headingRef: Ref<HTMLHeadingElement>; onChange: () => void }) {
  const { t } = useI18n()
  const reasons = result.reasons.map((r) => r.reason || r.question)
  const [first, ...more] = reasons
  return (
    <StopCard icon={CircleAlert} tone="info" headingRef={headingRef} title={first && !more.length ? first : t('ent.notEligibleTitle')}
      actions={<><Link to="/challenges" className={buttonClasses({ variant: 'secondary' })}>{t('ent.allChallenges')}</Link><Button variant="ghost" onClick={onChange}>{t('ent.changeAnswers')}</Button></>}>
      {more.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5 list-disc pl-5 text-text">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <OpenChallenges exclude={slug} generalUrl={result.general_idea_url} />
    </StopCard>
  )
}

function OpenChallenges({ exclude, generalUrl }: { exclude: string; generalUrl: string }) {
  const { t, lang } = useI18n()
  const list = useAsync(() => publicContent.challenges({ status: 'open', sort: 'closing_soon' }), [lang])
  const open = (list.data?.results ?? []).filter((c) => c.slug !== exclude).slice(0, 3)
  return (
    <>
      <p>{t('ent.stillOpen')}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {open.map((c) => (
          <li key={c.slug}>
            <Row to={`/challenges/${c.slug}`}>{c.title}{c.closes_at ? ` · ${t('ent.closesShort', { when: formatDayMonth(c.closes_at, lang) })}` : ''}</Row>
          </li>
        ))}
        <li><Row to={generalUrl}>{t('ent.openCall')}</Row></li>
      </ul>
    </>
  )
}

function Row({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-control bg-surface2 px-3 py-2.5 text-d-label text-text hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="min-w-0">{children}</span>
      <ArrowRight size={16} aria-hidden className="shrink-0 text-primary" />
    </Link>
  )
}

/** 1.9b: why Enter stops here, and the way on. */
function Stopped({ status }: { status: EntryStatus }) {
  const { t, lang } = useI18n()
  const [notify, setNotify] = useState(false)
  const notifyRef = useRef<HTMLButtonElement>(null)
  const c = status.challenge
  const allOpen = <Link to="/challenges?status=open" className={buttonClasses({ variant: 'secondary' })}>{t('ent.seeOpen')}</Link>

  switch (status.state) {
    case 'entered':
      return (
        <StopCard icon={Check} tone="success" title={t('ent.enteredTitle')}
          actions={
            <>
              {status.entry && <Link to={status.entry.url} className={buttonClasses({})}>{t('ent.track')}</Link>}
              {c.has_results && <Link to={`/challenges/${c.slug}/my-result`} className={buttonClasses({ variant: 'secondary' })}>{t('ent.myResult')}</Link>}
            </>
          }>
          {status.entry && <p>{t('ent.enteredBody', { when: formatDayMonth(status.entry.submitted_at, lang) })}</p>}
        </StopCard>
      )
    case 'limit':
      return (
        <StopCard icon={CircleCheck} tone="success" title={t('ent.limitTitle')}
          actions={<Link to="/my-ideas" className={buttonClasses({})}>{t('ent.myIdeas')}</Link>}>
          <p>{t('ent.limitBody', { count: status.max_entries ?? status.entries_used })}</p>
        </StopCard>
      )
    case 'not_open':
      return (
        <StopCard icon={Clock} tone="warning" title={t('ent.notOpenTitle', { when: formatDate(c.opens_at, lang) })}
          actions={<><Link to={`/challenges/${c.slug}`} className={buttonClasses({})}>{t('ent.backToChallenge')}</Link>{allOpen}</>}>
          <p>{t('ent.notOpenBody')}</p>
        </StopCard>
      )
    case 'audience':
      return (
        <StopCard icon={Lock} tone="info" title={t('ent.audienceTitle')} actions={null}>
          <p className="mb-4">{t('ent.audienceBody')}</p>
          <OpenChallenges exclude={c.slug} generalUrl={status.general_idea_url} />
          <div className="mt-4"><Link to="/challenges" className={buttonClasses({ variant: 'secondary' })}>{t('ent.allChallenges')}</Link></div>
        </StopCard>
      )
    default:
      return (
        <StopCard icon={Clock} tone="warning" title={c.closes_at ? t('ent.closedTitle', { when: formatDate(c.closes_at, lang) }) : t('ent.closedNoDate')}
          actions={
            c.has_results ? (
              <>
                <Link to={`/challenges/${c.slug}/results`} className={buttonClasses({})}><Trophy size={18} aria-hidden />{t('ent.seeResults')}</Link>
                {allOpen}
              </>
            ) : (
              <>
                <Button ref={notifyRef} onClick={() => setNotify(true)}>{t('ent.notifyNext')}</Button>
                {allOpen}
                <Modal open={notify} onClose={() => setNotify(false)} triggerRef={notifyRef} title={t('ent.notifyNext')} size="sm">
                  <SubscribeCard headingLevel={3} />
                </Modal>
              </>
            )
          }>
          <p>
            {c.has_results
              ? t('ent.closedResults')
              : c.results_publish_at
                ? t('ent.closedJudging', { when: new Date(c.results_publish_at).toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { month: 'long' }) })
                : t('ent.closedJudgingNoDate')}
          </p>
        </StopCard>
      )
  }
}

const TONES = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  primary: 'bg-primary-soft text-primary',
} as const

function StopCard({ icon: Icon, tone, title, actions, children, headingRef }: {
  icon: LucideIcon
  tone: keyof typeof TONES
  title: string
  actions: ReactNode
  children: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <section aria-labelledby="stop-title" className="rounded-card border border-border bg-surface p-5 lg:p-7 flex flex-col gap-3 lg:gap-4">
      <span aria-hidden className={`w-12 h-12 rounded-full flex items-center justify-center ${TONES[tone]}`}><Icon size={22} /></span>
      <h1 id="stop-title" ref={headingRef} tabIndex={-1} className="font-heading text-d-h4 text-text focus:outline-none">{title}</h1>
      <div className="text-d-body text-muted">{children}</div>
      {actions && <div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
    </section>
  )
}

function EnterSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-accent-soft/55 border-b border-border"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-7 space-y-3"><Skeleton className="h-3 w-40" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-1.5 w-full" /></div></div>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-10 grid gap-12 lg:grid-cols-[1fr_380px]"><div className="space-y-4"><SkeletonText lines={2} /><Skeleton className="h-16 rounded-card" /><Skeleton className="h-16 rounded-card" /></div><Skeleton className="hidden lg:block h-72 rounded-2xl" /></div>
    </div>
  )
}


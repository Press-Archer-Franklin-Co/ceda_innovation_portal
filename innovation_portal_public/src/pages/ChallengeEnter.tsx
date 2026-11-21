import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, CalendarClock, CircleCheck, CircleSlash, Lock, ShieldCheck, Trophy, UserX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Button, { buttonClasses } from '../components/ui/Button'
import { RadioGroup } from '../components/ui/Choice'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import ChallengeFlowHeader from '../components/challenges/ChallengeFlowHeader'
import { useI18n } from '../i18n'
import { useAsync } from '../lib/useAsync'
import { formatDate } from '../lib/dates'
import { challengeEntryService, type EligibilityResult, type EntryStatus } from '../services/challengeEntry.service'
import { parseApiError } from '../utils/apiError'

// U10 screens 1.9 Can you enter? (Figma 106:718 website, 106:914 phone) and 1.9b Closed / already entered /
// not eligible (106:987, 106:1156). GET /api/programs/public/{slug}/entry/ says what Enter leads to; the
// questions come from the challenge's own requirements. Passing them opens this challenge's own form (2.10),
// never the general idea form. Not eligible offers the general idea as the way on ("No challenge fits?").

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
  if (s.state === 'sign_in') return <Navigate to={`/sign-in?next=${encodeURIComponent(`/challenges/${c.slug}/enter`)}`} replace />
  if (s.state === 'form') return <StartForm status={s} />

  return (
    <>
      <ChallengeFlowHeader slug={c.slug} challenge={c.title} titleId="enter-title" overline={s.state === 'questions' ? t('ent.stepCheck') : undefined}
        title={s.state === 'questions' ? t('ent.title') : c.title}>
        {c.status === 'open' && c.closes_at && (
          <p className="flex items-center gap-2 text-d-body-s text-banner-muted"><CalendarClock size={16} aria-hidden />{t('ent.closes', { when: formatDate(c.closes_at, lang) })}</p>
        )}
      </ChallengeFlowHeader>
      <div className="max-w-[720px] mx-auto px-5 lg:px-6 py-10 lg:py-14 pb-28 lg:pb-16">
        {s.state === 'questions' ? <Questions status={s} /> : <Stopped status={s} />}
      </div>
    </>
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

function Questions({ status }: { status: EntryStatus }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [missing, setMissing] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<EligibilityResult | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const slug = status.challenge.slug
  const questions = status.questions

  async function onCheck() {
    if (questions.some((q) => !answers[q.id])) {
      setMissing(true)
      return
    }
    setSending(true)
    try {
      const body = Object.fromEntries(questions.map((q) => [q.id, answers[q.id] === 'yes']))
      const answer = await challengeEntryService.answer(slug, body)
      if (answer.eligible && answer.draft_id) {
        navigate(entryFormPath(slug, answer.draft_id))
        return
      }
      setResult(answer)
      window.scrollTo({ top: 0 })
      window.setTimeout(() => headingRef.current?.focus(), 0)
    } catch (error) {
      toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
    } finally {
      setSending(false)
    }
  }

  if (result && !result.eligible) {
    return (
      <StopCard icon={UserX} tone="warning" title={t('ent.notEligibleTitle')} headingRef={headingRef}
        actions={
          <>
            <Link to={result.general_idea_url} className={buttonClasses({})}>{t('ent.generalIdea')}</Link>
            <Button variant="secondary" onClick={() => setResult(null)}>{t('ent.changeAnswers')}</Button>
          </>
        }>
        <p>{t('ent.notEligibleBody')}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {result.reasons.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-text">
              <CircleSlash size={18} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              <span>{r.reason || r.question}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4">{t('ent.noFit')}</p>
      </StopCard>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onCheck()
      }}
      className="flex flex-col gap-6"
    >
      <p className="text-d-body text-muted">{questions.length === 1 ? t('ent.introOne') : t('ent.intro', { count: questions.length })}</p>
      <ol className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-card border border-border bg-surface p-4 lg:p-5">
            <RadioGroup<Answer>
              name={`q-${q.id}`}
              legend={<span className="text-d-h5 font-heading text-text"><span className="text-muted tabular-nums">{i + 1}. </span>{q.question}</span>}
              hint={q.help || undefined}
              options={[{ value: 'yes', label: t('ent.yes') }, { value: 'no', label: t('ent.no') }]}
              value={answers[q.id] ?? null}
              onChange={(value) => {
                setAnswers((prev) => ({ ...prev, [q.id]: value }))
                setMissing(false)
              }}
              error={missing && !answers[q.id] ? t('ent.answerAll') : undefined}
              variant="cards"
            />
          </li>
        ))}
      </ol>
      <p role="alert" className="sr-only">{missing ? t('ent.answerAll') : ''}</p>
      <p className="flex items-start gap-2 text-d-cap text-muted"><ShieldCheck size={16} aria-hidden className="mt-px shrink-0" />{t('ent.private')}</p>
      {/* Phone: the main button first and full width, the way back under it. */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link to={`/challenges/${slug}`} className={buttonClasses({ variant: 'ghost' })}><ArrowLeft size={18} aria-hidden />{t('ent.backToChallenge')}</Link>
        <Button type="submit" loading={sending} arrow className="w-full sm:w-auto">{t('ent.check')}</Button>
      </div>
    </form>
  )
}

/** 1.9b: why Enter stops here, and the way on. */
function Stopped({ status }: { status: EntryStatus }) {
  const { t, lang } = useI18n()
  const c = status.challenge
  const back = <Link to={`/challenges/${c.slug}`} className={buttonClasses({ variant: 'secondary' })}>{t('ent.backToChallenge')}</Link>
  const general = <Link to={status.general_idea_url} className={buttonClasses({ variant: 'secondary' })}>{t('ent.generalIdea')}</Link>

  switch (status.state) {
    case 'entered':
      return (
        <StopCard icon={CircleCheck} tone="success" title={t('ent.enteredTitle')}
          actions={
            <>
              {status.entry && <Link to={status.entry.url} className={buttonClasses({})}>{t('ent.openEntry')}</Link>}
              {c.has_results && <Link to={`/challenges/${c.slug}/my-result`} className={buttonClasses({ variant: 'secondary' })}>{t('ent.myResult')}</Link>}
              {back}
            </>
          }>
          {status.entry && <p>{t('ent.enteredBody', { ref: status.entry.reference_number, when: formatDate(status.entry.submitted_at, lang) })}</p>}
        </StopCard>
      )
    case 'limit':
      return (
        <StopCard icon={CircleCheck} tone="success" title={t('ent.limitTitle')}
          actions={<><Link to="/my-ideas" className={buttonClasses({})}>{t('ent.myIdeas')}</Link>{back}</>}>
          <p>{t('ent.limitBody', { count: status.max_entries ?? status.entries_used })}</p>
        </StopCard>
      )
    case 'not_open':
      return (
        <StopCard icon={CalendarClock} tone="info" title={t('ent.notOpenTitle')} actions={back}>
          <p>{t('ent.notOpenBody', { when: formatDate(c.opens_at, lang) })}</p>
        </StopCard>
      )
    case 'audience':
      return (
        <StopCard icon={Lock} tone="warning" title={t('ent.audienceTitle')} actions={<><Link to="/challenges" className={buttonClasses({})}>{t('ent.allChallenges')}</Link>{general}</>}>
          <p>{t('ent.audienceBody')}</p>
          <p className="mt-4">{t('ent.noFit')}</p>
        </StopCard>
      )
    default:
      return (
        <StopCard icon={Lock} tone="neutral" title={t('ent.closedTitle')}
          actions={
            <>
              {c.has_results
                ? <Link to={`/challenges/${c.slug}/results`} className={buttonClasses({})}><Trophy size={18} aria-hidden />{t('ent.seeResults')}</Link>
                : <Link to="/challenges" className={buttonClasses({})}>{t('ent.allChallenges')}</Link>}
              {status.entry && <Link to={status.entry.url} className={buttonClasses({ variant: 'secondary' })}>{t('ent.openEntry')}</Link>}
              {general}
            </>
          }>
          <p>{c.closes_at ? t('ent.closedBody', { when: formatDate(c.closes_at, lang) }) : t('ent.closedNoDate')}</p>
        </StopCard>
      )
  }
}

const TONES = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface2 text-muted',
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
    <section aria-labelledby="stop-title" className="rounded-card border border-border bg-surface p-6 lg:p-8 flex flex-col gap-4">
      <span aria-hidden className={`w-12 h-12 rounded-full flex items-center justify-center ${TONES[tone]}`}><Icon size={24} /></span>
      <h2 id="stop-title" ref={headingRef} tabIndex={-1} className="font-heading text-d-h3 text-text focus:outline-none">{title}</h2>
      <div className="text-d-body text-muted">{children}</div>
      <div className="flex flex-wrap gap-3 pt-2">{actions}</div>
    </section>
  )
}

function EnterSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-banner"><div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-8 space-y-3"><Skeleton className="h-3 w-48 bg-on-banner/10" /><Skeleton className="h-10 w-2/3 bg-on-banner/10" /></div></div>
      <div className="max-w-[720px] mx-auto px-5 lg:px-6 py-10 space-y-4"><SkeletonText lines={2} /><Skeleton className="h-28 rounded-card" /><Skeleton className="h-28 rounded-card" /></div>
    </div>
  )
}

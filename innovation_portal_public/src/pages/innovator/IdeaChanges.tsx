import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import Button, { buttonClasses } from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState } from '../../components/ui/EmptyState'
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton'
import Tag from '../../components/ui/Tag'
import FormRenderer from '../../components/innovator/form/FormRenderer'
import { checkStep, type Answers, type FieldProblem } from '../../components/innovator/form/logic'
import { DocumentItem, ReturnChecklist, changedAnswers, itemAnchor } from '../../components/innovator/tracking/ReturnedCard'
import { formatDate, formatShortDate } from '../../components/innovator/format'
import { usePageTitle } from '../../lib/usePageTitle'
import { useI18n } from '../../i18n'
import { innovatorService } from '../../services/innovator.service'
import type { FormField, FormStep, IdeaTracking, ReturnedForChanges, TrackedIdea } from '../../types/innovator'

/**
 * "Respond to changes" (/my-ideas/:id/changes): one of the three modes of an idea, next to viewing a sent idea
 * (/my-ideas/:id, read only) and editing an unfinished draft (/my-ideas/draft/:id).
 * The form as it was sent, with every answer. The officer's notes are pinned at the top; only the questions they
 * flagged can change, and they are highlighted. "Send changes" goes through the workflow from #103
 * (POST /api/me/ideas/{id}/resend/): the idea returns to the same stage and the officer is told.
 */
export default function IdeaChanges() {
  const { id = '' } = useParams()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const [idea, setIdea] = useState<TrackedIdea | null>(null)
  const [tracking, setTracking] = useState<IdeaTracking | null>(null)
  const [failed, setFailed] = useState(false)
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [errors, setErrors] = useState<Record<string, FieldProblem | string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [detail, track] = await Promise.all([innovatorService.trackedIdea(id), innovatorService.tracking(id, lang)])
      setIdea(detail)
      setTracking(track)
      // Every answer as it was sent, with the requested ones as they are now; kept when files are added.
      setAnswers((kept) => kept ?? (track.returned ? { ...track.returned.sent_answers, ...track.returned.answers } : {}))
    } catch {
      setFailed(true)
    }
  }, [id, lang])

  useEffect(() => {
    load()
  }, [load])

  const returned = tracking?.returned ?? null
  usePageTitle(idea ? `${idea.title} · ${t('mode.changes')}` : t('mode.changes'))
  const steps = useMemo(() => (returned ? formSteps(returned) : []), [returned])
  const flagged = useMemo(() => new Set((returned?.items ?? []).filter((i) => i.kind === 'answer').map((i) => i.field_key)), [returned])

  // A checklist link from the idea page lands on its question.
  useEffect(() => {
    if (!hash || steps.length === 0) return
    const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' }), 150)
    return () => window.clearTimeout(timer)
  }, [hash, steps.length])

  async function send() {
    if (!returned || !answers) return
    const asked: FormStep = { id: 'asked', code: 'asked', title: '', description: '', tips: [], is_active: true, rows: returned.fields.map((field, i) => ({ row: i + 1, fields: [field] })) }
    const problems = checkStep(asked, answers)
    if (Object.keys(problems).length) {
      setErrors(problems)
      document.getElementById(`field-${Object.keys(problems)[0]}`)?.scrollIntoView({ block: 'center' })
      return
    }
    setBusy(true)
    setMessage('')
    setErrors({})
    const onlyAsked = Object.fromEntries(Object.entries(answers).filter(([key]) => flagged.has(key)))
    try {
      await innovatorService.resend(id, changedAnswers(returned.answers, onlyAsked), lang)
      navigate(`/my-ideas/${id}`, { replace: true, state: { resent: true } })
    } catch (error) {
      const data = (error as { response?: { data?: { errors?: Record<string, unknown> } & Record<string, unknown> } }).response?.data
      const body = (data?.errors ?? data ?? {}) as Record<string, unknown>
      const fieldErrors: Record<string, string> = {}
      for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('answers.')) fieldErrors[key.slice(8)] = Array.isArray(value) ? value.join(' ') : String(value)
      }
      setErrors(fieldErrors)
      const items = Array.isArray(body.items) ? (body.items as string[]) : []
      setMessage(items.length ? t('trk.notDone', { items: items.join(', ') }) : Object.keys(fieldErrors).length ? '' : t('trk.resendError'))
      setBusy(false)
    }
  }

  if (failed) {
    return <Shell><ErrorState title={t('chg.loadError')} onRetry={load} /></Shell>
  }
  if (!idea || !tracking || !answers) {
    return (
      <Shell>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-2/3" />
        <Skeleton className="mt-6 h-40 w-full rounded-card" />
        <SkeletonText lines={6} className="mt-8" />
      </Shell>
    )
  }
  if (!returned) {
    // Not waiting for changes: a sent idea is read only.
    return (
      <Shell>
        <Card className="flex flex-col items-start gap-4">
          <p className="text-d-body">{t('chg.notWaiting')}</p>
          <Link to={`/my-ideas/${id}`} className="text-primary underline">{t('form.openIdea')}</Link>
        </Card>
      </Shell>
    )
  }

  const documents = returned.items.filter((item) => item.kind === 'document')
  const program = idea.program_detail?.is_general_intake ? t('form.generalIdea') : idea.program_detail?.title

  return (
    <div className="bg-bg">
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
          <p className="text-d-over uppercase font-heading text-warning">{t('mode.changes')}</p>
          <h1 className="mt-1 font-heading text-d-h3 text-text break-words">{idea.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {program && <Tag tone="neutral">{program}</Tag>}
            <span className="text-d-cap text-muted">{idea.reference_number}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6 sm:py-8">
        {/* The officer's notes stay at the top while scrolling the form (desktop); on a phone they lead the page. */}
        <section aria-labelledby="notes-title" className="rounded-card border border-amber bg-warning-soft p-5 lg:sticky lg:top-24 lg:z-10 lg:shadow-pop">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <h2 id="notes-title" className="font-heading text-d-h5 text-text">
                {returned.fix_by ? t('trk.returnedBy', { date: formatShortDate(returned.fix_by, lang) }) : t('trk.returnedTitle')}
              </h2>
              <p className="text-d-cap text-muted">{t('trk.from', { name: returned.requested_by, date: formatShortDate(returned.requested_at, lang) })}</p>
            </div>
          </div>
          <p className="mt-3 text-d-body-s text-text whitespace-pre-line break-words">{returned.reason}</p>
          <ReturnChecklist returned={returned} hrefFor={(item) => `#${itemAnchor(item)}`} />
        </section>

        <p className="mt-6 text-d-body-s text-muted">{t('chg.intro')}</p>

        <div className="mt-6 flex flex-col gap-10">
          {steps.map((step) => (
            <section key={step.code} aria-labelledby={`step-${step.code}`}>
              <h2 id={`step-${step.code}`} className="font-heading text-d-h4 text-text mb-4">{step.title}</h2>
              <FormRenderer step={step} answers={answers} onChange={(key, value) => setAnswers((a) => ({ ...(a ?? {}), [key]: value }))} lang={lang} errors={errors} flagged={flagged} />
            </section>
          ))}
          {documents.length > 0 && (
            <section aria-labelledby="docs-title" className="rounded-card border-2 border-amber bg-warning-soft p-4">
              <h2 id="docs-title" className="font-heading text-d-h5 text-text mb-4">{t('chg.documents')}</h2>
              <div className="flex flex-col gap-5">
                {documents.map((item) => <DocumentItem key={item.id} ideaId={id} item={item} autoFocus={false} onChanged={load} />)}
              </div>
            </section>
          )}
        </div>

        {message && <p role="alert" className="mt-6 rounded-control bg-danger-soft px-3 py-2.5 text-d-body-s text-danger">{message}</p>}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Link to={`/my-ideas/${id}`} className={buttonClasses({ variant: 'secondary' })}>{t('chg.back')}</Link>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={send} loading={busy} arrow>{t('chg.send')}</Button>
            {returned.fix_by && <p className="text-d-cap text-muted">{t('chg.fixBy', { date: formatDate(returned.fix_by, lang) })}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6">{children}</div>
}

/**
 * The sent form's steps, with each flagged question replaced by its "on its own" version from the API (no
 * conditions on other answers, so it always shows and can be edited). A flagged question the form no longer has
 * goes at the end, so it can still be answered.
 */
export function formSteps(returned: ReturnedForChanges): FormStep[] {
  const asked = new Map<string, FormField>(returned.fields.map((f) => [f.key, f]))
  const placed = new Set<string>()
  const steps = (returned.form?.steps ?? [])
    .filter((step) => step.is_active !== false)
    .map((step) => ({
      ...step,
      rows: step.rows.map((row) => ({
        ...row,
        fields: row.fields.map((field) => {
          const own = asked.get(field.key)
          if (!own) return field
          placed.add(field.key)
          return { ...own, width: field.width }
        }),
      })),
    }))
  // Questions in no step (older forms) still show, last.
  const loose = (returned.form?.loose_fields ?? []).map((field) => {
    const own = asked.get(field.key)
    if (!own) return field
    placed.add(field.key)
    return own
  })
  if (loose.length) {
    steps.push({ id: 'loose', code: 'loose', title: '', description: '', tips: [], is_active: true, rows: loose.map((field, i) => ({ row: i + 1, fields: [field] })) })
  }
  const rest = returned.fields.filter((f) => !placed.has(f.key))
  if (rest.length) {
    steps.push({ id: 'asked', code: 'asked', title: '', description: '', tips: [], is_active: true, rows: rest.map((field, i) => ({ row: i + 1, fields: [field] })) })
  }
  return steps
}

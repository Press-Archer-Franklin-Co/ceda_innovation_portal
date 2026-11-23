import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileText, ShieldCheck, Sparkles, Star, X } from 'lucide-react'
import clsx from 'clsx'
import Button from '../../ui/Button'
import Drawer from '../../ui/Drawer'
import Skeleton from '../../ui/Skeleton'
import Tag, { type TagTone } from '../../ui/Tag'
import { useI18n } from '../../../i18n'
import { answersToSend } from './logic'
import type { UploadedFile } from './UploadField'
import {
  assistantService, isCancel, isNotFound,
  type CheckItem, type CheckStatus, type DocumentReview, type DraftCheck,
} from '../../../services/assistant.service'
import { COACH, combineChecks, createCoach, hasAnswers, pickSuggestions, stepUploads, type Suggestion } from '../../../lib/assistant/coach'
import type { FormStep } from '../../../types/innovator'

type Answers = Record<string, unknown>
type StepResult = { loading: boolean; failed: boolean; data?: DraftCheck }
type DocState = { file: UploadedFile; kind: 'reading' | 'ready' | 'failed' | 'unreadable'; data?: DocumentReview }

const STATUS_TONE: Record<CheckStatus, TagTone> = { clear: 'green', add_more: 'amber', missing: 'red' }

export interface AiHelperPanelProps {
  draftId: string
  steps: FormStep[]
  /** The step on screen; steps.length is the review step. */
  stepIndex: number
  answers: Answers
  /** "Show me where": go to that step and that question. The panel never changes an answer. */
  onShowField: (stepIndex: number, fieldKey: string) => void
  /** Where the questions are: leaving or pausing in a field there asks the helper. */
  watchSelector?: string
  /** Today's panel (similar ideas, tips, WhatsApp). Always shown; it is all that shows when the AI helper is off. */
  children?: ReactNode
}

/**
 * The AI helper beside the idea form (2.13). It looks at the current step when the person leaves a field or
 * pauses on a long answer, and shows 1 to 3 short suggestions. Uploaded files get notes. "Check my idea" opens the
 * full review of every step (Figma 133:1341, phone 133:1583). Off or not set up: only today's panel shows.
 */
export default function AiHelperPanel({
  draftId, steps, stepIndex, answers, onShowField, watchSelector = 'section[aria-labelledby="step-heading"]', children,
}: AiHelperPanelProps) {
  const { t, lang } = useI18n()
  const [helper, setHelper] = useState<'loading' | 'on' | 'off'>('loading')
  const [docsOn, setDocsOn] = useState(false)
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [docs, setDocs] = useState<Record<string, DocState>>({})
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const checkRef = useRef<HTMLButtonElement>(null)

  const step: FormStep | undefined = steps[stepIndex]
  const stepRef = useRef(step)
  stepRef.current = step
  const answersRef = useRef(answers)
  answersRef.current = answers
  const lastAsked = useRef<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    assistantService.status().then((status) => {
      if (!alive) return
      const features = status?.features ?? {}
      setHelper(status?.available && features.draft_check ? 'on' : 'off')
      setDocsOn(Boolean(status?.available && features.document_review))
    })
    return () => {
      alive = false
    }
  }, [])

  // ── The step check ──────────────────────────────────────────────────────
  const run = useCallback(
    (signal: AbortSignal) => {
      const current = stepRef.current
      if (!current) return
      const sent = answersToSend(current, answersRef.current)
      if (!hasAnswers(sent)) return
      const asked = `${lang}:${JSON.stringify(sent)}`
      if (lastAsked.current[current.code] === asked) return
      lastAsked.current[current.code] = asked
      const code = current.code
      setResults((prev) => ({ ...prev, [code]: { ...prev[code], loading: true, failed: false } }))
      assistantService
        .draftCheck({ draft_id: draftId, step: code, answers: sent, lang }, signal)
        .then((data) => {
          if (!data.available) {
            setHelper('off')
            return
          }
          setResults((prev) => ({ ...prev, [code]: { loading: false, failed: false, data } }))
        })
        .catch((error) => {
          if (lastAsked.current[code] === asked) delete lastAsked.current[code] // ask again next time
          if (isCancel(error)) setResults((prev) => ({ ...prev, [code]: { ...prev[code], loading: false } }))
          else setResults((prev) => ({ ...prev, [code]: { ...prev[code], loading: false, failed: true } }))
        })
    },
    [draftId, lang],
  )
  const runRef = useRef(run)
  runRef.current = run
  const coach = useMemo(() => createCoach((signal) => runRef.current(signal), COACH.pauseMs), [])

  useEffect(() => {
    if (helper !== 'on') return undefined
    const inForm = (target: EventTarget | null): target is HTMLElement =>
      target instanceof HTMLElement && target.matches('input, textarea, select') && Boolean(document.querySelector(watchSelector)?.contains(target))
    const onInput = (e: Event) => inForm(e.target) && coach.typed(e.target.tagName === 'TEXTAREA')
    const onLeave = (e: Event) => inForm(e.target) && coach.left()
    document.addEventListener('input', onInput, true)
    document.addEventListener('focusout', onLeave, true)
    return () => {
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('focusout', onLeave, true)
      coach.stop()
    }
  }, [helper, watchSelector, coach])

  const retryStep = () => {
    if (step) delete lastAsked.current[step.code]
    coach.left()
  }

  // ── Uploaded files ──────────────────────────────────────────────────────
  const uploads = stepUploads(step, answers)
  const uploadIds = uploads.map((file) => file.id).join(',')
  const seen = useRef<Set<string>>(new Set())
  const primed = useRef<Set<string>>(new Set())
  const docControllers = useRef<Record<string, AbortController>>({})

  const review = useCallback(
    (file: UploadedFile) => {
      docControllers.current[file.id]?.abort()
      const controller = new AbortController()
      docControllers.current[file.id] = controller
      setDocs((prev) => ({ ...prev, [file.id]: { file, kind: 'reading' } }))
      assistantService
        .reviewDocument(file.id, lang, controller.signal)
        .then((data) =>
          setDocs((prev) => {
            const next = { ...prev }
            if (data.available) next[file.id] = { file, kind: 'ready', data }
            else delete next[file.id] // the helper is off for files: nothing to say
            return next
          }),
        )
        .catch((error) => {
          if (isCancel(error)) return
          setDocs((prev) => ({ ...prev, [file.id]: { file, kind: isNotFound(error) ? 'unreadable' : 'failed' } }))
        })
    },
    [lang],
  )

  useEffect(() => {
    if (!step || helper === 'loading') return
    // Files already there when the step opens are not re-read; only new uploads are.
    const first = !primed.current.has(step.code)
    primed.current.add(step.code)
    for (const file of uploads) {
      if (seen.current.has(file.id)) continue
      seen.current.add(file.id)
      if (!first && docsOn && helper === 'on') review(file)
    }
  }, [uploadIds, step?.code, helper, docsOn])

  useEffect(() => () => Object.values(docControllers.current).forEach((c) => c.abort()), [])

  // ── Render ──────────────────────────────────────────────────────────────
  if (helper !== 'on') return <>{children}</>

  const result = step ? results[step.code] : undefined
  const suggestions = pickSuggestions(result?.data)
  const shownDocs = uploads.map((file) => docs[file.id]).filter((d): d is DocState => Boolean(d))
  const count = suggestions.length

  return (
    <>
      <section aria-labelledby="ai-helper-title" className="rounded-card bg-info-soft p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface">
            <Sparkles size={18} className="text-info" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ai-helper-title" className="font-heading text-d-h5 text-text">{t('ai.title')}</h2>
            <p className="text-d-cap text-muted">
              <span className="hidden lg:inline">{t('ai.subtitle')}</span>
              <span className="lg:hidden">{count > 0 ? (count === 1 ? t('ai.tipsOne') : t('ai.tipsCount', { count })) : t('ai.subtitle')}</span>
            </p>
          </div>
          <button
            type="button"
            className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            aria-expanded={phoneOpen}
            aria-controls="ai-helper-body"
            aria-label={t('ai.title')}
            onClick={() => setPhoneOpen((open) => !open)}
          >
            <ChevronDown size={20} aria-hidden className={clsx('transition-transform motion-reduce:transition-none', phoneOpen && 'rotate-180')} />
          </button>
        </div>

        <div id="ai-helper-body" className={clsx('mt-4 flex-col gap-3', phoneOpen ? 'flex' : 'hidden lg:flex')}>
          {step && (
            <div aria-live="polite" className="flex flex-col gap-2">
              {result?.loading && !result.data ? (
                <Shimmer label={t('ai.looking')} />
              ) : result?.failed ? (
                <div className="flex flex-col items-start gap-1">
                  <p className="text-d-body-s text-text">{t('ai.failed')}</p>
                  <Button variant="link" onClick={retryStep}>{t('ai.retry')}</Button>
                </div>
              ) : result?.data ? (
                <>
                  {suggestions.length === 0 ? (
                    <p className="text-d-body-s text-text">{t('ai.allGood')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {suggestions.map((s, i) => (
                        <SuggestionCard key={`${s.fieldKey}-${i}`} suggestion={s} onShow={s.fieldKey ? () => onShowField(stepIndex, s.fieldKey) : undefined} />
                      ))}
                    </ul>
                  )}
                  {result.loading && <p className="text-d-cap text-muted">{t('ai.looking')}</p>}
                </>
              ) : (
                <p className="text-d-body-s text-muted">{t('ai.waiting')}</p>
              )}
            </div>
          )}

          {shownDocs.length > 0 && (
            <ul aria-live="polite" className="flex flex-col gap-2">
              {shownDocs.map((doc) => (
                <DocNote key={doc.file.id} doc={doc} onRetry={() => review(doc.file)} />
              ))}
            </ul>
          )}

          <Button ref={checkRef} data-guide="idea.check" variant="secondary" block icon={<Star size={18} aria-hidden />} onClick={() => setCheckOpen(true)}>
            {t('ai.check')}
          </Button>
        </div>
      </section>

      {children}

      <CheckDrawer
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        triggerRef={checkRef}
        draftId={draftId}
        steps={steps}
        answers={answers}
        onShowField={(index, key) => {
          setCheckOpen(false)
          onShowField(index, key)
        }}
      />
    </>
  )
}

function Shimmer({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-surface p-3" role="status">
      <p className="text-d-cap text-muted">{label}</p>
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

function SuggestionCard({ suggestion, onShow }: { suggestion: Suggestion; onShow?: () => void }) {
  const { t } = useI18n()
  return (
    <li className="flex flex-col gap-1.5 rounded-control bg-surface p-3">
      {suggestion.topic && (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-d-label-s text-text">{suggestion.topic}</p>
          <Tag tone={STATUS_TONE[suggestion.status]}>{t(`ai.status.${suggestion.status}`)}</Tag>
        </div>
      )}
      <p className="text-d-body-s text-text">{suggestion.text}</p>
      {onShow && (
        <button type="button" onClick={onShow} className="self-start text-d-label-s text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
          {t('ai.showMe')}
        </button>
      )}
    </li>
  )
}

function DocNote({ doc, onRetry }: { doc: DocState; onRetry: () => void }) {
  const { t } = useI18n()
  const name = doc.file.filename
  if (doc.kind === 'reading') {
    return (
      <li>
        <Shimmer label={`${t('ai.reading')} ${name}`} />
      </li>
    )
  }
  return (
    <li className="flex flex-col gap-1.5 rounded-control bg-surface p-3">
      <p className="flex items-center gap-2 text-d-label-s text-text">
        <FileText size={16} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">{name}</span>
      </p>
      {doc.kind === 'ready' && doc.data && (
        <>
          {doc.data.summary && <p className="text-d-body-s text-text">{doc.data.summary}</p>}
          {(doc.data.missing ?? []).length > 0 && (
            <p className="text-d-body-s text-text">{t('ai.docMissing', { list: (doc.data.missing ?? []).slice(0, 3).join('; ') })}</p>
          )}
        </>
      )}
      {doc.kind === 'unreadable' && <p className="text-d-body-s text-muted">{t('ai.docUnreadable', { name })}</p>}
      {doc.kind === 'failed' && (
        <>
          <p className="text-d-body-s text-text">{t('ai.docFailed', { name })}</p>
          <Button variant="link" className="self-start" onClick={onRetry}>{t('ai.retry')}</Button>
        </>
      )}
    </li>
  )
}

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking'; n: number; total: number }
  | { kind: 'nothing' }
  | { kind: 'off' }
  | { kind: 'failed' }
  | { kind: 'done'; items: (CheckItem & { stepIndex: number })[]; strong: number; total: number; overall: 'ready' | 'almost' | 'needs_work' }

/** 2.13 Check my idea: every step, from the side on a computer and from the bottom on a phone. */
function CheckDrawer({
  open, onClose, triggerRef, draftId, steps, answers, onShowField,
}: {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  draftId: string
  steps: FormStep[]
  answers: Answers
  onShowField: (stepIndex: number, fieldKey: string) => void
}) {
  const { t, lang } = useI18n()
  const [state, setState] = useState<CheckState>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const answersRef = useRef(answers)
  answersRef.current = answers

  const check = useCallback(async () => {
    controller.current?.abort()
    const mine = new AbortController()
    controller.current = mine
    const todo = steps
      .map((step, stepIndex) => ({ step, stepIndex, sent: answersToSend(step, answersRef.current) }))
      .filter(({ sent }) => hasAnswers(sent))
    if (todo.length === 0) {
      setState({ kind: 'nothing' })
      return
    }
    const results: { stepIndex: number; data: DraftCheck }[] = []
    try {
      for (const [i, { step, stepIndex, sent }] of todo.entries()) {
        setState({ kind: 'checking', n: i + 1, total: todo.length })
        const data = await assistantService.draftCheck({ draft_id: draftId, step: step.code, answers: sent, lang }, mine.signal)
        if (!data.available) {
          setState({ kind: 'off' })
          return
        }
        results.push({ stepIndex, data })
      }
      setState({ kind: 'done', ...combineChecks(results) })
    } catch (error) {
      if (!isCancel(error)) setState({ kind: 'failed' })
    }
  }, [steps, draftId, lang])

  useEffect(() => {
    if (open) check()
    else controller.current?.abort()
  }, [open, check])
  useEffect(() => () => controller.current?.abort(), [])

  const band = state.kind === 'done'
    ? { ready: 'bg-success-soft', almost: 'bg-warning-soft', needs_work: 'bg-primary-soft' }[state.overall]
    : ''

  return (
    <Drawer
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      label={t('ai.check')}
      width={440}
      className="max-sm:top-auto max-sm:max-h-[92dvh] max-sm:rounded-t-[20px]"
    >
      <div className="flex items-start gap-3 px-5 pt-5">
        <span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-control bg-cms-soft">
          <Star size={18} className="text-cms" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-d-h5 text-text">{t('ai.check')}</h2>
          <p className="text-d-cap text-muted">{t('ai.subtitle')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('ai.close')} className="-m-2 flex h-10 w-10 items-center justify-center rounded-control text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X size={20} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3.5" aria-live="polite">
        {state.kind === 'checking' || state.kind === 'idle' ? (
          <div className="flex flex-col gap-3.5" role="status">
            <p className="text-d-body-s text-muted">{state.kind === 'checking' ? t('ai.checking', { n: state.n, total: state.total }) : t('ai.looking')}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-card border border-border p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : state.kind === 'done' ? (
          <div className="flex flex-col gap-3.5">
            <div className={clsx('flex items-center justify-between gap-3 rounded-card px-3.5 py-4', band)}>
              <p className="text-d-label text-text">{t(state.overall === 'ready' ? 'ai.ready' : state.overall === 'almost' ? 'ai.almost' : 'ai.needsWork')}</p>
              <p className="text-d-label-s text-success">{t('ai.strongCount', { n: state.strong, total: state.total })}</p>
            </div>
            {state.items.length === 0 ? (
              <p className="text-d-body-s text-text">{t('ai.allGood')}</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {state.items.map((item, i) => (
                  <li key={`${item.stepIndex}-${i}`} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-d-label text-text">{item.topic}</p>
                      <Tag tone={STATUS_TONE[item.status]}>{t(`ai.status.${item.status}`)}</Tag>
                    </div>
                    {item.suggestion && <p className="text-d-body-s text-text">{item.suggestion}</p>}
                    {item.field_key && item.status !== 'clear' && (
                      <button type="button" onClick={() => onShowField(item.stepIndex, item.field_key)} className="self-start rounded text-d-label text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {t('ai.showMe')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-d-body-s text-text">{t(state.kind === 'nothing' ? 'ai.nothing' : state.kind === 'off' ? 'ai.off' : 'ai.checkFailed')}</p>
        )}

        <p className="mt-3.5 flex items-start gap-2.5 rounded-card bg-surface2 px-3 py-2.5 text-d-cap text-muted">
          <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0" />
          {t('ai.private')}
        </p>
        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="ghost" onClick={check} disabled={state.kind === 'checking'}>{t('ai.checkAgain')}</Button>
          <Button onClick={onClose}>{t('ai.backToForm')}</Button>
        </div>
      </div>
    </Drawer>
  )
}

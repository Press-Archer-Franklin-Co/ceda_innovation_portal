import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Lightbulb, MessageCircle, Star } from 'lucide-react'
import clsx from 'clsx'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Checkbox } from '../../components/ui/Choice'
import { ErrorState } from '../../components/ui/EmptyState'
import LanguageSwitch from '../../components/ui/LanguageSwitch'
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton'
import StepProgress from '../../components/ui/StepProgress'
import Tag from '../../components/ui/Tag'
import { useToast } from '../../components/ui/Toast'
import { useShellSettings } from '../../components/layout/shellData'
import EntryBand from '../../components/challenges/EntryBand'
import FormRenderer from '../../components/innovator/form/FormRenderer'
import AiHelperPanel, { useCheckMyIdea } from '../../components/innovator/form/AiHelperPanel'
import { showAnswer } from '../../components/innovator/form/showAnswer'
import {
  type Answers, type FieldProblem, answersToSend, checkStep,
  isEmptyAnswer, isLayoutField, isVisible, stepFields,
} from '../../components/innovator/form/logic'
import { usePageTitle } from '../../lib/usePageTitle'
import { useI18n } from '../../i18n'
import { formsService } from '../../services/forms.service'
import { type GuestContact, guestContactProblem, guestContactStorage, intakeService, resumeStorage } from '../../services/intake.service'
import { normalisePhone } from '../../lib/phone'
import Input from '../../components/ui/Input'
import { challengeEntryService } from '../../services/challengeEntry.service'
import { useAsync } from '../../lib/useAsync'
import type { FormStep, IntakeDraft, Lang, PublishedForm } from '../../types/innovator'
import { parseApiError } from '../../utils/apiError'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_published' }
  | { kind: 'sent'; submissionId: string | null }
  | { kind: 'ready'; draft: IntakeDraft }

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'failed' }

const AUTOSAVE_MS = 1200

/**
 * Screen 2.3: the full idea form, one step at a time, saved as you go.
 * Opened as /challenges/:slug/entry/:id it is 2.10, the challenge's own entry form (Figma 108:367, 108:578):
 * the challenge name and closing date in the header, and the entry is sent to that challenge (U10).
 */
export default function IdeaForm({ guest = false }: { guest?: boolean } = {}) {
  const { id = '', slug } = useParams()
  // 23 Nov, send without an account: /submit/draft/:id is the same form for a guest, using the draft's resume token
  // kept on this device. It sends from the last step with the guest's email or phone, and makes no account.
  const kept = guest ? resumeStorage.get() : null
  const token = kept && kept.draftId === id ? kept.token : undefined
  const [contact, setContact] = useState<GuestContact>(() => guestContactStorage.get() ?? { name: '', email: '', phone: '' })
  const [contactError, setContactError] = useState('')
  const [params] = useSearchParams()
  /** Set by "Link it" on 2.1: open at the first unanswered question's step. */
  const askedStep = params.get('step')
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useShellSettings()
  // 2.13: Check my idea opens from the AI helper panel or from beside Next.
  const checkMyIdea = useCheckMyIdea()

  // 2.10: the challenge's name and closing date for the header.
  const challenge = useAsync(() => (slug ? challengeEntryService.status(slug) : Promise.resolve(null)), [slug, lang]).data?.challenge ?? null

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [forms, setForms] = useState<Partial<Record<Lang, PublishedForm>>>({})
  const [answers, setAnswers] = useState<Answers>({})
  /** Prompt 37: questions filled from the profile (key to the answer as the person reads it) until they press Edit. */
  const [fromProfile, setFromProfile] = useState<Record<string, string>>({})
  /** The step the person moved to on this visit; until then the draft's saved step (no jump on open). */
  const [chosenStep, setChosenStep] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, FieldProblem | string[] | string>>({})
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [now, setNow] = useState(Date.now())
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)

  const dirty = useRef<Set<string>>(new Set())
  const answersRef = useRef<Answers>({})
  answersRef.current = answers
  const headingRef = useRef<HTMLHeadingElement>(null)

  // ── Load the draft, then the published form in the current language ──────
  const loadDraft = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      if (guest && !token) {
        setLoad({ kind: 'error' })
        return
      }
      const draft = await intakeService.getDraft(id, token)
      if (draft.status === 'submitted') {
        setLoad({ kind: 'sent', submissionId: draft.submitted_submission })
        return
      }
      if (!draft.form_id || !draft.form_version_id) {
        setLoad({ kind: 'not_published' })
        return
      }
      // The profile fills only questions with no answer yet; what the person typed always wins.
      const typed = (draft.draft_data ?? {}) as Answers
      const filled = Object.fromEntries(Object.entries(draft.profile_prefill ?? {}).filter(([key]) => isEmptyAnswer(typed[key])))
      setAnswers({ ...Object.fromEntries(Object.entries(filled).map(([key, item]) => [key, item.value])), ...typed })
      setFromProfile(Object.fromEntries(Object.entries(filled).map(([key, item]) => [key, item.display])))
      setLoad({ kind: 'ready', draft })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [id, guest, token])

  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  const draft = load.kind === 'ready' ? load.draft : null
  usePageTitle(draft ? `${draft.title} · ${t('mode.draft')}` : t('mode.draft'))

  // A challenge entry opened from My ideas uses the challenge's own address (2.10).
  const entrySlug = !guest && !slug && draft && !draft.program_detail?.is_general_intake ? draft.program_detail?.slug : null
  useEffect(() => {
    if (entrySlug) navigate(`/challenges/${entrySlug}/entry/${id}`, { replace: true })
  }, [entrySlug, id, navigate])
  const form = forms[lang] ?? forms.en ?? forms.tn

  useEffect(() => {
    if (!draft?.form_id || forms[lang]) return
    let alive = true
    formsService
      .published(draft.form_id, lang)
      .then((doc) => alive && setForms((prev) => ({ ...prev, [lang]: doc })))
      .catch(() => alive && !form && setLoad({ kind: 'not_published' }))
    return () => {
      alive = false
    }
  }, [draft?.form_id, lang, forms, form])

  const steps = useMemo(() => (form?.steps ?? []).filter((step) => step.is_active !== false), [form])

  // Open at the step the person was last on. Worked out before the first draw, so the form never shows step 1
  // and then jumps (the reopening "glitch").
  const savedStep = useMemo(() => {
    if (!draft || steps.length === 0) return 0
    const found = steps.findIndex((s) => s.code === (askedStep || draft.current_section_code))
    return found >= 0 ? found : 0
  }, [draft, steps, askedStep])
  const stepIndex = chosenStep ?? savedStep
  const reviewIndex = steps.length
  const onReview = stepIndex === reviewIndex
  const step: FormStep | undefined = steps[stepIndex]

  // ── Save ─────────────────────────────────────────────────────────────────
  const saveStep = useCallback(
    async (target: FormStep) => {
      setSave({ kind: 'saving' })
      try {
        const result = await intakeService.saveStep(id, target.code, answersToSend(target, answersRef.current), token)
        dirty.current.delete(target.code)
        setSave({ kind: 'saved', at: Date.now() })
        return result
      } catch {
        setSave({ kind: 'failed' })
        return null
      }
    },
    [id],
  )

  // Autosave the current step a moment after the last change.
  useEffect(() => {
    if (!step || !dirty.current.has(step.code)) return
    const timer = window.setTimeout(() => saveStep(step), AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [answers, step, saveStep])

  // "Saved 12 seconds ago" keeps counting.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  const onChange = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }))
      if (step) dirty.current.add(step.code)
      setErrors((prev) => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    [step],
  )

  // ── Moving between steps ─────────────────────────────────────────────────
  function goTo(index: number) {
    setErrors({})
    setChosenStep(index)
    // Remember where the person is, so reopening the draft lands here even if they type nothing on this step.
    const target = steps[index]
    if (target) intakeService.saveStep(id, target.code, answersToSend(target, answersRef.current)).catch(() => undefined)
    window.scrollTo({ top: 0 })
    window.setTimeout(() => headingRef.current?.focus(), 0)
  }

  async function onContinue() {
    if (!step) return
    const problems = checkStep(step, answers)
    if (Object.keys(problems).length > 0) {
      setErrors(problems)
      focusFirstError(step, problems)
      return
    }
    setBusy(true)
    const result = await saveStep(step)
    setBusy(false)
    if (!result) return
    const apiErrors = result.errors ?? {}
    if (Object.keys(apiErrors).length > 0) {
      setErrors(apiErrors)
      focusFirstError(step, apiErrors)
      return
    }
    goTo(stepIndex + 1)
  }

  /** "Send now, finish later": keep what is typed and go to Review, where the idea is sent. */
  async function onSendNow() {
    if (step && dirty.current.has(step.code)) {
      setBusy(true)
      const ok = await saveStep(step)
      setBusy(false)
      if (!ok) return
    }
    goTo(reviewIndex)
  }

  async function onBack() {
    if (step && dirty.current.has(step.code)) await saveStep(step)
    goTo(Math.max(0, stepIndex - 1))
  }

  async function onSaveExit() {
    if (step && dirty.current.has(step.code)) {
      setBusy(true)
      const ok = await saveStep(step)
      setBusy(false)
      if (!ok) return
    }
    // A guest's draft stays on this device; the home page offers to carry on.
    navigate(guest ? '/' : '/my-ideas')
  }

  async function onSend() {
    if (!consent) {
      setConsentError(true)
      return
    }
    let guestPayload = {}
    if (guest) {
      const problem = guestContactProblem(contact)
      if (problem) {
        setContactError(problem === 'none' ? t('qs2.contactNeeded') : problem === 'email' ? t('qs2.emailError') : t('qs2.phoneError'))
        return
      }
      const first = typeof answers.first_name === 'string' ? answers.first_name.trim() : ''
      const last = typeof answers.last_name === 'string' ? answers.last_name.trim() : ''
      guestPayload = {
        create_account: false,
        ...(first || last ? { first_name: first, last_name: last } : { name: contact.name.trim() }),
        ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
        ...(contact.phone.trim() ? { phone: normalisePhone(contact.phone) } : {}),
      }
    }
    setSending(true)
    try {
      const result = await intakeService.submit(id, { consent: true, ...guestPayload }, token)
      if (guest) {
        resumeStorage.clear()
        guestContactStorage.clear()
      }
      // 1.5 replaces the form in the history, so Back cannot reopen a form that would send the idea twice.
      const sentFor = challenge ? { title: challenge.title, slug: challenge.slug } : undefined
      navigate('/idea-sent', { replace: true, state: { result, challenge: sentFor } })
    } catch (error) {
      toast.show({ tone: 'error', title: parseApiError(error, t('common.somethingWrong')) })
    } finally {
      setSending(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (load.kind === 'loading' || (load.kind === 'ready' && !form)) return <FormSkeleton />
  if (load.kind === 'error') {
    return (
      <Page>
        <ErrorState title={t('form.loadError')} onRetry={loadDraft} />
      </Page>
    )
  }
  if (load.kind === 'not_published') {
    return (
      <Page>
        <ErrorState title={t('form.notPublished')} />
      </Page>
    )
  }
  if (load.kind === 'sent' && load.submissionId) {
    // A sent idea is never edited here: it opens read only on its page (and "Respond to changes" from there).
    return <Navigate to={`/my-ideas/${load.submissionId}`} replace />
  }
  if (load.kind === 'sent') {
    return (
      <Page>
        <Card className="flex flex-col items-start gap-4">
          <p className="text-d-body">{t('form.alreadySent')}</p>
          <Link to={load.submissionId ? `/my-ideas/${load.submissionId}` : '/my-ideas'} className="text-primary underline">
            {t('form.openIdea')}
          </Link>
        </Card>
      </Page>
    )
  }
  if (!draft || !form) return null

  const stepNames = [...steps.map((s) => s.title), t('form.reviewStep')]
  const programLabel = draft.program_detail?.is_general_intake ? t('form.generalIdea') : draft.program_detail?.title
  const challengeTitle = challenge?.title ?? (slug ? draft.program_detail?.title : null)

  return (
    <div className="bg-bg">
      {/* Form head. 2.10: the entry band continues the four steps from 1.9; the form's own parts show underneath. */}
      {slug && challengeTitle ? (
        <EntryBand
          titleId="entry-title"
          title={t('ent.yourEntry', { challenge: challengeTitle })}
          closesAt={challenge?.closes_at ?? null}
          current={2}
          actions={
            <>
              <SaveStatus save={save} now={now} />
              <Button data-guide="idea.saveExit" variant="secondary" size="sm" onClick={onSaveExit} loading={busy && !onReview}>{t('form.saveExit')}</Button>
            </>
          }
          below={<p className="text-d-label-s text-text">{t('ent.part', { n: stepIndex + 1, total: stepNames.length, name: stepNames[stepIndex] ?? '' })}</p>}
        />
      ) : (
      <div className="border-b border-border">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-d-over uppercase font-heading text-muted mb-1">{t('mode.draft')}</p>
              <h1 className="font-heading text-d-h3 text-text break-words">{draft.title}</h1>
              {programLabel && <Tag tone="neutral" className="mt-2">{programLabel}</Tag>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SaveStatus save={save} now={now} />
              <LanguageSwitch />
              <Button data-guide="idea.saveExit" variant="secondary" size="sm" onClick={onSaveExit} loading={busy && !onReview}>
                {t('form.saveExit')}
              </Button>
            </div>
          </div>
          <StepProgress
            steps={stepNames}
            current={stepIndex}
            saved={save.kind === 'saved'}
            onStepClick={(i) => goTo(i)}
          />
        </div>
      </div>
      )}

      {/* Form body */}
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="step-heading" className="min-w-0">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className={clsx('font-heading text-text mb-2 focus:outline-none', slug ? 'text-d-h3 lg:text-d-h2' : 'text-d-h3')}>
            {onReview ? t('form.reviewStep') : step?.title}
          </h2>
          {!onReview && step?.description && <p className="text-d-body text-muted mb-6">{step.description}</p>}

          {Object.keys(errors).length > 0 && (
            <p role="alert" className="mb-6 rounded-control bg-danger-soft px-4 py-3 text-d-body-s text-danger">
              {t('form.fixStep')}
            </p>
          )}

          {onReview ? (
            <ReviewStep steps={steps} answers={answers} onEdit={goTo} />
          ) : step ? (
            <FormRenderer
              step={step}
              answers={answers}
              onChange={onChange}
              lang={lang}
              errors={errors}
              fromProfile={fromProfile}
              onEditProfile={(key) =>
                setFromProfile((prev) => {
                  const next = { ...prev }
                  delete next[key]
                  return next
                })
              }
            />
          ) : null}

          {onReview && guest && (
            // Send without an account: how CEDA can reach them. One of the two is enough.
            <fieldset className="mt-8 flex flex-col gap-3 rounded-card border border-border p-4" aria-describedby="guest-one-of">
              <legend className="px-1 font-heading text-d-h5 text-text">{t('form.guestReach')}</legend>
              <p id="guest-one-of" role={contactError ? 'alert' : undefined} className={contactError ? 'text-d-cap text-danger' : 'text-d-cap text-muted'}>
                {contactError || t('qs2.oneOf')}
              </p>
              <Input
                label={t('qs2.email')}
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => { const next = { ...contact, email: e.target.value }; setContact(next); guestContactStorage.set(next); setContactError('') }}
              />
              <Input
                label={t('qs2.phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contact.phone}
                onChange={(e) => { const next = { ...contact, phone: e.target.value }; setContact(next); guestContactStorage.set(next); setContactError('') }}
              />
              <p className="text-d-cap text-muted">{t('form.guestNoAccount')}</p>
            </fieldset>
          )}

          {onReview && (
            <div className="mt-8">
              <Checkbox
                checked={consent}
                invalid={consentError}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  if (e.target.checked) setConsentError(false)
                }}
                label={t('form.consent')}
              />
              {consentError && <p role="alert" className="text-d-cap text-danger mt-1">{t('form.consentNeeded')}</p>}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            {stepIndex > 0 ? (
              <Button data-guide="idea.back" variant={slug ? 'secondary' : 'ghost'} onClick={onBack}>{t('form.back')}</Button>
            ) : (
              <span />
            )}
            {onReview ? (
              <Button data-guide="idea.send" onClick={onSend} loading={sending} arrow>{t('form.send')}</Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {/* Prompt 31 part B: only when the idea may go with just the basics (R-23); the rest can come later. */}
                {draft.send_now_allowed && stepIndex < reviewIndex - 1 && (
                  <Button variant="ghost" onClick={onSendNow} disabled={busy}>{t('form.sendNow')}</Button>
                )}
                {/* 2.13 pin 1: Check my idea beside Next, only while the AI helper is on. It opens the same review as the panel. */}
                {checkMyIdea.available && (
                  <Button data-guide="idea.check" variant="secondary" icon={<Star size={18} aria-hidden />} onClick={(e) => checkMyIdea.openFrom(e.currentTarget)} disabled={busy}>
                    {t('ai.check')}
                  </Button>
                )}
                <Button data-guide="idea.next" onClick={onContinue} loading={busy} arrow>
                  {slug ? t('ent.next', { name: stepNames[stepIndex + 1] ?? '' }) : stepIndex === reviewIndex - 1 ? t('form.reviewStep') : t('form.continue')}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* 2.13: the AI helper sits on top and the right column stays in view, with its own scroll, while the form scrolls. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[128px] lg:max-h-[calc(100vh-152px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          {/* The AI helper's step check needs a signed-in person; a guest sees the rest of the column as it is. */}
          {guest ? (
            <>
          {!onReview && step && step.tips.length > 0 && (
            <Card padding="md">
              <p className="flex items-center gap-2 font-heading text-d-h5 text-text">
                <Lightbulb size={18} aria-hidden className="text-amber" />
                {t('form.tips')}
              </p>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-d-body-s text-text">
                {step.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </Card>
          )}

          {settings.whatsapp_number && (
            <p className="flex items-start gap-3 rounded-card bg-surface2 p-4 text-d-body-s text-text">
              <MessageCircle size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
              {t('form.voiceNote', { number: settings.whatsapp_number })}
            </p>
          )}
            </>
          ) : (
          <AiHelperPanel
            draftId={id}
            steps={steps}
            stepIndex={stepIndex}
            answers={answers}
            check={checkMyIdea}
            onShowField={(index, key) => {
              if (index !== stepIndex) goTo(index)
              window.setTimeout(() => {
                const box = document.querySelector<HTMLElement>(`[data-guide="idea.field.${CSS.escape(key)}"]`)
                box?.scrollIntoView({ block: 'center' })
                box?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true })
              }, 50)
            }}
          >
          {!onReview && step && step.tips.length > 0 && (
            <Card padding="md">
              <p className="flex items-center gap-2 font-heading text-d-h5 text-text">
                <Lightbulb size={18} aria-hidden className="text-amber" />
                {t('form.tips')}
              </p>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-d-body-s text-text">
                {step.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </Card>
          )}

          {settings.whatsapp_number && (
            <p className="flex items-start gap-3 rounded-card bg-surface2 p-4 text-d-body-s text-text">
              <MessageCircle size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
              {t('form.voiceNote', { number: settings.whatsapp_number })}
            </p>
          )}
          </AiHelperPanel>
          )}
        </aside>
      </div>
    </div>
  )
}

function focusFirstError(step: FormStep, problems: Record<string, unknown>) {
  const first = stepFields(step).find((field) => field.key in problems)
  if (!first) return
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(first.key)}"], [aria-invalid="true"]`)
    el?.focus()
  }, 0)
}

function SaveStatus({ save, now }: { save: SaveState; now: number }) {
  const { t } = useI18n()
  let text = ''
  if (save.kind === 'saving') text = t('form.saving')
  else if (save.kind === 'failed') text = t('form.saveFailed')
  else if (save.kind === 'saved') {
    const seconds = Math.max(0, Math.round((now - save.at) / 1000))
    text = seconds < 5 ? t('form.savedJustNow') : seconds < 60 ? t('form.savedSeconds', { count: seconds }) : t('form.savedMinutes', { count: Math.round(seconds / 60) })
  }
  if (!text) return null
  return (
    <p role="status" className={save.kind === 'failed' ? 'text-d-label-s text-danger' : 'flex items-center gap-1.5 text-d-label-s text-muted'}>
      {save.kind === 'saved' && <Check size={14} aria-hidden className="text-success" />}
      {text}
    </p>
  )
}

function ReviewStep({ steps, answers, onEdit }: { steps: FormStep[]; answers: Answers; onEdit: (index: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-6">
      <p className="text-d-body text-muted">{t('form.reviewIntro')}</p>
      {steps.map((step, index) => {
        const fields = stepFields(step).filter((f) => !isLayoutField(f) && isVisible(f, answers))
        return (
          <Card key={step.code} padding="md">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-d-h5 text-text">{t('form.stepsLabel', { n: index + 1, name: step.title })}</h3>
              <Button variant="link" onClick={() => onEdit(index)}>{t('form.edit')}</Button>
            </div>
            <dl className="mt-3 flex flex-col gap-3">
              {fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-d-label-s text-muted">{field.label}</dt>
                  <dd className="text-d-body-s text-text whitespace-pre-line break-words">
                    {showAnswer(field, answers[field.key], t('form.yes')) || <span className="text-muted">{t('form.noAnswer')}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )
      })}
    </div>
  )
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[800px] px-4 sm:px-6 py-12">{children}</div>
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8" aria-busy="true">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="mt-6 h-20 w-full rounded-card" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-7 w-1/2" />
          <SkeletonText lines={3} />
          <Skeleton className="h-28 w-full rounded-control" />
          <Skeleton className="h-28 w-full rounded-control" />
        </div>
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    </div>
  )
}

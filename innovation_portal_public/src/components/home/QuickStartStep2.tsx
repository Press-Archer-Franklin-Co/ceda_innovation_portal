import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { codeSignInService } from '../../services/codeSignIn.service'
import { intakeService, resumeStorage } from '../../services/intake.service'
import { JourneyBar } from './QuickStartCard'
import { nameStep, startStep, stepFields, useJourney } from './journeySteps'
import type { QuickStartDraft } from './QuickStartCard'

// Figma 1.2 › Quick start step 2 (11:279 website, 11:375 phone sheet), for signed-out visitors.
// Prompt 31 part B: this is not a separate form any more. The visitor gives their name and confirms their phone
// with a 6-digit code (POST /api/auth/otp/request/, then /api/auth/otp/verify/), which signs them in, with an
// account made from that phone when they have none (no password). The draft then joins the account
// (POST /api/drafts/{id}/claim/, which fills the form's name and phone questions) and the full form (2.3) opens
// at step 2. The name is saved to the draft as it is typed, so a refresh keeps it.

function normalisePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('267')) return `+${digits}`
  return `+267${digits}`
}

const splitName = (full: string) => {
  const [first_name = '', ...rest] = full.trim().split(/\s+/)
  return { first_name, last_name: rest.join(' ') }
}

export default function QuickStartStep2({ draft, onEdit, onContinued }: { draft: QuickStartDraft; onEdit: () => void; onContinued: (path: string) => void }) {
  const { t } = useI18n()
  const { signInWithCode, refreshProfile } = useAuth()
  const [formId, setFormId] = useState<string | null>(null)
  const journey = useJourney(draft.programId ? formId : null)
  const aboutYou = useMemo(() => nameStep(journey.steps), [journey.steps])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const savedName = useRef('')

  // The draft knows its form and any name already saved (a refresh on this step).
  useEffect(() => {
    intakeService
      .getDraft(draft.draftId, draft.token)
      .then((d) => {
        setFormId(d.form_id)
        const data = d.draft_data ?? {}
        const kept = [data.first_name, data.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')
        const keptPhone = typeof data.contact_number === 'string' ? data.contact_number : ''
        savedName.current = JSON.stringify([kept, keptPhone])
        if (kept) setName((v) => v || kept)
        if (keptPhone) setPhone((v) => v || keptPhone)
      })
      .catch(() => undefined)
  }, [draft.draftId, draft.token])

  // Save the name (and the phone, when the form asks it there) to the form's "About you" step as it is typed, so a
  // refresh keeps them and step 2 shows them filled.
  const aboutYouAnswers = useCallback((confirmed = false) => {
    const answers: Record<string, string> = splitName(name)
    if (aboutYou && phone.trim() && stepFields(aboutYou).some((f) => f.key === 'contact_number')) {
      answers.contact_number = confirmed ? normalisePhone(phone) : phone.trim()
    }
    return answers
  }, [name, phone, aboutYou])
  useEffect(() => {
    const key = JSON.stringify([name.trim(), phone.trim()])
    if (!aboutYou || !name.trim() || key === savedName.current) return
    const timer = window.setTimeout(() => {
      intakeService
        .saveStep(draft.draftId, aboutYou.code, aboutYouAnswers(), draft.token)
        .then(() => { savedName.current = key })
        .catch(() => undefined)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [name, phone, aboutYou, aboutYouAnswers, draft.draftId, draft.token])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  const sendCode = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) {
      setErrors((e) => ({ ...e, phone: t('qs2.phoneError') }))
      return
    }
    setErrors((e) => ({ ...e, phone: undefined, code: undefined }))
    setBusy('send')
    try {
      const res = await codeSignInService.requestCode({ phone: normalisePhone(phone) })
      setCodeSentTo(res.destination_hint || normalisePhone(phone))
      setResendIn(res.resend_after_seconds || 60)
    } catch {
      setErrors((e) => ({ ...e, phone: t('qs2.sendError') }))
    } finally {
      setBusy(null)
    }
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string | undefined> = {}
    if (!name.trim()) next.name = t('qs2.nameError')
    if (!codeSentTo) next.phone = t('qs2.phoneFirst')
    else if (code.length !== 6) next.code = t('qs2.codeError')
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy('verify')
    try {
      // The name first, while the draft is still the visitor's, so the account and step 2 both get it.
      if (aboutYou) await intakeService.saveStep(draft.draftId, aboutYou.code, aboutYouAnswers(true), draft.token).catch(() => undefined)
      const outcome = await signInWithCode({ phone: normalisePhone(phone) }, code.trim())
      if (outcome.status !== 'ok') {
        // An account with a second sign-in step: finish signing in there; the draft stays on this device.
        onContinued('/sign-in')
        return
      }
    } catch {
      setErrors({ code: t('qs2.codeError') })
      setBusy(null)
      return
    }
    try {
      const joined = await intakeService.claim(draft.draftId, draft.token)
      // Claiming copies the name from "About you" to the account; show it in the header.
      await refreshProfile().catch(() => undefined)
      const step = startStep(journey.steps, Boolean(joined.send_now_allowed))
      onContinued(`/my-ideas/draft/${draft.draftId}${step ? `?step=${encodeURIComponent(step)}` : ''}`)
      // Forget the guest draft only once the account has it.
      resumeStorage.clear()
    } catch {
      setErrors({ form: t('qs2.joinFail') })
      setBusy(null)
    }
  }

  return (
    <form
      onSubmit={confirm}
      noValidate
      aria-labelledby="qs2-title"
      className="relative flex flex-col gap-3.5 bg-surface text-text rounded-[16px] p-5 sm:p-7 shadow-[0_10px_15px_rgba(46,26,15,0.25)] w-full lg:w-[470px] shrink-0"
    >
      <h2 id="qs2-title" className="text-d-h4 font-heading">{t('qs2.title')}</h2>
      {/* Step 1 (the card) is done; name and phone belong to the form's next step. */}
      <JourneyBar names={journey.names} current={1} />

      <div className="flex items-center gap-2.5 bg-surface2 rounded-[10px] p-3">
        <Lightbulb size={18} aria-hidden className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-d-label text-text truncate">{draft.title}</p>
          <p className="text-d-cap text-muted truncate">{[draft.sectorName, draft.programTitle ?? t('qs2.general')].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={onEdit} className="text-d-label text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t('qs2.edit')}
        </button>
      </div>

      <Input label={t('qs2.name')} value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })) }} error={errors.name} autoComplete="name" required />

      <Input
        label={t('qs2.phone')}
        hint={codeSentTo ? undefined : t('qs2.phoneHint')}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+267  71 234 567"
        value={phone}
        onChange={(e) => { setPhone(e.target.value); setCodeSentTo(null); setCode('') }}
        error={errors.phone}
        required
        trailing={
          !codeSentTo ? (
            <Button size="sm" variant="secondary" onClick={sendCode} loading={busy === 'send'} className="h-8">
              {t('qs2.sendCode')}
            </Button>
          ) : undefined
        }
      />
      {codeSentTo && (
        <>
          <Input
            label={t('qs2.code')}
            hint={t('qs2.codeHint', { to: codeSentTo })}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErrors((x) => ({ ...x, code: undefined })) }}
            error={errors.code}
            autoFocus
          />
          <p className="-mt-2 text-d-cap text-muted">
            {resendIn > 0 ? (
              t('qs2.resendIn', { time: `0:${String(resendIn).padStart(2, '0')}` })
            ) : (
              <button type="button" className="text-primary font-bold hover:underline" onClick={sendCode}>{t('qs2.resend')}</button>
            )}
          </p>
        </>
      )}

      <p className="rounded-[10px] border border-border p-3 text-d-body-s text-muted">
        <span className="block text-d-label text-text">{t('qs2.account')}</span>
        {t('qs2.accountHint')}
      </p>

      {errors.form && <p role="alert" className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">{errors.form}</p>}

      <div className="flex gap-2.5">
        <Button variant="secondary" onClick={onEdit}>{t('qs2.back')}</Button>
        <Button type="submit" arrow className="flex-1" loading={busy === 'verify'} disabled={!codeSentTo}>{t('qs2.continue')}</Button>
      </div>
    </form>
  )
}

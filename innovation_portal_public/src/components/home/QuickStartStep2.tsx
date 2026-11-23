import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { Toggle } from '../ui/Choice'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useGuestContactCode } from '../../lib/usePublicConfig'
import { normalisePhone } from '../../lib/phone'
import { codeSignInService } from '../../services/codeSignIn.service'
import { guestContactProblem, guestContactStorage, intakeService, resumeStorage } from '../../services/intake.service'
import { JourneyBar } from './QuickStartCard'
import { nameStep, startStep, stepFields, useJourney } from './journeySteps'
import type { QuickStartDraft } from './QuickStartCard'
import type { OtpTarget } from '../../types/innovator'

// Figma 1.2 › Quick start step 2 (11:279 website, 11:375 phone sheet), for signed-out visitors.
// 23 Nov (send without an account): the visitor gives their name and at least one way to reach them, an email or a
// phone (one is enough). By default no account is made: the full General idea form (2.3) opens at step 2 as a guest
// draft (/submit/draft/:id, resume token), with these filled in, and its last step sends without an account.
// "Create an account to track your idea" is optional: then the email or phone is confirmed with a 6-digit code,
// which signs them in (PR 109), the draft joins the account and the full form opens at step 2.
// With "Confirm a guest's phone or email with a code" on, a guest confirms the contact with a code first.
// Name and phone are saved to the draft's "About you" as they are typed, so a refresh keeps them.

const splitName = (full: string) => {
  const [first_name = '', ...rest] = full.trim().split(/\s+/)
  return { first_name, last_name: rest.join(' ') }
}

export default function QuickStartStep2({ draft, onEdit, onContinued }: { draft: QuickStartDraft; onEdit: () => void; onContinued: (path: string) => void }) {
  const { t } = useI18n()
  const { signInWithCode, refreshProfile } = useAuth()
  const codeForGuests = useGuestContactCode()
  const [formId, setFormId] = useState<string | null>(null)
  const [sendNowAllowed, setSendNowAllowed] = useState(false)
  const journey = useJourney(draft.programId ? formId : null)
  const aboutYou = useMemo(() => nameStep(journey.steps), [journey.steps])
  const kept = guestContactStorage.get()
  const [name, setName] = useState(kept?.name ?? '')
  const [email, setEmail] = useState(kept?.email ?? '')
  const [phone, setPhone] = useState(kept?.phone ?? '')
  const [account, setAccount] = useState(false)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const savedName = useRef('')
  // A code is needed to make an account, or for every guest while the switch is on. The phone is used when given.
  const needsCode = account || codeForGuests
  const codeTarget: OtpTarget = phone.trim() ? { phone: normalisePhone(phone) } : { email: email.trim().toLowerCase() }

  // The draft knows its form, whether the basics are enough, and any name already saved (a refresh on this step).
  useEffect(() => {
    intakeService
      .getDraft(draft.draftId, draft.token)
      .then((d) => {
        setFormId(d.form_id)
        setSendNowAllowed(Boolean(d.send_now_allowed))
        const data = d.draft_data ?? {}
        const keptName = [data.first_name, data.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')
        const keptPhone = typeof data.contact_number === 'string' ? data.contact_number : ''
        savedName.current = JSON.stringify([keptName, keptPhone])
        if (keptName) setName((v) => v || keptName)
        if (keptPhone) setPhone((v) => v || keptPhone)
      })
      .catch(() => undefined)
  }, [draft.draftId, draft.token])

  // Keep what is typed on this device too (the email is not a form question), so a refresh loses nothing.
  useEffect(() => {
    guestContactStorage.set({ name, email, phone })
  }, [name, email, phone])

  // Name and phone go to the form's "About you" step as they are typed, so step 2 shows them filled.
  const aboutYouAnswers = useCallback((final = false) => {
    const answers: Record<string, string> = splitName(name)
    if (aboutYou && phone.trim() && stepFields(aboutYou).some((f) => f.key === 'contact_number')) {
      answers.contact_number = final ? normalisePhone(phone) : phone.trim()
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

  /** Name plus at least one way to reach them; a plain message for each problem. */
  function check(): boolean {
    const next: Record<string, string | undefined> = {}
    if (!name.trim()) next.name = t('qs2.nameError')
    const problem = guestContactProblem({ email, phone })
    if (problem === 'none') next.contact = t('qs2.contactNeeded')
    if (problem === 'email') next.email = t('qs2.emailError')
    if (problem === 'phone') next.phone = t('qs2.phoneError')
    setErrors(next)
    return !Object.values(next).some(Boolean)
  }

  const sendCode = async () => {
    if (!check()) return
    setBusy('send')
    try {
      const res = await codeSignInService.requestCode(codeTarget)
      setCodeSentTo(res.destination_hint || ('phone' in codeTarget ? codeTarget.phone : codeTarget.email))
      setResendIn(res.resend_after_seconds || 60)
    } catch {
      setErrors((e) => ({ ...e, code: t('qs2.sendError') }))
    } finally {
      setBusy(null)
    }
  }

  const fullForm = (base: string) => {
    const step = startStep(journey.steps, sendNowAllowed)
    return `${base}${step ? `?step=${encodeURIComponent(step)}` : ''}`
  }

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    if (!check()) return
    if (needsCode && (!codeSentTo || code.length !== 6)) {
      setErrors((x) => ({ ...x, code: codeSentTo ? t('qs2.codeError') : t('qs2.codeFirst') }))
      return
    }
    setBusy('verify')
    // The name and phone first, while the draft is still the visitor's, so step 2 (and an account) gets them.
    if (aboutYou) await intakeService.saveStep(draft.draftId, aboutYou.code, aboutYouAnswers(true), draft.token).catch(() => undefined)
    if (!account) {
      // Send without an account: confirm the contact first only when the switch asks for it.
      try {
        if (codeForGuests) {
          if ('phone' in codeTarget) await intakeService.verifyPhone(draft.draftId, draft.token, codeTarget.phone, code.trim())
          else await intakeService.verifyEmail(draft.draftId, draft.token, codeTarget.email, code.trim())
        }
      } catch {
        setErrors({ code: t('qs2.codeError') })
        setBusy(null)
        return
      }
      resumeStorage.setStage(null)
      onContinued(fullForm(`/submit/draft/${draft.draftId}`))
      return
    }
    try {
      const outcome = await signInWithCode(codeTarget, code.trim())
      if (outcome.status !== 'ok') {
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
      await refreshProfile().catch(() => undefined)
      setSendNowAllowed(Boolean(joined.send_now_allowed))
      onContinued(fullForm(`/my-ideas/draft/${draft.draftId}`))
      resumeStorage.clear()
      guestContactStorage.clear()
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
      {/* Step 1 (the card) is done; name and contact belong to the form's next step. */}
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

      <fieldset className="flex flex-col gap-3.5" aria-describedby="qs2-one-of">
        <legend className="sr-only">{t('qs2.reachYou')}</legend>
        <p id="qs2-one-of" className={errors.contact ? 'text-d-cap text-danger' : 'text-d-cap text-muted'} role={errors.contact ? 'alert' : undefined}>
          {errors.contact ?? t('qs2.oneOf')}
        </p>
        <Input
          label={t('qs2.email')}
          type="email"
          autoComplete="email"
          placeholder="you@example.co.bw"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setCodeSentTo(null); setErrors((x) => ({ ...x, email: undefined, contact: undefined })) }}
          error={errors.email}
        />
        <Input
          label={t('qs2.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+267  71 234 567"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setCodeSentTo(null); setErrors((x) => ({ ...x, phone: undefined, contact: undefined })) }}
          error={errors.phone}
        />
      </fieldset>

      <div className="rounded-[10px] border border-border p-3">
        <Toggle label={t('qs2.accountOptional')} description={t('qs2.accountHint')} checked={account} onChange={(on) => { setAccount(on); setCodeSentTo(null); setCode('') }} />
      </div>

      {needsCode && (
        <div className="flex flex-col gap-2">
          {!codeSentTo ? (
            <>
              <p className="text-d-cap text-muted">{account ? t('qs2.codeForAccount') : t('qs2.codeForGuest')}</p>
              <Button variant="secondary" onClick={sendCode} loading={busy === 'send'}>{t('qs2.sendCode')}</Button>
            </>
          ) : (
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
              <p className="text-d-cap text-muted">
                {resendIn > 0 ? (
                  t('qs2.resendIn', { time: `0:${String(resendIn).padStart(2, '0')}` })
                ) : (
                  <button type="button" className="text-primary font-bold hover:underline" onClick={sendCode}>{t('qs2.resend')}</button>
                )}
              </p>
            </>
          )}
          {!codeSentTo && errors.code && <p role="alert" className="text-d-cap text-danger">{errors.code}</p>}
        </div>
      )}

      {errors.form && <p role="alert" className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">{errors.form}</p>}

      <div className="flex gap-2.5">
        <Button variant="secondary" onClick={onEdit}>{t('qs2.back')}</Button>
        <Button type="submit" arrow className="flex-1" loading={busy === 'verify'}>{needsCode ? t('qs2.continue') : t('qs2.continueGuest')}</Button>
      </div>
    </form>
  )
}

import { FormEvent, useEffect, useState } from 'react'
import axios from 'axios'
import { CheckCircle2, Lightbulb } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import { Checkbox, Toggle } from '../ui/Choice'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { codeSignInService } from '../../services/codeSignIn.service'
import { intakeService, resumeStorage } from '../../services/intake.service'
import { useBasicsOnly } from '../../lib/usePublicConfig'
import { useAsync } from '../../lib/useAsync'
import { referenceService } from '../../services/reference.service'
import type { SubmitResult } from '../../types/innovator'
import type { QuickStartDraft } from './QuickStartCard'

// Figma 1.2 › Quick start step 2 (11:279 website, 11:375 phone sheet). The idea from step 1 stays visible with
// Edit. Guests confirm their phone with a 6-digit code (POST /api/auth/otp/request/, then
// /api/drafts/{id}/verify-phone/); "Create my account" is on by default, and off sends the idea as a guest.
// Signed-in people skip the phone: the draft is claimed and sent from their account.
// District (everyone) and Email (guests) are optional and go with the submit; the email gets the confirmation copy (R-22).

const needsMoreAnswers = (err: unknown): boolean =>
  axios.isAxiosError(err) && err.response?.status === 400 && !!(err.response.data as { errors?: { draft_data?: unknown } } | undefined)?.errors?.draft_data

const apiCode = (err: unknown): string | undefined => {
  if (!axios.isAxiosError(err)) return undefined
  const body = err.response?.data as { errors?: Record<string, unknown> } | undefined
  const errors = body?.errors ?? {}
  if (typeof errors.code === 'string') return errors.code
  for (const v of Object.values(errors)) {
    if (v && typeof v === 'object' && 'code' in (v as Record<string, unknown>)) return String((v as { code: unknown }).code)
  }
  return undefined
}

function normalisePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('267')) return `+${digits}`
  return `+267${digits}`
}

export default function QuickStartStep2({ draft, onEdit, onSent }: { draft: QuickStartDraft; onEdit: () => void; onSent: (result: SubmitResult) => void }) {
  const { t, lang } = useI18n()
  const { isAuthenticated, user } = useAuth()
  const districts = useAsync(() => referenceService.districts(lang), [lang])
  const [district, setDistrict] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState(user ? `${user.first_name} ${user.last_name}`.trim() : '')
  const [phone, setPhone] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [verified, setVerified] = useState(false)
  const [createAccount, setCreateAccount] = useState(true)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'send' | 'verify' | 'submit' | null>(null)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const isChallenge = Boolean(draft.programId)
  // "Send ideas with just the basics" off: General ideas answer the problem and the solution here, before
  // Send. Also shown when the API asks for them anyway (switch changed, or the config did not load).
  const basicsOnly = useBasicsOnly()
  const [serverAsked, setServerAsked] = useState(false)
  const askDetails = !isChallenge && (!basicsOnly || serverAsked)
  const [problem, setProblem] = useState('')
  const [solution, setSolution] = useState('')

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

  const verify = async () => {
    setBusy('verify')
    try {
      await intakeService.verifyPhone(draft.draftId, draft.token, normalisePhone(phone), code.trim())
      setVerified(true)
      setErrors((e) => ({ ...e, code: undefined }))
    } catch {
      setErrors((e) => ({ ...e, code: t('qs2.codeError') }))
    } finally {
      setBusy(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string | undefined> = {}
    if (askDetails && !problem.trim()) next.problem = t('qs2.problemError')
    if (askDetails && !solution.trim()) next.solution = t('qs2.solutionError')
    if (!name.trim()) next.name = t('qs2.nameError')
    if (!isAuthenticated && email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t('qs2.emailError')
    if (!isAuthenticated && !verified) next.code = t('qs2.phoneFirst')
    if (!consent) next.consent = t('qs2.consentError')
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy('submit')
    try {
      if (isAuthenticated) await intakeService.claim(draft.draftId, draft.token).catch(() => undefined)
      const token = isAuthenticated ? undefined : draft.token
      const [first_name, ...rest] = name.trim().split(/\s+/)
      const last_name = rest.join(' ')
      // The general form has an "about-you" step with the same names; fill it so the form check passes.
      // Challenge forms may not have that step, so a refusal here is fine.
      await intakeService.saveStep(draft.draftId, 'about-you', { first_name, last_name }, token).catch(() => undefined)
      if (askDetails) await intakeService.saveStep(draft.draftId, 'your-idea', { problem: problem.trim(), solution: solution.trim() }, token)
      const result = await intakeService.submit(
        draft.draftId,
        {
          consent: true,
          create_account: isAuthenticated ? undefined : isChallenge || createAccount,
          first_name,
          last_name,
          ...(district ? { district } : {}),
          ...(!isAuthenticated && email.trim() ? { email: email.trim() } : {}),
        },
        token,
      )
      resumeStorage.clear()
      onSent(result)
    } catch (err) {
      const c = apiCode(err)
      if (needsMoreAnswers(err) && !isChallenge) setServerAsked(true)
      // A district or email the API does not accept shows on that field.
      const fields = axios.isAxiosError(err) && err.response?.status === 400 ? ((err.response.data as { errors?: Record<string, unknown> } | undefined)?.errors ?? {}) : {}
      if ('district' in fields || 'email' in fields) {
        setErrors({ district: 'district' in fields ? t('qs2.districtError') : undefined, email: 'email' in fields ? t('qs2.emailError') : undefined })
        return
      }
      setErrors({
        form:
          c === 'phone_verification_required' ? t('qs2.phoneFirst')
          : c === 'consent_required' ? t('qs2.consentError')
          : c === 'name_required' ? t('qs2.nameError')
          // The form still wants answers: show the questions (General ideas) or say what is missing.
          : needsMoreAnswers(err) ? (isChallenge ? t('qs2.needMore') : t('qs2.answerBelow'))
          : t('qs2.sendFail'),
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="qs2-title"
      className="relative flex flex-col gap-3.5 bg-surface text-text rounded-[16px] p-5 sm:p-7 shadow-[0_10px_15px_rgba(46,26,15,0.25)] w-full lg:w-[470px] shrink-0"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="qs2-title" className="text-d-h4 font-heading">{t('qs2.title')}</h2>
        <p className="text-d-label-s text-muted whitespace-nowrap pt-1">{t('qs.step', { n: 2 })}</p>
      </div>
      <div aria-hidden className="h-1 rounded-full bg-primary" />

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

      {askDetails && (
        <>
          <Textarea label={t('qs2.problem')} rows={3} maxChars={1000} value={problem} onChange={(e) => { setProblem(e.target.value); setErrors((x) => ({ ...x, problem: undefined })) }} error={errors.problem} required />
          <Textarea label={t('qs2.solution')} rows={3} maxChars={1000} value={solution} onChange={(e) => { setSolution(e.target.value); setErrors((x) => ({ ...x, solution: undefined })) }} error={errors.solution} required />
        </>
      )}

      {/* Figma 11:279: name and district side by side. District is hidden when the list cannot load; it is
          optional, so it never blocks sending. */}
      <div className="grid gap-4 sm:grid-cols-2">
      <Input label={t('qs2.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" required />
      {!districts.error && (
        <Select
          label={t('qs2.district')}
          optional
          placeholder={districts.loading ? t('qs2.districtLoading') : t('qs2.districtPlaceholder')}
          disabled={districts.loading}
          options={(districts.data ?? []).map((d) => ({ value: d.slug, label: d.name }))}
          value={district || null}
          onChange={setDistrict}
          error={errors.district}
        />
      )}
      </div>

      {isAuthenticated ? (
        <p className="text-d-body-s text-muted">{t('qs2.signedIn', { name: name || user?.email || '' })}</p>
      ) : verified ? (
        <p className="flex items-center gap-2 text-d-label text-success" role="status">
          <CheckCircle2 size={18} aria-hidden />
          {t('qs2.confirmed')}
          <button type="button" className="ml-auto text-d-label text-primary hover:underline" onClick={() => { setVerified(false); setCodeSentTo(null); setCode('') }}>
            {t('qs2.change')}
          </button>
        </p>
      ) : (
        <>
          <Input
            label={t('qs2.phone')}
            hint={codeSentTo ? undefined : t('qs2.phoneHint')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+267  71 234 567"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setCodeSentTo(null) }}
            error={errors.phone}
            autoFocus
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
            <div className="flex items-end gap-2">
              <Input
                fieldClassName="flex-1"
                label={t('qs2.code')}
                hint={t('qs2.codeHint', { to: codeSentTo })}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                error={errors.code}
                autoFocus
              />
              <Button onClick={verify} loading={busy === 'verify'} disabled={code.length !== 6} className="mb-[22px]">
                {t('qs2.confirm')}
              </Button>
            </div>
          )}
          {codeSentTo && (
            <p className="-mt-2 text-d-cap text-muted">
              {resendIn > 0 ? (
                t('qs2.resendIn', { time: `0:${String(resendIn).padStart(2, '0')}` })
              ) : (
                <button type="button" className="text-primary font-bold hover:underline" onClick={sendCode}>{t('qs2.resend')}</button>
              )}
            </p>
          )}
          {!codeSentTo && errors.code && <p role="alert" className="text-d-cap text-danger -mt-2">{errors.code}</p>}
        </>
      )}

      {!isAuthenticated && (
        <Input
          label={t('qs2.email')}
          optional
          hint={t('qs2.emailHint')}
          type="email"
          autoComplete="email"
          placeholder="you@example.co.bw"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })) }}
          error={errors.email}
        />
      )}

      {!isAuthenticated && (
        <div className="rounded-[10px] border border-border p-3">
          {isChallenge ? (
            <p className="text-d-body-s text-muted">{t('qs2.accountRequired')}</p>
          ) : (
            <Toggle label={t('qs2.account')} description={t('qs2.accountHint')} checked={createAccount} onChange={setCreateAccount} />
          )}
        </div>
      )}

      <div>
        <Checkbox label={<span className="text-d-cap text-muted">{t('qs2.consent')}</span>} checked={consent} onChange={(e) => setConsent(e.target.checked)} invalid={Boolean(errors.consent)} />
        {errors.consent && <p role="alert" className="text-d-cap text-danger">{errors.consent}</p>}
      </div>

      {errors.form && <p role="alert" className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">{errors.form}</p>}

      <div className="flex gap-2.5">
        <Button variant="secondary" onClick={onEdit}>{t('qs2.back')}</Button>
        <Button type="submit" arrow className="flex-1" loading={busy === 'submit'}>{t('qs2.send')}</Button>
      </div>
    </form>
  )
}

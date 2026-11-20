import { FormEvent, useEffect, useState } from 'react'
import axios from 'axios'
import { CheckCircle2, Lightbulb } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { Checkbox, Toggle } from '../ui/Choice'
import { useI18n } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { codeSignInService } from '../../services/codeSignIn.service'
import { intakeService, resumeStorage } from '../../services/intake.service'
import type { SubmitResult } from '../../types/innovator'
import type { QuickStartDraft } from './QuickStartCard'

// Figma 1.2 › Quick start step 2 (11:279 website, 11:375 phone sheet). The idea from step 1 stays visible with
// Edit. Guests confirm their phone with a 6-digit code (POST /api/auth/otp/request/, then
// /api/drafts/{id}/verify-phone/); "Create my account" is on by default, and off sends the idea as a guest.
// Signed-in people skip the phone: the draft is claimed and sent from their account.
// TODO(R-22): District and Email are in the design but nothing stores them yet, so they are not asked for.

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
  const { t } = useI18n()
  const { isAuthenticated, user } = useAuth()
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
    if (!name.trim()) next.name = t('qs2.nameError')
    if (!isAuthenticated && !verified) next.code = t('qs2.phoneFirst')
    if (!consent) next.consent = t('qs2.consentError')
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy('submit')
    try {
      if (isAuthenticated) await intakeService.claim(draft.draftId, draft.token).catch(() => undefined)
      const result = await intakeService.submit(
        draft.draftId,
        { consent: true, create_account: isAuthenticated ? undefined : isChallenge || createAccount, name: name.trim() },
        isAuthenticated ? undefined : draft.token,
      )
      resumeStorage.clear()
      onSent(result)
    } catch (err) {
      const c = apiCode(err)
      setErrors({
        form: c === 'phone_verification_required' ? t('qs2.phoneFirst') : c === 'consent_required' ? t('qs2.consentError') : c === 'name_required' ? t('qs2.nameError') : t('qs2.sendFail'),
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

      <Input label={t('qs2.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" required />

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

import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import StaffSignInButton from '../../components/auth/StaffSignInButton'
import CodeBoxes from '../../components/innovator/CodeBoxes'
import { useAuth } from '../../context/AuthContext'
import { useI18n, type StringKey } from '../../i18n'
import { codeSignInService } from '../../services/codeSignIn.service'
import type { OtpRequestResult, OtpTarget } from '../../types/innovator'
import { parseApiError } from '../../utils/apiError'

type Mode = 'phone' | 'email'

const CHANNEL_KEY: Record<string, StringKey> = {
  sms: 'channel.sms',
  whatsapp: 'channel.whatsapp',
  email: 'channel.email',
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Screen 2.0: sign in with a code sent by phone or email. Password sign-in stays at /login. */
export default function CodeSignIn() {
  const { t } = useI18n()
  const { signInWithCode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'

  const [mode, setMode] = useState<Mode>('phone')
  const [target, setTarget] = useState('')
  const [sent, setSent] = useState<OtpRequestResult | null>(null)
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const otpTarget = (): OtpTarget => (mode === 'phone' ? { phone: target.trim() } : { email: target.trim() })

  async function requestCode(event?: FormEvent) {
    event?.preventDefault()
    if (!target.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await codeSignInService.requestCode(otpTarget())
      setSent(result)
      setCode('')
      setWait(result.resend_after_seconds ?? 60)
    } catch (err) {
      setError(parseApiError(err, t('signin.sendError')))
    } finally {
      setBusy(false)
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      const outcome = await signInWithCode(otpTarget(), value)
      if (outcome.status === 'mfa_required') navigate('/mfa', { state: { from: { pathname: from } } })
      else navigate(from, { replace: true })
    } catch (err) {
      setError(parseApiError(err, t('signin.codeError')))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  function switchMode() {
    setMode((m) => (m === 'phone' ? 'email' : 'phone'))
    setTarget('')
    setSent(null)
    setCode('')
    setError('')
  }

  const channel = sent ? t(CHANNEL_KEY[sent.channel] ?? 'channel.sms') : ''
  const errorId = error ? 'signin-error' : undefined

  return (
    <div className="bg-bg">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:py-20">
        <div>
          <p className="text-d-over uppercase text-primary">{t('signin.eyebrow')}</p>
          <h1 className="mt-3 font-heading text-d-mh1 sm:text-d-h1 text-text">{t('signin.headline')}</h1>
          <ul className="mt-6 hidden flex-col gap-4 sm:flex">
            {(['signin.why1', 'signin.why2', 'signin.why3'] as const).map((key) => (
              <li key={key} className="flex items-center gap-3 text-d-body text-text">
                <CheckCircle2 size={20} aria-hidden className="shrink-0 text-success" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        <Card padding="lg" className="shadow-card">
          <h2 className="font-heading text-d-h3 text-text">{t('signin.title')}</h2>

          {!sent ? (
            <form className="mt-4 flex flex-col gap-5" onSubmit={requestCode} noValidate>
              <p className="text-d-body-s text-muted">{t('signin.intro')}</p>
              <Input
                label={mode === 'phone' ? t('signin.phone') : t('signin.email')}
                type={mode === 'phone' ? 'tel' : 'email'}
                inputMode={mode === 'phone' ? 'tel' : 'email'}
                autoComplete={mode === 'phone' ? 'tel' : 'email'}
                placeholder={mode === 'phone' ? '+267 71 234 567' : undefined}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                error={error || undefined}
                required
                autoFocus
              />
              <Button type="submit" block loading={busy} disabled={!target.trim()}>
                {t('signin.sendCode')}
              </Button>
              <button type="button" onClick={switchMode} className="self-start text-d-label-s text-primary hover:underline">
                {mode === 'phone' ? t('signin.useEmail') : t('signin.usePhone')}
              </button>
            </form>
          ) : (
            <form
              className="mt-4 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                verify()
              }}
            >
              <p className="text-d-body text-text">
                {t('signin.sentTo', { destination: sent.destination_hint, channel })}{' '}
                <button type="button" onClick={() => setSent(null)} className="text-d-label-s text-primary hover:underline">
                  {t('signin.change')}
                </button>
              </p>
              <fieldset>
                <legend className="sr-only">{t('signin.codeLegend')}</legend>
                <CodeBoxes value={code} onChange={setCode} onComplete={verify} invalid={Boolean(error)} disabled={busy} describedBy={errorId} />
              </fieldset>
              {error && (
                <p id={errorId} role="alert" className="text-d-cap text-danger">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {wait > 0 ? (
                  <p className="text-d-cap text-muted" aria-live="polite">{t('signin.resendIn', { time: formatSeconds(wait) })}</p>
                ) : (
                  <button type="button" onClick={() => requestCode()} className="text-d-label-s text-primary hover:underline">
                    {t('signin.resend')}
                  </button>
                )}
                <button type="button" onClick={switchMode} className="text-d-label-s text-primary hover:underline">
                  {mode === 'phone' ? t('signin.useEmail') : t('signin.usePhone')}
                </button>
              </div>
              <Button type="submit" block loading={busy} disabled={code.length !== 6}>
                {t('signin.submit')}
              </Button>
            </form>
          )}

          <div className="my-6 flex items-center gap-3 text-d-cap text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            {t('signin.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-3">
            <StaffSignInButton />
            <Link to="/login" state={location.state} className="text-center text-d-label-s text-primary hover:underline">
              {t('signin.password')}
            </Link>
          </div>
          <p className="mt-6 flex items-center gap-2 text-d-cap text-muted">
            <ShieldCheck size={14} aria-hidden />
            {t('signin.staffNote')}
          </p>
        </Card>
      </div>
    </div>
  )
}

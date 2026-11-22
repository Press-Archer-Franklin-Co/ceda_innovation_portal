import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleCheck, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import { Checkbox } from '../components/ui/Choice'
import CodeBoxes from '../components/innovator/CodeBoxes'
import TestAccountsPill from '../components/auth/TestAccountsPill'
import watermarkUrl from '../assets/brand/ceda-watermark.png'
import { useAuth } from '../context/AuthContext'
import { useI18n, type StringKey } from '../i18n'
import { authService, type DemoAccount, type PublicConfig } from '../services/auth.service'
import { isSignedIn, signInService, type FinishResult, type SignupResult, type StartResult } from '../services/signIn.service'
import { parseApiError } from '../utils/apiError'

type Step =
  | { kind: 'identify' }
  | { kind: 'code'; sent: Extract<StartResult, { next: 'code' }> }
  | { kind: 'password' }
  | { kind: 'signup' }
  | { kind: 'mfa' }
  | { kind: 'sso' }

const CHANNEL_KEY: Record<string, StringKey> = { sms: 'channel.sms', whatsapp: 'channel.whatsapp', email: 'channel.email' }

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function looksLikeEmail(value: string): boolean {
  return value.includes('@')
}

/**
 * U7 screens 2.0, 2.0b and 2.6: one sign-in for innovators, staff, judges and admins.
 * Step 1 asks for a phone number or email; the server says what comes next (code,
 * password, single sign-on or "One more step"). The second step is the owner's
 * choice in Platform settings, not hard-coded here.
 */
export default function SignIn() {
  const { t } = useI18n()
  const { acceptSignIn, completeMfa, pendingMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = params.get('next') || (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || ''

  const [config, setConfig] = useState<PublicConfig | null>(null)
  // A two-step check still waiting (for example after staff single sign-on) opens on that step.
  const [step, setStep] = useState<Step>(() => (pendingMfa ? { kind: 'mfa' } : { kind: 'identify' }))
  const [identifier, setIdentifier] = useState('')
  const [foundAccount, setFoundAccount] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [wait, setWait] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demoBusy, setDemoBusy] = useState<string | null>(null)
  // One more step
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState<'en' | 'tn'>('en')
  const [consent, setConsent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    authService.getPublicConfig().then(setConfig).catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const secondStep = config?.sign_in.second_step ?? 'code'
  const demoAccounts: DemoAccount[] = config?.demo_logins?.accounts ?? []

  function goTo(redirect: string) {
    // The staff console is a separate app under /staff: load it as a page.
    if (redirect.startsWith('/staff')) window.location.assign(redirect)
    else navigate(redirect || '/home', { replace: true })
  }

  async function signedIn(result: FinishResult | SignupResult) {
    if (!isSignedIn(result) && !('mfa_required' in result)) return
    const outcome = await acceptSignIn(result as FinishResult)
    if (outcome.status === 'mfa_required') {
      setCode('')
      setStep({ kind: 'mfa' })
      return
    }
    goTo((result as { redirect?: string }).redirect || '/home')
  }

  function fail(err: unknown, fallback: StringKey = 'auth.error') {
    setError(parseApiError(err, t(fallback)))
  }

  function showStart(result: StartResult) {
    setError('')
    setCode('')
    if (result.next === 'sso') {
      setStep({ kind: 'sso' })
      window.location.assign(result.redirect)
    } else if (result.next === 'signup') {
      const isEmail = looksLikeEmail(identifier)
      setPhone(isEmail ? '' : identifier.trim())
      setEmail(isEmail ? identifier.trim() : '')
      setFieldErrors({})
      setStep({ kind: 'signup' })
    } else if (result.next === 'password') {
      setPassword('')
      setStep({ kind: 'password' })
    } else {
      setWait(result.resend_after_seconds ?? 60)
      setStep({ kind: 'code', sent: result })
    }
  }

  async function start(event?: FormEvent, wantCode = false) {
    event?.preventDefault()
    if (!identifier.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      showStart(await signInService.start(identifier.trim(), wantCode))
    } catch (err) {
      fail(err, wantCode ? 'auth.sendError' : 'auth.error')
    } finally {
      setBusy(false)
    }
  }

  async function finish(payload: { code?: string; password?: string }) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await signedIn(await signInService.finish({ identifier: identifier.trim(), next, ...payload }))
    } catch (err) {
      fail(err)
      if (payload.code) setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function finishMfa(value = code) {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError('')
    try {
      await completeMfa(value)
      goTo(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home')
    } catch (err) {
      fail(err)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setFieldErrors({})
    try {
      const result = await signInService.signup({
        identifier: identifier.trim(),
        full_name: fullName,
        phone,
        email,
        language,
        consent,
        password: secondStep === 'password' ? newPassword : undefined,
        next,
      })
      if (isSignedIn(result)) await signedIn(result)
      else {
        // This phone or email already has an account: finish with a code for that account, never a second one.
        if (result.found_account && result.identifier) {
          setIdentifier(result.identifier)
          setFoundAccount(true)
        }
        showStart(result)
      }
    } catch (err) {
      const errors = (err as { response?: { data?: { errors?: Record<string, { detail?: string }> } } }).response?.data?.errors
      if (errors && typeof errors === 'object') {
        const mapped: Record<string, string> = {}
        for (const [key, value] of Object.entries(errors)) if (value && typeof value === 'object' && 'detail' in value) mapped[key] = String(value.detail)
        setFieldErrors(mapped)
        if (!Object.keys(mapped).length) fail(err)
      } else fail(err)
    } finally {
      setBusy(false)
    }
  }

  async function pickDemo(account: DemoAccount) {
    setDemoBusy(account.id)
    setError('')
    try {
      await signedIn(await signInService.demoLogin(account.id, next || undefined))
    } catch (err) {
      fail(err, 'demo.error')
    } finally {
      setDemoBusy(null)
    }
  }

  function backToStart() {
    setFoundAccount(false)
    setStep({ kind: 'identify' })
    setError('')
    setCode('')
    setPassword('')
  }

  const isNew = step.kind === 'signup'
  const errorId = error ? 'signin-error' : undefined
  const changeKey: StringKey = looksLikeEmail(identifier) ? 'auth.changeEmail' : 'auth.changeNumber'

  const headline = useMemo(
    () =>
      isNew
        ? { eyebrow: t('auth.newEyebrow'), start: t('auth.newHeadlineStart'), highlight: t('auth.newHeadlineHighlight') }
        : { eyebrow: t('auth.eyebrow'), start: t('auth.headlineStart'), highlight: t('auth.headlineHighlight') },
    [isNew, t],
  )

  return (
    <div className="relative overflow-hidden bg-banner">
      <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none absolute -bottom-40 -left-48 w-[760px] max-w-none select-none opacity-90 sm:w-[900px]" />

      {demoAccounts.length > 0 && (
        <div className="relative z-10 mx-auto flex max-w-[1200px] justify-end px-4 pt-4 sm:px-6 lg:absolute lg:inset-x-0 lg:top-4 lg:pt-0">
          <TestAccountsPill accounts={demoAccounts} busyId={demoBusy} onPick={pickDemo} />
        </div>
      )}

      <div className="relative mx-auto grid max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-10 lg:py-20">
        <div>
          <p className="text-d-over uppercase text-amber">{headline.eyebrow}</p>
          <h1 className="mt-3 font-heading text-d-mh1 text-on-banner sm:text-d-h1">
            {headline.start} <span className="text-amber">{headline.highlight}</span>
          </h1>
          <ul className="mt-6 hidden flex-col gap-4 sm:flex">
            {(['signin.why1', 'signin.why2', 'signin.why3'] as const).map((key) => (
              <li key={key} className="flex items-center gap-3 text-d-body text-on-banner">
                <CircleCheck size={20} aria-hidden className="shrink-0 text-amber" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        <Card padding="lg" className="shadow-card">
          {step.kind === 'identify' && (
            <form className="flex flex-col gap-5" onSubmit={(e) => start(e)} noValidate>
              <div>
                <h2 className="font-heading text-d-h3 text-text">{t('auth.title')}</h2>
                <p className="mt-2 text-d-body-s text-muted">{t('auth.intro')}</p>
              </div>
              <Input
                label={t('auth.identifier')}
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder={t('auth.identifierPlaceholder')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                error={error || undefined}
                required
                autoFocus
              />
              <Button type="submit" block loading={busy} disabled={!identifier.trim()} arrow>
                {t('auth.continue')}
              </Button>
              <Note icon>{t(secondStep === 'password' ? 'auth.passwordNote' : 'auth.codeNote')}</Note>
              <div className="border-t border-border pt-5">
                <p className="text-d-body-s text-text">{t('auth.newHere')}</p>
                <p className="mt-4 text-d-cap text-muted">{t('auth.ssoNote')}</p>
              </div>
            </form>
          )}

          {step.kind === 'code' && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                finish({ code })
              }}
            >
              {foundAccount && <p role="status" className="rounded-control bg-accent-soft px-3 py-2.5 text-d-body-s text-text">{t('auth.foundAccount')}</p>}
              <div>
                <h2 className="font-heading text-d-h3 text-text">{t('auth.codeTitle')}</h2>
                <p className="mt-2 text-d-body-s text-muted">
                  {t('auth.codeSent', { destination: step.sent.sent_to, channel: t(CHANNEL_KEY[step.sent.channel] ?? 'channel.sms') })}
                </p>
              </div>
              <fieldset>
                <legend className="sr-only">{t('auth.codeLegend')}</legend>
                <CodeBoxes value={code} onChange={setCode} onComplete={(value) => finish({ code: value })} invalid={Boolean(error)} disabled={busy} describedBy={errorId} />
              </fieldset>
              <ErrorLine id={errorId} text={error} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {wait > 0 ? (
                  <p className="text-d-cap text-muted" aria-live="polite">{t('auth.resendIn', { time: formatSeconds(wait) })}</p>
                ) : (
                  <button type="button" onClick={() => start(undefined, true)} className="text-d-label-s text-primary hover:underline">
                    {t('auth.resend')}
                  </button>
                )}
                <button type="button" onClick={backToStart} className="text-d-label-s text-primary hover:underline">
                  {t(changeKey)}
                </button>
              </div>
              <Button type="submit" block loading={busy} disabled={code.length !== 6}>
                {t('auth.signIn')}
              </Button>
              <Note icon>{t('auth.codeFooter')}</Note>
            </form>
          )}

          {step.kind === 'password' && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                finish({ password })
              }}
            >
              <div>
                <h2 className="font-heading text-d-h3 text-text">{t('auth.passwordTitle')}</h2>
                <p className="mt-2 text-d-body-s text-muted">
                  {t('auth.signingInAs', { identifier: identifier.trim() })}{' '}
                  <button type="button" onClick={backToStart} className="text-d-label-s text-primary hover:underline">
                    {t('auth.change')}
                  </button>
                </p>
              </div>
              <div>
                <Input
                  label={t('auth.password')}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={error || undefined}
                  required
                  autoFocus
                />
                <button type="button" onClick={() => start(undefined, true)} className="mt-2 text-d-label-s text-primary hover:underline">
                  {t('auth.forgot')}
                </button>
              </div>
              <Button type="submit" block loading={busy} disabled={!password}>
                {t('auth.signIn')}
              </Button>
            </form>
          )}

          {step.kind === 'mfa' && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                finishMfa()
              }}
            >
              <div>
                <h2 className="font-heading text-d-h3 text-text">{t('auth.twoStepTitle')}</h2>
                <p className="mt-2 text-d-body-s text-muted">{t('auth.twoStepSent', { destination: pendingMfa?.email_hint || identifier.trim() })}</p>
              </div>
              <fieldset>
                <legend className="sr-only">{t('auth.codeLegend')}</legend>
                <CodeBoxes value={code} onChange={setCode} onComplete={finishMfa} invalid={Boolean(error)} disabled={busy} describedBy={errorId} />
              </fieldset>
              <ErrorLine id={errorId} text={error} />
              <Button type="submit" block loading={busy} disabled={code.length !== 6}>
                {t('auth.signIn')}
              </Button>
            </form>
          )}

          {step.kind === 'sso' && <p className="text-d-body text-text" aria-live="polite">{t('auth.ssoGoing')}</p>}

          {step.kind === 'signup' && (
            <form className="flex flex-col gap-4" onSubmit={createAccount} noValidate>
              <div>
                <h2 className="font-heading text-d-h3 text-text">{t('auth.signupTitle')}</h2>
                <p className="mt-2 text-d-body-s text-muted">{t('auth.signupIntro')}</p>
              </div>
              <Input label={t('auth.fullName')} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={fieldErrors.full_name} required autoFocus />
              <Input
                label={looksLikeEmail(identifier) ? t('auth.phoneOptional') : t('auth.phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                readOnly={!looksLikeEmail(identifier)}
                hint={!looksLikeEmail(identifier) && secondStep === 'code' ? t('auth.phoneHint') : undefined}
                error={fieldErrors.phone}
              />
              <Input
                label={looksLikeEmail(identifier) ? t('auth.email') : t('auth.emailOptional')}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={looksLikeEmail(identifier)}
                hint={looksLikeEmail(identifier) && secondStep === 'code' ? t('auth.emailHint') : undefined}
                error={fieldErrors.email}
              />
              {secondStep === 'password' && (
                <Input
                  label={t('auth.choosePassword')}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  hint={t('auth.passwordRule')}
                  error={fieldErrors.password}
                  required
                />
              )}
              <Segmented
                label={t('auth.language')}
                value={language}
                onChange={setLanguage}
                options={[
                  { value: 'en', label: t('auth.langEn') },
                  { value: 'tn', label: t('auth.langTn') },
                ]}
              />
              <div>
                <Checkbox label={t('auth.consent')} checked={consent} onChange={(e) => setConsent(e.target.checked)} invalid={Boolean(fieldErrors.consent)} />
                <ErrorLine id={fieldErrors.consent ? 'consent-error' : undefined} text={fieldErrors.consent ?? ''} />
              </div>
              <ErrorLine id={errorId} text={error} />
              <Button type="submit" block loading={busy} disabled={!fullName.trim() || !consent}>
                {t('auth.createAccount')}
              </Button>
              <button type="button" onClick={backToStart} className="self-start text-d-label-s text-primary hover:underline">
                {t('auth.haveAccount')}
              </button>
            </form>
          )}

        </Card>
      </div>
    </div>
  )
}

function Note({ children, icon }: { children: ReactNode; icon?: boolean }) {
  return (
    <p className="flex items-start gap-2 text-d-cap text-muted">
      {icon && <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  )
}

function ErrorLine({ id, text }: { id?: string; text: string }) {
  if (!text) return null
  return (
    <p id={id} role="alert" className="text-d-cap text-danger">
      {text}
    </p>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-d-label-s text-text">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-control bg-surface2 p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={clsx(
              'flex min-h-[40px] cursor-pointer items-center justify-center rounded-control text-d-label-s',
              'focus-within:ring-2 focus-within:ring-primary',
              value === option.value ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
            )}
          >
            <input type="radio" className="sr-only" name={label} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

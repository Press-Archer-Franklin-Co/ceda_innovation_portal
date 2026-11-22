import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button, { buttonClasses } from '../components/ui/Button'
import Input from '../components/ui/Input'
import { AuthState, AuthStateShell } from '../components/auth/AuthStateShell'
import { useI18n } from '../i18n'
import { authService } from '../services/auth.service'
import { tokenStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/apiError'

// /verify-email?token=…: checks the link from the email, signs the person in and takes them back to what they were
// doing. No frame of its own: the U7 sign-in layout (AuthStateShell).

type Status = 'loading' | 'success' | 'error' | 'no-token'

export default function VerifyEmail() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const returnTo = searchParams.get('return') ?? localStorage.getItem('ceda_post_verify_redirect') ?? '/dashboard'
  const { refreshProfile } = useAuth()

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'no-token')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(5)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<'' | 'ok' | 'failed'>('')
  const [sendError, setSendError] = useState('')
  const [wait, setWait] = useState(0)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!token) return
    authService.verifyEmail(token)
      .then(async (tokens: any) => {
        if (!tokens.already_verified) {
          tokenStorage.setAccess(tokens.access)
          tokenStorage.setRefresh(tokens.refresh)
          await refreshProfile()
        }
        localStorage.removeItem('ceda_post_verify_redirect')
        setStatus('success')
      })
      .catch((err) => {
        setError(parseApiError(err, ''))
        setStatus('error')
      })
  }, [token, refreshProfile])

  useEffect(() => {
    if (status !== 'success') return undefined
    if (countdown <= 0) { navigate(returnTo, { replace: true }); return undefined }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [status, countdown, navigate, returnTo])

  useEffect(() => {
    if (wait <= 0) return undefined
    const timer = setTimeout(() => setWait((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const resend = async () => {
    if (wait > 0 || !email.trim()) return
    setSent('')
    setSending(true)
    try {
      await authService.resendVerification(email.trim())
      setSent('ok')
      setWait(60)
    } catch (err) {
      setSendError(parseApiError(err, t('authState.linkFailed')))
      setSent('failed')
    } finally {
      setSending(false)
    }
  }

  const newLink = (
    <form className="flex flex-col gap-3 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); resend() }} noValidate>
      <p className="text-d-label-s text-text">{t('authState.newLink')}</p>
      <Input label={t('authState.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
        error={sent === 'failed' ? sendError : undefined} />
      {sent === 'ok' && <p role="status" className="text-d-cap text-success">{t('authState.linkSent')}</p>}
      <Button type="submit" block loading={sending} disabled={wait > 0 || !email.trim()}>
        {wait > 0 ? t('authState.sendAgainIn', { n: wait }) : t('authState.sendLink')}
      </Button>
      <Link to="/sign-in" className="text-center text-d-label-s text-primary hover:underline">{t('authState.backToSignIn')}</Link>
    </form>
  )

  return (
    <AuthStateShell start={t('authState.verifyHeadStart')} highlight={t('authState.verifyHeadHighlight')}>
      {status === 'loading' && <AuthState tone="loading" title={t('authState.verifyLoading')} body={t('authState.verifyLoadingBody')} />}
      {status === 'success' && (
        <AuthState tone="success" title={t('authState.verifyDone')} body={<>{t('authState.verifyDoneBody')} {t('authState.redirecting', { n: Math.max(countdown, 0) })}</>}>
          <Link to={returnTo} replace className={buttonClasses({ block: true })}>{t('authState.continue')}</Link>
        </AuthState>
      )}
      {status === 'error' && (
        <AuthState tone="error" title={t('authState.verifyFailed')} body={error || t('authState.verifyFailedBody')}>
          {newLink}
        </AuthState>
      )}
      {status === 'no-token' && (
        <AuthState tone="error" title={t('authState.noToken')} body={t('authState.noTokenBody')}>
          {newLink}
        </AuthState>
      )}
    </AuthStateShell>
  )
}

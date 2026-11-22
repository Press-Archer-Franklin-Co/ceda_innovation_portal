import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authService, SSO_TRIAL_STATE_PREFIX } from '../services/auth.service'
import type { SsoTrialResult } from '../services/auth.service'
import { securityService } from '../services/security.service'
import { tokenStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/apiError'
import { buttonClasses } from '../components/ui/Button'
import { AuthState, AuthStateShell } from '../components/auth/AuthStateShell'
import { useI18n } from '../i18n'

// /auth/callback: where Google, Microsoft and CEDA SSO send people back. Finishes the sign-in (or the account link,
// or the "Try sign-in" trial from Platform settings). No frame of its own: the U7 sign-in layout (AuthStateShell).

export default function AuthCallback() {
  const { t } = useI18n()
  const [searchParams]     = useSearchParams()
  const navigate           = useNavigate()
  const { refreshProfile, updatePendingMfa } = useAuth()

  const [error, setError] = useState('')
  const [trial, setTrial] = useState<SsoTrialResult | null>(null)
  const isTrial = (searchParams.get('state') ?? '').startsWith(SSO_TRIAL_STATE_PREFIX)

  useEffect(() => {
    const code     = searchParams.get('code')     ?? ''
    const state    = searchParams.get('state')    ?? ''

    // "Try sign-in" from Platform settings: report what the directory sent, sign nobody in.
    if (state.startsWith(SSO_TRIAL_STATE_PREFIX)) {
      const providerError = searchParams.get('error_description') || searchParams.get('error')
      if (!code) {
        setError(providerError ? t('authState.trialRefused', { reason: providerError }) : t('authState.trialNoCode'))
        return
      }
      authService
        .completeSsoTrial(code, state)
        .then(setTrial)
        .catch(err => setError(parseApiError(err, t('authState.trialNotFinished'))))
      return
    }

    const provider = sessionStorage.getItem('oauth_provider') ?? ''
    const action   = sessionStorage.getItem('oauth_action')   ?? 'login'

    if (!code || !state || !provider) {
      setError(t('authState.callbackIncomplete'))
      return
    }

    ;(async () => {
      sessionStorage.removeItem('oauth_provider')
      sessionStorage.removeItem('oauth_action')

      try {
        if (action === 'link') {
          await securityService.linkProvider(provider, code, state)
          navigate(`/security?linked=${provider}`, { replace: true })
        } else {
          const result = await authService.completeSocialAuth(provider, code, state)
          if ('mfa_required' in result && result.mfa_required) {
            updatePendingMfa({
              challenge_id: result.challenge_id,
              method: result.method,
              email_hint: result.email_hint,
              expires_at: result.expires_at,
            })
            navigate('/sign-in', { replace: true })
            return
          }
          if (!('access' in result)) {
            throw new Error(t('authState.signInFailed'))
          }
          tokenStorage.setAccess(result.access)
          tokenStorage.setRefresh(result.refresh)
          await refreshProfile()
          navigate('/', { replace: true })
        }
      } catch (err) {
        setError(parseApiError(err,
          action === 'link' ? t('authState.linkAccountFailed') : t('authState.signInFailed')
        ))
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once for the code in the address

  if (isTrial) {
    const result = trial?.trial
    return (
      <AuthStateShell start={t('authState.trialHeadStart')} highlight={t('authState.trialHeadHighlight')}>
        {!trial && !error && <AuthState tone="loading" title={t('authState.trialLoading')} />}
        {error && <AuthState tone="error" title={t('authState.trialFailed')} body={error} />}
        {trial && (
          <AuthState tone={trial.ok && result?.allowed ? 'success' : 'error'} title={t('authState.trialDone')} body={t('authState.trialDoneBody')}>
            {result ? (
              <dl className="flex flex-col gap-1.5 rounded-control border border-border px-4 py-3 text-d-body-s">
                <div><dt className="inline text-muted">{t('authState.trialEmail')}: </dt><dd className="inline text-text">{result.email || t('authState.trialNotSent')}</dd></div>
                <div><dt className="inline text-muted">{t('authState.trialName')}: </dt><dd className="inline text-text">{result.name || t('authState.trialNotSent')}</dd></div>
                <div className="break-words"><dt className="inline text-muted">{t('authState.trialGroups')}: </dt><dd className="inline text-text">{result.groups.length ? result.groups.join(', ') : t('authState.trialNone')}</dd></div>
                <p className={result.allowed ? 'pt-1 font-semibold text-success' : 'pt-1 font-semibold text-danger'}>
                  {result.allowed ? t('authState.trialAllowed', { by: result.allowed_by, role: result.role }) : t('authState.trialWouldRefuse', { reason: result.reason })}
                </p>
              </dl>
            ) : (
              <ul className="flex flex-col gap-1 text-d-body-s text-danger">
                {trial.steps.map((step) => <li key={step.step}>{step.step}: {step.detail}</li>)}
              </ul>
            )}
          </AuthState>
        )}
        <button type="button" onClick={() => window.close()} className={buttonClasses({ variant: 'ghost', block: true, className: 'mt-4' })}>
          {t('authState.closeWindow')}
        </button>
      </AuthStateShell>
    )
  }

  return (
    <AuthStateShell start={t('authState.callbackHeadStart')} highlight={t('authState.callbackHeadHighlight')}>
      {!error ? (
        <AuthState tone="loading" title={t('authState.callbackLoading')} body={t('authState.callbackLoadingBody')} />
      ) : (
        <AuthState tone="error" title={t('authState.callbackFailed')} body={error}>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => navigate('/sign-in')} className={buttonClasses({ block: true })}>{t('authState.backToSignIn')}</button>
            <button type="button" onClick={() => navigate('/security')} className={buttonClasses({ variant: 'ghost', block: true })}>{t('authState.backToSecurity')}</button>
          </div>
        </AuthState>
      )}
    </AuthStateShell>
  )
}

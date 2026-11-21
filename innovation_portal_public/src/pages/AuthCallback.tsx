import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { authService, SSO_TRIAL_STATE_PREFIX } from '../services/auth.service'
import type { SsoTrialResult } from '../services/auth.service'
import { securityService } from '../services/security.service'
import { tokenStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/apiError'
import logoSrc from '../assets/logo.png'

export default function AuthCallback() {
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
        setError(providerError ? `The provider refused the sign-in: ${providerError}` : 'The provider did not return a sign-in code.')
        return
      }
      authService
        .completeSsoTrial(code, state)
        .then(setTrial)
        .catch(err => setError(parseApiError(err, 'The trial sign-in could not be finished.')))
      return
    }

    const provider = sessionStorage.getItem('oauth_provider') ?? ''
    const action   = sessionStorage.getItem('oauth_action')   ?? 'login'

    if (!code || !state || !provider) {
      setError('Incomplete OAuth callback. Please try again.')
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
            throw new Error('Sign in failed.')
          }
          tokenStorage.setAccess(result.access)
          tokenStorage.setRefresh(result.refresh)
          await refreshProfile()
          navigate('/', { replace: true })
        }
      } catch (err) {
        setError(parseApiError(err,
          action === 'link'
            ? 'Could not link account. Please try again from Account Security.'
            : 'Sign in failed. Please try again.'
        ))
      }
    })()
  }, [])

  if (isTrial) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="max-w-md w-full">
          <img src={logoSrc} alt="CEDA" className="h-10 w-auto mx-auto mb-8" />
          {!trial && !error && (
            <div className="text-center">
              <Loader2 size={32} className="animate-spin mx-auto mb-4 text-[#A01E0A]" />
              <p className="text-sm text-gray-500">Checking the trial sign-in…</p>
            </div>
          )}
          {error && (
            <div className="text-center">
              <XCircle size={32} className="mx-auto mb-3 text-red-500" />
              <h1 className="text-lg font-bold text-gray-900 mb-2">Trial sign-in failed</h1>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          )}
          {trial && (
            <div>
              <div className="text-center mb-5">
                {trial.ok && trial.trial?.allowed
                  ? <CheckCircle2 size={32} className="mx-auto mb-3 text-green-600" />
                  : <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />}
                <h1 className="text-lg font-bold text-gray-900">Trial sign-in finished</h1>
                <p className="text-sm text-gray-500 mt-1">Nobody was signed in. The result is also shown in Platform settings.</p>
              </div>
              {trial.trial ? (
                <dl className="rounded-xl border border-gray-200 px-4 py-3 text-sm space-y-1.5">
                  <div><dt className="inline text-gray-500">Email: </dt><dd className="inline">{trial.trial.email || 'not received'}</dd></div>
                  <div><dt className="inline text-gray-500">Name: </dt><dd className="inline">{trial.trial.name || 'not received'}</dd></div>
                  <div className="break-words"><dt className="inline text-gray-500">Groups: </dt><dd className="inline">{trial.trial.groups.length ? trial.trial.groups.join(', ') : 'none'}</dd></div>
                  <p className={trial.trial.allowed ? 'text-green-700 font-medium pt-1' : 'text-red-700 font-medium pt-1'}>
                    {trial.trial.allowed
                      ? `Allowed (by ${trial.trial.allowed_by}). A new user would get: ${trial.trial.role}.`
                      : `Would be refused: ${trial.trial.reason}`}
                  </p>
                </dl>
              ) : (
                <ul className="text-sm space-y-1">
                  {trial.steps.map(step => <li key={step.step} className="text-red-700">{step.step}: {step.detail}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="text-center mt-6">
            <button onClick={() => window.close()} className="text-sm font-semibold hover:underline" style={{ color: '#A01E0A' }}>
              Close this window
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="text-center max-w-sm w-full">
        <img src={logoSrc} alt="CEDA" className="h-10 w-auto mx-auto mb-8" />

        {!error ? (
          <>
            <Loader2 size={36} className="animate-spin mx-auto mb-5 text-[#A01E0A]" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">Just a moment…</h1>
            <p className="text-sm text-gray-500">Completing your request.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
              <AlertCircle size={26} className="text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">{error}</p>
            <div className="flex flex-col gap-2 items-center">
              <button
                onClick={() => navigate('/security')}
                className="text-sm font-semibold hover:underline"
                style={{ color: '#A01E0A' }}
              >
                Back to Account Security
              </button>
              <button
                onClick={() => navigate('/sign-in')}
                className="text-xs text-gray-400 hover:underline"
              >
                Back to Log In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

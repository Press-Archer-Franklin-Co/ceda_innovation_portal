import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { authService } from '../services/auth.service'
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

  useEffect(() => {
    const code     = searchParams.get('code')     ?? ''
    const state    = searchParams.get('state')    ?? ''
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
            navigate('/mfa', { replace: true })
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
                onClick={() => navigate('/login')}
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

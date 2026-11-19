import { useEffect, useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { parseApiError } from '../../utils/apiError'

/**
 * "Sign in with CEDA account". Shown only when Platform settings has staff single
 * sign-on switched on and a connection is active (GET /api/platform/public-config/).
 */
export default function StaffSignInButton() {
  const [visible, setVisible] = useState(false)
  const [label, setLabel] = useState('Sign in with CEDA account')
  const [provider, setProvider] = useState('ceda_staff')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    authService
      .getPublicConfig()
      .then(config => {
        if (cancelled) return
        const sso = config.sign_in?.sso
        setVisible(!!sso?.active)
        if (sso?.label) setLabel(sso.label)
        if (sso?.provider) setProvider(sso.provider)
      })
      .catch(() => { if (!cancelled) setVisible(false) })
    return () => { cancelled = true }
  }, [])

  if (!visible) return null

  const start = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await authService.startSocialAuth(provider)
      if (res.authorization_url) {
        sessionStorage.setItem('oauth_provider', provider)
        window.location.href = res.authorization_url
        return
      }
      setError('Could not start CEDA sign-in.')
    } catch (err) {
      setError(parseApiError(err, 'Could not start CEDA sign-in.'))
    }
    setLoading(false)
  }

  return (
    <div className="mb-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-3">{error}</div>
      )}
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:border-[#A01E0A] hover:text-[#A01E0A] disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
        {label}
      </button>
      <div className="relative flex items-center gap-3 mt-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium shrink-0">or use your email</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { authService } from '../services/auth.service'
import { parseApiError } from '../utils/apiError'

export default function MfaChallenge() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pendingMfa, completeMfa, clearPendingMfa, updatePendingMfa } = useAuth()
  const from = (location.state as { from?: string })?.from ?? '/dashboard'

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendWait, setResendWait] = useState(0)
  const [resendMsg, setResendMsg] = useState('')

  useEffect(() => {
    if (!pendingMfa) {
      navigate('/login', { replace: true })
    }
  }, [pendingMfa, navigate])

  useEffect(() => {
    if (resendWait <= 0) return
    const timer = setTimeout(() => setResendWait((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendWait])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingMfa) return
    setError('')
    setLoading(true)
    try {
      await completeMfa(code)
      if (from.startsWith('/staff/')) window.location.href = window.location.origin + from
      else navigate(from, { replace: true })
    } catch (err) {
      setError(parseApiError(err, 'Verification failed. Please check the code and try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!pendingMfa || resendWait > 0) return
    setResendMsg('')
    try {
      const res = await authService.resendMfa(pendingMfa.challenge_id)
      updatePendingMfa({
        challenge_id: res.challenge_id,
        method: res.method,
        email_hint: res.email_hint,
        expires_at: res.expires_at,
      })
      setResendMsg('New code sent. Check your email.')
      setResendWait(45)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not resend the code. Please try again.'))
    }
  }

  if (!pendingMfa) return null

  return (
    <AuthShell mode="signin">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-50">
          <ShieldCheck size={22} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Security check</h1>
        <p className="text-sm text-gray-500">
          {pendingMfa.method === 'email'
            ? `Enter the 6-digit code we sent to ${pendingMfa.email_hint ?? 'your email'}.`
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {resendMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm mb-4">
          {resendMsg}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={e => setCode(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
          />
        </div>

        <Button type="submit" loading={loading} className="w-full py-3 text-sm">
          Verify and continue
        </Button>
      </form>

      <div className="mt-5 text-center text-sm text-gray-500">
        {pendingMfa.method === 'email' && (
          <button
            onClick={handleResend}
            disabled={resendWait > 0}
            className="font-semibold text-[#A01E0A] hover:text-[#F0641E] disabled:opacity-50"
          >
            {resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend code'}
          </button>
        )}
        <div className="mt-3">
          <button
            onClick={() => { clearPendingMfa(); navigate('/login') }}
            className="text-xs text-gray-400 hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </AuthShell>
  )
}

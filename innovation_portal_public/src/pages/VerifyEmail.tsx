import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import logoSrc from '../assets/logo.png'
import { authService } from '../services/auth.service'
import { parseApiError } from '../utils/apiError'
import { tokenStorage } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const token          = searchParams.get('token') ?? ''
  const returnTo       = searchParams.get('return') ?? localStorage.getItem('ceda_post_verify_redirect') ?? '/dashboard'
  const { refreshProfile } = useAuth()

  const [status,    setStatus]    = useState<'loading' | 'success' | 'error' | 'no-token'>('loading')
  const [error,     setError]     = useState('')
  const [countdown, setCountdown] = useState(5)
  const [resendEmail, setResendEmail] = useState('')
  const [resendMsg,   setResendMsg]   = useState('')
  const [resendWait,  setResendWait]  = useState(0)

  useEffect(() => {
    if (!token) { setStatus('no-token'); return }
    authService.verifyEmail(token)
      .then(async (tokens: any) => {
        if (tokens.already_verified) {
          localStorage.removeItem('ceda_post_verify_redirect')
          setStatus('success')
          return
        }
        tokenStorage.setAccess(tokens.access)
        tokenStorage.setRefresh(tokens.refresh)
        await refreshProfile()
        localStorage.removeItem('ceda_post_verify_redirect')
        setStatus('success')
      })
      .catch(err => {
        setError(parseApiError(err, 'Verification failed. The link may have expired or already been used.'))
        setStatus('error')
      })
  }, [token, refreshProfile])

  useEffect(() => {
    if (status !== 'success') return
    if (countdown <= 0) { navigate(returnTo, { replace: true }); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [status, countdown, navigate, returnTo])

  useEffect(() => {
    if (resendWait <= 0) return
    const t = setTimeout(() => setResendWait(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendWait])

  const handleResend = async () => {
    if (resendWait > 0 || !resendEmail) return
    setResendMsg('')
    try {
      await authService.resendVerification(resendEmail)
      setResendMsg('Verification email sent. Please check your inbox.')
      setResendWait(60)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not resend the email. Please try again.'))
    }
  }

  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#A01E0A' }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.8) 1px,transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        <div className="relative flex items-center gap-3">
          <img src={logoSrc} alt="CEDA" className="h-11 w-auto" />
          <div className="w-px h-9 bg-white/25" />
          <div className="flex flex-col leading-none">
            <span style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 24, color: '#fff', lineHeight: 1 }}>ceda</span>
            <span className="text-[10px] font-semibold text-white/50 tracking-[0.05em] mt-[4px]">Innovation Portal</span>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Verifying your<br />email address
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            One click and you're in. We just need to confirm this email belongs to you.
          </p>
        </div>
        <p className="relative text-white/30 text-xs">
          Citizen Entrepreneurial Development Agency (CEDA) {new Date().getFullYear()}
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-3 mb-12 lg:hidden">
            <img src={logoSrc} alt="CEDA" className="h-9 w-auto" />
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col leading-none">
              <span style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 22, color: '#A01E0A', lineHeight: 1 }}>ceda</span>
              <span className="text-[10px] font-semibold text-gray-400 tracking-[0.05em] mt-[4px]">Innovation Portal</span>
            </div>
          </Link>

          {status === 'loading' && (
            <div className="text-center">
              <Loader2 size={36} className="animate-spin mx-auto mb-5 text-[#A01E0A]" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Verifying your email…</h1>
              <p className="text-sm text-gray-500">Please wait a moment.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#A01E0A' }}>
                <CheckCircle2 size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Email verified</h1>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                Your email address has been confirmed. You can now continue with your submission.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                Redirecting in {countdown}s…
              </p>
              <Link
                to={returnTo}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#A01E0A' }}
              >
                Continue now
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
                <AlertCircle size={26} className="text-red-500" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Verification failed</h1>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">{error}</p>
              <div className="flex flex-col gap-3 items-stretch">
                <p className="text-sm font-medium text-gray-700">Request a new verification link:</p>
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
                />
                {resendMsg && (
                  <p className={`text-xs ${resendMsg.startsWith('Verification') ? 'text-green-600' : 'text-red-500'}`}>
                    {resendMsg}
                  </p>
                )}
                <button
                  onClick={handleResend}
                  disabled={resendWait > 0 || !resendEmail}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: '#A01E0A' }}
                >
                  {resendWait > 0 ? `Resend in ${resendWait}s` : 'Send new verification link'}
                </button>
                <Link to="/sign-in" className="text-sm font-semibold hover:underline text-center" style={{ color: '#A01E0A' }}>
                  Back to Log In
                </Link>
              </div>
            </div>
          )}

          {status === 'no-token' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-amber-50">
                <AlertCircle size={26} className="text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid verification link</h1>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                This link is missing a verification token. Please use the link sent to your email.
              </p>
              <Link to="/sign-in" className="text-sm font-semibold hover:underline" style={{ color: '#A01E0A' }}>
                Back to Log In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

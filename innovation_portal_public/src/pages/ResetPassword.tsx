import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
import Button from '../components/ui/Button'
import logoSrc from '../assets/logo.png'
import { authService } from '../services/auth.service'
import { parseApiError } from '../utils/apiError'

export default function ResetPassword() {
  const [searchParams]            = useSearchParams()
  const navigate                  = useNavigate()
  const token                     = searchParams.get('token') ?? ''

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <AlertCircle size={26} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid reset link</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            This link is missing a reset token. Please use the link sent to your email.
          </p>
          <Link to="/forgot-password" className="text-sm font-semibold hover:underline" style={{ color: '#A01E0A' }}>
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!password) { setError('Please enter a new password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await authService.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(parseApiError(err, 'Failed to reset password. The link may have expired.'))
    } finally {
      setLoading(false)
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
            Set a new<br />password
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            Choose a strong password you haven't used before.
          </p>
        </div>
        <p className="relative text-white/30 text-xs">
          Citizen Entrepreneurial Development Agency (CEDA) {new Date().getFullYear()}
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-3 mb-8 lg:hidden">
            <img src={logoSrc} alt="CEDA" className="h-9 w-auto" />
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col leading-none">
              <span style={{ fontFamily: 'Poppins', fontWeight: 900, fontSize: 22, color: '#A01E0A', lineHeight: 1 }}>ceda</span>
              <span className="text-[10px] font-semibold text-gray-400 tracking-[0.05em] mt-[4px]">Innovation Portal</span>
            </div>
          </Link>

          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#A01E0A' }}>
                <CheckCircle2 size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Password updated</h1>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Your password has been reset successfully. Redirecting you to log in...
              </p>
              <Link to="/login" className="text-sm font-semibold hover:underline" style={{ color: '#A01E0A' }}>
                Log in now
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Reset password</h1>
              <p className="text-gray-500 text-sm mb-8">
                Remember it?{' '}
                <Link to="/login" className="font-semibold hover:underline" style={{ color: '#A01E0A' }}>Log in</Link>
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} required placeholder="At least 8 characters"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <input
                    type={showPw ? 'text' : 'password'} required placeholder="Re-enter your password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 ${confirm && password !== confirm ? 'border-red-400' : 'border-gray-200'}`}
                  />
                  {confirm && password !== confirm && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>
                <Button type="submit" loading={loading} className="w-full py-3 text-sm mt-1">
                  Set New Password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

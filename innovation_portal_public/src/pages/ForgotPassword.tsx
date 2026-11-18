import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import Button from '../components/ui/Button'
import logoSrc from '../assets/logo.png'
import { authService } from '../services/auth.service'
import { parseApiError } from '../utils/apiError'

export default function ForgotPassword() {
  const [email,     setEmail]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) { setError('Please enter your email address.'); return }
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      setSubmitted(true)
    } catch (err) {
      setError(parseApiError(err, 'Failed to send reset email. Please try again.'))
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
          backgroundSize: '48px 48px'
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
            Reset your<br />password
          </h2>
          <p className="text-white/65 text-sm leading-relaxed max-w-xs">
            Enter your registered email and we'll send you a link to reset your password.
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

          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#A01E0A' }}>
                <CheckCircle2 size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Check your inbox</h1>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
              </p>
              <Link to="/login" className="text-sm font-semibold hover:underline" style={{ color: '#A01E0A' }}>
                Back to Log In
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Forgot password?</h1>
              <p className="text-gray-500 text-sm mb-8">
                Remembered it?{' '}
                <Link to="/login" className="font-semibold hover:underline" style={{ color: '#A01E0A' }}>Log in</Link>
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input
                    type="email" required placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30"
                  />
                </div>
                <Button type="submit" loading={loading} className="w-full py-3 text-sm mt-1">
                  Send Reset Link
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

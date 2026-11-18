import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle2, XCircle, PencilLine } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import SocialAuthButtons from '../components/ui/SocialAuthButtons'
import AuthShell from '../components/auth/AuthShell'
import { tokenStorage } from '../services/api'
import { parseApiError, parseFieldErrors } from '../utils/apiError'
import { authService } from '../services/auth.service'

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter',       pass: /[A-Z]/.test(password) },
    { label: 'Number',                 pass: /[0-9]/.test(password) },
    { label: 'Special character',      pass: /[^A-Za-z0-9]/.test(password) },
  ]
  const score  = checks.filter(c => c.pass).length
  const colors = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-[#F0641E]']
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${i <= score ? colors[score] : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {checks.map(({ label, pass }) => (
          <li key={label} className="flex items-center gap-1">
            {pass
              ? <CheckCircle2 size={10} className="text-[#F0641E]" />
              : <XCircle size={10} className="text-gray-300" />
            }
            <span className={`text-xs ${pass ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SignUp() {
  const navigate = useNavigate()
  const { signup, refreshProfile, user } = useAuth()

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone_number: '',
    password: '', confirm: '', agree: false,
  })
  const [showPw,      setShowPw]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created,     setCreated]     = useState(false)
  const [resendMsg,   setResendMsg]   = useState('')
  const [resendWait,  setResendWait]  = useState(0)
  const [editingEmail, setEditingEmail] = useState(false)
  const [newEmail,     setNewEmail]     = useState('')
  const [emailSaving,  setEmailSaving]  = useState(false)

  useEffect(() => {
    if (!created) return
    setNewEmail(user?.email ?? form.email)
  }, [created, user?.email, form.email])

  const up = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setError('Please fill in all required fields.')
      return
    }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8)       { setError('Password must be at least 8 characters.'); return }
    if (!form.agree)                     { setError('Please accept the Terms of Use and Privacy Policy.'); return }
    setLoading(true)
    try {
      await signup({
        first_name:   form.first_name,
        last_name:    form.last_name,
        email:        form.email,
        phone_number: form.phone_number || undefined,
        password:     form.password,
      })
      setCreated(true)
    } catch (err) {
      setFieldErrors(parseFieldErrors(err))
      setError(parseApiError(err, 'Registration failed. Please check your details and try again.'))
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30'

  useEffect(() => {
    if (resendWait <= 0) return
    const timer = setTimeout(() => setResendWait((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendWait])

  const handleResend = async () => {
    if (resendWait > 0) return
    setResendMsg('')
    try {
      await authService.resendVerification(user?.email ?? form.email)
      setResendMsg('Verification email sent. Please check your inbox.')
      setResendWait(45)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not resend verification email. Please try again.'))
    }
  }

  const handleEmailChange = async () => {
    if (!newEmail) return
    setEmailSaving(true)
    setResendMsg('')
    try {
      await authService.changeEmail(newEmail)
      await refreshProfile()
      setEditingEmail(false)
      setResendMsg('Email updated. We sent a new verification link.')
      setResendWait(45)
    } catch (err) {
      setResendMsg(parseApiError(err, 'Could not update email. Please try again.'))
    } finally {
      setEmailSaving(false)
    }
  }

  if (created) {
    return (
      <AuthShell mode="register">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 bg-green-50">
            <CheckCircle2 size={26} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Verify your email</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            We sent a verification link to <strong>{user?.email ?? form.email}</strong>. You must verify before submitting ideas.
          </p>
          <p className="text-xs text-gray-400 mb-6">Tip: Check your spam or promotions folder if you don’t see it.</p>

          {resendMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm mb-4">
              {resendMsg}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button onClick={handleResend} disabled={resendWait > 0} className="w-full">
              {resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend verification email'}
            </Button>
            {!editingEmail ? (
              <button
                onClick={() => setEditingEmail(true)}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#A01E0A] hover:text-[#F0641E]"
              >
                <PencilLine size={14} /> Change email address
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={inp}
                  placeholder="new@email.com"
                />
                <div className="flex gap-2">
                  <Button onClick={handleEmailChange} loading={emailSaving} className="flex-1">
                    Update email
                  </Button>
                  <button
                    onClick={() => setEditingEmail(false)}
                    className="flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <Link to="/login" className="text-xs text-gray-400 hover:underline">
              Already verified? Sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell mode="register">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Register</h1>
      <p className="text-sm text-gray-500 mb-8">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold hover:underline" style={{ color: '#A01E0A' }}>
          Sign in
        </Link>
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              className={`${inp} ${fieldErrors.first_name ? 'border-red-400' : ''}`}
              placeholder="Kagiso"
              required
              value={form.first_name}
              onChange={e => up('first_name', e.target.value)}
            />
            {fieldErrors.first_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.first_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              className={`${inp} ${fieldErrors.last_name ? 'border-red-400' : ''}`}
              placeholder="Molefe"
              required
              value={form.last_name}
              onChange={e => up('last_name', e.target.value)}
            />
            {fieldErrors.last_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.last_name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              className={`${inp} ${fieldErrors.email ? 'border-red-400' : ''}`}
              placeholder="you@example.com"
              required
              value={form.email}
              onChange={e => up('email', e.target.value)}
            />
            {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="tel"
              className={`${inp} ${fieldErrors.phone_number ? 'border-red-400' : ''}`}
              placeholder="+267 7X XXX XXX"
              value={form.phone_number}
              onChange={e => up('phone_number', e.target.value)}
            />
            {fieldErrors.phone_number && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone_number}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              placeholder="Create a strong password"
              className={`${inp} pr-10`}
              value={form.password}
              onChange={e => up('password', e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
          <PasswordStrength password={form.password} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            required
            placeholder="Re-enter password"
            className={`${inp} ${form.confirm && form.password !== form.confirm ? 'border-red-400' : ''}`}
            value={form.confirm}
            onChange={e => up('confirm', e.target.value)}
          />
          {form.confirm && form.password !== form.confirm && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
          )}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.agree}
            onChange={e => up('agree', e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded accent-[#A01E0A] shrink-0"
          />
          <span className="text-sm text-gray-600">
            I agree to the{' '}
            <Link
              to="/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={{ color: '#A01E0A' }}
            >
              Terms of Use
            </Link>
            {' '}and{' '}
            <Link
              to="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={{ color: '#A01E0A' }}
            >
              Privacy Policy
            </Link>
          </span>
        </label>

        <Button type="submit" loading={loading} className="w-full py-3 text-sm mt-1">
          Create account
        </Button>
      </form>

      <SocialAuthButtons onSuccess={async (tokens) => {
        tokenStorage.setAccess(tokens.access)
        tokenStorage.setRefresh(tokens.refresh)
        await refreshProfile()
        navigate('/')
      }} />
    </AuthShell>
  )
}

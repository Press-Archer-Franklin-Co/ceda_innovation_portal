import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, LayoutDashboard, Briefcase } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import SocialAuthButtons from '../components/ui/SocialAuthButtons'
import AuthShell from '../components/auth/AuthShell'
import VerificationRequired from '../components/ui/VerificationRequired'
import { tokenStorage } from '../services/api'
import { parseApiError, parseFieldErrors } from '../utils/apiError'
import type { AuthUser } from '../context/AuthContext'

const STAFF_PORTAL_ROLES = [
  'administrator', 'admin',
  'innovation_officer', 'innovation_manager', 'innovation_analyst',
  'staff_member', 'specialist', 'exo', 'management_viewer',
  'judge', 'reviewer',
  'mentor',
]

function hasStaffAccess(roles: string[]) {
  return roles.some(r => STAFF_PORTAL_ROLES.includes(r))
}

function safeNextPath(search: string): string | null {
  const next = new URLSearchParams(search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
  return next
}


function PortalPicker({ user, from }: { user: AuthUser; from: string }) {
  const navigate = useNavigate()

  return (
    <AuthShell mode="signin">
      <div className="text-center mb-6">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto mb-3"
          style={{ background: '#A01E0A' }}
        >
          {(user.first_name.charAt(0) + user.last_name.charAt(0)).toUpperCase()}
        </div>
        <h1 className="text-xl font-extrabold text-gray-900">
          Welcome, {user.first_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Your account has access to multiple portals. Where would you like to go?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate(from, { replace: true })}
          className="group flex flex-col items-center gap-2.5 rounded-2xl border-2 border-gray-100 px-4 py-5 text-center transition-all hover:border-[#A01E0A] hover:bg-[#A01E0A]/5"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-[#A01E0A]/10 flex items-center justify-center transition-colors">
            <LayoutDashboard size={18} className="text-gray-500 group-hover:text-[#A01E0A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-[#A01E0A]">Public Portal</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Innovator dashboard</p>
          </div>
        </button>

        <button
          onClick={() => { window.location.href = window.location.origin + '/staff/dashboard' }}
          className="group flex flex-col items-center gap-2.5 rounded-2xl border-2 border-gray-100 px-4 py-5 text-center transition-all hover:border-[#A01E0A] hover:bg-[#A01E0A]/5"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-[#A01E0A]/10 flex items-center justify-center transition-colors">
            <Briefcase size={18} className="text-gray-500 group-hover:text-[#A01E0A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-[#A01E0A]">Staff Portal</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Staff management</p>
          </div>
        </button>
      </div>
    </AuthShell>
  )
}


export default function Login() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { login, refreshProfile, user: authUser } = useAuth()

  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [showPw,          setShowPw]          = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [fieldErrors,     setFieldErrors]     = useState<Record<string, string>>({})
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [dualRoleUser,    setDualRoleUser]    = useState<AuthUser | null>(null)

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? safeNextPath(location.search) ?? '/'

  function handlePortalRedirect(roles: string[], resolvedUser?: AuthUser) {
    if (from.startsWith('/judge-invite/') || from.startsWith('/specialist-invite/')) {
      navigate(from, { replace: true })
      return
    }
    const isStaff     = hasStaffAccess(roles)
    const isInnovator = roles.includes('innovator')

    if (isStaff && isInnovator) {
      setDualRoleUser(resolvedUser ?? authUser)
      return
    }
    if (isStaff) {
      window.location.href = window.location.origin + (from.startsWith('/staff/') ? from : '/staff/dashboard')
      return
    }
    navigate(from.startsWith('/staff/') ? '/' : from, { replace: true })
  }

  const handleSocialSuccess = async (tokens: { access: string; refresh: string }) => {
    tokenStorage.setAccess(tokens.access)
    tokenStorage.setRefresh(tokens.refresh)
    await refreshProfile()
    navigate(from, { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setUnverifiedEmail(null)
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.status === 'mfa_required') {
        navigate('/mfa', { replace: true, state: { from } })
        return
      }
      if (!result.email_verified) {
        setUnverifiedEmail(email)
        return
      }
      handlePortalRedirect(result.roles)
    } catch (localErr) {
      setFieldErrors(parseFieldErrors(localErr))
      setError(parseApiError(localErr, 'Invalid email or password. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  if (dualRoleUser) {
    return <PortalPicker user={dualRoleUser} from={from} />
  }

  if (unverifiedEmail) {
    return (
      <AuthShell mode="signin">
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Verify your email</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account is active but your email hasn't been verified yet. Verify to access all features.
        </p>
        <VerificationRequired email={unverifiedEmail} />
        <div className="mt-6 text-center">
          <button
            onClick={() => { setUnverifiedEmail(null); navigate(from, { replace: true }) }}
            className="text-sm font-semibold hover:underline"
            style={{ color: '#A01E0A' }}
          >
            Continue to dashboard anyway
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell mode="signin">
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Sign in</h1>
      <p className="text-sm text-gray-500 mb-8">
        Don't have an account?{' '}
        <Link to="/signup" className="font-semibold hover:underline" style={{ color: '#A01E0A' }}>
          Register
        </Link>
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 ${
              fieldErrors.email ? 'border-red-400' : 'border-gray-200'
            }`}
          />
          {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`w-full px-4 py-3 pr-10 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#A01E0A]/30 ${
                fieldErrors.password ? 'border-red-400' : 'border-gray-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
          <div className="flex justify-end mt-1.5">
            <Link
              to="/forgot-password"
              className="text-xs font-medium hover:underline"
              style={{ color: '#A01E0A' }}
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={loading} className="w-full py-3 text-sm mt-1">
          Sign in
        </Button>
      </form>

      <SocialAuthButtons onSuccess={handleSocialSuccess} />
    </AuthShell>
  )
}

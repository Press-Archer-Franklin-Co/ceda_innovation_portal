import React, { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, Lock } from 'lucide-react'
import { useAuth } from '../../lib/auth/AuthContext'
import CedaInnovationHubLogo from '../../components/brand/CedaInnovationHubLogo'


function WorkflowPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.055 }}
    >
      <rect x="40" y="90"  width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>
      <rect x="40" y="175" width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>
      <rect x="40" y="260" width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>
      <rect x="40" y="345" width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>

      <line x1="72" y1="112" x2="72" y2="175" stroke="white" strokeWidth="0.8" strokeDasharray="4 5"/>
      <line x1="72" y1="197" x2="72" y2="260" stroke="white" strokeWidth="0.8" strokeDasharray="4 5"/>
      <line x1="72" y1="282" x2="72" y2="345" stroke="white" strokeWidth="0.8" strokeDasharray="4 5"/>

      <circle cx="72" cy="143" r="3" fill="white"/>
      <circle cx="72" cy="228" r="3" fill="white"/>
      <circle cx="72" cy="313" r="3" fill="white"/>

      <line x1="104" y1="101" x2="200" y2="101" stroke="white" strokeWidth="0.8"/>
      <line x1="104" y1="186" x2="200" y2="186" stroke="white" strokeWidth="0.8"/>
      <line x1="104" y1="271" x2="200" y2="271" stroke="white" strokeWidth="0.8"/>

      <rect x="200" y="90"  width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>
      <rect x="200" y="175" width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>
      <rect x="200" y="260" width="64" height="22" rx="3" fill="none" stroke="white" strokeWidth="0.8"/>

      <line x1="232" y1="112" x2="232" y2="175" stroke="white" strokeWidth="0.8" strokeDasharray="4 5"/>
      <line x1="232" y1="197" x2="232" y2="260" stroke="white" strokeWidth="0.8" strokeDasharray="4 5"/>
      <circle cx="232" cy="143" r="3" fill="white"/>
      <circle cx="232" cy="228" r="3" fill="white"/>

      <polygon points="72,395 90,413 72,431 54,413" fill="none" stroke="white" strokeWidth="0.8"/>
      <line x1="72" y1="367" x2="72" y2="395" stroke="white" strokeWidth="0.8"/>
      <line x1="90" y1="413" x2="160" y2="413" stroke="white" strokeWidth="0.8"/>
      <line x1="54" y1="413" x2="30"  y2="413" stroke="white" strokeWidth="0.8"/>

      <circle cx="340" cy="60"  r="3" fill="none" stroke="white" strokeWidth="1"/>
      <circle cx="340" cy="120" r="2" fill="white"/>
      <line x1="340" y1="63"  x2="340" y2="120" stroke="white" strokeWidth="0.8"/>
      <line x1="340" y1="120" x2="380" y2="120" stroke="white" strokeWidth="0.8"/>
      <circle cx="380" cy="120" r="2" fill="none" stroke="white" strokeWidth="1"/>

      <circle cx="360" cy="480" r="3" fill="none" stroke="white" strokeWidth="1"/>
      <line x1="360" y1="480" x2="360" y2="520" stroke="white" strokeWidth="0.8"/>
      <line x1="360" y1="520" x2="300" y2="520" stroke="white" strokeWidth="0.8"/>

      <polygon
        points="360,30 373,22 386,30 386,46 373,54 360,46"
        fill="none" stroke="white" strokeWidth="0.7"
      />
      <polygon
        points="300,400 313,392 326,400 326,416 313,424 300,416"
        fill="none" stroke="white" strokeWidth="0.7"
      />
    </svg>
  )
}


const SYSTEM_INFO = [
  { label: 'Environment',  value: 'Production' },
  { label: 'Access Level', value: 'Role-based (RBAC)' },
  { label: 'Sessions',     value: 'Monitored & logged' },
]


export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()

  if (user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F2F5' }}>

      <div
        className="hidden lg:flex lg:w-[420px] flex-col justify-between p-10 flex-shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #021a0e 0%, #3E2922 45%, #5A3C32 100%)' }}
      >
        <div className="absolute inset-0 ops-grid-dark" />

        <WorkflowPattern />

        <div className="relative z-10">
          <CedaInnovationHubLogo tone="dark" />
          <div className="mt-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ceda-green animate-pulse-dot" />
            <span className="text-white/35 text-[10px] font-mono tracking-widest uppercase">
              System Operational
            </span>
          </div>
        </div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 bg-white/5 mb-6">
            <ShieldCheck size={11} className="text-ceda-green flex-shrink-0" />
            <span className="text-white/45 text-[10px] font-mono tracking-widest uppercase">
              Authorized Personnel Only
            </span>
          </div>

          <h2 className="text-white font-bold text-[22px] leading-snug mb-3">
            Innovation Programs<br />Management System
          </h2>
          <p className="text-white/40 text-xs leading-relaxed max-w-[260px]">
            Staff workspace for program officers, evaluation committee members, and system administrators.
          </p>

          <div className="mt-8 border border-white/10 rounded-lg overflow-hidden">
            {SYSTEM_INFO.map(({ label, value }, i) => (
              <div
                key={label}
                className="flex items-center justify-between px-4 py-2.5 text-xs border-b border-white/8 last:border-0"
                style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent' }}
              >
                <span className="text-white/30 font-mono">{label}</span>
                <span className="text-white/55 font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/18 text-[10px] font-mono">
          © {new Date().getFullYear()} Citizen Entrepreneurial Development Agency (CEDA) &nbsp;·&nbsp; Confidential
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          <div className="mb-8 lg:hidden">
            <CedaInnovationHubLogo tone="light" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-ceda-forest flex items-center justify-center">
                  <Lock size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-mono tracking-widest uppercase text-ceda-muted">
                    Staff Access
                  </p>
                  <p className="text-xs font-semibold text-ceda-dark">Secure Sign-In</p>
                </div>
              </div>
              <h1 className="text-xl font-bold text-ceda-dark">Welcome back</h1>
              <p className="text-sm text-ceda-muted mt-0.5">
                Enter your credentials to access the system.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="staff@ceda.co.bw"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ceda-muted hover:text-ceda-dark transition-colors"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-ceda-red-pale text-ceda-red text-sm border border-ceda-red/15">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="btn-primary w-full justify-center py-2.5 mt-1"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? 'Authenticating…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-ceda-border">
              <p className="text-center text-xs text-ceda-muted">
                Having trouble accessing your account?{' '}
                <span className="text-ceda-forest font-medium">Contact your system administrator.</span>
              </p>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
            <ShieldCheck size={11} className="text-gray-400" />
            All sessions are monitored and activity is logged
          </p>
        </div>
      </div>
    </div>
  )
}

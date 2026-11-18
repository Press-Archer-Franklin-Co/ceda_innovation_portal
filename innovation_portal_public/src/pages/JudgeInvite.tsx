import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ClipboardCheck, Loader2 } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import logoSrc from '../assets/logo.png'

interface JudgeInviteDetails {
  name: string
  email: string
  program_title: string
  marking_closes_at: string | null
  accepted: boolean
  marking_closed: boolean
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JudgeInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth()
  const [invite, setInvite] = useState<JudgeInviteDetails | null>(null)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    api.get(`/programs/judge-invite/${token}/`)
      .then(res => setInvite(res.data?.data ?? res.data))
      .catch(() => setError('This judging link is not valid. Please check the link in your email.'))
  }, [token])

  useEffect(() => {
    if (!invite || invite.marking_closed || authLoading || !isAuthenticated || attempted.current) return
    attempted.current = true
    setAccepting(true)
    api.post(`/programs/judge-invite/${token}/`)
      .then(res => {
        const next = (res.data?.data ?? res.data)?.next ?? '/staff/assignments'
        window.location.href = window.location.origin + next
      })
      .catch(err => {
        const data = err.response?.data
        setError(data?.detail ?? (Array.isArray(data) ? data[0] : undefined) ?? 'We could not open your marking page. Please try again.')
        setAccepting(false)
      })
  }, [invite, authLoading, isAuthenticated, token])

  const signIn = () => navigate('/login', { state: { from: { pathname: `/judge-invite/${token}` } } })

  if (error) {
    const wrongAccount = isAuthenticated && invite && user?.email?.toLowerCase() !== invite.email
    return (
      <Shell>
        <AlertCircle size={36} className="mx-auto mb-4 text-red-500" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Can't open marking</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{error}</p>
        {wrongAccount && (
          <button onClick={() => { logout().then(signIn) }} className="btn-dark w-full mb-3">
            Sign out and use {invite.email}
          </button>
        )}
        <Link to="/" className="text-sm font-semibold text-[#A01E0A] hover:underline">Go to Home</Link>
      </Shell>
    )
  }

  if (!invite || authLoading || accepting) {
    return (
      <Shell>
        <Loader2 size={32} className="animate-spin mx-auto mb-4 text-[#A01E0A]" />
        <p className="text-sm text-gray-500">{accepting ? 'Opening your marking page…' : 'Loading your invitation…'}</p>
      </Shell>
    )
  }

  if (invite.marking_closed) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Marking has closed</h1>
        <p className="text-sm text-gray-500">Marking for {invite.program_title} is closed. Thank you for judging.</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="w-14 h-14 rounded-full bg-[#A01E0A] flex items-center justify-center mx-auto mb-6">
        <ClipboardCheck size={24} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Judging invitation</h1>
      <p className="text-sm text-gray-500 mb-6">
        Hi {invite.name}, you've been invited to judge <strong className="text-gray-800">{invite.program_title}</strong>.
      </p>
      {invite.marking_closes_at && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6 text-left">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Marking closes</p>
          <p className="text-sm font-semibold text-gray-900">{formatDateTime(invite.marking_closes_at)}</p>
        </div>
      )}
      <button onClick={signIn} className="btn-dark w-full mb-3">Sign in to start marking</button>
      <p className="text-xs text-gray-500 leading-relaxed">
        Sign in with <strong>{invite.email}</strong>. CEDA staff use their normal CEDA login.
        First time here? <Link to="/signup" className="font-semibold text-[#A01E0A] hover:underline">Create an account</Link> with that
        email, then open this link again.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="text-center max-w-sm w-full">
        <img src={logoSrc} alt="CEDA" className="h-10 w-auto mx-auto mb-8" />
        {children}
      </div>
    </div>
  )
}

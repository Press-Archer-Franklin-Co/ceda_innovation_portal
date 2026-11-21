import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, AlertCircle, Loader2, Mail, FileText } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import logoSrc from '../assets/logo.png'

interface InviteDetails {
  id: string
  invitee_name: string
  invitee_email: string
  submission_title: string
  program_title: string
  message: string
  status: string
  is_expired: boolean
  expires_at: string
}

type PageState = 'loading' | 'ready' | 'claiming' | 'success' | 'error' | 'already_done'

export default function SpecialistInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setPageState('error')
      setErrorMsg('Invalid invitation link.')
      return
    }
    api.get(`/assignments/specialist-invite/${token}/`)
      .then(res => {
        const data: InviteDetails = res.data?.data ?? res.data
        if (data.is_expired) {
          setPageState('error')
          setErrorMsg('This invitation link has expired.')
          return
        }
        if (data.status !== 'pending') {
          setPageState('already_done')
          setInvite(data)
          return
        }
        setInvite(data)
        setPageState('ready')
      })
      .catch(err => {
        const msg = err.response?.status === 404
          ? 'This invitation link is invalid or has already been used.'
          : 'Unable to load invitation. Please try again.'
        setPageState('error')
        setErrorMsg(msg)
      })
  }, [token])

  const handleAccept = () => {
    if (!isAuthenticated) {
      sessionStorage.setItem('specialist_invite_token', token ?? '')
      navigate('/sign-in', { state: { from: { pathname: `/specialist-invite/${token}` } } })
      return
    }
    claimInvite()
  }

  const claimInvite = () => {
    setPageState('claiming')
    api.post(`/assignments/specialist-invite/${token}/claim/`)
      .then(() => setPageState('success'))
      .catch(err => {
        const data = err.response?.data
        const msg = data?.detail
          ?? data?.non_field_errors?.[0]
          ?? (Array.isArray(data) ? data[0] : undefined)
          ?? 'Failed to accept invitation. Please try again.'
        setPageState('error')
        setErrorMsg(msg)
      })
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated && pageState === 'ready' && invite?.status === 'pending') {
      const pending = sessionStorage.getItem('specialist_invite_token')
      if (pending === token) {
        sessionStorage.removeItem('specialist_invite_token')
        claimInvite()
      }
    }
  }, [isAuthenticated, authLoading, pageState])

  if (pageState === 'loading' || authLoading) {
    return (
      <Shell>
        <Loader2 size={36} className="animate-spin mx-auto mb-5 text-[#A01E0A]" />
        <p className="text-sm text-gray-500">Validating invitation…</p>
      </Shell>
    )
  }

  if (pageState === 'error') {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <AlertCircle size={26} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation Unavailable</h1>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{errorMsg}</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm font-semibold hover:underline"
          style={{ color: '#A01E0A' }}
        >
          Go to Home
        </button>
      </Shell>
    )
  }

  if (pageState === 'already_done') {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={26} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Already Accepted</h1>
        <p className="text-sm text-gray-500 mb-6">
          You have already accepted this specialist invitation for{' '}
          <span className="font-medium text-gray-800">{invite?.submission_title}</span>.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm font-semibold hover:underline"
          style={{ color: '#A01E0A' }}
        >
          Go to Dashboard
        </button>
      </Shell>
    )
  }

  if (pageState === 'success') {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={26} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">You're in!</h1>
        <p className="text-sm text-gray-500 mb-2 leading-relaxed">
          You've accepted the specialist reviewer role for:
        </p>
        <p className="text-base font-semibold text-gray-900 mb-1">{invite?.submission_title}</p>
        <p className="text-sm text-gray-500 mb-6">{invite?.program_title}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#A01E0A' }}
        >
          Go to Dashboard
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{ background: '#A01E0A' }}>
        <Mail size={24} className="text-white" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Specialist Review Invitation</h1>
      <p className="text-sm text-gray-500 mb-6">
        You've been invited to review a submission as a specialist.
      </p>

      <div className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6 text-left space-y-3">
        <div className="flex items-start gap-3">
          <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Submission</p>
            <p className="text-sm font-semibold text-gray-900">{invite?.submission_title}</p>
            <p className="text-xs text-gray-500">{invite?.program_title}</p>
          </div>
        </div>

        {invite?.message && (
          <div className="border-t border-gray-200 pt-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-1">Message from organiser</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{invite.message}</p>
          </div>
        )}
      </div>

      {!isAuthenticated && (
        <p className="text-xs text-gray-400 mb-4">
          You'll be asked to sign in before accepting.
        </p>
      )}

      <button
        onClick={handleAccept}
        disabled={pageState === 'claiming'}
        className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: '#A01E0A' }}
      >
        {pageState === 'claiming' ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Accepting…
          </span>
        ) : (
          'Accept Invitation'
        )}
      </button>

      <button
        onClick={() => navigate('/')}
        className="mt-3 text-xs text-gray-400 hover:underline"
      >
        Decline — go to home
      </button>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="text-center max-w-sm w-full">
        <img src={logoSrc} alt="CEDA" className="h-10 w-auto mx-auto mb-8" />
        {children}
      </div>
    </div>
  )
}

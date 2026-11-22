import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, FileText, MessageCircle } from 'lucide-react'
import api from '../services/api'
import { unwrapData } from '../services/envelope'
import { useAuth } from '../context/AuthContext'
import { InviteActions, InvitePage, InviteRow, InviteRows } from '../components/invite/InviteCard'
import { StatusScreen } from '../components/status/StatusScreen'
import { buttonClasses } from '../components/ui/Button'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { useI18n } from '../i18n'
import { formatDate } from '../lib/dates'
import { usePageTitle } from '../lib/usePageTitle'

// Figma 1.15 (138:3382 / 138:3716), the same invitation card for a specialist asked to review one idea.
// Accept continues to the one sign-in page (2.0) and lands on the person's work list.
// Decline shows once the API can record it (can_decline, R-50).

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
  can_decline?: boolean
}

type State = 'ready' | 'accepted' | 'declined'

export default function SpecialistInvite() {
  const { token = '' } = useParams<{ token: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [state, setState] = useState<State>('ready')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const autoAccepted = useRef(false)
  usePageTitle(t('invite.specialistTitle'))

  useEffect(() => {
    api.get(`/assignments/specialist-invite/${token}/`)
      .then((res) => setInvite(unwrapData<InviteDetails>(res.data)))
      .catch(() => setLoadFailed(true))
  }, [token])

  const accept = async () => {
    if (!isAuthenticated) {
      navigate(`/sign-in?next=${encodeURIComponent(`/specialist-invite/${token}?accept=1`)}`)
      return
    }
    setAccepting(true)
    setAcceptError('')
    try {
      await api.post(`/assignments/specialist-invite/${token}/claim/`)
      setState('accepted')
    } catch (err) {
      const data = (err as { response?: { data?: { detail?: string; errors?: { detail?: string } } } }).response?.data
      setAcceptError(data?.errors?.detail ?? data?.detail ?? t('invite.acceptError'))
    } finally {
      setAccepting(false)
    }
  }

  useEffect(() => {
    if (autoAccepted.current || params.get('accept') !== '1' || !invite || invite.is_expired || invite.status !== 'pending' || authLoading || !isAuthenticated) return
    autoAccepted.current = true
    void accept()
  }, [invite, authLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const home = <Link to="/" className={buttonClasses({ variant: 'secondary' })}>{t('notFound.home')}</Link>
  const work = <Link to="/dashboard" className={buttonClasses({ variant: 'primary' })}>{t('invite.goDashboard')}</Link>

  if (loadFailed) return <StatusScreen title={t('invite.loadError')} body={t('invite.loadErrorBody')}>{home}</StatusScreen>
  if (!invite || authLoading) {
    return (
      <InvitePage title={t('invite.specialistTitle')}>
        <div aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-6 w-56" />
          <SkeletonText lines={4} />
        </div>
      </InvitePage>
    )
  }
  if (invite.is_expired) return <StatusScreen title={t('invite.expired')} body={t('invite.loadErrorBody')}>{home}</StatusScreen>
  if (state === 'accepted') return <StatusScreen title={t('invite.specialistAccepted')} body={t('invite.specialistAcceptedBody')}>{work}</StatusScreen>
  if (state === 'declined' || invite.status === 'declined') return <StatusScreen title={t('invite.declined')} body={t('invite.declinedBody')} />
  if (invite.status !== 'pending') return <StatusScreen title={t('invite.specialistDone')} body={invite.submission_title}>{work}</StatusScreen>

  const rows: InviteRow[] = [{ icon: FileText, text: t('invite.specialistIdea', { title: invite.submission_title }) }]
  if (invite.expires_at) rows.push({ icon: CalendarDays, text: t('invite.specialistDue', { date: formatDate(invite.expires_at, lang) }) })
  rows.push({ icon: MessageCircle, text: t('invite.comments') })

  return (
    <InvitePage title={t('invite.specialistTitle')} subtitle={invite.program_title}>
      <InviteRows rows={rows} note={t('invite.conflict')} />
      {invite.message && (
        <div className="flex flex-col gap-1">
          <p className="text-d-label-s text-muted">{t('invite.message')}</p>
          <p className="text-d-body-s text-text whitespace-pre-line">{invite.message}</p>
        </div>
      )}
      {!isAuthenticated && <p className="text-d-cap text-muted">{t('invite.signInAs', { email: invite.invitee_email })}</p>}
      {acceptError && <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-d-body-s text-danger">{acceptError}</p>}
      <InviteActions
        acceptLabel={isAuthenticated ? t('invite.accept') : t('invite.acceptSignIn')}
        accepting={accepting}
        onAccept={accept}
        onDecline={
          invite.can_decline
            ? async (reason) => {
                await api.post(`/assignments/specialist-invite/${token}/decline/`, { reason })
                setState('declined')
              }
            : undefined
        }
      />
    </InvitePage>
  )
}

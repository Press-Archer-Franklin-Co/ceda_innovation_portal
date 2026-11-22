import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, MessageCircle, Star } from 'lucide-react'
import api from '../services/api'
import { unwrapData } from '../services/envelope'
import { useAuth } from '../context/AuthContext'
import { InviteActions, InvitedBy, InvitePage, InviteRow, InviteRows } from '../components/invite/InviteCard'
import { StatusScreen } from '../components/status/StatusScreen'
import Button, { buttonClasses } from '../components/ui/Button'
import Skeleton, { SkeletonText } from '../components/ui/Skeleton'
import { useI18n } from '../i18n'
import { formatDate } from '../lib/dates'
import { usePageTitle } from '../lib/usePageTitle'

// Figma 1.15 Judge invitation (138:3382 website, 138:3716 phone). From the invitation email or SMS link.
// Accept continues to the one sign-in page (2.0) and lands on Judging (3.17, /staff/judging).
// Fields marked R-50 are coming from the backend lane; each row shows only once its field is there.

interface JudgeInviteDetails {
  name: string
  email: string
  program_title: string
  marking_closes_at: string | null
  accepted: boolean
  marking_closed: boolean
  // R-50
  invited_by?: { name: string; role_label?: string } | null
  invited_at?: string | null
  idea_count?: number | null
  criteria_count?: number | null
  marking_opens_at?: string | null
  declined?: boolean
  can_decline?: boolean
}

const JUDGING_PATH = '/staff/judging'

export default function JudgeInvite() {
  const { token = '' } = useParams<{ token: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth()
  const [invite, setInvite] = useState<JudgeInviteDetails | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const [declined, setDeclined] = useState(false)
  const autoAccepted = useRef(false)
  usePageTitle(t('invite.judgeTitle'))

  useEffect(() => {
    api.get(`/programs/judge-invite/${token}/`)
      .then((res) => setInvite(unwrapData<JudgeInviteDetails>(res.data)))
      .catch(() => setLoadFailed(true))
  }, [token])

  const accept = async () => {
    if (!isAuthenticated) {
      // Back here after signing in, then accepted straight away.
      navigate(`/sign-in?next=${encodeURIComponent(`/judge-invite/${token}?accept=1`)}`)
      return
    }
    setAccepting(true)
    setAcceptError('')
    try {
      await api.post(`/programs/judge-invite/${token}/`)
      window.location.href = window.location.origin + JUDGING_PATH
    } catch (err) {
      const data = (err as { response?: { data?: { detail?: string; errors?: { detail?: string } } } }).response?.data
      setAcceptError(data?.errors?.detail ?? data?.detail ?? t('invite.acceptError'))
      setAccepting(false)
    }
  }

  useEffect(() => {
    if (autoAccepted.current || params.get('accept') !== '1' || !invite || invite.marking_closed || authLoading || !isAuthenticated) return
    autoAccepted.current = true
    void accept()
  }, [invite, authLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadFailed) {
    return (
      <StatusScreen title={t('invite.loadError')} body={t('invite.loadErrorBody')}>
        <Link to="/" className={buttonClasses({ variant: 'secondary' })}>{t('notFound.home')}</Link>
      </StatusScreen>
    )
  }

  if (!invite || authLoading) {
    return (
      <InvitePage title={t('invite.judgeTitle')}>
        <div aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <SkeletonText lines={4} />
        </div>
      </InvitePage>
    )
  }

  if (invite.marking_closed) {
    return <StatusScreen title={t('invite.closed')} body={t('invite.closedBody', { programme: invite.program_title })} />
  }

  if (declined || invite.declined) {
    return <StatusScreen title={t('invite.declined')} body={t('invite.declinedBody')} />
  }

  const rows: InviteRow[] = []
  if (invite.idea_count) {
    rows.push({ icon: Star, text: invite.criteria_count ? t('invite.score', { ideas: invite.idea_count, criteria: invite.criteria_count }) : t('invite.scoreIdeas', { ideas: invite.idea_count }) })
  } else {
    rows.push({ icon: Star, text: t('invite.scoreAll') })
  }
  if (invite.marking_opens_at && invite.marking_closes_at) {
    rows.push({ icon: CalendarDays, text: t('invite.window', { from: formatDate(invite.marking_opens_at, lang), to: formatDate(invite.marking_closes_at, lang) }) })
  } else if (invite.marking_closes_at) {
    rows.push({ icon: CalendarDays, text: t('invite.until', { date: formatDate(invite.marking_closes_at, lang) }) })
  }
  rows.push({ icon: MessageCircle, text: t('invite.comments') })

  const wrongAccount = isAuthenticated && user?.email?.toLowerCase() !== invite.email.toLowerCase()

  return (
    <InvitePage title={t('invite.judgeTitle')} subtitle={invite.program_title}>
      {invite.invited_by?.name && (
        <InvitedBy name={invite.invited_by.name} role={invite.invited_by.role_label} invitedOn={invite.invited_at ? formatDate(invite.invited_at, lang) : undefined} />
      )}
      <InviteRows rows={rows} note={t('invite.conflict')} />
      {!isAuthenticated && <p className="text-d-cap text-muted">{t('invite.signInAs', { email: invite.email })}</p>}
      {(acceptError || wrongAccount) && (
        <div role="alert" className="flex flex-col gap-2 rounded-control bg-danger-soft px-4 py-3 text-d-body-s text-danger">
          <p>{wrongAccount ? t('invite.wrongAccount', { email: invite.email }) : acceptError}</p>
          {wrongAccount && (
            <Button size="sm" variant="secondary" className="self-start" onClick={() => logout().then(() => navigate(`/sign-in?next=${encodeURIComponent(`/judge-invite/${token}?accept=1`)}`))}>
              {t('invite.signOutUse', { email: invite.email })}
            </Button>
          )}
        </div>
      )}
      <InviteActions
        acceptLabel={isAuthenticated ? t('invite.accept') : t('invite.acceptSignIn')}
        accepting={accepting}
        onAccept={accept}
        onDecline={
          invite.can_decline
            ? async (reason) => {
                await api.post(`/programs/judge-invite/${token}/decline/`, { reason })
                setDeclined(true)
              }
            : undefined
        }
      />
    </InvitePage>
  )
}

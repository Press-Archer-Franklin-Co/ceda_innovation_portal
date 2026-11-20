import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, LinkIcon, MailX } from 'lucide-react'
import EmptyState, { ErrorState } from '../components/ui/EmptyState'
import { buttonClasses } from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import { useI18n } from '../i18n'
import { subscriptionsService, type LinkOutcome } from '../services/subscriptions.service'

// The two links in update emails (B6 part 2): /subscribe/confirm/<token> confirms an email sign-up and
// /unsubscribe/<token> stops updates. Each opens once; a used or wrong link says so instead of an error.

export default function SubscriptionLink({ action }: { action: 'confirm' | 'unsubscribe' }) {
  const { t } = useI18n()
  const { token = '' } = useParams()
  const [outcome, setOutcome] = useState<LinkOutcome | 'loading'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setOutcome('loading')
    const follow = action === 'confirm' ? subscriptionsService.confirm : subscriptionsService.unsubscribe
    follow(token).then((result) => alive && setOutcome(result))
    return () => { alive = false }
  }, [action, token, attempt])

  const home = <Link to="/news" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('subLink.toNews')}</Link>

  return (
    <div className="max-w-[640px] mx-auto px-4 py-12 sm:py-20">
      <h1 className="sr-only">{action === 'confirm' ? t('subLink.confirmTitle') : t('subLink.unsubTitle')}</h1>
      {outcome === 'loading' ? (
        <div aria-busy="true" aria-label={t('subLink.working')} className="flex flex-col items-center gap-3 rounded-card border border-border p-10">
          <Skeleton className="w-12 h-12 rounded-full" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      ) : outcome === 'error' || outcome === 'busy' ? (
        <ErrorState
          title={t('subLink.errorTitle')}
          body={outcome === 'busy' ? t('subLink.busyBody') : t('subLink.errorBody')}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : outcome === 'invalid' ? (
        <EmptyState icon={LinkIcon} title={t('subLink.invalidTitle')} body={t('subLink.invalidBody')}>{home}</EmptyState>
      ) : action === 'confirm' ? (
        <div role="status">
          <EmptyState icon={CheckCircle2} title={t('subLink.confirmedTitle')} body={t('subLink.confirmedBody')}>{home}</EmptyState>
        </div>
      ) : (
        <div role="status">
          <EmptyState icon={MailX} title={t('subLink.unsubscribedTitle')} body={t('subLink.unsubscribedBody')}>{home}</EmptyState>
        </div>
      )}
    </div>
  )
}

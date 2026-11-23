import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { MessageCircle, Plus, RadioTower } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'
import ConnectionCard from '../../components/channels/ConnectionCard'
import ConnectionSetup from '../../components/channels/ConnectionSetup'
import { useChannelConnections, useChannelStatus } from '../../lib/queries/channels'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n } from '../../i18n/context'
import { useTrigger } from '../../components/ui/useTrigger'

// Drill-down from the status cards on 3.33: the connections of one channel. Staff add a provider, enter and
// change its keys, test, activate, turn off and make a new webhook address here, with no developer.
// Several connections may exist (for example "Twilio Sandbox" and "Twilio production").

export default function ChannelConnections() {
  // Add opens out of the button used; Edit (a card's button or menu) out of the control just pressed.
  const setupTrigger = useTrigger()
  const { kind } = useParams()
  const { t } = useI18n()
  const { can } = useAuth()
  const { data, isLoading, isError, error, refetch, isFetching } = useChannelConnections({ kind })
  const status = useChannelStatus()
  const [setup, setSetup] = useState(null) // { id, step } or { id: null, step: 0 }
  if (kind !== 'ussd' && kind !== 'whatsapp') return <Navigate to="/channels" replace />
  const Icon = kind === 'ussd' ? RadioTower : MessageCircle
  const list = data ?? []
  const switchOff = status.data && !status.data[kind]?.switch_on
  const addLabel = t(kind === 'ussd' ? 'ch.conn.addOperator' : 'ch.conn.addNumber')

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t(`ch.conn.crumb.${kind}`)}</span>}
        title={t(`ch.conn.title.${kind}`)}
        subtitle={t(`ch.conn.subtitle.${kind}`)}
        actions={<Button icon={<Plus size={16} />} onClick={(e) => { setupTrigger.from(e); setSetup({ id: null, step: 0 }) }}>{addLabel}</Button>}
      />
      {switchOff && (
        <p className="mb-4 rounded-control bg-surface2 px-3 py-2 text-sm text-muted">
          {t('ch.conn.switchOff')}{' '}
          {can('settings.manage') && <Link to="/admin/platform?tab=features" className="underline text-text">{t('ch.state.turnOn')}</Link>}
        </p>
      )}
      {isLoading ? (
        <SkeletonCards count={2} />
      ) : isError ? (
        <ErrorState framed title={t('ch.conn.loadFailed')} message={error?.message} onRetry={refetch} retrying={isFetching} />
      ) : list.length === 0 ? (
        <EmptyState framed icon={Icon} title={t(`ch.conn.empty.${kind}`)} message={t(`ch.conn.emptyBody.${kind}`)}
          action={<Button size="sm" icon={<Plus size={14} />} onClick={(e) => { setupTrigger.from(e); setSetup({ id: null, step: 0 }) }}>{addLabel}</Button>} />
      ) : (
        <div className="grid gap-3.5 xl:grid-cols-2">
          {list.map((c) => <ConnectionCard key={c.id} connection={c} onEdit={(conn) => { setupTrigger.ref.current = null; setSetup({ id: conn.id, step: 1 }) }} />)}
        </div>
      )}
      <ConnectionSetup kind={kind} open={!!setup} connectionId={setup?.id} startStep={setup?.step ?? 0} onClose={() => setSetup(null)} triggerRef={setupTrigger.ref} />
    </div>
  )
}

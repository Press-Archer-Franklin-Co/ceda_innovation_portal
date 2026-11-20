import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, PowerOff } from 'lucide-react'
import Skeleton from '../ui/Skeleton'
import { useChannelStatus } from '../../lib/queries/channels'
import { useAuth } from '../../lib/auth/AuthContext'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'

const LOOK = {
  live: { icon: CheckCircle2, cls: 'bg-success-soft text-success' },
  switched_off: { icon: PowerOff, cls: 'bg-surface2 text-muted' },
  waiting_for_provider: { icon: Clock, cls: 'bg-warning-soft text-warning' },
}

/** One line per channel: live, switched off, or waiting for provider details. */
export default function ChannelStatusBanner({ className }) {
  const t = useT()
  const { can } = useAuth()
  const { data, isLoading, isError } = useChannelStatus()
  if (isLoading) return <Skeleton className={cn('h-9 w-full', className)} />
  if (isError || !data) return null
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {['ussd', 'whatsapp'].map((channel) => {
        const state = data[channel]?.state
        const look = LOOK[state]
        if (!look) return null
        const Icon = look.icon
        return (
          <p key={channel} className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control px-3 py-2 text-sm', look.cls)}>
            <Icon size={15} aria-hidden className="shrink-0" />
            <span className="font-bold">{t(`ch.channel.${channel}`)}:</span>
            <span>{t(`ch.state.${state}`)}</span>
            {state === 'waiting_for_provider' && <Link to="/channels/connections" className="underline">{t('ch.state.addConnection')}</Link>}
            {state === 'switched_off' && can('settings.manage') && <Link to="/admin/platform?tab=features" className="underline">{t('ch.state.turnOn')}</Link>}
          </p>
        )
      })}
    </div>
  )
}

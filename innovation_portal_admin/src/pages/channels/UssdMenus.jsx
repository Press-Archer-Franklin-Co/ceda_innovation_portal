import { Link, useParams } from 'react-router-dom'
import Skeleton from '../../components/ui/Skeleton'
import { buttonClasses } from '../../components/ui/buttonClasses'
import FlowEditor from '../../components/channels/FlowEditor'
import JourneysPage from '../../components/channels/JourneysPage'
import { useChannelConnections } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'

// 3.31 USSD menus (Figma 137:1319 website, 137:1696 phone), split like WhatsApp flows: /channels/ussd lists the
// menus; /channels/ussd/:id is the editor with the branching diagram. Each screen shows its 160-character count.

function MenuSettings({ journeyId }) {
  const { t } = useI18n()
  const { data, isLoading, isError } = useChannelConnections({ kind: 'ussd' })
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return null
  const running = (data ?? []).filter((c) => c.journey?.id === journeyId)
  return (
    <section aria-label={t('ch.ussd.settings')} className="rounded-card bg-surface2 px-3.5 py-3 text-d-cap">
      <p className="font-bold text-muted mb-1.5">{t('ch.ussd.settings')}</p>
      {running.length === 0 ? (
        <p className="text-muted">{t('ch.ussd.noConnection')} <Link className="text-primary underline" to="/channels/connections/ussd">{t('ch.ussd.addConnection')}</Link></p>
      ) : (
        <dl className="space-y-1">
          {running.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr,auto] gap-x-3">
              <dt className="text-muted">{t('ch.ussd.shortCode')}</dt><dd className="text-text text-right">{c.address || c.name}</dd>
              <dt className="text-muted">{t('ch.ussd.sessionEnds')}</dt><dd className="text-text text-right">{t('ch.ussd.seconds', { count: c.config?.session_timeout ?? 60 })}</dd>
              <dt className="text-muted">{t('ch.ussd.connection')}</dt><dd className="text-text text-right"><Link className="underline" to="/channels/connections/ussd">{c.name}</Link></dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export default function UssdMenus() {
  const { id } = useParams()
  const { t } = useI18n()
  if (!id) return <JourneysPage channel="ussd" />
  return (
    <FlowEditor
      id={id}
      channel="ussd"
      basePath="/channels/ussd"
      extra={<MenuSettings journeyId={id} />}
      actions={<Link to={`/channels/try?journey=${id}&look=ussd`} className={buttonClasses({ variant: 'link', size: 'sm' })}>{t('ch.ussd.openSimulator')}</Link>}
    />
  )
}

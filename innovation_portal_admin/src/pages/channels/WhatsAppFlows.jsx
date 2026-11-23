import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Megaphone } from 'lucide-react'
import Skeleton from '../../components/ui/Skeleton'
import { buttonClasses } from '../../components/ui/buttonClasses'
import FlowEditor from '../../components/channels/FlowEditor'
import JourneysPage from '../../components/channels/JourneysPage'
import { useChannelConnections } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'

// 3.31b WhatsApp flows (Figma 145:1608 website, 145:2060 phone), now two pages: /channels/whatsapp lists every
// flow; /channels/whatsapp/:id is the flow editor on the full width, with the branching diagram as the canvas
// and the selected step's settings in the sticky panel. Message templates stay on the connection.

function TemplatesCard() {
  const { t } = useI18n()
  const { data, isLoading, isError } = useChannelConnections({ kind: 'whatsapp' })
  if (isLoading) return <Skeleton className="h-16 w-full" />
  if (isError) return null
  const list = data ?? []
  const missing = new Set(list.flatMap((c) => c.templates_missing ?? []))
  const set = list.reduce((sum, c) => sum + Object.keys(c.config?.templates ?? {}).filter((k) => c.config.templates[k]).length, 0)
  return (
    <Link to="/channels/connections/whatsapp" className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3 hover:bg-surface2">
      <Megaphone size={18} aria-hidden className="text-muted shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-text">{t('ch.wa.templates')}</span>
        <span className="block text-d-cap text-muted">{list.length ? t('ch.wa.templatesCount', { set, missing: missing.size }) : t('ch.wa.noNumber')}</span>
      </span>
      <ChevronRight size={16} aria-hidden className="text-muted" />
    </Link>
  )
}

export default function WhatsAppFlows() {
  const { id } = useParams()
  const { t } = useI18n()
  if (!id) return <JourneysPage channel="whatsapp" />
  return (
    <FlowEditor
      id={id}
      channel="whatsapp"
      basePath="/channels/whatsapp"
      extra={<TemplatesCard />}
      actions={<Link to={`/channels/try?journey=${id}&look=whatsapp`} className={buttonClasses({ variant: 'link', size: 'sm' })}>{t('ch.ussd.openSimulator')}</Link>}
    />
  )
}

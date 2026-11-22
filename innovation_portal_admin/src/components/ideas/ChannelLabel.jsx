import { Globe, MessageCircle, Phone, Smartphone, Users } from 'lucide-react'
import { useT } from '../../i18n/context'
import { EMPTY_CELL } from '../../lib/format'

// The channel an idea came in through, with its icon (Figma 3.15). Unknown values show a dash, never the raw word.
const ICONS = { web: Globe, whatsapp: MessageCircle, ussd: Smartphone, sms: Phone, walk_in: Users }

export default function ChannelLabel({ channel }) {
  const t = useT()
  const Icon = ICONS[channel]
  if (!Icon) return <span className="text-muted">{EMPTY_CELL}</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon size={15} aria-hidden className="shrink-0 text-muted" />
      {t(`ideas.channel.${channel}`)}
    </span>
  )
}

import Tag from '../ui/Tag'
import { useT } from '../../i18n/context'

// One place that turns channel API values into the words on screen (ceda-ui section 6).
// An unknown value shows "Not known", never a guessed label.

export function ChannelTag({ channel }) {
  const t = useT()
  if (!['ussd', 'whatsapp', 'both'].includes(channel)) return <Tag tone="unknown">{t('ch.status.unknown')}</Tag>
  return <Tag tone="neutral">{t(`ch.channel.${channel}`)}</Tag>
}

export function JourneyStatusTag({ journey, dirty = false }) {
  const t = useT()
  if (!journey) return null
  if (journey.version === 0) return <Tag tone="neutral" dot>{t('ch.status.draft')}</Tag>
  if (dirty || journey.has_unpublished_changes) return <Tag tone="amber" dot>{t('ch.status.publishedWithChanges', { version: journey.version })}</Tag>
  return <Tag tone="green" dot>{t('ch.status.published', { version: journey.version })}</Tag>
}

const CONNECTION_TONES = { waiting: 'neutral', not_tested: 'blue', tested: 'blue', failed: 'red', active: 'green', off: 'neutral' }

export function ConnectionStatusTag({ status }) {
  const t = useT()
  const tone = CONNECTION_TONES[status]
  if (!tone) return <Tag tone="unknown">{t('ch.status.unknown')}</Tag>
  return <Tag tone={tone} dot>{t(`ch.conn.status.${status}`)}</Tag>
}

const SESSION_TONES = { active: 'blue', completed: 'green', handed_over: 'orange', abandoned: 'neutral', timed_out: 'neutral' }

export function SessionStatusTag({ status }) {
  const t = useT()
  const tone = SESSION_TONES[status]
  if (!tone) return <Tag tone="unknown">{t('ch.status.unknown')}</Tag>
  return <Tag tone={tone} dot>{t(`ch.session.${status}`)}</Tag>
}

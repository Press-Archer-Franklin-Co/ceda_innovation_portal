import { AlertCircle, Check, Eye, RotateCcw, X, type LucideIcon } from 'lucide-react'
import Card from '../../ui/Card'
import { useI18n, type StringKey } from '../../../i18n'
import { formatShortDate } from '../format'
import type { StageFeedback } from '../../../types/innovator'

// Figma 2.4 pin 4 (and 2.4b pin 4): what was decided at each stage, by whom and when. Only what staff shared.

const LOOK: Record<StageFeedback['decision'], { Icon: LucideIcon; tone: string }> = {
  received: { Icon: Check, tone: 'bg-success-soft text-success' },
  passed: { Icon: Check, tone: 'bg-success-soft text-success' },
  not_taken_forward: { Icon: X, tone: 'bg-danger-soft text-danger' },
  returned: { Icon: AlertCircle, tone: 'bg-warning-soft text-warning' },
  resent: { Icon: RotateCcw, tone: 'bg-success-soft text-success' },
  in_progress: { Icon: Eye, tone: 'bg-info-soft text-info' },
}

export default function FeedbackByStage({ events }: { events: StageFeedback[] }) {
  const { t, lang } = useI18n()
  if (events.length === 0) return null
  return (
    <Card padding="md">
      <h2 className="font-heading text-d-h5 text-text">{t('trk.feedback')}</h2>
      <ol className="mt-4 flex flex-col gap-4">
        {events.map((event, index) => {
          const { Icon, tone } = LOOK[event.decision] ?? LOOK.in_progress
          const who = event.automatic ? t('trk.automatic') : event.by_you ? t('trk.you') : event.by
          const when = event.decision === 'in_progress' ? t('trk.inProgress') : event.at ? formatShortDate(event.at, lang) : ''
          return (
            <li key={`${event.code}-${event.decision}-${index}`} className="flex items-start gap-3">
              <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="text-d-label text-text">{event.name}</h3>
                  <p className="text-d-cap text-muted">{[when, who].filter(Boolean).join(' · ')}</p>
                </div>
                <p className="mt-0.5 text-d-body-s text-text whitespace-pre-line break-words">{event.comment || t(`trk.d.${event.decision}` as StringKey)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

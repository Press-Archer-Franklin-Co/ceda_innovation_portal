import { CalendarClock, MapPin, Star, Video } from 'lucide-react'
import Card from '../../ui/Card'
import { buttonClasses } from '../../ui/Button'
import { useI18n } from '../../../i18n'
import type { PitchSession } from '../../../types/innovator'
import { formatPitchWhen } from '../format'

/**
 * 2.4: the Shortlisted card with what happens next, and the pitch session from the API (prompt 39) when staff set one.
 * No session: "CEDA will share the pitch details soon", never a made-up date. An idea can have its own session before
 * it is shortlisted; then only the session shows, without the Shortlisted heading.
 */
export default function ShortlistedCard({ shortlisted = true, session }: { shortlisted?: boolean; session: PitchSession | null | undefined }) {
  const { t } = useI18n()
  if (!shortlisted && !session) return null
  return (
    <Card padding="md" className={shortlisted ? 'border-2 border-amber' : ''}>
      {shortlisted && (
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow/30 text-text">
            <Star size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-d-h5 text-text">{t('short.title')}</h2>
            <p className="mt-1 text-d-body-s text-text">{t('short.body')}</p>
          </div>
        </div>
      )}
      <div className={shortlisted ? 'mt-4 grid gap-4 sm:grid-cols-2' : ''}>
        {shortlisted && (
          <div>
            <h3 className="text-d-label-s text-text">{t('short.next')}</h3>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-d-body-s text-muted">
              <li>{t('short.step1')}</li>
              <li>{t('short.step2')}</li>
              <li>{t('short.step3')}</li>
            </ol>
          </div>
        )}
        <PitchSessionDetails session={session} heading={shortlisted ? 'h3' : 'h2'} />
      </div>
    </Card>
  )
}

export function PitchSessionDetails({ session, heading: Heading = 'h3' }: { session: PitchSession | null | undefined; heading?: 'h2' | 'h3' }) {
  const { t, lang } = useI18n()
  const online = session?.format === 'online'
  return (
    <div className="rounded-control bg-surface2 p-3">
      <Heading className="text-d-label-s text-text">{t('short.session')}</Heading>
      {session ? (
        <ul className="mt-2 flex flex-col gap-2 text-d-body-s text-text">
          <li className="flex items-start gap-2">
            <CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
            <span>
              {t('short.sessionWhen', { date: formatPitchWhen(session, lang) })}
              {session.duration_minutes ? <span className="text-muted"> · {t('short.minutes', { n: session.duration_minutes })}</span> : null}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {online ? <Video size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" /> : <MapPin size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />}
            <span>{online ? t('short.online') : [t('short.inPerson'), session.place].filter(Boolean).join(': ')}</span>
          </li>
          {session.instructions && <li className="whitespace-pre-line text-muted">{session.instructions}</li>}
          {online && session.meeting_link && (
            <li>
              <a href={session.meeting_link} target="_blank" rel="noreferrer" className={buttonClasses({ size: 'sm', block: true, className: 'sm:w-auto' })}>
                {t('short.join')}
              </a>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-d-body-s text-muted">{t('short.sessionSoon')}</p>
      )}
    </div>
  )
}

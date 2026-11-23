import { CalendarClock, ExternalLink, MapPin, Star } from 'lucide-react'
import Card from '../../ui/Card'
import { useI18n } from '../../../i18n'
import type { PitchSession } from '../../../types/innovator'
import { formatGaboroneDateTime } from '../format'

/** 2.4, shortlisted (23 Nov): a clear card with what happens next, and the pitch session only when one is set. */
export default function ShortlistedCard({ session }: { session: PitchSession | null | undefined }) {
  const { t, lang } = useI18n()
  return (
    <Card padding="md" className="border-2 border-amber">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow/30 text-text">
          <Star size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-d-h5 text-text">{t('short.title')}</h2>
          <p className="mt-1 text-d-body-s text-text">{t('short.body')}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-d-label-s text-text">{t('short.next')}</h3>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-d-body-s text-muted">
            <li>{t('short.step1')}</li>
            <li>{t('short.step2')}</li>
            <li>{t('short.step3')}</li>
          </ol>
        </div>
        <div className="rounded-control bg-surface2 p-3">
          <h3 className="text-d-label-s text-text">{t('short.session')}</h3>
          {session?.starts_at ? (
            <ul className="mt-2 flex flex-col gap-1.5 text-d-body-s text-text">
              <li className="flex items-start gap-2"><CalendarClock size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />{t('short.sessionWhen', { date: formatGaboroneDateTime(session.starts_at, lang) })}</li>
              {session.place && <li className="flex items-start gap-2"><MapPin size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />{session.place}</li>}
              {session.link && (
                <li className="flex items-start gap-2">
                  <ExternalLink size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                  <a href={session.link} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2">{session.link}</a>
                </li>
              )}
              {session.instructions && <li className="whitespace-pre-line text-muted">{session.instructions}</li>}
            </ul>
          ) : (
            <p className="mt-2 text-d-body-s text-muted">{t('short.sessionSoon')}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

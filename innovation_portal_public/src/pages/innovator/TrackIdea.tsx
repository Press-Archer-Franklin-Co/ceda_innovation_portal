import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Check, Eye, Lock, Paperclip } from 'lucide-react'
import Card from '../../components/ui/Card'
import { ErrorState } from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import Tag from '../../components/ui/Tag'
import { useShellSettings } from '../../components/layout/shellData'
import MessageThread from '../../components/innovator/MessageThread'
import DocumentsCard from '../../components/innovator/tracking/DocumentsCard'
import FeedbackByStage from '../../components/innovator/tracking/FeedbackByStage'
import ReturnedCard from '../../components/innovator/tracking/ReturnedCard'
import ShortlistedCard from '../../components/innovator/tracking/ShortlistedCard'
import { answerFiles, answerText, isFile } from '../../components/innovator/answers'
import { formatDate, formatShortDate } from '../../components/innovator/format'
import { statusWord } from '../../components/innovator/ideaStatus'
import { useI18n } from '../../i18n'
import { innovatorService } from '../../services/innovator.service'
import type { IdeaTracking, SubmissionAnswer, TimelineStage, TrackedIdea } from '../../types/innovator'

/** Screen 2.4: where the idea is, the conversation with the officer, and the idea read-only. */
export default function TrackIdea() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { hash } = useLocation()
  const settings = useShellSettings()
  const [idea, setIdea] = useState<TrackedIdea | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'not_found'>('loading')
  const [tracking, setTracking] = useState<IdeaTracking | null>(null)
  const [trackingFailed, setTrackingFailed] = useState(false)
  const [resent, setResent] = useState(false)

  const loadTracking = useCallback(async () => {
    setTrackingFailed(false)
    try {
      setTracking(await innovatorService.tracking(id, lang))
    } catch {
      setTrackingFailed(true)
    }
  }, [id, lang])

  const load = useCallback(async () => {
    setState('loading')
    try {
      setIdea(await innovatorService.trackedIdea(id))
      setState('ready')
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      setState(status === 404 || status === 403 ? 'not_found' : 'error')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadTracking()
  }, [loadTracking])

  useEffect(() => {
    if (idea) document.title = `${idea.title} · CEDA Innovation`
  }, [idea])

  // Open at the messages when a "Reply" link was used.
  useEffect(() => {
    if (state === 'ready' && hash === '#messages') {
      window.setTimeout(() => document.getElementById('messages')?.scrollIntoView(), 0)
    }
  }, [state, hash])

  if (state === 'loading') return <TrackSkeleton />
  if (state === 'not_found' || state === 'error' || !idea) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-12 sm:px-6">
        <ErrorState title={state === 'not_found' ? t('track.notFound') : t('track.loadError')} onRetry={state === 'error' ? load : undefined} />
      </div>
    )
  }

  const word = statusWord(idea.current_status)
  const program = idea.program_detail?.is_general_intake ? t('form.generalIdea') : idea.program_detail?.title
  const stages = idea.timeline?.stages ?? []

  return (
    <div className="bg-bg">
      <section className="border-b border-border bg-surface2">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {tracking?.returned ? <Tag tone="blue">{t('trk.returnedTitle')}</Tag> : <Tag tone={word.tone}>{t(word.key)}</Tag>}
            {program && <Tag tone="neutral">{program}</Tag>}
          </div>
          <h1 className="mt-3 font-heading text-d-mh1 sm:text-d-h2 text-text break-words">{idea.title}</h1>
          <p className="mt-2 text-d-body-s text-muted">
            {[idea.reference_number, idea.submitted_at ? t('track.sentOn', { date: formatDate(idea.submitted_at, lang) }) : ''].filter(Boolean).join(' · ')}
          </p>

          <h2 className="sr-only">{t('track.timeline')}</h2>
          <ol data-guide="track.progress" className="mt-6 grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-5 lg:p-6">
            {stages.map((stage) => (
              <Stage key={stage.code} stage={stage} nextPanelAt={idea.timeline.next_panel_at} />
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {resent && <p role="status" className="rounded-control bg-success-soft px-4 py-3 text-d-body-s text-success">{t('trk.resent')}</p>}
          {tracking?.returned && (
            <ReturnedCard
              ideaId={idea.id}
              returned={tracking.returned}
              onChanged={loadTracking}
              onResent={(next) => {
                setTracking(next)
                setResent(true)
                innovatorService.trackedIdea(id).then(setIdea).catch(() => undefined)
              }}
            />
          )}
          {word.key === 'status.shortlisted' && <ShortlistedCard session={tracking?.pitch_session} />}
          <MessageThread ideaId={idea.id} />
          {trackingFailed ? (
            <ErrorState title={t('trk.feedbackError')} onRetry={loadTracking} />
          ) : tracking ? (
            <>
              <FeedbackByStage events={tracking.feedback_by_stage} />
              <DocumentsCard ideaId={idea.id} documents={tracking.documents} canAdd={tracking.can_add_documents} onChanged={loadTracking} />
            </>
          ) : (
            <Skeleton className="h-[220px] w-full rounded-card" />
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card padding="md">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-d-h5 text-text">{t('track.yourIdea')}</h2>
              <span className="inline-flex items-center gap-1 text-d-cap text-muted">
                <Lock size={14} aria-hidden />
                {t('track.readOnly')}
              </span>
            </div>
            <dl className="mt-4 flex flex-col gap-3">
              {idea.responses.filter((answer) => !isLayout(answer)).map((answer) => (
                <div key={answer.id}>
                  <dt className="text-d-cap text-muted">{answer.field_label || answer.field_key}</dt>
                  <dd className="text-d-body-s text-text whitespace-pre-line break-words">
                    {isFile(answer) && answerFiles(answer.value).length ? (
                      <ul className="flex flex-col gap-1">
                        {answerFiles(answer.value).map((file, i) => (
                          <li key={file.id ?? i} className="flex items-center gap-1.5">
                            <Paperclip size={14} aria-hidden className="shrink-0 text-muted" />
                            {file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:no-underline">{file.name}</a> : <span>{file.name}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      answerText(answer, t('form.yes'), t('form.noAnswer'))
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          {settings.ussd_code && (
            <Card tone="soft" padding="md">
              <h2 className="font-heading text-d-h5 text-text">{t('track.noDataTitle')}</h2>
              <p className="mt-2 text-d-body-s text-muted">{t('track.noDataBody', { ussd: settings.ussd_code, reference: idea.reference_number })}</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function Stage({ stage, nextPanelAt }: { stage: TimelineStage; nextPanelAt: string | null }) {
  const { t, lang } = useI18n()
  const done = stage.status === 'done'
  const current = stage.status === 'current'
  const skipped = stage.status === 'skipped'
  // The next panel date belongs on the judging stage; workflow step codes name it (judging_review, under_judging, ...).
  const isPanel = /panel|judg/i.test(stage.code)
  let line = ''
  if (done && stage.reached_at) line = formatShortDate(stage.reached_at, lang)
  else if (skipped) line = t('track.skipped')
  else if (isPanel && nextPanelAt && !done) line = t('track.nextPanel', { date: formatShortDate(nextPanelAt, lang) })
  else if (stage.usual_duration) line = t('track.usual', { duration: stage.usual_duration })

  return (
    <li aria-current={current ? 'step' : undefined} className="flex gap-3 sm:flex-col">
      <span
        aria-hidden
        className={clsx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
          done ? 'border-primary bg-primary text-on-primary' : current ? 'border-amber bg-warning-soft text-text' : 'border-border bg-surface text-muted',
        )}
      >
        {done ? <Check size={14} strokeWidth={3} /> : current ? <Eye size={14} /> : null}
      </span>
      <div className="min-w-0">
        <p className={clsx('font-heading text-d-h5', skipped ? 'text-muted' : 'text-text')}>{stage.name}</p>
        {line && <p className="text-d-cap text-muted">{line}</p>}
        {current && stage.explanation && <p className="mt-1 text-d-body-s text-text">{stage.explanation}</p>}
        {current && stage.officer && <p className="mt-1 text-d-body-s text-text">{t('track.officerReading', { officer: stage.officer })}</p>}
        <span className="sr-only">{done ? t('common.done') : ''}</span>
      </div>
    </li>
  )
}

function isLayout(answer: SubmissionAnswer): boolean {
  return answer.field_type === 'heading' || answer.field_type === 'paragraph'
}

function TrackSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-3 h-10 w-2/3" />
      <Skeleton className="mt-6 h-[140px] w-full rounded-card" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-[300px] rounded-card" />
        <Skeleton className="h-[300px] rounded-card" />
      </div>
    </div>
  )
}

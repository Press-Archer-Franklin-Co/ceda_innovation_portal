import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ServerTable from '../ui/ServerTable'
import Tag from '../ui/Tag'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { useT } from '../../i18n/context'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { pitchApi, pitchWhen, shownSession } from '../../lib/api/pitch'
import PitchSessionModal from './PitchSessionModal'

// Pitch schedule (Nshathisi, 23 Nov 11:13): every shortlisted entry with its own pitch time. An officer sets or
// changes each person's time; the person is told and cannot change it. The list is R-84 (backend); until it is on
// main the section says so honestly and points to the idea page, where one person's time can already be set.

export function WhereText({ session }) {
  const t = useT()
  if (!session) return null
  if (session.format === 'online') {
    return session.meeting_link
      ? <a href={session.meeting_link} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{t('pitch.format.online')}</a>
      : <span>{t('pitch.format.online')}</span>
  }
  const place = typeof session.place === 'object' ? session.place?.en : session.place
  return <span>{[t('pitch.format.in_person'), place].filter(Boolean).join(': ')}</span>
}

export default function PitchSchedule({ program }) {
  const t = useT()
  const { can } = useAuth()
  const canEdit = can('challenges.manage')
  const [notSet, setNotSet] = useState(false)
  const [dialog, setDialog] = useState(null)
  const buttons = useRef({})
  // Is the list on this server yet (R-84)? A 404 means not yet; anything else is a real error.
  const probe = useQuery({
    queryKey: ['pitch', program.id, 'schedule', 'probe'],
    queryFn: async () => {
      try {
        return await pitchApi.schedule(program.id, { page: 1, page_size: 1 })
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true }
        throw err
      }
    },
  })

  if (probe.isLoading) return <Skeleton className="h-64 rounded-card" />
  if (probe.isError) return <ErrorState framed compact title={t('pitch.loadError')} message={probe.error?.message} onRetry={probe.refetch} />

  const name = (row) => row.innovator?.name || row.reference
  const columns = [
    { key: 'person', label: t('pitch.col.person'), render: (_, row) => <span className="font-semibold text-text">{name(row)}</span> },
    { key: 'title', label: t('pitch.col.idea'), link: (row) => `/submissions/${row.submission_id}`, render: (v, row) => <span className="line-clamp-2">{v || row.reference}</span> },
    {
      key: 'when', label: t('pitch.col.when'),
      render: (_, row) => {
        const s = shownSession(row)
        if (!s) return <Tag tone="amber">{t('pitch.notSet')}</Tag>
        return (
          <span className="flex flex-col">
            <span className="whitespace-nowrap">{pitchWhen(s)}{s.duration_minutes ? <span className="text-muted"> · {t('pitch.minutesShort', { n: s.duration_minutes })}</span> : null}</span>
            {!row.own && <span className="text-[12px] text-muted">{t('pitch.cardStage')}</span>}
          </span>
        )
      },
    },
    { key: 'where', label: t('pitch.col.where'), hideOnPhone: false, render: (_, row) => <WhereText session={shownSession(row)} /> },
    ...(canEdit ? [{
      key: 'action', label: <span className="sr-only">{t('pitch.change')}</span>, align: 'right', width: '120px',
      render: (_, row) => (
        <button type="button" ref={(el) => { buttons.current[row.submission_id] = el }}
          onClick={(e) => { e.stopPropagation(); setDialog(row) }}
          aria-label={t('pitch.actions', { name: name(row) })}
          className="min-h-[36px] rounded-control px-2 text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {row.own ? t('pitch.change') : t('pitch.set')}
        </button>
      ),
    }] : []),
  ]

  return (
    <section className="flex flex-col gap-3" aria-labelledby="pitch-schedule-title">
      <div>
        <h2 id="pitch-schedule-title" className="font-heading text-[15px] font-bold text-text">{t('pitch.schedule')}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{t('pitch.scheduleIntro')}</p>
      </div>
      {probe.data?.unavailable ? (
        <p className="rounded-card bg-surface2 px-4 py-3 text-[13px] text-text" role="note">
          {t('pitch.unavailable')} <Link to={`/submissions?program=${program.id}`} className="font-bold text-primary hover:underline">{t('cst.seeIdeas')}</Link>
        </p>
      ) : (
        <ServerTable
          caption={t('pitch.schedule')}
          queryKey={(request) => ['pitch', program.id, 'schedule', request]}
          fetcher={(request) => pitchApi.schedule(program.id, request)}
          filters={notSet ? { not_set: 'true' } : {}}
          searchLabel={t('pitch.search')}
          urlState={false}
          toolbar={(
            <button type="button" aria-pressed={notSet} onClick={() => setNotSet((v) => !v)}
              className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                notSet ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:bg-surface2')}>
              {probe.data?.not_set_count != null ? `${t('pitch.notSetOnly')} (${probe.data.not_set_count})` : t('pitch.notSetOnly')}
            </button>
          )}
          columns={columns}
          emptyTitle={notSet ? t('pitch.emptyNotSet') : t('pitch.empty')}
          emptyMessage={notSet ? undefined : t('pitch.emptyBody')}
        />
      )}
      {dialog && (
        <PitchSessionModal open onClose={() => setDialog(null)} programId={program.id} submissionId={dialog.submission_id}
          name={name(dialog)} triggerRef={{ current: buttons.current[dialog.submission_id] }} />
      )}
    </section>
  )
}

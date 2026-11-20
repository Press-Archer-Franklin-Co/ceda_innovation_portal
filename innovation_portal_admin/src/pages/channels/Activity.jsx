import { useMemo, useState } from 'react'
import { Activity as ActivityIcon, Lightbulb, Headset, LogOut, PhoneCall } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import StatCard from '../../components/ui/StatCard'
import DataTable from '../../components/ui/DataTable'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import Button from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Choice'
import { SkeletonStatCards } from '../../components/ui/LoadingSkeleton'
import { ChartCanvas } from '../../components/charts/lazy'
import { SessionStatusTag } from '../../components/channels/tags'
import { useChannelConnections, useChannelReport, useChannelSession, useChannelSessions, useJourneys } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'
import { formatDateTime } from '../../components/channels/format'

const PERIODS = [7, 30, 90]
const PAGE_SIZE = 20

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return d.toISOString().slice(0, 10)
}

/** A token colour (Option D) as rgb(), so the chart follows light and dark mode. */
function token(name, alpha = 1) {
  if (typeof window === 'undefined') return 'rgb(0 0 0)'
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim()
  return `rgb(${value} / ${alpha})`
}

function SessionDialog({ id, onClose }) {
  const t = useT()
  const { data, isLoading, isError, error, refetch } = useChannelSession(id)
  return (
    <Modal open={!!id} onClose={onClose} title={t('ch.act.sessionTitle')} size="lg">
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <ErrorState compact title={t('ch.act.sessionFailed')} message={error?.message} onRetry={refetch} />
      ) : data ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">{t('ch.act.colJourney')}</dt><dd>{data.journey_name}{data.version_number ? ` · ${t('ch.status.published', { version: data.version_number })}` : ''}</dd>
            <dt className="text-muted">{t('ch.act.colConnection')}</dt><dd>{data.connection_name || (data.is_simulation ? t('ch.act.simulator') : '')}</dd>
            <dt className="text-muted">{t('ch.act.colPhone')}</dt><dd className="tabular-nums">{data.phone}</dd>
            <dt className="text-muted">{t('ch.act.colStatus')}</dt><dd><SessionStatusTag status={data.status} /></dd>
            {data.draft_reference && (<><dt className="text-muted">{t('ch.act.idea')}</dt><dd>{data.draft_reference}</dd></>)}
          </dl>
          <ol className="divide-y divide-border rounded-control border border-border">
            {data.steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="w-36 shrink-0 text-xs text-muted tabular-nums">{formatDateTime(step.created_at)}</span>
                <span className="font-bold text-text">{step.node_key}</span>
                <span className="text-muted">{t(`ch.type.${step.node_type}`)}</span>
                {step.input && <span className="ml-auto truncate text-text">{step.input === '[hidden]' ? t('ch.act.hidden') : step.input}</span>}
              </li>
            ))}
            {data.steps.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('ch.act.noSteps')}</li>}
          </ol>
        </div>
      ) : null}
    </Modal>
  )
}

export default function Activity() {
  const t = useT()
  const [channel, setChannel] = useState('')
  const [journey, setJourney] = useState('')
  const [connection, setConnection] = useState('')
  const [days, setDays] = useState(30)
  const [simulations, setSimulations] = useState(false)
  const [day, setDay] = useState('')
  const [page, setPage] = useState(1)
  const [openSession, setOpenSession] = useState(null)

  const filters = useMemo(() => {
    const params = { from: isoDaysAgo(days), to: isoDaysAgo(1) }
    if (channel) params.channel = channel
    if (journey) params.journey = journey
    if (connection) params.connection = connection
    if (simulations) params.include_simulations = 'true'
    return params
  }, [channel, journey, connection, days, simulations])

  const report = useChannelReport(filters)
  const sessions = useChannelSessions({ ...filters, ...(day ? { from: day, to: day } : {}), page, page_size: PAGE_SIZE })
  const journeys = useJourneys()
  const connections = useChannelConnections()
  const totals = report.data?.totals

  const chart = useMemo(() => {
    const rows = report.data?.per_day ?? []
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.date.slice(5)),
        datasets: [
          { label: t('ch.act.sessions'), data: rows.map((r) => r.sessions), backgroundColor: token('primary', 0.85), borderRadius: 3 },
          { label: t('ch.act.ideas'), data: rows.map((r) => r.ideas_started), backgroundColor: token('success', 0.85), borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (!elements.length) return
          setDay(rows[elements[0].index].date)
          setPage(1)
        },
        plugins: { legend: { position: 'bottom', labels: { color: token('text'), boxWidth: 10 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: token('muted'), maxRotation: 0, autoSkipPadding: 12 } },
          y: { beginAtZero: true, ticks: { precision: 0, color: token('muted') }, grid: { color: token('border') } },
        },
      },
    }
  }, [report.data, t])

  const resetPage = (fn) => (value) => { fn(value); setPage(1); setDay('') }
  const sessionData = sessions.data

  return (
    <div className="space-y-3.5 2xl:space-y-[22px]">
      <PageHeader title={t('ch.act.title')} subtitle={t('ch.act.subtitle')} className="mb-0" />

      <div className="flex flex-wrap items-end gap-3">
        <Select label={t('ch.act.channel')} fieldClassName="w-40" options={[{ value: '', label: t('ch.act.allChannels') }, { value: 'ussd', label: t('ch.channel.ussd') }, { value: 'whatsapp', label: t('ch.channel.whatsapp') }]} value={channel} onChange={resetPage(setChannel)} />
        <Select label={t('ch.act.journey')} fieldClassName="w-56" options={[{ value: '', label: t('ch.act.allJourneys') }, ...(journeys.data ?? []).map((j) => ({ value: j.id, label: j.name }))]} value={journey} onChange={resetPage(setJourney)} />
        <Select label={t('ch.act.connection')} fieldClassName="w-56" options={[{ value: '', label: t('ch.act.allConnections') }, ...(connections.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} value={connection} onChange={resetPage(setConnection)} />
        <Select label={t('ch.act.period')} fieldClassName="w-40" options={PERIODS.map((d) => ({ value: String(d), label: t('ch.act.lastDays', { count: d }) }))} value={String(days)} onChange={resetPage((v) => setDays(Number(v)))} />
        <Toggle label={t('ch.act.includeSimulations')} checked={simulations} onChange={resetPage(setSimulations)} className="pb-1.5" />
      </div>

      {report.isLoading ? (
        <SkeletonStatCards count={4} />
      ) : report.isError ? (
        <ErrorState title={t('ch.act.reportFailed')} message={report.error?.message} onRetry={() => report.refetch()} framed />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard title={t('ch.act.sessions')} value={totals?.sessions ?? 0} icon={PhoneCall} />
            <StatCard title={t('ch.act.ideas')} value={totals?.ideas_started ?? 0} icon={Lightbulb} />
            <StatCard title={t('ch.act.handovers')} value={totals?.handovers ?? 0} icon={Headset} />
            <StatCard title={t('ch.act.dropped')} value={totals?.dropped ?? 0} icon={LogOut} />
          </div>

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SectionCard title={t('ch.act.perDay')} subtitle={t('ch.act.perDayHint')}>
              {totals?.sessions ? (
                <div role="img" aria-label={t('ch.act.chartLabel', { sessions: totals.sessions, ideas: totals.ideas_started })}>
                  <ChartCanvas config={chart} height={220} />
                </div>
              ) : (
                <EmptyState compact icon={ActivityIcon} title={t('ch.act.noSessionsTitle')} message={t('ch.act.noSessionsBody')} />
              )}
            </SectionCard>
            <SectionCard title={t('ch.act.dropOff')} subtitle={t('ch.act.dropOffHint')} padding={false}>
              <DataTable
                data={report.data?.drop_off ?? []}
                emptyTitle={t('ch.act.noDropOff')}
                columns={[
                  { key: 'node_title', label: t('ch.act.colStep'), render: (v, row) => <span><span className="font-bold">{v}</span><span className="block text-xs text-muted">{row.journey}</span></span> },
                  { key: 'sessions', label: t('ch.act.colLeft') },
                ]}
              />
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard
        title={day ? t('ch.act.sessionsOn', { day }) : t('ch.act.sessionLog')}
        actions={day ? <Button size="sm" variant="ghost" onClick={() => { setDay(''); setPage(1) }}>{t('ch.act.allDays')}</Button> : null}
        padding={false}
      >
        <DataTable
          loading={sessions.isLoading}
          error={sessions.isError ? sessions.error?.message || t('ch.act.sessionsFailed') : undefined}
          onRetry={() => sessions.refetch()}
          emptyTitle={t('ch.act.noSessionsTitle')}
          emptyMessage={t('ch.act.noSessionsBody')}
          onRowClick={(row) => setOpenSession(row.id)}
          data={sessionData?.results ?? []}
          page={page}
          total={sessionData?.count ?? 0}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          columns={[
            { key: 'started_at', label: t('ch.act.colStarted'), render: (v) => formatDateTime(v) },
            { key: 'channel', label: t('ch.act.colChannel'), render: (v) => t(`ch.channel.${v}`) },
            { key: 'journey_name', label: t('ch.act.colJourney') },
            { key: 'connection_name', label: t('ch.act.colConnection'), render: (v, row) => v || (row.is_simulation ? t('ch.act.simulator') : '') },
            { key: 'phone', label: t('ch.act.colPhone') },
            { key: 'status', label: t('ch.act.colStatus'), render: (v) => <SessionStatusTag status={v} /> },
            { key: 'draft_reference', label: t('ch.act.idea'), render: (v) => v || '' },
          ]}
        />
      </SectionCard>
      <SessionDialog id={openSession} onClose={() => setOpenSession(null)} />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import DataTable from '../../components/ui/DataTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import Tag from '../../components/ui/Tag'
import { Toggle } from '../../components/ui/Choice'
import { ChartCanvas } from '../../components/charts/lazy'
import { SessionStatusTag } from '../../components/channels/tags'
import { formatDateTime } from '../../components/channels/format'
import { useChannelConnections, useChannelReport, useChannelSession, useChannelSessions, useChannelStatus, useJourneys } from '../../lib/queries/channels'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// 3.33 Channels: connections and activity (Figma 137:2158 website, 137:2593 phone).
// ① Connection status for WhatsApp, USSD and website live chat; WhatsApp and USSD open their connections.
// ② Sessions this week by channel. ③ Where people stop in one journey. ④ Recent sessions; open one to see its steps.
// Phone: the status cards and the week chart.

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function token(name, alpha = 1) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim()
  return `rgb(${value} / ${alpha})`
}

// Draws each bar's number above it (Figma), in the text colour.
const valueLabels = {
  id: 'chValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    ctx.save()
    ctx.fillStyle = token('text')
    ctx.font = '600 12px Lato, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const last = chart.data.datasets.length - 1
    chart.getDatasetMeta(last).data.forEach((bar, i) => {
      const total = chart.data.datasets.reduce((sum, ds) => sum + (ds.data[i] || 0), 0)
      if (total) ctx.fillText(String(total), bar.x, bar.y - 6)
    })
    ctx.restore()
  },
}

function StatusCard({ title, tone, word, detail, to }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-text">{title}</span>
        <span className="block text-d-cap text-muted truncate">{detail}</span>
      </span>
      <Tag tone={tone}>{word}</Tag>
      {to && <ChevronRight size={16} aria-hidden className="text-muted shrink-0" />}
    </>
  )
  const cls = 'flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3.5'
  return to ? <Link to={to} className={cn(cls, 'hover:bg-surface2')}>{body}</Link> : <div className={cls}>{body}</div>
}

function StatusCards() {
  const { t } = useI18n()
  const { can } = useAuth()
  const status = useChannelStatus()
  const connections = useChannelConnections()
  if (status.isLoading || connections.isLoading) return <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[74px]" />)}</div>
  if (status.isError) return <ErrorState compact title={t('ch.over.statusFailed')} onRetry={() => status.refetch()} />
  const list = connections.data ?? []
  const card = (kind) => {
    const s = status.data[kind]
    const mine = list.filter((c) => c.kind === kind)
    const active = mine.filter((c) => c.is_active)
    if (s.live) return { tone: 'green', word: t('ch.over.active'), detail: active.map((c) => c.address || c.name).join(', ') }
    if (mine.length) {
      return { tone: 'amber', word: t('ch.over.testing'), detail: active.length ? t('ch.over.switchOff') : t('ch.over.notActive', { count: mine.length }) }
    }
    return { tone: 'neutral', word: t('ch.over.notSetUp'), detail: t(`ch.over.notSetUpHint.${kind}`) }
  }
  const chat = status.data.live_chat
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatusCard title={t('ch.channel.whatsapp')} to="/channels/connections/whatsapp" {...card('whatsapp')} />
      <StatusCard title={t('ch.channel.ussd')} to="/channels/connections/ussd" {...card('ussd')} />
      {chat && (
        <StatusCard
          title={t('ch.over.liveChat')}
          to={can('settings.manage') ? '/admin/live-chat' : undefined}
          tone={chat.live ? 'green' : 'neutral'}
          word={chat.live ? t('ch.over.active') : t('ch.over.off')}
          detail={chat.officers_online == null ? '' : t('ch.over.online', { count: chat.officers_online })}
        />
      )}
    </div>
  )
}

function WeekChart({ report }) {
  const { t } = useI18n()
  const rows = useMemo(() => report?.per_day ?? [], [report])
  const config = useMemo(() => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })),
      datasets: [
        { label: t('ch.channel.ussd'), data: rows.map((r) => r.by_channel?.ussd ?? 0), backgroundColor: token('primary', 0.9), borderRadius: 3, stack: 's' },
        { label: t('ch.channel.whatsapp'), data: rows.map((r) => r.by_channel?.whatsapp ?? 0), backgroundColor: token('success', 0.85), borderRadius: 3, stack: 's' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      plugins: { legend: { position: 'bottom', labels: { color: token('text'), boxWidth: 10 } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: token('muted') } },
        y: { stacked: true, display: false, beginAtZero: true },
      },
    },
    plugins: [valueLabels],
  }), [rows, t])
  const total = rows.reduce((sum, r) => sum + r.sessions, 0)
  return (
    <SectionCard title={t('ch.over.week')} subtitle={t('ch.over.allChannels')}>
      {total === 0 ? (
        <EmptyState compact title={t('ch.act.noSessionsTitle')} message={t('ch.act.noSessionsBody')} />
      ) : (
        <div role="img" aria-label={t('ch.over.weekLabel', { count: total })}><ChartCanvas config={config} height={200} /></div>
      )}
    </SectionCard>
  )
}

function Funnel({ journeyId, onJourney, journeys, report }) {
  const { t } = useI18n()
  const funnel = report?.funnel
  const max = funnel?.steps?.[0]?.sessions || 0
  return (
    <SectionCard
      title={funnel ? t('ch.over.stopIn', { journey: funnel.journey }) : t('ch.over.stop')}
      subtitle={t('ch.over.stopHint')}
      actions={journeys.length > 1 ? <Select label={t('ch.act.journey')} hideLabel fieldClassName="w-48" options={journeys.map((j) => ({ value: j.id, label: j.name }))} value={journeyId} onChange={onJourney} /> : null}
    >
      {!funnel || max === 0 ? (
        <EmptyState compact title={t('ch.over.noFunnel')} message={t('ch.over.noFunnelBody')} />
      ) : (
        <ul className="space-y-2.5">
          {funnel.steps.map((step, i) => (
            <li key={step.node_key || 'start'} className="grid grid-cols-[minmax(0,7rem),1fr,2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-text">{step.is_start ? t('ch.over.start') : step.title}</span>
              <span className="h-2 rounded-full bg-surface2" aria-hidden>
                <span className={cn('block h-2 rounded-full', i === funnel.steps.length - 1 ? 'bg-accent' : 'bg-primary')} style={{ width: `${Math.round((step.sessions / max) * 100)}%` }} />
              </span>
              <span className="text-right font-bold tabular-nums text-text">{step.sessions}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function result(row, t) {
  if (row.status === 'handed_over') return t('ch.over.handed')
  if (row.draft_reference) return t('ch.over.ideaSaved', { reference: row.draft_reference })
  if (row.status === 'completed') return t('ch.session.completed')
  if (row.status === 'active') return t('ch.over.inProgress', { step: row.current_node_title || '' })
  return t('ch.over.stoppedAt', { step: row.current_node_title || t('ch.over.start') })
}

function SessionSteps({ id, onClose }) {
  const { t } = useI18n()
  const { data, isLoading, isError, error, refetch } = useChannelSession(id)
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={t('ch.act.sessionTitle')}>
      {isLoading ? <Skeleton className="h-40 w-full" /> : isError ? <ErrorState compact title={t('ch.act.sessionFailed')} message={error?.message} onRetry={refetch} /> : data ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">{t('ch.act.colJourney')}</dt><dd>{data.journey_name}</dd>
            <dt className="text-muted">{t('ch.act.colConnection')}</dt><dd>{data.connection_name || (data.is_simulation ? t('ch.act.simulator') : '')}</dd>
            <dt className="text-muted">{t('ch.act.colPhone')}</dt><dd className="tabular-nums">{data.phone}</dd>
            <dt className="text-muted">{t('ch.act.colStatus')}</dt><dd><SessionStatusTag status={data.status} /></dd>
            {data.draft_reference && (<><dt className="text-muted">{t('ch.act.idea')}</dt><dd>{data.draft_reference}</dd></>)}
          </dl>
          <DataTable
            data={data.steps}
            emptyTitle={t('ch.act.noSteps')}
            columns={[
              { key: 'created_at', label: t('ch.act.colStarted'), render: (v) => formatDateTime(v) },
              { key: 'node_key', label: t('ch.act.colStep') },
              { key: 'input', label: t('ch.over.answer'), render: (v) => (v === '[hidden]' ? t('ch.act.hidden') : v) },
            ]}
          />
        </div>
      ) : null}
    </Modal>
  )
}

export default function ChannelsOverview() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [tests, setTests] = useState(false)
  const [open, setOpen] = useState(null)
  const journeys = useJourneys()
  const list = journeys.data ?? []
  const [picked, setPicked] = useState('')
  const journeyId = picked || list[0]?.id || ''
  const params = { from: isoDaysAgo(6), to: isoDaysAgo(0), ...(tests ? { include_simulations: 'true' } : {}) }
  const report = useChannelReport({ ...params, ...(journeyId ? { journey: journeyId } : {}) })
  const sessions = useChannelSessions({ ...params, page_size: 8 })

  return (
    <div className="space-y-3.5 2xl:space-y-[22px]">
      <PageHeader
        className="mb-0"
        back={<span className="text-[12px] text-muted">{t('ch.over.crumb')}</span>}
        title={t('ch.over.title')}
        subtitle={t('ch.over.subtitle')}
        actions={
          <DropdownMenu
            label={t('ch.over.journeys')}
            items={[
              { key: 'ussd', label: t('ch.ussd.title'), onSelect: () => navigate('/channels/ussd') },
              { key: 'wa', label: t('ch.wa.title'), onSelect: () => navigate('/channels/whatsapp') },
              { key: 'try', label: t('ch.try.title'), onSelect: () => navigate('/channels/try') },
            ]}
            trigger={(props) => <Button {...props} variant="secondary">{t('ch.over.journeys')}<ChevronDown size={14} aria-hidden /></Button>}
          />
        }
      />
      <StatusCards />
      <Toggle label={t('ch.over.includeTests')} checked={tests} onChange={setTests} className="max-w-xs" />
      {report.isError ? (
        <ErrorState framed title={t('ch.act.reportFailed')} message={report.error?.message} onRetry={() => report.refetch()} />
      ) : report.isLoading ? (
        <div className="grid gap-3.5 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <WeekChart report={report.data} />
          <div className="hidden md:block"><Funnel journeyId={journeyId} onJourney={setPicked} journeys={list} report={report.data} /></div>
        </div>
      )}
      <div className="hidden md:block">
        <SectionCard title={t('ch.over.recent')} padding={false}>
          <DataTable
            loading={sessions.isLoading}
            error={sessions.isError ? sessions.error?.message || t('ch.act.sessionsFailed') : undefined}
            onRetry={() => sessions.refetch()}
            emptyTitle={t('ch.act.noSessionsTitle')}
            emptyMessage={t('ch.act.noSessionsBody')}
            onRowClick={(row) => setOpen(row.id)}
            data={sessions.data?.results ?? []}
            columns={[
              { key: 'started_at', label: t('ch.over.when'), render: (v) => formatDateTime(v) },
              { key: 'channel', label: t('ch.act.colChannel'), render: (v) => <Tag tone={v === 'whatsapp' ? 'green' : 'blue'}>{t(`ch.channel.${v}`)}</Tag> },
              { key: 'journey_name', label: t('ch.act.colJourney') },
              { key: 'status', label: t('ch.over.result'), render: (_, row) => result(row, t) },
            ]}
          />
        </SectionCard>
      </div>
      <SessionSteps id={open} onClose={() => setOpen(null)} />
    </div>
  )
}

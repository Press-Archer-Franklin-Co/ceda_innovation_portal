import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, Clock, Inbox, ListTodo, Timer } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Tag from '../../components/ui/Tag'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { buttonClasses } from '../../components/ui/buttonClasses'
import FilterRow from '../../components/analytics/FilterRow'
import { useAnalyticsFilters } from '../../components/analytics/useAnalyticsFilters'
import ChartCard from '../../components/analytics/ChartCard'
import { pipelineConfig, seriesConfig } from '../../components/analytics/configs'
import SourcesCard from '../../components/analytics/SourcesCard'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n, useT } from '../../i18n/context'
import { useKpis, usePipeline, useSeries } from '../../lib/queries/analytics'
import { useReviewerQueue } from '../../lib/queries/assignmentInstances'
import { EMPTY_CELL } from '../../lib/format'
import { changeWords, dayLabel, decisionTone, periodLabel, pipelineRows } from '../../lib/analytics/dashboard'

const day = (iso, lang) => (iso ? dayLabel(new Date(`${iso}T00:00:00`), lang) : '')
const QUEUE_SIZE = 5

/** A KPI card that opens its detail when the person may open it. */
function Kpi({ to, ...card }) {
  const tile = <StatCard {...card} className="h-full" />
  return to ? <Link to={to} className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tile}</Link> : tile
}

function Kpis({ query }) {
  const t = useT()
  const { lang } = useI18n()
  const { can } = useAuth()
  if (query.isError && !query.data) return <ErrorState framed compact title={t('dash.kpi.loadError')} onRetry={() => query.refetch()} className="mb-3.5" />
  const k = query.data
  const loading = query.isLoading
  const prev = { from: day(k?.period?.previous_from, lang), to: day(k?.period?.previous_to, lang) }
  const change = changeWords(k?.submitted?.change_pct)
  const decision = decisionTone(k?.days_to_decision?.average, k?.days_to_decision?.target)
  const waiting = k?.in_review?.waiting_over_7_days ?? 0
  const ideas = can('entries.search') ? '/submissions' : null

  return (
    <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Kpi to={ideas} loading={loading} title={t('dash.kpi.submitted')} value={k?.submitted?.count ?? EMPTY_CELL} icon={ClipboardList} color="forest"
        subtitle={k ? t(change.key, { value: change.value, ...prev }) : ''} />
      <Kpi to={ideas} loading={loading} title={t('dash.kpi.inReview')} value={k?.in_review?.count ?? EMPTY_CELL} icon={Clock} color={waiting ? 'gold' : 'green'}
        subtitle={k ? (waiting ? t('dash.kpi.waiting', { count: waiting }) : t('dash.kpi.noneWaiting')) : ''} />
      <Kpi loading={loading} title={t('dash.kpi.days')} icon={Timer} color={decision === 'late' ? 'red' : 'green'}
        value={k?.days_to_decision?.average != null ? t('dash.kpi.daysValue', { days: k.days_to_decision.average }) : EMPTY_CELL}
        subtitle={k ? (decision === 'none' ? t('dash.kpi.noDecisions') : t('dash.kpi.target', { target: k.days_to_decision.target, count: k.days_to_decision.decided })) : ''} />
      <Kpi to={can('entries.review') ? '/assignments' : null} loading={loading} title={t('dash.kpi.mine')} value={k?.waiting_for_me?.count ?? EMPTY_CELL} icon={ListTodo} color="indigo"
        subtitle={k ? (k.waiting_for_me.due_today ? t('dash.kpi.dueToday', { count: k.waiting_for_me.due_today }) : t('dash.kpi.noneDue')) : ''} />
    </div>
  )
}

function SeriesCard({ filters }) {
  const t = useT()
  const { lang } = useI18n()
  const query = useSeries(filters, 'week')
  const points = useMemo(() => query.data?.points ?? [], [query.data])
  const config = useMemo(() => seriesConfig(points, 'week', { t, lang }), [points, t, lang])
  const total = query.data?.total ?? 0
  return (
    <ChartCard className="lg:col-span-2" title={t('dash.series.week')} subtitle={query.data ? t('dash.series.total', { count: total }) : ''}
      query={query} isEmpty={!!query.data && total === 0}
      chart={{ config, label: t('dash.series.label', { interval: t('dash.series.unit.week'), count: total }) }}
      table={{
        columns: [{ key: 'period', label: t('dash.col.period') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }],
        rows: points.map((p) => ({ id: p.period_start, period: periodLabel(p.period_start, 'week', lang, { long: true }), count: p.count })),
      }} />
  )
}

function PipelineCard({ filters }) {
  const t = useT()
  const query = usePipeline(filters)
  const rows = useMemo(() => pipelineRows(query.data), [query.data])
  const config = useMemo(() => pipelineConfig(rows, { t }), [rows, t])
  const hold = rows.find((r) => r.bottleneck)
  const open = rows.reduce((sum, r) => sum + r.count, 0)
  return (
    <ChartCard title={t('dash.pipe.title')} subtitle={t('dash.pipe.subtitle')} query={query} isEmpty={!!query.data && open === 0}
      chart={{ config, label: hold ? t('dash.pipe.label', { stage: t(`dash.stage.${hold.code}`) }) : t('dash.pipe.labelNone') }}
      table={{
        columns: [{ key: 'stage', label: t('dash.col.stage') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }, { key: 'waiting', label: t('dash.col.waiting'), align: 'right' }],
        rows: rows.map((r) => ({ id: r.code, stage: t(`dash.stage.${r.code}`), count: r.count, waiting: r.waiting })),
      }}
      note={hold
        ? <p className="flex items-start gap-1.5 rounded-control bg-warning-soft px-2.5 py-2 text-[12px] font-bold text-warning"><AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />{t('dash.pipe.bottleneck', { stage: t(`dash.stage.${hold.code}`), count: hold.waiting })}</p>
        : <p className="flex items-center gap-1.5 text-[12px] text-muted"><CheckCircle2 size={14} className="text-success" aria-hidden />{t('dash.pipe.noBottleneck')}</p>} />
  )
}

function QueueCard({ className }) {
  const t = useT()
  const { can } = useAuth()
  const query = useReviewerQueue({ unassigned: true })
  const items = query.data ?? []
  const open = can('entries.search')
  return (
    <section aria-labelledby="queue-title" className={`flex min-w-0 flex-col rounded-card border border-border bg-surface p-3.5 2xl:p-5 ${className ?? ''}`}>
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="queue-title" className="font-heading text-[14px] font-bold text-text">{t('dash.queue.title')}</h2>
          <p className="text-[12px] text-muted">{t('dash.queue.subtitle')}</p>
        </div>
        <Link to="/assignments" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>{t('dash.queue.open')} <ArrowRight size={14} aria-hidden /></Link>
      </header>
      {query.isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-control" />)}</div>
      ) : query.isError ? (
        <ErrorState compact title={t('dash.queue.loadError')} onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState compact icon={Inbox} title={t('dash.queue.empty')} message={t('dash.queue.emptyBody')} />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {items.slice(0, QUEUE_SIZE).map((item) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-text">{item.title}</span>
                    <span className="block truncate text-[12px] text-muted">{[item.reference_number, item.current_step].filter(Boolean).join(' · ')}</span>
                  </span>
                  {item.slots_remaining > 0
                    ? <Tag tone="amber">{t('dash.queue.places', { count: item.slots_remaining })}</Tag>
                    : <Tag tone="green">{t('dash.queue.full')}</Tag>}
                </>
              )
              return (
                <li key={item.id}>
                  {open
                    ? <Link to={`/submissions/${item.id}`} className="flex items-center gap-2 px-1 py-2 hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{body}</Link>
                    : <div className="flex items-center gap-2 px-1 py-2">{body}</div>}
                </li>
              )
            })}
          </ul>
          {items.length > QUEUE_SIZE && <p className="mt-2 text-[12px] text-muted">{t('dash.queue.more', { count: items.length - QUEUE_SIZE })}</p>}
        </>
      )}
    </section>
  )
}

/**
 * 3.1 Staff dashboard (U4) for people with dashboard.view. One filter row drives every number (B7, R-35).
 * Phone: the summary (KPIs, hold-up, queue); the charts start from md.
 */
export default function StaffOverview() {
  const t = useT()
  const { lang } = useI18n()
  const { can } = useAuth()
  const { filters, set, clear } = useAnalyticsFilters()
  const kpis = useKpis(filters)
  const period = kpis.data?.period
  const showQueue = can('entries.review')

  return (
    <div>
      <PageHeader
        title={t('dash.title')}
        subtitle={period ? t('dash.subtitle', { period: t('dash.f.period', { from: day(period.from, lang), to: day(period.to, lang) }) }) : undefined}
        actions={<Link to={{ pathname: '/reports', search: new URLSearchParams(filters).toString() }} className={buttonClasses({ variant: 'secondary', size: 'sm' })}><BarChart3 size={14} aria-hidden /> {t('dash.toReports')}</Link>}
      />
      <FilterRow filters={filters} onChange={set} onClear={clear} updating={kpis.isPlaceholderData && kpis.isFetching} />
      <Kpis query={kpis} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <div className="hidden md:contents"><SeriesCard filters={filters} /></div>
        <PipelineCard filters={filters} />
        <div className="hidden md:contents"><SourcesCard filters={filters} onFilter={set} className={showQueue ? '' : 'lg:col-span-3'} /></div>
        {showQueue && <QueueCard className="lg:col-span-2" />}
      </div>
    </div>
  )
}

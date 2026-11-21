import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import PageSkeleton from '../../components/ui/PageSkeleton'
import { buttonClasses } from '../../components/ui/buttonClasses'
import FilterRow from '../../components/analytics/FilterRow'
import { useAnalyticsFilters } from '../../components/analytics/useAnalyticsFilters'
import ChartCard, { ExportMenu } from '../../components/analytics/ChartCard'
import { funnelConfig, sectorsConfig, seriesConfig } from '../../components/analytics/configs'
import SourcesCard from '../../components/analytics/SourcesCard'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n, useT } from '../../i18n/context'
import { useFunnel, useInclusion, useSectors, useSeries } from '../../lib/queries/analytics'
import { useTabParam } from '../../lib/useTabParam'
import { funnelRows, inclusionShares, periodLabel } from '../../lib/analytics/dashboard'

const FormAnswers = lazy(() => import('./FormAnswers'))

function MonthlyCard({ filters, canExport }) {
  const t = useT()
  const { lang } = useI18n()
  const query = useSeries(filters, 'month')
  const points = useMemo(() => query.data?.points ?? [], [query.data])
  const config = useMemo(() => seriesConfig(points, 'month', { t, lang }), [points, t, lang])
  const total = query.data?.total ?? 0
  return (
    <ChartCard className="lg:col-span-2" title={t('dash.series.month')} subtitle={query.data ? t('dash.series.total', { count: total }) : ''}
      query={query} isEmpty={!!query.data && total === 0} report="series" filters={filters} canExport={canExport}
      chart={{ config, label: t('dash.series.label', { interval: t('dash.series.unit.month'), count: total }) }}
      table={{
        columns: [{ key: 'period', label: t('dash.col.period') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }],
        rows: points.map((p) => ({ id: p.period_start, period: periodLabel(p.period_start, 'month', lang, { long: true }), count: p.count })),
      }} />
  )
}

function FunnelCard({ filters, canExport }) {
  const t = useT()
  const query = useFunnel(filters)
  const rows = useMemo(() => funnelRows(query.data), [query.data])
  const config = useMemo(() => funnelConfig(rows, { t }), [rows, t])
  const sent = query.data?.submitted ?? 0
  return (
    <ChartCard title={t('rep.funnel.title')} subtitle={t('rep.funnel.subtitle')} query={query} isEmpty={!!query.data && sent === 0}
      report="funnel" filters={filters} canExport={canExport}
      chart={{ config, label: t('rep.funnel.label', { count: sent }) }}
      table={{
        columns: [{ key: 'step', label: t('dash.col.step') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }, { key: 'pct', label: t('dash.col.reached'), align: 'right' }],
        rows: rows.map((r) => (r.count === null
          ? { id: r.step, step: t(`rep.step.${r.step}`), count: t('rep.notTracked'), pct: t('rep.notTracked') }
          : { id: r.step, step: t(`rep.step.${r.step}`), count: r.count, pct: `${r.pct}%` })),
      }}
      note={query.data && !query.data.funded_tracked ? <p className="text-[12px] text-muted">{t('rep.funnel.notTracked')}</p> : null} />
  )
}

function SectorsCard({ filters, onFilter, canExport }) {
  const t = useT()
  const query = useSectors(filters)
  const rows = useMemo(() => query.data?.sectors ?? [], [query.data])
  const config = useMemo(() => sectorsConfig(rows, { t, onPick: (slug) => onFilter('sector', slug) }), [rows, t, onFilter])
  const none = query.data?.no_sector ?? 0
  return (
    <ChartCard title={t('rep.sectors.title')} subtitle={none ? t('rep.sectors.subtitle', { count: none }) : ''}
      query={query} isEmpty={!!query.data && rows.length === 0} report="sectors" filters={filters} canExport={canExport}
      chart={{ config, label: t('rep.sectors.label'), height: Math.max(140, rows.length * 26) }}
      table={{
        columns: [{ key: 'name', label: t('dash.col.sector') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }],
        rows: rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
      }} />
  )
}

/** Youth, women and rural reach as three big shares, each out of the people we know about. */
function InclusionCard({ filters, canExport }) {
  const t = useT()
  const query = useInclusion(filters)
  const shares = useMemo(() => inclusionShares(query.data), [query.data])
  const groups = [['youth', 'rep.incl.youth'], ['women', 'rep.incl.women'], ['rural', 'rep.incl.rural']]
  return (
    <ChartCard title={t('rep.incl.title')} subtitle={t('rep.incl.subtitle')} query={query} isEmpty={!!query.data && !query.data.total}
      report="inclusion" filters={filters} canExport={canExport}
      table={shares ? {
        columns: [{ key: 'group', label: t('dash.col.group') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }, { key: 'known', label: t('dash.col.known'), align: 'right' }, { key: 'pct', label: t('dash.col.share'), align: 'right' }],
        rows: groups.map(([key, label]) => ({ id: key, group: t(label), count: shares[key].count, known: shares[key].known, pct: shares[key].pct === null ? t('rep.incl.notKnown') : `${shares[key].pct}%` })),
      } : undefined}>
      {shares && (
        <dl className="grid grid-cols-3 gap-2">
          {groups.map(([key, label]) => {
            const s = shares[key]
            return (
              <div key={key} className="rounded-control bg-surface2 p-2.5">
                <dt className="text-[11px] font-bold text-muted">{t(label)}</dt>
                <dd className="font-heading text-[22px] font-bold leading-tight text-text tabular-nums">{s.pct === null ? <span className="text-[13px] font-normal text-muted">{t('rep.incl.notKnown')}</span> : `${s.pct}%`}</dd>
                {s.known > 0 && <dd className="text-[11px] text-muted">{t('rep.incl.of', { count: s.count, known: s.known })}</dd>}
                {s.unknown > 0 && <dd className="text-[11px] text-muted">{t('rep.incl.unknown', { count: s.unknown })}</dd>}
              </div>
            )
          })}
        </dl>
      )}
    </ChartCard>
  )
}

function Numbers() {
  const { can } = useAuth()
  const { filters, set, clear } = useAnalyticsFilters()
  const canExport = can('reports.export')
  const funnel = useFunnel(filters)
  return (
    <>
      <FilterRow filters={filters} onChange={set} onClear={clear} updating={funnel.isPlaceholderData && funnel.isFetching} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <MonthlyCard filters={filters} canExport={canExport} />
        <FunnelCard filters={filters} canExport={canExport} />
        <SectorsCard filters={filters} onFilter={set} canExport={canExport} />
        <SourcesCard filters={filters} onFilter={set} canExport={canExport} />
        <InclusionCard filters={filters} canExport={canExport} />
      </div>
    </>
  )
}

/**
 * 3.2 Reports (U4). Numbers: the B7 reports for one filter row, each with "View as table" and a download
 * (reports.export). Form answers: how people filled in one challenge's form (analytics.view).
 */
export default function Reports() {
  const t = useT()
  const { can } = useAuth()
  const tabs = [
    { key: 'numbers', label: t('rep.tab.numbers'), hidden: !can('dashboard.view') },
    { key: 'answers', label: t('rep.tab.answers'), hidden: !can('analytics.view') },
  ].filter((tab) => !tab.hidden)
  const [tab, setTab] = useTabParam(tabs)
  const { filters } = useAnalyticsFilters()

  return (
    <div>
      <PageHeader
        title={t('rep.title')}
        subtitle={t('rep.subtitle')}
        back={can('dashboard.view') ? <Link to={{ pathname: '/dashboard', search: new URLSearchParams(filters).toString() }} className={buttonClasses({ variant: 'ghost', size: 'sm' })}><ArrowLeft size={14} aria-hidden /> {t('dash.title')}</Link> : null}
        actions={tab === 'numbers' && can('reports.export') ? <ExportMenu report="all" filters={filters} label={t('exp.menu', { chart: t('exp.report.all') })} text={t('exp.button')} /> : null}
      />
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('rep.title')} className="mb-3.5" />}
      {tab === 'numbers' && <Numbers />}
      {tab === 'answers' && <Suspense fallback={<PageSkeleton />}><FormAnswers /></Suspense>}
    </div>
  )
}

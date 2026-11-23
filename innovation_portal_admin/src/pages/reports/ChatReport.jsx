import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import ChartCard, { ExportMenu } from '../../components/analytics/ChartCard'
import { byChannelConfig, perDayConfig, ratingsConfig } from '../../components/analytics/chatConfigs'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import ErrorState from '../../components/ui/ErrorState'
import { InputControl } from '../../components/ui/Input'
import PageSkeleton from '../../components/ui/PageSkeleton'
import { SelectControl } from '../../components/ui/Select'
import { useT } from '../../i18n/context'
import { analytics } from '../../lib/api/endpoints'
import { useAuth } from '../../lib/auth/AuthContext'
import { cn } from '../../lib/cn'
import { CHAT_CHANNELS, HOURS, WEEKDAYS, busiestSlot, defaultRange, heatLevel, hourLabel, minutesText, normaliseChatReport, readChatFilters } from '../../lib/analytics/chatReport'

// Reports > Live chat: chat statistics for the hackathon criteria. No Figma frame of its own: it copies the Numbers
// tab (filter row, stat cards, chart cards with "View as table"). A null shows "No data yet", never 0.

const HEAT = ['bg-surface2', 'bg-primary/20', 'bg-primary/40', 'bg-primary/65', 'bg-primary']

function Field({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-bold text-muted">{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value, hint }) {
  const t = useT()
  const none = value === null || value === undefined
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface p-3.5 2xl:p-5">
      <dt className="text-[12px] font-bold text-muted">{label}</dt>
      <dd className={none ? 'mt-1 text-[14px] text-muted' : 'mt-1 font-heading text-[22px] font-bold leading-tight text-text tabular-nums'}>{none ? t('chatrep.noData') : value}</dd>
      {hint && <dd className="mt-0.5 text-[11px] text-muted">{hint}</dd>}
    </div>
  )
}

/** Weekday by hour. Scrolls inside its card on a phone; the page itself never scrolls sideways. */
function BusyGrid({ cells }) {
  const t = useT()
  const counts = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c.chats]))
  const max = Math.max(0, ...cells.map((c) => c.chats))
  return (
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label={t('chatrep.busiest')}>
      <div className="grid min-w-[680px] gap-[2px]" style={{ gridTemplateColumns: '40px repeat(24, minmax(0, 1fr))' }} aria-hidden>
        <span />
        {HOURS.map((h) => <span key={h} className="text-center text-[10px] text-muted">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
        {WEEKDAYS.map((day, d) => (
          <div key={day} className="contents">
            <span className="self-center text-[11px] text-muted">{t(`chatrep.dayShort.${day}`)}</span>
            {HOURS.map((h) => {
              const n = counts.get(`${d}-${h}`) ?? 0
              return <span key={h} title={t('chatrep.cell', { day: t(`chatrep.day.${day}`), hour: hourLabel(h), n })} className={cn('h-5 rounded-[3px]', HEAT[heatLevel(n, max)])} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ChatReport() {
  const t = useT()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readChatFilters(params), [params])
  const canExport = can('reports.export')
  const set = useCallback((key, value) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (value) next.set(key, value); else next.delete(key)
    return next
  }, { replace: true }), [setParams])
  const reset = () => setParams((p) => {
    const next = new URLSearchParams(p)
    ;['from', 'to', 'chat_channel'].forEach((k) => next.delete(k))
    return next
  }, { replace: true })

  const query = useQuery({
    queryKey: ['analytics', 'chat', filters],
    queryFn: () => analytics.chat(filters),
    placeholderData: keepPreviousData,
    retry: (count, err) => err?.status !== 404 && err?.status !== 403 && count < 1,
  })
  const report = useMemo(() => (query.data ? normaliseChatReport(query.data) : null), [query.data])
  const perDay = useMemo(() => (report ? perDayConfig(report.perDay, { t }) : null), [report, t])
  const byChannel = useMemo(() => (report ? byChannelConfig(report.byChannel, { t }) : null), [report, t])
  const ratings = useMemo(() => (report ? ratingsConfig(report.ratings, { t }) : null), [report, t])

  const range = defaultRange()
  const isDefault = filters.from === range.from && filters.to === range.to && !filters.channel
  const channelOptions = [{ value: '', label: t('chatrep.allChannels') }, ...CHAT_CHANNELS.map((c) => ({ value: c, label: t(`chatrep.ch.${c}`) }))]
  const filterRow = (
    <section aria-label={t('chatrep.filters')} className="mb-3.5 rounded-card border border-border bg-surface p-3">
      <div className="grid grid-cols-2 items-end gap-2.5 md:grid-cols-[repeat(2,minmax(0,160px))_minmax(0,240px)_auto_1fr]">
        <Field label={t('chatrep.from')}><InputControl type="date" value={filters.from} max={filters.to} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label={t('chatrep.to')}><InputControl type="date" value={filters.to} min={filters.from} onChange={(e) => set('to', e.target.value)} /></Field>
        <div className="col-span-2 md:col-span-1">
          <Field label={t('chatrep.channel')}><SelectControl aria-label={t('chatrep.channel')} options={channelOptions} value={filters.channel ?? ''} onChange={(v) => set('chat_channel', v)} /></Field>
        </div>
        <span>{!isDefault && <Button variant="ghost" size="sm" onClick={reset}>{t('chatrep.reset')}</Button>}</span>
        <span className="flex justify-end">{canExport && <ExportMenu report="chat" filters={filters} label={t('exp.menu', { chart: t('exp.report.chat') })} text={t('chatrep.export')} />}</span>
      </div>
      <p className="sr-only" aria-live="polite">{query.isPlaceholderData && query.isFetching ? t('chatrep.updating') : ''}</p>
    </section>
  )

  if (query.isLoading) return <>{filterRow}<PageSkeleton /></>
  if (query.isError && !query.data) {
    const missing = query.error?.status === 404
    return (
      <>
        {filterRow}
        <ErrorState framed title={missing ? t('chatrep.unavailable') : t('chatrep.loadError')} message={missing ? t('chatrep.unavailableBody') : query.error?.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
      </>
    )
  }

  const { totals } = report
  const best = busiestSlot(report.busiest)
  const caption = best ? t('chatrep.busiestCaption', { day: t(`chatrep.day.${WEEKDAYS[best.weekday]}`), from: hourLabel(best.hour), to: hourLabel(best.hour + 1) }) : ''
  const none = (v) => (v === null || v === undefined ? t('chatrep.noData') : v)
  const people = [
    { key: 'name', label: t('chatrep.col.name'), sortable: true },
    { key: 'chats', label: t('chatrep.col.handled'), sortable: true, align: 'right', render: none },
    { key: 'medianFirstReply', label: t('chatrep.col.firstReply'), sortable: true, align: 'right', render: (v) => none(minutesText(v, t)) },
    { key: 'rating', label: t('chatrep.col.avgRating'), sortable: true, align: 'right', render: none },
    { key: 'openNow', label: t('chatrep.col.open'), sortable: true, align: 'right', render: none },
  ]

  return (
    <>
      {filterRow}
      {!report.liveChatOn && (
        <p role="note" className="mb-3.5 flex flex-wrap items-center gap-2 rounded-control bg-info-soft px-3 py-2.5 text-[13px] text-text">
          <Info size={15} aria-hidden className="shrink-0 text-info" />
          <span>{t('chatrep.off')}</span>
          {can('settings.manage') && <Link to="/admin/live-chat" className="font-bold text-primary hover:underline">{t('chatrep.openSettings')}</Link>}
        </p>
      )}
      <dl className="mb-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t('chatrep.stat.started')} value={totals.started} />
        <Stat label={t('chatrep.stat.answered')} value={totals.answered} hint={totals.answeredPct === null ? null : t('chatrep.stat.answeredPct', { pct: totals.answeredPct })} />
        <Stat label={t('chatrep.stat.firstReply')} value={minutesText(totals.medianFirstReply, t)} />
        <Stat label={t('chatrep.stat.rating')} value={totals.averageRating === null ? null : t('chatrep.stat.ratingValue', { n: totals.averageRating })} hint={totals.ratedCount ? t('chatrep.stat.rated', { n: totals.ratedCount }) : null} />
        <Stat label={t('chatrep.stat.outside')} value={totals.outsideHours} hint={t('chatrep.stat.outsideHint')} />
        <Stat label={t('chatrep.stat.escalated')} value={totals.escalated} />
      </dl>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title={t('chatrep.perDay')} query={query} isEmpty={report.perDay.every((r) => !r.started && !r.answered)}
          chart={{ config: perDay, label: t('chatrep.perDayLabel') }}
          table={{ columns: [{ key: 'date', label: t('chatrep.col.date') }, { key: 'started', label: t('chatrep.startedSeries'), align: 'right' }, { key: 'answered', label: t('chatrep.answeredSeries'), align: 'right' }], rows: report.perDay.map((r) => ({ id: r.date, ...r })) }} />
        <ChartCard title={t('chatrep.byChannel')} query={query} isEmpty={report.byChannel.every((r) => !r.started && !r.answered)}
          chart={{ config: byChannel, label: t('chatrep.byChannelLabel') }}
          table={{ columns: [{ key: 'name', label: t('chatrep.col.channel') }, { key: 'started', label: t('chatrep.startedSeries'), align: 'right' }, { key: 'answered', label: t('chatrep.answeredSeries'), align: 'right' }], rows: report.byChannel.map((r) => ({ id: r.channel, name: t(`chatrep.ch.${r.channel}`), started: r.started, answered: r.answered })) }} />
        <ChartCard className="lg:col-span-2" title={t('chatrep.busiest')} subtitle={caption} query={query} isEmpty={!best}
          table={{ columns: [{ key: 'day', label: t('chatrep.col.day') }, { key: 'hour', label: t('chatrep.col.hour') }, { key: 'chats', label: t('chatrep.col.chats'), align: 'right' }], rows: report.busiest.filter((c) => c.chats > 0).map((c) => ({ id: `${c.weekday}-${c.hour}`, day: t(`chatrep.day.${WEEKDAYS[c.weekday]}`), hour: hourLabel(c.hour), chats: c.chats })) }}>
          <BusyGrid cells={report.busiest} />
          <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted" aria-hidden>
            {t('chatrep.less')}{HEAT.map((c) => <span key={c} className={cn('h-3 w-3 rounded-[2px]', c)} />)}{t('chatrep.more')}
          </p>
        </ChartCard>
        <ChartCard title={t('chatrep.ratings')} query={query} isEmpty={report.ratings.every((r) => r.count === 0)}
          chart={{ config: ratings, label: t('chatrep.ratingsLabel'), height: 200 }}
          table={{ columns: [{ key: 'label', label: t('chatrep.col.rating') }, { key: 'count', label: t('chatrep.col.count'), align: 'right' }], rows: report.ratings.map((r) => ({ id: r.stars, label: t('chatrep.stars', { n: r.stars }), count: r.count })) }} />
      </div>
      <section className="mt-3.5" aria-labelledby="chat-people">
        <h2 id="chat-people" className="mb-2 font-heading text-[14px] font-bold text-text">{t('chatrep.people')}</h2>
        <DataTable caption={t('chatrep.people')} columns={people} data={report.answerers} pageSize={10} emptyTitle={t('chatrep.noData')} emptyMessage={t('chatrep.peopleEmpty')} />
      </section>
    </>
  )
}

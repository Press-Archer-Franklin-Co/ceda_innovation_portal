import { useId, useState } from 'react'
import { BarChart3, Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import Button from '../ui/Button'
import DropdownMenu from '../ui/DropdownMenu'
import ErrorState from '../ui/ErrorState'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import DataTable from '../ui/DataTable'
import { ChartCanvas } from '../charts/lazy'
import { useT } from '../../i18n/context'
import { useAnalyticsExport } from './useExport'

/** Download menu (CSV or PDF) for one report. Shown only to people with reports.export. */
export function ExportMenu({ report, filters, label, text, compact = false }) {
  const t = useT()
  const start = useAnalyticsExport()
  return (
    <DropdownMenu
      label={label}
      width={200}
      trigger={(props) => (
        <Button {...props} variant={compact ? 'ghost' : 'secondary'} size="sm" icon={<Download size={14} aria-hidden />} aria-label={compact ? label : undefined}>
          {compact ? null : (text ?? t('exp.download'))}
        </Button>
      )}
      items={[
        { key: 'csv', label: t('exp.csv'), icon: <FileSpreadsheet size={14} aria-hidden />, onSelect: () => start(report, 'csv', filters) },
        { key: 'pdf', label: t('exp.pdf'), icon: <FileText size={14} aria-hidden />, onSelect: () => start(report, 'pdf', filters) },
      ]}
    />
  )
}

/**
 * One chart on 3.1 or 3.2: a heading, the chart or the same numbers as a table, and (with reports.export)
 * a download menu. Loading keeps the card's height; an error says so with Retry; no data says what to try.
 *
 * chart: { config, label, height }  table: { columns, rows }  (rows are plain objects keyed by column key)
 */
export default function ChartCard({
  title, subtitle, report, filters, canExport, query, isEmpty, chart, table, note, children, className, height = 220, footer,
}) {
  const t = useT()
  const headingId = useId()
  const [asTable, setAsTable] = useState(false)
  const loading = query?.isLoading
  const failed = query?.isError && !query?.data

  let body
  if (loading) body = <Skeleton className="w-full rounded-control" style={{ height }} />
  else if (failed) body = <ErrorState compact title={t('dash.loadError')} onRetry={() => query.refetch()} retrying={query.isFetching} />
  else if (isEmpty) body = <EmptyState compact icon={BarChart3} title={t('dash.empty')} message={t('dash.emptyBody')} />
  else if (asTable && table) body = <DataTable columns={table.columns} data={table.rows} caption={title} />
  else body = (
    <>
      {chart && <ChartCanvas config={chart.config} label={chart.label} height={chart.height ?? height} />}
      {children}
    </>
  )

  const ready = !loading && !failed && !isEmpty
  return (
    <section aria-labelledby={headingId} className={`flex min-w-0 flex-col rounded-card border border-border bg-surface p-3.5 2xl:p-5 ${className ?? ''}`}>
      <header className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="font-heading text-[14px] font-bold text-text">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ready && table && (
            <Button variant="ghost" size="sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}
              icon={asTable ? <BarChart3 size={14} aria-hidden /> : <Table2 size={14} aria-hidden />}>
              <span className="hidden sm:inline">{asTable ? t('dash.viewChart') : t('dash.viewTable')}</span>
              <span className="sr-only sm:hidden">{asTable ? t('dash.viewChart') : t('dash.viewTable')}</span>
            </Button>
          )}
          {canExport && report && <ExportMenu report={report} filters={filters} label={t('exp.menu', { chart: t(`exp.report.${report}`) })} compact />}
        </div>
      </header>
      <div className="min-h-0 flex-1">{body}</div>
      {ready && note && <div className="mt-2.5">{note}</div>}
      {footer}
    </section>
  )
}

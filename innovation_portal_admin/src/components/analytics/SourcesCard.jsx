import { useMemo } from 'react'
import ChartCard from './ChartCard'
import { channelConfig } from './configs'
import { useT } from '../../i18n/context'
import { useSources } from '../../lib/queries/analytics'
import { channelRows } from '../../lib/analytics/dashboard'

/** Channels as a chart, then the top districts. Clicking a channel bar or a district filters the whole page. */
export default function SourcesCard({ filters, onFilter, canExport, className }) {
  const t = useT()
  const query = useSources(filters)
  const rows = useMemo(() => channelRows(query.data), [query.data])
  const config = useMemo(() => channelConfig(rows, { t, onPick: (ch) => onFilter('channel', ch) }), [rows, t, onFilter])
  const total = query.data?.total ?? 0
  const districts = query.data?.top_districts ?? []
  return (
    <ChartCard className={className} title={t('dash.src.title')} subtitle={query.data ? t('dash.src.subtitle', { count: total }) : ''}
      query={query} isEmpty={!!query.data && total === 0} report="sources" filters={filters} canExport={canExport} height={130}
      chart={{ config, label: t('dash.src.label'), height: 130 }}
      table={{
        columns: [{ key: 'channel', label: t('dash.col.channel') }, { key: 'count', label: t('dash.col.ideas'), align: 'right' }, { key: 'pct', label: t('dash.col.share'), align: 'right' }],
        rows: rows.map((r) => ({ id: r.channel, channel: t(`dash.ch.${r.channel}`), count: r.count, pct: `${r.pct}%` })),
      }}>
      <h3 className="mb-1 mt-3 text-[11px] font-bold text-muted">{t('dash.src.districts')}</h3>
      {districts.length === 0 ? <p className="text-[12px] text-muted">{t('dash.src.noDistricts')}</p> : (
        <ol className="flex flex-col">
          {districts.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onFilter('district', d.slug || d.id)}
                className="flex w-full items-center justify-between gap-2 rounded-control px-1.5 py-1 text-left text-[13px] text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="truncate">{d.name}</span><span className="tabular-nums font-bold">{d.count}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {query.data?.no_district > 0 && <p className="mt-1 px-1.5 text-[12px] text-muted">{t('dash.src.noDistrict', { count: query.data.no_district })}</p>}
    </ChartCard>
  )
}

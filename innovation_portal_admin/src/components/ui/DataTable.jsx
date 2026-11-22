import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import Button from './Button'
import Skeleton from './Skeleton'

/**
 * Figma Foundations › Data table (compact) and its phone card. ceda-ui section 4.
 * A screen supplies columns and cells; it does not restyle the table.
 *
 * columns: [{ key, label, width?, align?, sortable?, render?(value, row), link?(row) -> href, hideOnPhone? }]
 *   link: makes that cell a real <Link> (keyboard, open in new tab). The whole row still opens on click.
 * States: skeleton rows while loading (columns stay), a message row when empty, an error row with Retry.
 * Phone (below md): a stacked card list with the same fields in the same order.
 * Paging: pageSize pages the rows in the browser. For server paging pass page, total, onPageChange
 * (and sort + onSortChange), or use ServerTable.
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  error,
  onRetry,
  retrying = false,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  emptyAction,
  onRowClick,
  // Need help guide: a data-guide id for the rows (the guide rings the first one, e.g. "review.open").
  rowGuide,
  selectable = false,
  selected = [],
  onSelectionChange,
  toolbar,
  footer,
  className,
  caption,
  // Paging (client: pageSize alone; server: page + total + onPageChange)
  pageSize,
  page: pageProp,
  total,
  onPageChange,
  // Sorting (controlled when onSortChange is given): sort = { key, dir: 'asc' | 'desc' }
  sort: sortProp,
  onSortChange,
  skeletonRows = 6,
}) {
  const t = useT()
  const [localSort, setLocalSort] = useState({ key: null, dir: 'asc' })
  const [localPage, setLocalPage] = useState(1)
  const serverSort = Boolean(onSortChange)
  const serverPage = Boolean(onPageChange)
  const sort = serverSort ? sortProp ?? { key: null, dir: 'asc' } : localSort
  const page = serverPage ? pageProp ?? 1 : localPage

  const handleSort = (col) => {
    if (!col.sortable) return
    const next = sort.key === col.key ? { key: col.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
    if (serverSort) onSortChange(next)
    else setLocalSort(next)
  }

  const sortKey = sort.key
  const sortDir = sort.dir
  const sorted = useMemo(() => {
    if (serverSort || !sortKey) return data
    return [...data].sort((a, b) => {
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir, serverSort])

  const totalRows = serverPage ? total ?? data.length : sorted.length
  const totalPages = pageSize ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1
  const rows = !serverPage && pageSize ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted
  const goTo = (p) => (serverPage ? onPageChange(p) : setLocalPage(p))

  const allSelected = data.length > 0 && data.every((r) => selected.includes(r.id))
  const toggleAll = () => (allSelected ? onSelectionChange?.([]) : onSelectionChange?.(data.map((r) => r.id)))
  const toggleRow = (id) =>
    selected.includes(id) ? onSelectionChange?.(selected.filter((s) => s !== id)) : onSelectionChange?.([...selected, id])

  const span = columns.length + (selectable ? 1 : 0)
  const emptyCell = <span className="text-muted" aria-label={t('common.notKnown')}>–</span>

  const cellContent = (col, row) => {
    const value = col.render ? col.render(row[col.key], row) : row[col.key]
    const shown = value === null || value === undefined || value === '' ? emptyCell : value
    const href = col.link?.(row)
    return href ? (
      <Link to={href} onClick={(e) => e.stopPropagation()} className="font-bold text-text hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
        {shown}
      </Link>
    ) : shown
  }

  const errorText = typeof error === 'string' ? error : error?.message

  const sortIcon = (col) =>
    sort.key === col.key ? (
      sort.dir === 'asc' ? <ChevronUp size={12} aria-hidden className="flex-shrink-0" /> : <ChevronDown size={12} aria-hidden className="flex-shrink-0" />
    ) : (
      <ChevronsUpDown size={12} aria-hidden className="opacity-40 flex-shrink-0" />
    )

  const errorBlock = (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px] text-danger">
      <AlertCircle size={15} aria-hidden className="flex-shrink-0" />
      <span className="flex-1 min-w-0">{errorText || t('common.somethingWrong')}</span>
      {onRetry && (
        <Button variant="soft" size="sm" onClick={onRetry} loading={retrying} icon={<RefreshCw size={13} aria-hidden />}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )

  return (
    <div className={cn('w-full flex flex-col min-w-0', className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border">{toolbar}</div>}

      {/* Desktop and tablet: the table. Wide tables scroll sideways inside, never the page. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th className="th" style={{ width: 40 }}>
                  <input type="checkbox" className="checkbox" aria-label={t('table.selectAll')} checked={allSelected} onChange={toggleAll} />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="th"
                  style={{ width: col.width }}
                  aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className={cn('flex items-center gap-1 w-full truncate uppercase tracking-wider hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded', col.align === 'right' && 'justify-end')}
                    >
                      <span className="truncate">{col.label}</span>
                      {sortIcon(col)}
                    </button>
                  ) : (
                    <div className={cn('flex items-center gap-1 truncate', col.align === 'right' && 'justify-end')}>
                      <span className="truncate">{col.label}</span>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={span}>{errorBlock}</td>
              </tr>
            ) : loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} aria-hidden>
                  {selectable && (
                    <td className="td overflow-hidden">
                      <Skeleton className="h-4 w-4" />
                    </td>
                  )}
                  {columns.map((col, j) => (
                    <td key={col.key} className="td overflow-hidden">
                      <Skeleton className="h-3.5" style={{ width: `${50 + ((i * 7 + j * 13) % 40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={span}>
                  <EmptyState compact icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  data-guide={rowGuide}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                    selected.includes(row.id) ? 'bg-primary-soft/60' : 'hover:bg-surface2/70',
                  )}
                >
                  {selectable && (
                    <td className="td overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="checkbox" aria-label={t('table.selectRow')} checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn('td overflow-hidden', col.align === 'right' && 'text-right')}>
                      {cellContent(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phone: the same fields, in the same order, as a stacked card list. */}
      <div className="md:hidden">
        {error ? (
          errorBlock
        ) : loading ? (
          <div className="p-3 space-y-2.5" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border p-3 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState compact icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
        ) : (
          <ul className="p-3 space-y-2.5">
            {rows.map((row, i) => (
              <li
                key={row.id ?? i}
                data-guide={rowGuide}
                onClick={() => onRowClick?.(row)}
                className={cn('rounded-card border border-border bg-surface p-3', onRowClick && 'cursor-pointer active:bg-surface2')}
              >
                {columns.filter((c) => !c.hideOnPhone).map((col, j) => (
                  <div key={col.key} className={cn(j === 0 ? 'text-[14px] font-bold text-text mb-1' : 'flex items-baseline justify-between gap-3 py-0.5 text-[13px]')}>
                    {j > 0 && <span className="text-muted shrink-0">{col.label}</span>}
                    <span className={cn('min-w-0', j > 0 && 'text-right text-text')}>{cellContent(col, row)}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(footer || totalPages > 1) && (
        <div className="border-t border-border px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-muted">{footer}</div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={goTo} />}
        </div>
      )}
    </div>
  )
}

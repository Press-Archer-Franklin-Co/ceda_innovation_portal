import React, { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import EmptyState from './EmptyState'

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  error,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  onRowClick,
  selectable = false,
  selected = [],
  onSelectionChange,
  footer,
  className,
}) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (col) => {
    if (!col.sortable) return
    if (sortKey === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col.key); setSortDir('asc') }
  }

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    const cmp = String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const allSelected = data.length > 0 && data.every(r => selected.includes(r.id))
  const toggleAll   = () => allSelected ? onSelectionChange?.([]) : onSelectionChange?.(data.map(r => r.id))
  const toggleRow   = (id) => selected.includes(id)
    ? onSelectionChange?.(selected.filter(s => s !== id))
    : onSelectionChange?.([...selected, id])

  if (error) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-ceda-red text-sm">
        <AlertCircle size={15} className="flex-shrink-0" />
        {error}
      </div>
    )
  }

  return (
    <div className={cn('w-full flex flex-col', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {selectable && (
                <th className="th" style={{ width: 40 }}>
                  <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn('th', col.sortable && 'cursor-pointer select-none hover:text-ceda-forest')}
                  style={{ width: col.width }}
                  onClick={() => handleSort(col)}
                >
                  <div className={cn('flex items-center gap-1 truncate', col.align === 'right' && 'justify-end')}>
                    <span className="truncate">{col.label}</span>
                    {col.sortable && (
                      sortKey === col.key
                        ? sortDir === 'asc'
                          ? <ChevronUp size={12} className="flex-shrink-0" />
                          : <ChevronDown size={12} className="flex-shrink-0" />
                        : <ChevronsUpDown size={12} className="opacity-40 flex-shrink-0" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {selectable && (
                    <td className="td overflow-hidden">
                      <div className="h-4 w-4 bg-ceda-border rounded animate-pulse" />
                    </td>
                  )}
                  {columns.map((col, j) => (
                    <td key={col.key} className="td overflow-hidden">
                      <div
                        className="h-4 bg-ceda-border rounded animate-pulse"
                        style={{ width: `${50 + ((i * 7 + j * 13) % 40)}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer',
                    selected.includes(row.id)
                      ? 'bg-ceda-green-pale/60'
                      : 'hover:bg-ceda-surface/70'
                  )}
                >
                  {selectable && (
                    <td className="td overflow-hidden" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={cn('td overflow-hidden', col.align === 'right' && 'text-right')}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="border-t border-ceda-border px-4 py-3 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  )
}

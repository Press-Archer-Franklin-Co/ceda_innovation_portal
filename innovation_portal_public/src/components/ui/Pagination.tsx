import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '../../i18n'

export interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}

/** Page numbers with gaps: 1 … 4 5 6 … 12. Shows nothing when there is one page. */
export function pageList(page: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)
  if (start > 2) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('gap')
  out.push(total)
  return out
}

export default function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const t = useT()
  if (totalPages <= 1) return null
  const btn =
    'inline-flex items-center justify-center min-w-[40px] h-10 px-2 rounded-control text-d-label font-body transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <nav aria-label={t('pager.label')} className={clsx('flex items-center justify-center gap-1', className)}>
      <button type="button" className={clsx(btn, 'text-text hover:bg-surface2')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('pager.previous')}>
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span className="sm:hidden text-d-body-s text-muted px-2">{t('pager.of', { page, total: totalPages })}</span>
      <ul className="hidden sm:flex items-center gap-1">
        {pageList(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <li key={`g${i}`} aria-hidden className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-label={t('pager.page', { page: p })}
                aria-current={p === page ? 'page' : undefined}
                className={clsx(btn, p === page ? 'bg-banner text-on-banner' : 'text-text hover:bg-surface2')}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button type="button" className={clsx(btn, 'text-text hover:bg-surface2')} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={t('pager.next')}>
        <ChevronRight size={18} aria-hidden />
      </button>
    </nav>
  )
}

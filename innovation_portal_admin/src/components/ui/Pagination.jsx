import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'

function pageList(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)
  if (start > 2) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('gap')
  out.push(total)
  return out
}

/** Pager: 1 … 4 5 6 … 12. Shows nothing when there is one page. page starts at 1. */
export default function Pagination({ page, totalPages, onChange, className }) {
  const t = useT()
  if (!totalPages || totalPages <= 1) return null
  const btn =
    'inline-flex items-center justify-center min-w-[30px] h-[30px] px-1.5 rounded-control text-[13px] font-bold font-body transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <nav aria-label={t('pager.label')} className={cn('flex items-center gap-1', className)}>
      <button type="button" className={cn(btn, 'text-text hover:bg-surface2')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('pager.previous')}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span className="sm:hidden text-[13px] text-muted px-1.5">{t('pager.of', { page, total: totalPages })}</span>
      <ul className="hidden sm:flex items-center gap-1">
        {pageList(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <li key={`g${i}`} aria-hidden className="px-0.5 text-muted">…</li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-label={t('pager.page', { page: p })}
                aria-current={p === page ? 'page' : undefined}
                className={cn(btn, p === page ? 'bg-banner text-on-banner' : 'text-text hover:bg-surface2')}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button type="button" className={cn(btn, 'text-text hover:bg-surface2')} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={t('pager.next')}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

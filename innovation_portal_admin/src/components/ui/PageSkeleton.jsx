import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import Skeleton, { SkeletonText } from './Skeleton'

/**
 * Whole-page placeholder while a lazy page loads (the Suspense fallback in AppLayout) or while a
 * page's first data arrives. Shapes: list (header + toolbar + table rows), detail (header + two
 * columns), stats (cards + chart area), form (header + fields). Real heights, so nothing jumps.
 */
export default function PageSkeleton({ shape = 'list', className }) {
  const t = useT()
  return (
    <div role="status" aria-label={t('common.loading')} className={cn('w-full', className)}>
      <div className="flex items-start justify-between gap-4 mb-[14px] 2xl:mb-[22px]">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      {shape === 'list' && (
        <div className="rounded-card border border-border overflow-hidden">
          <div className="flex gap-2 px-3 py-2.5 border-b border-border">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="h-8 bg-surface2" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 h-9 2xl:h-11 border-b border-border/60 last:border-0">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      )}

      {shape === 'detail' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-[14px] 2xl:gap-[22px]">
          <div className="rounded-card border border-border p-[14px] 2xl:p-[22px] space-y-4">
            <Skeleton className="h-9 w-full" />
            <SkeletonText lines={6} />
            <SkeletonText lines={4} />
          </div>
          <div className="rounded-card border border-border p-[14px] 2xl:p-[22px] space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <SkeletonText lines={5} />
          </div>
        </div>
      )}

      {shape === 'stats' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] 2xl:gap-[22px] mb-[14px] 2xl:mb-[22px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border p-[14px] space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-card border border-border p-[14px]">
            <Skeleton className="h-[260px] w-full" />
          </div>
        </>
      )}

      {shape === 'form' && (
        <div className="rounded-card border border-border p-[14px] 2xl:p-[22px] max-w-3xl space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className={i === 3 ? 'h-24 w-full' : 'h-[34px] w-full'} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const ListPageSkeleton = (props) => <PageSkeleton {...props} shape="list" />
export const DetailPageSkeleton = (props) => <PageSkeleton {...props} shape="detail" />
export const StatsPageSkeleton = (props) => <PageSkeleton {...props} shape="stats" />
export const FormPageSkeleton = (props) => <PageSkeleton {...props} shape="form" />

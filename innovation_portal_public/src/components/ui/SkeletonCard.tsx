import Skeleton, { SkeletonText } from './Skeleton'

// Older names, kept for existing pages. Built on <Skeleton>.

export function SkeletonCard() {
  return (
    <div className="rounded-card border border-border overflow-hidden bg-surface" aria-hidden>
      <Skeleton className="h-36 rounded-none" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <SkeletonText lines={2} />
      </div>
    </div>
  )
}

interface SkeletonGridProps {
  count?: number
  columns?: string
}

export function SkeletonGrid({ count = 3, columns = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }: SkeletonGridProps) {
  return (
    <div className={`grid ${columns} gap-5`} role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3" aria-hidden>
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-20" />
    </div>
  )
}

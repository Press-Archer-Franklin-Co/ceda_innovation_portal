export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-36 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
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
    <div className={`grid ${columns} gap-5`}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 animate-pulse">
      <div className="h-8 w-8 bg-gray-200 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
      <div className="h-6 bg-gray-100 rounded-lg w-20" />
    </div>
  )
}

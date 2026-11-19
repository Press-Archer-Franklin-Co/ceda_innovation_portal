import { cn } from '../../lib/cn'

/** A cream block at the real size of what is loading, so nothing jumps. Tables use skeleton rows (LoadingSkeleton.SkeletonTable). */
export default function Skeleton({ className, style }) {
  return <span aria-hidden className={cn('block rounded-control bg-surface2 animate-pulse motion-reduce:animate-none', className)} style={style} />
}

/** Skeleton lines for a block of text. */
export function SkeletonText({ lines = 3, className }) {
  return (
    <span aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  )
}

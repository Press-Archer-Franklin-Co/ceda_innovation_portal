import clsx from 'clsx'
import { CSSProperties } from 'react'
import { useT } from '../../i18n'

/** A grey block in the cream tint. Give it the real size of what is loading so nothing jumps. */
export default function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={clsx('block rounded-control bg-surface2 animate-pulse motion-reduce:animate-none', className)} style={style} />
}

/** Skeleton lines for a block of text. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={clsx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  )
}

/** Figma Foundations › States, fourth card: a loading card at the card's real height. */
export function SkeletonBlock({ className, height }: { className?: string; height?: number }) {
  const t = useT()
  return (
    <div role="status" aria-label={t('common.loading')} className={clsx('rounded-card border border-border bg-surface p-5', className)} style={{ minHeight: height }}>
      <Skeleton className="h-3 w-1/3 mb-4" />
      <Skeleton className="h-7 w-1/2 mb-4" />
      <SkeletonText lines={2} />
    </div>
  )
}

import React from 'react'
import { cn } from '../../lib/cn'

function SkeletonBar({ width = 'w-full', height = 'h-4', className }) {
  return (
    <div
      className={cn(
        'bg-ceda-border/60 rounded animate-pulse',
        width,
        height,
        className
      )}
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="divide-y divide-ceda-border/40">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBar
              key={c}
              height="h-3.5"
              width={c === 0 ? 'w-24' : c === cols - 1 ? 'w-16' : 'flex-1'}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="h-1.5 bg-ceda-border/60 animate-pulse" />
          <div className="p-5 space-y-3">
            <div className="flex justify-between">
              <SkeletonBar width="w-20" height="h-3" />
              <SkeletonBar width="w-16" height="h-3" />
            </div>
            <SkeletonBar width="w-3/4" height="h-4" />
            <SkeletonBar width="w-full" height="h-3" />
            <SkeletonBar width="w-5/6" height="h-3" />
            <div className="flex gap-2 pt-2">
              <SkeletonBar width="w-14" height="h-5" />
              <SkeletonBar width="w-14" height="h-5" />
            </div>
            <div className="border-t border-ceda-border/40 pt-3 flex gap-4">
              <SkeletonBar width="w-1/3" height="h-5" />
              <SkeletonBar width="w-1/3" height="h-5" />
              <SkeletonBar width="w-1/3" height="h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4 mb-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-ceda-border/60 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBar width="w-24" height="h-3" />
            <SkeletonBar width="w-16" height="h-6" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default SkeletonBar

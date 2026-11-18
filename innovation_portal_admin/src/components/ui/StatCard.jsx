import React from 'react'
import { cn } from '../../lib/cn'
import { TrendingUp, TrendingDown } from 'lucide-react'


const COLOR_MAP = {
  green:  { border: 'border-l-ceda-green',  icon: 'text-ceda-green',  dot: 'bg-ceda-green'  },
  forest: { border: 'border-l-ceda-forest', icon: 'text-ceda-forest', dot: 'bg-ceda-forest' },
  indigo: { border: 'border-l-ceda-indigo', icon: 'text-ceda-indigo', dot: 'bg-ceda-indigo' },
  gold:   { border: 'border-l-ceda-gold',   icon: 'text-ceda-gold',   dot: 'bg-ceda-gold'   },
  red:    { border: 'border-l-ceda-red',    icon: 'text-ceda-red',    dot: 'bg-ceda-red'    },
}

export default function StatCard({ title, value, icon: Icon, color = 'green', trend, subtitle, loading, className }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.green

  if (loading) {
    return (
      <div className={cn('card border-l-2 border-l-ceda-border px-4 py-3.5', className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-2.5 w-20 bg-ceda-border rounded animate-pulse" />
            <div className="h-7 w-14 bg-ceda-border rounded animate-pulse" />
            <div className="h-2 w-24 bg-ceda-border/60 rounded animate-pulse" />
          </div>
          <div className="w-7 h-7 rounded bg-ceda-border animate-pulse flex-shrink-0 mt-0.5" />
        </div>
      </div>
    )
  }

  const trendUp   = trend?.value > 0
  const trendDown = trend?.value < 0

  return (
    <div className={cn(
      'card border-l-2 px-4 py-3.5 hover:shadow-card-hover transition-shadow duration-150',
      c.border,
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-ceda-muted uppercase tracking-widest truncate leading-none mb-2">
            {title}
          </p>
          <p className="data-value text-[26px] leading-none tracking-tight text-ceda-dark">
            {value ?? '—'}
          </p>

          {(subtitle || trend) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {trend && (
                <span className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] font-semibold',
                  trendUp ? 'text-ceda-green' : trendDown ? 'text-ceda-red' : 'text-ceda-muted'
                )}>
                  {trendUp  && <TrendingUp  size={10} />}
                  {trendDown && <TrendingDown size={10} />}
                  {trend.value > 0 ? '+' : ''}{trend.value}
                  {trend.label && (
                    <span className="text-ceda-muted font-normal ml-0.5">{trend.label}</span>
                  )}
                </span>
              )}
              {subtitle && (
                <span className="text-[10px] text-ceda-muted leading-none">{subtitle}</span>
              )}
            </div>
          )}
        </div>

        {Icon && (
          <div className="flex-shrink-0 mt-0.5">
            <Icon size={16} className={cn(c.icon, 'opacity-60')} strokeWidth={1.75} />
          </div>
        )}
      </div>
    </div>
  )
}

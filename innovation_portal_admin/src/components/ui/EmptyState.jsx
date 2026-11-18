import React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  message,
  action,
  className,
  compact = false,
  steps,
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-10 px-6' : 'py-16 px-6',
      className
    )}>
      <div className={cn(
        'rounded-full bg-ceda-surface border border-ceda-border flex items-center justify-center mb-3',
        compact ? 'w-9 h-9' : 'w-12 h-12'
      )}>
        <Icon size={compact ? 15 : 20} className="text-ceda-muted" strokeWidth={1.5} />
      </div>

      <p className={cn('font-semibold text-ceda-dark', compact ? 'text-sm' : 'text-sm')}>{title}</p>

      {message && (
        <p className={cn('text-ceda-muted mt-0.5 max-w-xs', compact ? 'text-xs' : 'text-xs')}>
          {message}
        </p>
      )}

      {steps && steps.length > 0 && (
        <div className="mt-6 w-full max-w-sm text-left">
          <p className="text-[10px] font-semibold text-ceda-muted uppercase tracking-widest mb-3 text-center">
            Get started
          </p>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3 relative">
                {i < steps.length - 1 && (
                  <div className="absolute left-[13px] top-6 bottom-0 w-px bg-ceda-border" />
                )}
                <div className="flex-shrink-0 w-7 h-7 rounded-full border border-ceda-border bg-white flex items-center justify-center z-10">
                  <span className="text-[10px] font-bold text-ceda-muted tabular-nums">{i + 1}</span>
                </div>
                <div className="pb-4 pt-0.5 flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ceda-dark leading-none">{step.label}</p>
                  {step.description && (
                    <p className="text-[11px] text-ceda-muted mt-0.5 leading-relaxed">{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {action && <div className={cn('mt-4', steps ? 'mt-3' : '')}>{action}</div>}
    </div>
  )
}

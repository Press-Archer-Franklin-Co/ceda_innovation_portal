import React from 'react'
import { cn } from '../../lib/cn'

export default function SectionCard({ title, subtitle, actions, padding = true, footer, children, className }) {
  const hasHeader = title || actions

  return (
    <div className={cn('card flex flex-col', className)}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ceda-border flex-shrink-0">
          <div className="min-w-0">
            {title && <p className="text-sm font-semibold text-ceda-dark truncate">{title}</p>}
            {subtitle && <p className="text-xs text-ceda-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}

      <div className={cn('flex-1 min-h-0', padding && 'p-5')}>
        {children}
      </div>

      {footer && (
        <div className="border-t border-ceda-border px-5 py-3 flex-shrink-0">
          {footer}
        </div>
      )}
    </div>
  )
}

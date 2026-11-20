import React from 'react'
import { cn } from '../../lib/cn'

export default function PageHeader({ title, subtitle, actions, back, badge, className }) {
  return (
    <div className={cn('mb-6', className)}>
      {back && <div className="mb-2">{back}</div>}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-ceda-dark tracking-tight truncate">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm text-ceda-muted">{subtitle}</p>
          )}
        </div>
        {/* min-w-0 and max-w-full let several actions wrap on a phone instead of running off the screen (R-24). */}
        {actions && (
          <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

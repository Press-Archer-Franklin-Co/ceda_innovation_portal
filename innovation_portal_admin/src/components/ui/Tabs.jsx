import React from 'react'
import { cn } from '../../lib/cn'

export default function Tabs({ tabs = [], active, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-0 border-b border-ceda-border overflow-x-auto', className)}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange?.(tab.key)}
          className={cn(
            'tab-btn flex items-center gap-2 flex-shrink-0',
            active === tab.key ? 'tab-active' : 'tab-inactive'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold px-1',
              active === tab.key
                ? 'bg-ceda-forest text-white'
                : 'bg-ceda-border text-ceda-muted'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

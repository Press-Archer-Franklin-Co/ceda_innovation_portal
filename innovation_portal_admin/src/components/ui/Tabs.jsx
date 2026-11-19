import { useId, useRef } from 'react'
import { cn } from '../../lib/cn'

/**
 * Figma Foundations › Tabs. tabs: [{ key, label, count?, disabled? }].
 * Underline strip (variant "line", default) or cream pill (variant "segment").
 * Count sits in a muted pill (red tint when selected). Below lg the strip scrolls sideways; labels never wrap.
 * Hide tabs the person cannot read, and keep the selected tab in the URL (?tab=).
 * Staff density: 36px strip, 40px from 2xl.
 */
export default function Tabs({ tabs = [], active, onChange, variant = 'line', label, idPrefix, className }) {
  const auto = useId().replace(/:/g, '')
  const prefix = idPrefix ?? `tabs${auto}`
  const refs = useRef({})

  const onKey = (e, index) => {
    const enabled = tabs.filter((t) => !t.disabled)
    const pos = enabled.findIndex((t) => t.key === tabs[index].key)
    let next
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (next) {
      e.preventDefault()
      onChange?.(next.key)
      refs.current[next.key]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'line' ? 'gap-0.5 border-b border-border' : 'gap-1.5',
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[tab.key] = el }}
            id={`${prefix}-tab-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange?.(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap font-heading text-[13px] leading-5 2xl:text-[14px] transition-colors',
              'h-9 2xl:h-10 px-2.5 2xl:px-3 rounded-control',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variant === 'line' &&
                (selected
                  ? 'text-text font-bold after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:bg-primary after:rounded-full'
                  : 'text-muted font-medium hover:text-text'),
              variant === 'segment' && (selected ? 'bg-surface2 text-text font-bold' : 'text-muted font-medium hover:text-text'),
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full font-body text-[11px] font-bold tabular-nums',
                  selected ? 'bg-primary-soft text-primary' : 'bg-surface2 text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Panel paired with a tab from <Tabs idPrefix=...>. */
export function TabPanel({ idPrefix, tabKey, children, className }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tabKey}`} aria-labelledby={`${idPrefix}-tab-${tabKey}`} tabIndex={0} className={cn('focus:outline-none', className)}>
      {children}
    </div>
  )
}

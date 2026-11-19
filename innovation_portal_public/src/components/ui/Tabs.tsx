import { KeyboardEvent, ReactNode, useId, useRef } from 'react'
import clsx from 'clsx'

// Figma Foundations › Tabs: underline strip, count in a muted pill (red tint when selected).
// Below lg the strip scrolls sideways; labels never wrap. Hide tabs the person cannot read;
// keep the selected tab in the URL with useTabParam (src/lib/useTabParam.ts).

export interface TabItem<K extends string = string> {
  key: K
  label: ReactNode
  count?: number
  disabled?: boolean
  /** Data this person cannot read: the tab is not shown. */
  hidden?: boolean
}

export interface TabsProps<K extends string = string> {
  tabs: TabItem<K>[]
  active: K
  onChange: (key: K) => void
  /** "line": underline strip (default). "segment": cream pill for the selected tab. */
  variant?: 'line' | 'segment'
  /** Accessible name for the tab list. */
  label?: string
  /** id prefix so panels can use aria-labelledby={`${idPrefix}-tab-${key}`}. */
  idPrefix?: string
  className?: string
}

export default function Tabs<K extends string = string>({ tabs: allTabs, active, onChange, variant = 'line', label, idPrefix, className }: TabsProps<K>) {
  const tabs = allTabs.filter((t) => !t.hidden)
  const auto = useId().replace(/:/g, '')
  const prefix = idPrefix ?? `tabs${auto}`
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: KeyboardEvent, index: number) => {
    const enabled = tabs.filter((t) => !t.disabled)
    const pos = enabled.findIndex((t) => t.key === tabs[index].key)
    let next: TabItem<K> | undefined
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (next) {
      e.preventDefault()
      onChange(next.key)
      refs.current[next.key]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        'flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'line' ? 'gap-1 border-b border-border' : 'gap-2',
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            ref={(el) => (refs.current[tab.key] = el)}
            id={`${prefix}-tab-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              'relative shrink-0 inline-flex items-center gap-2 whitespace-nowrap font-heading text-[14px] leading-5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded-control',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variant === 'line' && 'h-10 px-3',
              variant === 'line' && (selected ? 'text-text font-bold after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary after:rounded-full' : 'text-muted font-medium hover:text-text'),
              variant === 'segment' && 'h-10 px-4',
              variant === 'segment' && (selected ? 'bg-surface2 text-text font-bold' : 'text-muted font-medium hover:text-text'),
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full font-body text-[11px] font-bold tabular-nums',
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
export function TabPanel({ idPrefix, tabKey, children, className }: { idPrefix: string; tabKey: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tabKey}`} aria-labelledby={`${idPrefix}-tab-${tabKey}`} tabIndex={0} className={clsx('focus:outline-none', className)}>
      {children}
    </div>
  )
}

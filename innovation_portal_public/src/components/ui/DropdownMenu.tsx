import { KeyboardEvent, ReactNode, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import Popover from './Popover'
import { rememberOrigin } from '../../lib/motion/origin'

// Figma Foundations › Dropdown menu. Actions that grow out of their button (small genie).
// Gate each item on what this person may do: hidden: !can(...). Danger items sit last after a divider.

export interface MenuItem {
  key?: string
  label: string
  icon?: ReactNode
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
}

export interface TriggerProps {
  ref: React.RefObject<HTMLButtonElement>
  type: 'button'
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
}

export default function DropdownMenu({
  items, label = 'More actions', trigger, align = 'end', width = 240, inline = false,
}: {
  items: MenuItem[]
  label?: string
  trigger?: (props: TriggerProps) => ReactNode
  align?: 'start' | 'end'
  width?: number
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shown = items.filter((i) => !i.hidden)
  if (shown.length === 0) return null
  const normal = shown.filter((i) => !i.danger)
  const danger = shown.filter((i) => i.danger)

  const focusItem = (dir: number | 'first' | 'last') => {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
    if (!els.length) return
    const i = els.indexOf(document.activeElement as HTMLElement)
    const next = dir === 'first' ? 0 : dir === 'last' ? els.length - 1 : (i + dir + els.length) % els.length
    els[next].focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1) }
    else if (e.key === 'Home') { e.preventDefault(); focusItem('first') }
    else if (e.key === 'End') { e.preventDefault(); focusItem('last') }
    else if (e.key === 'Tab') setOpen(false)
  }

  const triggerProps: TriggerProps = {
    ref: triggerRef,
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
    },
  }

  const row = (item: MenuItem) => (
    <button
      key={item.key ?? item.label}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => { setOpen(false); rememberOrigin(triggerRef.current); item.onSelect?.() }}
      className={clsx(
        'w-full flex items-center gap-3 px-3 min-h-[44px] sm:min-h-[40px] rounded-control text-left text-d-body-s',
        'focus:outline-none focus-visible:bg-surface2 hover:bg-surface2 disabled:opacity-50 disabled:cursor-not-allowed',
        item.danger ? 'text-danger' : 'text-text',
      )}
    >
      {item.icon && <span aria-hidden className={clsx('flex shrink-0', item.danger ? 'text-danger' : 'text-muted')}>{item.icon}</span>}
      <span className="truncate">{item.label}</span>
    </button>
  )

  return (
    <span className={clsx('inline-flex', inline && 'relative')}>
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <button {...triggerProps} aria-label={label} className="w-10 h-10 rounded-control flex items-center justify-center text-muted hover:bg-surface2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <MoreHorizontal size={18} aria-hidden />
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align={align} width={width} role="menu" label={label} inline={inline} className="p-1.5">
        <div ref={listRef} onKeyDown={onKeyDown}>
          {normal.map(row)}
          {danger.length > 0 && normal.length > 0 && <div role="separator" className="my-1 border-t border-border" />}
          {danger.map(row)}
        </div>
      </Popover>
    </span>
  )
}

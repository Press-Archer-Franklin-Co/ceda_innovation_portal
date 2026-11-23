import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '../../lib/cn'
import Popover from './Popover'
import { rememberOrigin } from '../../lib/motion/origin'

/**
 * Figma Foundations › Dropdown menu. A list of actions that grows out of its button (small genie).
 * items: [{ key, label, icon?, onSelect, danger?, disabled?, hidden? }]. Gate each item on what this
 * person may do (ceda-security): pass hidden: !can(...). Danger items sit last, after a divider.
 * Arrow keys, Home/End move; Enter or Space picks; Esc closes and returns focus to the button.
 *
 *   <DropdownMenu label="Actions for Debswana" items={[...]} />
 *   <DropdownMenu trigger={(props) => <Button {...props} variant="secondary">More</Button>} items={[...]} />
 */
export default function DropdownMenu({ items = [], label = 'More actions', trigger, align = 'end', width = 220, inline = false }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const shown = items.filter((i) => !i.hidden)
  if (shown.length === 0) return null
  const normal = shown.filter((i) => !i.danger)
  const danger = shown.filter((i) => i.danger)

  const focusItem = (dir) => {
    const els = [...(listRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? [])]
    if (!els.length) return
    const i = els.indexOf(document.activeElement)
    const next = dir === 'first' ? 0 : dir === 'last' ? els.length - 1 : (i + dir + els.length) % els.length
    els[next].focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1) }
    else if (e.key === 'Home') { e.preventDefault(); focusItem('first') }
    else if (e.key === 'End') { e.preventDefault(); focusItem('last') }
    else if (e.key === 'Tab') setOpen(false)
  }

  const pick = (item) => {
    setOpen(false)
    // A dialog this item opens comes out of the menu's button (the item itself is about to go).
    rememberOrigin(triggerRef.current)
    item.onSelect?.()
  }

  const triggerProps = {
    ref: triggerRef,
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } },
  }

  const row = (item) => (
    <button
      key={item.key ?? item.label}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => pick(item)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 h-8 2xl:h-9 rounded-control text-left text-[13px] 2xl:text-[14px]',
        'focus:outline-none focus-visible:bg-surface2 hover:bg-surface2 disabled:opacity-50 disabled:cursor-not-allowed',
        item.danger ? 'text-danger' : 'text-text',
      )}
    >
      {item.icon && <span aria-hidden className={cn('flex shrink-0', item.danger ? 'text-danger' : 'text-muted')}>{item.icon}</span>}
      <span className="truncate">{item.label}</span>
    </button>
  )

  return (
    <span className={cn('inline-flex', inline && 'relative')}>
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <button {...triggerProps} aria-label={label} className="btn-icon">
          <MoreHorizontal size={16} aria-hidden />
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

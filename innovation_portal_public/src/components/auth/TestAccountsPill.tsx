import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, Users } from 'lucide-react'
import clsx from 'clsx'
import Popover from '../ui/Popover'
import { useI18n } from '../../i18n'
import type { DemoAccount } from '../../services/auth.service'

/**
 * U7 (Figma 2.0 pin 3): floating "Test accounts · Demo" pill on the sign-in page.
 * Only rendered when public-config sends demo_logins, which the server does only while
 * the demo server setting and the demo_logins switch are both on.
 * Tab reaches the pill, Enter or ArrowDown opens it, arrows move, Esc closes.
 */
export default function TestAccountsPill({
  accounts,
  busyId,
  onPick,
}: {
  accounts: DemoAccount[]
  busyId?: string | null
  onPick: (account: DemoAccount) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])

  const focusItem = (dir: number | 'first' | 'last') => {
    const els = items()
    if (!els.length) return
    const i = els.indexOf(document.activeElement as HTMLElement)
    const next = dir === 'first' ? 0 : dir === 'last' ? els.length - 1 : (i + dir + els.length) % els.length
    els[next].focus()
  }

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => focusItem('first'), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  const onListKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1) }
    else if (e.key === 'Home') { e.preventDefault(); focusItem('first') }
    else if (e.key === 'End') { e.preventDefault(); focusItem('last') }
    else if (e.key === 'Tab') setOpen(false)
  }

  if (!accounts.length) return null

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={clsx(
          'inline-flex h-10 items-center gap-2 rounded-full border-2 border-dashed border-amber bg-warning-soft px-4',
          'text-d-label-s text-text shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <Users size={16} aria-hidden className="text-muted" />
        <span>{t('demo.pill')}</span>
        <span className="rounded-full bg-amber/20 px-2 py-0.5 text-d-cap font-semibold text-accent">{t('demo.badge')}</span>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align="end" width={300} role="menu" label={t('demo.pill')} className="p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-d-cap text-muted">{t('demo.intro')}</p>
        <div ref={listRef} onKeyDown={onListKeyDown}>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="menuitem"
              disabled={Boolean(busyId)}
              aria-label={t('demo.signIn', { name: account.name, role: account.role_label })}
              onClick={() => {
                setOpen(false)
                onPick(account)
              }}
              className={clsx(
                'flex min-h-[48px] w-full items-center gap-3 rounded-control px-2 text-left',
                'hover:bg-surface2 focus:outline-none focus-visible:bg-surface2 disabled:cursor-wait disabled:opacity-60',
              )}
            >
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-d-cap font-semibold text-muted">
                {account.initials || account.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-d-label-s text-text">{account.role_label}</span>
                <span className="block truncate text-d-cap text-muted">{account.name}</span>
              </span>
              <ArrowRight size={16} aria-hidden className="shrink-0 text-primary" />
            </button>
          ))}
        </div>
        <p className="mt-1 border-t border-border px-2 pb-1 pt-2 text-d-cap text-muted">{t('demo.note')}</p>
      </Popover>
    </div>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import Field from './Field'
import { anchorStyle } from './anchor'
import { CONTROL_HEIGHT, controlClasses, useField } from './fieldContext'

/**
 * Choose one from a list. A button that opens a listbox; arrows, Home/End, Enter, Esc.
 * options: [{ value, label, keywords?, disabled? }]. Search box is on for more than 8 options.
 * U0 extends this (async options, MultiSelect). Never a raw <select>.
 */
export function SelectControl({ options, value, onChange, placeholder, searchable, disabled, invalid, name, className, 'aria-label': ariaLabel, 'data-guide': guide }) {
  const t = useT()
  const field = useField()
  const auto = useId().replace(/:/g, '')
  const buttonId = field?.controlId ?? `s${auto}`
  const listId = `${buttonId}-list`
  const isInvalid = invalid ?? field?.invalid ?? false
  const withSearch = searchable ?? options.length > 8

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  // The list is fixed next to the button (so a scrolling Modal body cannot clip it) but stays in
  // this DOM, inside the Modal. Re-place it when anything scrolls or the window resizes.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const again = () => setTick((n) => n + 1)
    window.addEventListener('scroll', again, true)
    window.addEventListener('resize', again)
    return () => {
      window.removeEventListener('scroll', again, true)
      window.removeEventListener('resize', again)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
    requestAnimationFrame(() => (withSearch ? searchRef.current : listRef.current)?.focus())
  }

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (o) => {
    if (!o || o.disabled) return
    onChange(o.value)
    close()
  }

  const move = (delta) => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + delta + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
  }

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) { e.preventDefault(); choose(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') { close(false) }
    else if (!withSearch && e.key.length === 1) {
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) setActive(i)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        data-guide={guide}
        ref={buttonRef}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList() }
        }}
        className={controlClasses(isInvalid, cn(CONTROL_HEIGHT, 'pl-3 pr-9 text-left flex items-center'))}
      >
        <span className={cn('truncate', !selected && 'text-muted')}>{selected?.label ?? placeholder ?? t('common.choose')}</span>
        <ChevronDown size={16} aria-hidden className={cn('absolute right-2.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      {open && (
        <div
          style={anchorStyle(buttonRef.current, { width: Math.max(buttonRef.current?.offsetWidth ?? 0, 200), maxHeight: 320 })}
          className="fixed z-[60] flex flex-col rounded-card bg-surface border border-border shadow-pop overflow-hidden"
        >
          {withSearch && (
            <div className="p-1.5 border-b border-border">
              <div className="relative">
                <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                  onKeyDown={onListKey}
                  placeholder={t('common.search')}
                  aria-label={t('common.search')}
                  aria-controls={listId}
                  aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                  className="w-full h-8 pl-8 pr-2.5 rounded-control bg-surface2 text-[13px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={buttonId}
            aria-activedescendant={!withSearch && shown[active] ? `${listId}-${active}` : undefined}
            onKeyDown={withSearch ? undefined : onListKey}
            className="flex-1 min-h-0 overflow-y-auto py-1 focus:outline-none"
          >
            {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">{t('common.noMatches')}</li>}
            {shown.map((o, i) => {
              const isSel = o.value === value
              return (
                <li
                  key={String(o.value)}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 min-h-[32px] text-[13px] cursor-pointer',
                    i === active && 'bg-surface2',
                    isSel ? 'text-primary font-bold' : 'text-text',
                    o.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSel && <Check size={14} aria-hidden />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Label + Select + hint/error. */
export default function Select({ label, hint, error, optional, required, hideLabel, id, fieldClassName, ...control }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} hideLabel={hideLabel} id={id} className={fieldClassName}>
      <SelectControl {...control} />
    </Field>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import Field from './Field'
import { controlClasses, useField } from './fieldContext'
import { anchorStyle } from './anchor'

/**
 * Figma Foundations › Multi-select. Choose several from a long list (judges, districts, partners).
 * Chosen items show as chips with a remove button; the list is searchable (label and keywords)
 * and stays in this DOM, so it works inside a Modal.
 * options: [{ value, label, keywords?, disabled? }], value: array of option values.
 */
export function MultiSelectControl({ options, value = [], onChange, placeholder, disabled, invalid, className, 'aria-label': ariaLabel }) {
  const t = useT()
  const field = useField()
  const auto = useId().replace(/:/g, '')
  const buttonId = field?.controlId ?? `ms${auto}`
  const listId = `${buttonId}-list`
  const isInvalid = invalid ?? field?.invalid ?? false
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const boxRef = useRef(null)
  const searchRef = useRef(null)
  const [, setTick] = useState(0)

  const chosen = options.filter((o) => value.includes(o.value))
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const again = () => setTick((n) => n + 1)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', again, true)
    window.addEventListener('resize', again)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', again, true)
      window.removeEventListener('resize', again)
    }
  }, [open])

  const openList = () => {
    if (disabled) return
    setQuery('')
    setActive(0)
    setOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const toggle = (o) => {
    if (!o || o.disabled) return
    onChange(value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value])
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); toggle(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); boxRef.current?.focus() }
    else if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1))
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        ref={boxRef}
        id={buttonId}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openList() } }}
        className={controlClasses(isInvalid, cn('min-h-[34px] 2xl:min-h-[38px] py-1 pl-1.5 pr-9 flex flex-wrap items-center gap-1 cursor-pointer', disabled && 'bg-surface2 cursor-not-allowed'))}
      >
        {chosen.length === 0 && <span className="px-1.5 text-muted">{placeholder ?? t('common.choose')}</span>}
        {chosen.map((o) => (
          <span key={String(o.value)} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface2 text-[12px] font-bold text-text">
            {o.label}
            <button
              type="button"
              aria-label={t('common.removeItem', { item: o.label })}
              onClick={(e) => { e.stopPropagation(); toggle(o) }}
              disabled={disabled}
              className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:bg-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={11} strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <ChevronDown size={16} aria-hidden className={cn('absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-transform', open && 'rotate-180')} />
      </div>

      {open && (
        <div
          style={anchorStyle(boxRef.current, { width: Math.max(boxRef.current?.offsetWidth ?? 0, 220), maxHeight: 320 })}
          className="fixed z-[60] flex flex-col rounded-card bg-surface border border-border shadow-pop overflow-hidden"
        >
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={onKey}
                placeholder={t('common.search')}
                aria-label={t('common.search')}
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                className="w-full h-8 pl-8 pr-2.5 rounded-control bg-surface2 text-[13px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-labelledby={buttonId} className="flex-1 min-h-0 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">{t('common.noMatches')}</li>}
            {shown.map((o, i) => {
              const isSel = value.includes(o.value)
              return (
                <li
                  key={String(o.value)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o)}
                  className={cn('flex items-center gap-2.5 px-3 py-1.5 min-h-[32px] text-[13px] cursor-pointer', i === active && 'bg-surface2', o.disabled && 'opacity-50 cursor-not-allowed')}
                >
                  <span aria-hidden className={cn('w-4 h-4 rounded-[4px] border-2 flex items-center justify-center shrink-0', isSel ? 'bg-primary border-primary text-on-primary' : 'border-muted/60')}>
                    {isSel && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate text-text">{o.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Label + MultiSelect + hint/error. */
export default function MultiSelect({ label, hint, error, optional, required, hideLabel, id, fieldClassName, ...control }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} hideLabel={hideLabel} id={id} className={fieldClassName}>
      <MultiSelectControl {...control} />
    </Field>
  )
}

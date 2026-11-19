import { KeyboardEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import clsx from 'clsx'
import Field, { controlClasses, FieldProps, useField } from './Field'
import { anchorStyle } from './anchor'
import { useT } from '../../i18n'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
  /** Extra words to match when searching (e.g. a district's old name). */
  keywords?: string
  disabled?: boolean
}

export interface SelectControlProps<V extends string | number = string> {
  options: SelectOption<V>[]
  value: V | null | undefined
  onChange: (value: V) => void
  placeholder?: string
  /** Shows a search box in the list. On by default for more than 8 options. */
  searchable?: boolean
  disabled?: boolean
  invalid?: boolean
  name?: string
  className?: string
  'aria-label'?: string
}

/** Choose one from a list. A button that opens a listbox; type to jump or search. Never a raw <select>. */
export function SelectControl<V extends string | number = string>({
  options,
  value,
  onChange,
  placeholder,
  searchable,
  disabled,
  invalid,
  name,
  className,
  'aria-label': ariaLabel,
}: SelectControlProps<V>) {
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
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

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
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const i = Math.max(0, options.findIndex((o) => o.value === value))
    setActive(i)
    requestAnimationFrame(() => (withSearch ? searchRef.current : listRef.current)?.focus())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const choose = (o: SelectOption<V> | undefined) => {
    if (!o || o.disabled) return
    onChange(o.value)
    close()
  }

  const move = (delta: number) => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + delta + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
  }

  const onListKey = (e: KeyboardEvent) => {
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
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
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
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) }
        }}
        className={controlClasses(isInvalid, 'h-[46px] pl-3.5 pr-10 text-left flex items-center')}
      >
        <span className={clsx('truncate', !selected && 'text-muted')}>{selected?.label ?? placeholder ?? t('common.choose')}</span>
        <ChevronDown size={18} aria-hidden className={clsx('absolute right-3 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      {open && (
        <div
          style={anchorStyle(buttonRef.current, { width: Math.max(buttonRef.current?.offsetWidth ?? 0, 200), maxHeight: 320 })}
          className="fixed z-[60] flex flex-col rounded-card bg-surface border border-border shadow-pop overflow-hidden"
        >
          {withSearch && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                  className="w-full h-9 pl-9 pr-3 rounded-control bg-surface2 text-d-body-s text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
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
            {shown.length === 0 && <li className="px-3.5 py-2.5 text-d-body-s text-muted">{t('common.noMatches')}</li>}
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
                  className={clsx(
                    'flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] text-d-body-s cursor-pointer',
                    i === active && 'bg-surface2',
                    isSel ? 'text-primary font-bold' : 'text-text',
                    o.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSel && <Check size={16} aria-hidden />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export interface SelectProps<V extends string | number = string>
  extends SelectControlProps<V>,
    Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional' | 'required' | 'hideLabel'> {
  id?: string
  fieldClassName?: string
  children?: ReactNode
}

/** Label + Select + hint/error. */
export default function Select<V extends string | number = string>({
  label, hint, error, optional, required, hideLabel, id, fieldClassName, ...control
}: SelectProps<V>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} hideLabel={hideLabel} id={id} className={fieldClassName}>
      <SelectControl {...control} />
    </Field>
  )
}

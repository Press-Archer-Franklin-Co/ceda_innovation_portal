import { forwardRef, useId } from 'react'
import { cn } from '../../lib/cn'

// Checkbox, Radio, RadioGroup and Toggle. Each is a real <input> with a real <label>; the whole row is the target.

const row = 'group flex items-start gap-2.5 py-1.5 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
const ring = 'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg'

function Text({ id, label, description }) {
  return (
    <span className="flex flex-col">
      <span className="text-[13px] leading-5 2xl:text-[14px] text-text">{label}</span>
      {description && (
        <span id={`${id}-desc`} className="text-d-cap text-muted">
          {description}
        </span>
      )}
    </span>
  )
}

export const Checkbox = forwardRef(function Checkbox({ label, description, invalid, className, id, ...props }, ref) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `c${auto}`
  return (
    <label htmlFor={inputId} className={cn(row, className)}>
      <span className="relative flex shrink-0 mt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={invalid || undefined}
          aria-describedby={description ? `${inputId}-desc` : undefined}
          className="peer absolute inset-0 opacity-0 cursor-[inherit]"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'w-4 h-4 rounded-[4px] border-2 bg-surface flex items-center justify-center transition-colors',
            invalid ? 'border-danger' : 'border-muted/60 group-hover:border-primary',
            'peer-checked:bg-primary peer-checked:border-primary peer-checked:[&>svg]:opacity-100',
            ring,
          )}
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3 text-on-primary opacity-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
      </span>
      <Text id={inputId} label={label} description={description} />
    </label>
  )
})

export const Radio = forwardRef(function Radio({ label, description, invalid, className, id, ...props }, ref) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `r${auto}`
  return (
    <label htmlFor={inputId} className={cn(row, className)}>
      <span className="relative flex shrink-0 mt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          aria-invalid={invalid || undefined}
          aria-describedby={description ? `${inputId}-desc` : undefined}
          className="peer absolute inset-0 opacity-0 cursor-[inherit]"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'w-4 h-4 rounded-full border-2 bg-surface flex items-center justify-center transition-colors',
            invalid ? 'border-danger' : 'border-muted/60 group-hover:border-primary',
            'peer-checked:border-primary peer-checked:[&>span]:scale-100',
            ring,
          )}
        >
          <span className="w-2 h-2 rounded-full bg-primary scale-0 transition-transform" />
        </span>
      </span>
      <Text id={inputId} label={label} description={description} />
    </label>
  )
})

/** A handful of fixed options that are the information itself (Yes / No). options: [{ value, label, description?, disabled? }] */
export function RadioGroup({ name, legend, options, value, onChange, error, hint, inline, className }) {
  const auto = useId().replace(/:/g, '')
  const errId = error ? `rg${auto}-err` : undefined
  const hintId = hint ? `rg${auto}-hint` : undefined
  return (
    <fieldset className={cn('min-w-0', className)} aria-describedby={[errId, hintId].filter(Boolean).join(' ') || undefined}>
      <legend className="text-[13px] leading-5 font-bold text-text mb-0.5">{legend}</legend>
      <div className={cn(inline ? 'flex flex-wrap gap-x-5' : 'flex flex-col')}>
        {options.map((o) => (
          <Radio
            key={o.value}
            name={name}
            value={o.value}
            label={o.label}
            description={o.description}
            disabled={o.disabled}
            checked={value === o.value}
            invalid={Boolean(error)}
            onChange={() => onChange(o.value)}
          />
        ))}
      </div>
      {error && <p id={errId} role="alert" className="text-d-cap text-danger mt-1">{error}</p>}
      {hint && <p id={hintId} className="text-d-cap text-muted mt-1">{hint}</p>}
    </fieldset>
  )
}

/** On/off switch for a setting that takes effect at once. onChange receives the new boolean. */
export const Toggle = forwardRef(function Toggle({ label, description, checked, onChange, className, id, ...props }, ref) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `t${auto}`
  return (
    <label htmlFor={inputId} className={cn(row, 'items-center justify-between gap-4', className)}>
      <Text id={inputId} label={label} description={description} />
      <span className="relative flex shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          aria-describedby={description ? `${inputId}-desc` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 opacity-0 cursor-[inherit]"
          {...props}
        />
        <span aria-hidden className={cn('w-9 h-5 rounded-full bg-muted/40 transition-colors p-0.5 flex', 'peer-checked:bg-success peer-checked:[&>span]:translate-x-4', ring)}>
          <span className="w-4 h-4 rounded-full bg-white shadow transition-transform" />
        </span>
      </span>
    </label>
  )
})

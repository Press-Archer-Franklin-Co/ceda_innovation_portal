import { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react'
import clsx from 'clsx'

// Radio, Checkbox and Toggle. Each is a real <input> with a real <label>; the whole row is the target (44px on phone).

interface ChoiceBase extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
  invalid?: boolean
}

const row = 'group flex items-start gap-3 py-2 min-h-[44px] sm:min-h-0 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
const ring = 'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg'

function Text({ id, label, description }: { id: string; label: ReactNode; description?: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-d-body-s text-text">{label}</span>
      {description && (
        <span id={`${id}-desc`} className="text-d-cap text-muted">
          {description}
        </span>
      )}
    </span>
  )
}

export const Checkbox = forwardRef<HTMLInputElement, ChoiceBase>(function Checkbox(
  { label, description, invalid, className, id, ...props },
  ref,
) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `c${auto}`
  return (
    <label htmlFor={inputId} className={clsx(row, className)}>
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
          className={clsx(
            'w-5 h-5 rounded-[5px] border-2 bg-surface flex items-center justify-center transition-colors',
            invalid ? 'border-danger' : 'border-muted/60 group-hover:border-primary',
            'peer-checked:bg-primary peer-checked:border-primary peer-checked:[&>svg]:opacity-100',
            ring,
          )}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-on-primary opacity-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
      </span>
      <Text id={inputId} label={label} description={description} />
    </label>
  )
})

export const Radio = forwardRef<HTMLInputElement, ChoiceBase>(function Radio(
  { label, description, invalid, className, id, ...props },
  ref,
) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `r${auto}`
  return (
    <label htmlFor={inputId} className={clsx(row, className)}>
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
          className={clsx(
            'w-5 h-5 rounded-full border-2 bg-surface flex items-center justify-center transition-colors',
            invalid ? 'border-danger' : 'border-muted/60 group-hover:border-primary',
            'peer-checked:border-primary peer-checked:[&>span]:scale-100',
            ring,
          )}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-primary scale-0 transition-transform" />
        </span>
      </span>
      <Text id={inputId} label={label} description={description} />
    </label>
  )
})

export interface RadioGroupProps<V extends string> {
  name: string
  legend: ReactNode
  options: { value: V; label: ReactNode; description?: ReactNode; disabled?: boolean }[]
  value: V | null | undefined
  onChange: (value: V) => void
  error?: ReactNode
  hint?: ReactNode
  inline?: boolean
  className?: string
}

/** A handful of fixed options that are the information itself (Yes / No). */
export function RadioGroup<V extends string>({ name, legend, options, value, onChange, error, hint, inline, className }: RadioGroupProps<V>) {
  const auto = useId().replace(/:/g, '')
  const errId = error ? `rg${auto}-err` : undefined
  const hintId = hint ? `rg${auto}-hint` : undefined
  return (
    <fieldset className={clsx('min-w-0', className)} aria-describedby={[errId, hintId].filter(Boolean).join(' ') || undefined}>
      <legend className="text-d-label text-text mb-1">{legend}</legend>
      <div className={clsx(inline ? 'flex flex-wrap gap-x-6' : 'flex flex-col')}>
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

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

/** On/off switch for a setting that takes effect at once. */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, description, checked, onChange, className, id, ...props },
  ref,
) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `t${auto}`
  return (
    <label htmlFor={inputId} className={clsx(row, 'items-center justify-between gap-4', className)}>
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
        <span
          aria-hidden
          className={clsx(
            'w-11 h-6 rounded-full bg-muted/40 transition-colors p-0.5 flex',
            'peer-checked:bg-success peer-checked:[&>span]:translate-x-5',
            ring,
          )}
        >
          <span className="w-5 h-5 rounded-full bg-white shadow transition-transform" />
        </span>
      </span>
    </label>
  )
})

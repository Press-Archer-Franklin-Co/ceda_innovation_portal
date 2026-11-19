import { createContext, ReactNode, useContext, useId } from 'react'
import clsx from 'clsx'
import { useT } from '../../i18n'

// Figma Foundations › Input: label D/label above, 46px field, hint D/cap below (red when there is an error).

interface FieldIds {
  controlId: string
  describedBy?: string
  invalid: boolean
  required: boolean
}

const FieldContext = createContext<FieldIds | null>(null)

/** Ids and state from the surrounding <Field>, for controls that render inside it. */
export function useField(): FieldIds | null {
  return useContext(FieldContext)
}

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  optional?: boolean
  /** Shown at the right of the label row, e.g. a character counter. */
  aside?: ReactNode
  id?: string
  className?: string
  /** Hide the label visually but keep it for screen readers. */
  hideLabel?: boolean
  children: ReactNode
}

/** Wraps a control with a real <label>, hint and error text tied by aria-describedby. */
export default function Field({ label, hint, error, required = false, optional = false, aside, id, className, hideLabel, children }: FieldProps) {
  const t = useT()
  const auto = useId()
  const controlId = id ?? `f${auto.replace(/:/g, '')}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={clsx('flex flex-col gap-1.5 min-w-0', className)}>
        {(label || aside) && (
          <div className={clsx('flex items-baseline justify-between gap-3', hideLabel && 'sr-only')}>
            {label && (
              <label htmlFor={controlId} className="text-d-label font-body text-text">
                {label}
                {required && (
                  <span className="text-primary ml-0.5" aria-hidden>
                    *
                  </span>
                )}
                {required && <span className="sr-only"> ({t('common.required')})</span>}
                {optional && !required && <span className="ml-1 font-normal text-muted">({t('common.optional')})</span>}
              </label>
            )}
            {aside}
          </div>
        )}
        {children}
        {error && (
          <p id={errorId} role="alert" className="text-d-cap text-danger">
            {error}
          </p>
        )}
        {hint && (
          <p id={hintId} className="text-d-cap text-muted">
            {hint}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

/** Shared look for text-like controls: 46px, white, 1px border, 2px red ring on focus, 2px danger on error. */
export function controlClasses(invalid: boolean, className?: string) {
  return clsx(
    'w-full rounded-control bg-surface text-d-body-s font-body text-text placeholder:text-muted',
    'border transition-[border-color,box-shadow] duration-150',
    'focus:outline-none focus-visible:ring-0',
    invalid
      ? 'border-2 border-danger focus:shadow-[0_0_0_3px_rgb(var(--c-danger)/0.15)]'
      : 'border-border hover:border-muted/50 focus:border-2 focus:border-primary focus:shadow-focus',
    'disabled:bg-surface2 disabled:text-muted disabled:cursor-not-allowed',
    className,
  )
}

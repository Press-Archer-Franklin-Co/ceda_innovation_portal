import { useId } from 'react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import { FieldContext } from './fieldContext'

/**
 * Wraps any control with a real <label>, hint and error text tied by aria-describedby.
 * Controls inside (InputControl, SelectControl, Textarea) pick up the id via useField().
 */
export default function Field({ label, hint, error, required = false, optional = false, aside, id, className, hideLabel, children }) {
  const t = useT()
  const auto = useId().replace(/:/g, '')
  const controlId = id ?? `f${auto}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1 min-w-0', className)}>
        {(label || aside) && (
          <div className={cn('flex items-baseline justify-between gap-3', hideLabel && 'sr-only')}>
            {label && (
              <label htmlFor={controlId} className="text-[13px] leading-5 font-bold font-body text-text">
                {label}
                {required && <span className="text-primary ml-0.5" aria-hidden>*</span>}
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

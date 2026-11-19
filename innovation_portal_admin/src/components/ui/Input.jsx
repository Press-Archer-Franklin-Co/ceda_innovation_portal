import { forwardRef } from 'react'
import { cn } from '../../lib/cn'
import Field from './Field'
import { CONTROL_HEIGHT, controlClasses, useField } from './fieldContext'

/** The bare text box. Inside a <Field> it picks up the id, error state and aria-describedby. */
export const InputControl = forwardRef(function InputControl({ invalid, leading, trailing, className, id, ...props }, ref) {
  const field = useField()
  const isInvalid = invalid ?? field?.invalid ?? false
  return (
    <div className="relative">
      {leading && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none flex">{leading}</span>}
      <input
        ref={ref}
        id={id ?? field?.controlId}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        aria-required={field?.required || undefined}
        className={controlClasses(isInvalid, cn(CONTROL_HEIGHT, 'px-3', leading && 'pl-9', trailing && 'pr-10', className))}
        {...props}
      />
      {trailing && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted flex">{trailing}</span>}
    </div>
  )
})

/** Label + text box + hint/error. */
const Input = forwardRef(function Input({ label, hint, error, optional, aside, hideLabel, required, fieldClassName, id, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional} aside={aside} hideLabel={hideLabel} id={id} className={fieldClassName}>
      <InputControl ref={ref} required={required} {...props} />
    </Field>
  )
})

export default Input

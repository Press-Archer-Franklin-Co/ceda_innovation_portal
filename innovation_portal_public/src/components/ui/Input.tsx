import { forwardRef, InputHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import Field, { controlClasses, FieldProps, useField } from './Field'

export interface InputControlProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Icon or text inside the field on the left. */
  leading?: ReactNode
  /** Icon or button inside the field on the right. */
  trailing?: ReactNode
}

/** The bare 46px text box. Inside a <Field> it picks up the id, error state and aria-describedby. */
export const InputControl = forwardRef<HTMLInputElement, InputControlProps>(function InputControl(
  { invalid, leading, trailing, className, id, ...props },
  ref,
) {
  const field = useField()
  const isInvalid = invalid ?? field?.invalid ?? false
  return (
    <div className="relative">
      {leading && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none flex">{leading}</span>}
      <input
        ref={ref}
        id={id ?? field?.controlId}
        aria-invalid={isInvalid || undefined}
        aria-describedby={field?.describedBy}
        aria-required={field?.required || undefined}
        className={controlClasses(isInvalid, clsx('h-[46px] px-3.5', leading && 'pl-10', trailing && 'pr-11', className))}
        {...props}
      />
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted flex">{trailing}</span>}
    </div>
  )
})

export interface InputProps extends InputControlProps, Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional' | 'aside' | 'hideLabel'> {
  fieldClassName?: string
}

/** Label + text box + hint/error. */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, aside, hideLabel, required, fieldClassName, id, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional} aside={aside} hideLabel={hideLabel} id={id} className={fieldClassName}>
      <InputControl ref={ref} required={required} {...props} />
    </Field>
  )
})

export default Input

import { ChangeEvent, forwardRef, TextareaHTMLAttributes, useState } from 'react'
import clsx from 'clsx'
import Field, { controlClasses, FieldProps, useField } from './Field'
import { useT } from '../../i18n'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    Pick<FieldProps, 'label' | 'hint' | 'error' | 'optional' | 'hideLabel'> {
  /** Shows "N characters left" and turns red past the limit. Does not cut the text. */
  maxChars?: number
  fieldClassName?: string
}

/** Multi-line text with an optional character counter. */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, hideLabel, required, maxChars, fieldClassName, id, className, rows = 4, value, defaultValue, onChange, ...props },
  ref,
) {
  const t = useT()
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
  const text = value !== undefined ? String(value ?? '') : uncontrolled
  const left = maxChars !== undefined ? maxChars - text.length : undefined
  const over = left !== undefined && left < 0

  const counter =
    left !== undefined ? (
      <span className={clsx('text-d-cap tabular-nums', over ? 'text-danger font-bold' : 'text-muted')} aria-live="polite">
        {over ? t('common.charsOver', { count: -left }) : t('common.charsLeft', { count: left })}
      </span>
    ) : undefined

  return (
    <Field
      label={label}
      hint={hint}
      error={error ?? (over ? t('common.charsOver', { count: -(left as number) }) : undefined)}
      required={required}
      optional={optional}
      hideLabel={hideLabel}
      aside={counter}
      id={id}
      className={fieldClassName}
    >
      <FieldTextarea
        ref={ref}
        rows={rows}
        required={required}
        value={value}
        defaultValue={defaultValue}
        invalid={Boolean(error) || over}
        className={className}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          if (value === undefined) setUncontrolled(e.target.value)
          onChange?.(e)
        }}
        {...props}
      />
    </Field>
  )
})

export default Textarea


const FieldTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid: boolean }>(
  function FieldTextarea({ invalid, className, ...props }, ref) {
    const field = useField()
    return (
      <textarea
        ref={ref}
        id={field?.controlId}
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        className={controlClasses(invalid, clsx('px-3.5 py-3 resize-y min-h-[100px] leading-[22px]', className))}
        {...props}
      />
    )
  },
)

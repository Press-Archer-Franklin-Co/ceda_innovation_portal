import { forwardRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import Field from './Field'
import { controlClasses, useField } from './fieldContext'

/** Multi-line text with an optional character counter (maxChars). The counter does not cut the text. */
const Textarea = forwardRef(function Textarea(
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
      <span className={cn('text-d-cap tabular-nums', over ? 'text-danger font-bold' : 'text-muted')} aria-live="polite">
        {over ? t('common.charsOver', { count: -left }) : t('common.charsLeft', { count: left })}
      </span>
    ) : undefined

  return (
    <Field
      label={label}
      hint={hint}
      error={error ?? (over ? t('common.charsOver', { count: -left }) : undefined)}
      required={required}
      optional={optional}
      hideLabel={hideLabel}
      aside={counter}
      id={id}
      className={fieldClassName}
    >
      <TextareaControl
        ref={ref}
        rows={rows}
        required={required}
        value={value}
        defaultValue={defaultValue}
        invalid={Boolean(error) || over}
        className={className}
        onChange={(e) => {
          if (value === undefined) setUncontrolled(e.target.value)
          onChange?.(e)
        }}
        {...props}
      />
    </Field>
  )
})

export default Textarea

const TextareaControl = forwardRef(function TextareaControl({ invalid, className, ...props }, ref) {
  const field = useField()
  return (
    <textarea
      ref={ref}
      id={field?.controlId}
      aria-invalid={invalid || undefined}
      aria-describedby={field?.describedBy}
      className={controlClasses(invalid, cn('px-3 py-2 resize-y min-h-[88px] leading-5', className))}
      {...props}
    />
  )
})

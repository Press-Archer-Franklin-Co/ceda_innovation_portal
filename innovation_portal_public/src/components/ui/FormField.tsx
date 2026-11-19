import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import Field, { controlClasses, useField } from './Field'

// Older all-in-one field, kept for existing pages. New code uses <Input>, <Textarea>, <Select>
// (searchable, no raw <select>) or <Field> around any control.

interface BaseProps {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
}

interface InputProps extends BaseProps, InputHTMLAttributes<HTMLInputElement> {
  as?: 'input'
  icon?: ReactNode
  trailing?: ReactNode
}

interface TextareaProps extends BaseProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as: 'textarea'
  rows?: number
}

interface SelectProps extends BaseProps, SelectHTMLAttributes<HTMLSelectElement> {
  as: 'select'
  children: ReactNode
}

type FormFieldProps = InputProps | TextareaProps | SelectProps

export default function FormField(props: FormFieldProps) {
  const { label, error, hint, required, id } = props
  return (
    <Field label={label} error={error} hint={hint} required={required} id={id}>
      <Control {...props} />
    </Field>
  )
}

function Control(props: FormFieldProps) {
  const field = useField()
  // Strip the wrapper-only props before spreading onto the element.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { label, error, hint, className, as, ...rest } = props as FormFieldProps & { icon?: ReactNode; trailing?: ReactNode }
  const a11y = {
    id: field?.controlId,
    'aria-invalid': Boolean(error) || undefined,
    'aria-describedby': field?.describedBy,
  }

  if (as === 'textarea') {
    const { rows, ...ta } = rest as TextareaHTMLAttributes<HTMLTextAreaElement>
    return <textarea {...ta} {...a11y} rows={rows ?? 4} className={controlClasses(Boolean(error), clsx('px-3.5 py-3 resize-y min-h-[100px]', className))} />
  }
  if (as === 'select') {
    const { children, ...sel } = rest as SelectHTMLAttributes<HTMLSelectElement>
    return (
      <select {...sel} {...a11y} className={controlClasses(Boolean(error), clsx('h-[46px] px-3.5', className))}>
        {children}
      </select>
    )
  }
  const { icon, trailing, ...input } = rest as InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; trailing?: ReactNode }
  return (
    <div className="relative">
      {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted flex">{icon}</div>}
      <input {...input} {...a11y} className={controlClasses(Boolean(error), clsx('h-[46px] px-3.5', icon && 'pl-10', trailing && 'pr-10', className))} />
      {trailing && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted flex">{trailing}</div>}
    </div>
  )
}

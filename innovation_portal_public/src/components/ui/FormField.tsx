import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

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
  const { label, error, hint, required, className } = props

  const inputBase = clsx(
    'w-full px-4 py-3 rounded-xl border bg-white text-gray-900 placeholder-gray-400 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-ceda-500 focus:border-transparent transition-all duration-200',
    error ? 'border-red-400 bg-red-50' : 'border-gray-200',
    className,
  )

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {props.as === 'textarea' ? (
        <textarea
          className={clsx(inputBase, 'resize-vertical min-h-[100px]')}
          rows={(props as TextareaProps).rows ?? 4}
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : props.as === 'select' ? (
        <select className={inputBase} {...(props as SelectHTMLAttributes<HTMLSelectElement>)}>
          {(props as SelectProps).children}
        </select>
      ) : (
        <div className="relative">
          {(props as InputProps).icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {(props as InputProps).icon}
            </div>
          )}
          <input
            className={clsx(inputBase, (props as InputProps).icon && 'pl-10', (props as InputProps).trailing && 'pr-10')}
            {...(props as InputHTMLAttributes<HTMLInputElement>)}
          />
          {(props as InputProps).trailing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {(props as InputProps).trailing}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

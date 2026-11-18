import { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[#A01E0A] text-white hover:bg-[#7E1708] shadow-sm disabled:bg-[#6B5248]',
  secondary:
    'bg-white text-[#A01E0A] border-2 border-[#A01E0A] hover:bg-[#F5EEE8] disabled:opacity-50',
  ghost:
    'text-gray-700 hover:bg-gray-100 disabled:opacity-50',
  danger:
    'bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-red-300',
}

const sizes: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm rounded-lg gap-1.5',
  md: 'px-6 py-3 text-sm rounded-xl gap-2',
  lg: 'px-8 py-4 text-base rounded-xl gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-95 cursor-pointer',
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-70 cursor-not-allowed active:scale-100',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}

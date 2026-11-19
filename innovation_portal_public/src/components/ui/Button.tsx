import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'

// Figma Foundations › Button: Type = Primary | Accent | Secondary | Ghost | On dark | Danger, Size = M | S.
// "soft" is the cream button from Foundations › States ("Try again"). "link" is a text-only action. "lg" is kept for older pages and maps to M with more padding.
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'soft' | 'ghost' | 'link' | 'onDark' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 font-heading font-semibold whitespace-nowrap rounded-control ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:bg-primary/45',
  accent: 'bg-accent text-on-accent hover:bg-accent/90 disabled:bg-accent/45',
  secondary: 'bg-surface text-text border border-border hover:bg-surface2 disabled:text-muted disabled:bg-surface',
  soft: 'bg-surface2 text-text hover:bg-border/70 disabled:text-muted',
  ghost: 'text-primary hover:bg-primary-soft disabled:text-muted disabled:bg-transparent',
  link: 'text-primary underline-offset-4 hover:underline !px-0 !py-0 !h-auto disabled:text-muted',
  onDark: 'bg-banner text-on-banner border border-on-banner hover:bg-on-banner/10 disabled:opacity-50 focus-visible:ring-on-banner focus-visible:ring-offset-banner',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-on-primary disabled:opacity-50 disabled:hover:bg-danger-soft disabled:hover:text-danger',
}

// M: 44px tall, 20px sides, D/btn. S: 34px, 14px sides, D/btnS. Bordered types are 2px taller in Figma; we keep one height.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-[34px] px-[14px] text-d-btn-s',
  md: 'h-11 px-5 text-d-btn',
  lg: 'h-12 px-7 text-d-btn',
}

/** Classes for a link that should look like a button (react-router <Link className={buttonClasses(...)}>). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return clsx(base, variants[variant], sizes[size], block && 'w-full', className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, disables the button and keeps its width. */
  loading?: boolean
  /** The arrow from the Figma component. */
  arrow?: boolean
  icon?: ReactNode
  block?: boolean
  children?: ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, arrow = false, icon, block, children, className, disabled, type = 'button', ...props },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : 18
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : icon}
      {children}
      {arrow && !loading && <ArrowRight size={iconSize} strokeWidth={1.5} aria-hidden />}
    </button>
  )
})

export default Button

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={clsx('animate-spin shrink-0', className)} width={size} height={size} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

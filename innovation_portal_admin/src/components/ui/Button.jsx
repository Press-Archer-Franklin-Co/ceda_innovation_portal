import { forwardRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { buttonClasses } from './buttonClasses'

/**
 * <Button variant="primary|accent|secondary|soft|ghost|link|onDark|danger" size="sm|md|lg" loading arrow icon={<Plus />}>
 * One primary button per screen. Destructive confirmations put the danger action last.
 */
const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, arrow = false, icon, block, children, className, disabled, type = 'button', ...props },
  ref,
) {
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 14 : 16
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

export function Spinner({ size = 16, className }) {
  return (
    <svg className={cn('animate-spin shrink-0', className)} width={size} height={size} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

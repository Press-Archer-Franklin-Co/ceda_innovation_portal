import { cn } from '../../lib/cn'

// Figma Foundations › Button: Type = Primary | Accent | Secondary | Ghost | On dark | Danger.
// "soft" is the cream "Try again" button from Foundations › States. "link" is text only.
// Staff console is compact: 32px buttons (36px from 2xl), 28px small.

const base =
  'inline-flex items-center justify-center gap-1.5 font-heading font-semibold whitespace-nowrap rounded-control ' +
  'transition-colors duration-150 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed'

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:bg-primary/45',
  accent: 'bg-accent text-on-accent hover:bg-accent/90 disabled:bg-accent/45',
  secondary: 'bg-surface text-text border border-border hover:bg-surface2 disabled:text-muted disabled:bg-surface',
  soft: 'bg-surface2 text-text hover:bg-border/70 disabled:text-muted',
  ghost: 'text-primary hover:bg-primary-soft disabled:text-muted disabled:bg-transparent',
  link: 'text-primary underline-offset-4 hover:underline !px-0 !h-auto disabled:text-muted',
  onDark: 'bg-banner text-on-banner border border-on-banner hover:bg-on-banner/10 disabled:opacity-50',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-on-primary disabled:opacity-50 disabled:hover:bg-danger-soft disabled:hover:text-danger',
}

const sizes = {
  sm: 'h-7 px-2.5 text-[12px] leading-4',
  md: 'h-8 px-3.5 text-[13px] leading-[18px] 2xl:h-9 2xl:px-4 2xl:text-[14px]',
  lg: 'h-11 px-5 text-d-btn',
}

/** Classes for a <Link> that should look like a button. */
export function buttonClasses({ variant = 'primary', size = 'md', block = false, className } = {}) {
  return cn(base, variants[variant] ?? variants.primary, sizes[size] ?? sizes.md, block && 'w-full', className)
}

import { ReactNode } from 'react'
import Tag, { TagTone } from './Tag'

// Older API, kept for existing pages. New code uses <Tag tone=...>.
type BadgeVariant = 'open' | 'closed' | 'upcoming' | 'default' | 'green' | 'blue' | 'orange' | 'red'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const toTone: Record<BadgeVariant, TagTone> = {
  open: 'green',
  closed: 'neutral',
  upcoming: 'blue',
  default: 'neutral',
  green: 'green',
  blue: 'blue',
  orange: 'orange',
  red: 'red',
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <Tag tone={toTone[variant]} dot={variant === 'open' || variant === 'upcoming'} className={className}>
      {children}
    </Tag>
  )
}

import { ReactNode } from 'react'
import Tag, { TagTone } from './Tag'
import { statusWord } from '../../lib/status'
import { useT, StringKey } from '../../i18n'

// <Badge status={idea.status} />: the CEDA status words (src/lib/status.ts); unknown shows "Not known".
// `variant` is the older colour-only API, kept for existing pages. New code uses <Tag tone=...> for non-status tags.
type BadgeVariant = 'open' | 'closed' | 'upcoming' | 'default' | 'green' | 'blue' | 'orange' | 'red'

interface BadgeProps {
  variant?: BadgeVariant
  /** An API status value. Shows its CEDA word unless children are given. */
  status?: string | null
  children?: ReactNode
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

export default function Badge({ variant = 'default', status, children, className }: BadgeProps) {
  const t = useT()
  if (status !== undefined) {
    const word = statusWord(status)
    return (
      <Tag tone={word.tone} dot dotClassName={word.dot} className={className}>
        {children ?? t(word.labelKey as StringKey)}
      </Tag>
    )
  }
  return (
    <Tag tone={toTone[variant]} dot={variant === 'open' || variant === 'upcoming'} className={className}>
      {children}
    </Tag>
  )
}

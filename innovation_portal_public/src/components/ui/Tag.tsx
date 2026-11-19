import { ReactNode } from 'react'
import clsx from 'clsx'
import { useT } from '../../i18n'

// Figma Foundations › Tag: Tone = Neutral | Red | Orange | Green | Amber | Blue | New | Dark | CMS | Selected.
// "unknown" is the honest state for a value that did not arrive (dashed border, "Not known").
export type TagTone =
  | 'neutral' | 'red' | 'orange' | 'green' | 'amber' | 'blue'
  | 'new' | 'dark' | 'cms' | 'selected' | 'unknown'

const tones: Record<TagTone, string> = {
  neutral: 'bg-surface2 text-text',
  red: 'bg-primary-soft text-primary',
  orange: 'bg-accent-soft text-accent-ink',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  blue: 'bg-info-soft text-info',
  new: 'bg-primary text-on-primary',
  dark: 'bg-banner-deep text-on-banner',
  cms: 'bg-cms text-on-banner',
  selected: 'bg-banner text-on-banner',
  unknown: 'bg-transparent text-muted border border-dashed border-muted/60',
}

const dots: Partial<Record<TagTone, string>> = {
  neutral: 'bg-muted',
  red: 'bg-primary',
  orange: 'bg-accent',
  green: 'bg-success',
  amber: 'bg-amber',
  blue: 'bg-info',
  unknown: 'bg-muted/60',
}

export interface TagProps {
  tone?: TagTone
  /** A small dot before the words. Colour never carries meaning alone: the words do. */
  dot?: boolean
  /** Gold dot for winners. */
  dotClassName?: string
  icon?: ReactNode
  children?: ReactNode
  className?: string
}

/** Pill tag and status chip (D/labelS, 24px tall, 10px sides, fully rounded). */
export default function Tag({ tone = 'neutral', dot = false, dotClassName, icon, children, className }: TagProps) {
  const t = useT()
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-d-label-s font-body whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotClassName ?? dots[tone] ?? 'bg-current')} />}
      {icon}
      {children ?? (tone === 'unknown' ? t('common.notKnown') : null)}
    </span>
  )
}

/** The red "New" cue: a tag, or just the dot next to a nav item or card title. */
export function NewCue({ dotOnly = false, className }: { dotOnly?: boolean; className?: string }) {
  const t = useT()
  if (dotOnly) {
    return (
      <span className={clsx('inline-block w-2 h-2 rounded-full bg-primary', className)} role="img" aria-label={t('common.new')} />
    )
  }
  return (
    <Tag tone="new" className={className}>
      {t('common.new')}
    </Tag>
  )
}

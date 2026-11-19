import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'

// Figma Foundations › Tag: tone = neutral | red | orange | green | amber | blue | new | dark | cms | selected.
// "unknown" is the honest state for a value that did not arrive (dashed border, "Not known").
// StatusPill maps API status values onto these tones (U0 moves it to the CEDA status words).

const tones = {
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

const dots = {
  neutral: 'bg-muted',
  red: 'bg-primary',
  orange: 'bg-accent',
  green: 'bg-success',
  amber: 'bg-amber',
  blue: 'bg-info',
  unknown: 'bg-muted/60',
}

/** Pill tag and status chip: 22px tall in the console, Lato bold 12px, fully rounded. Colour never carries meaning alone. */
export default function Tag({ tone = 'neutral', dot = false, dotClassName, icon, children, className }) {
  const t = useT()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-d-label-s font-body whitespace-nowrap',
        tones[tone] ?? tones.neutral,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotClassName ?? dots[tone] ?? 'bg-current')} />}
      {icon}
      {children ?? (tone === 'unknown' ? t('common.notKnown') : null)}
    </span>
  )
}

/** The red "New" cue: a tag, or only the dot next to a menu item or title. */
export function NewCue({ dotOnly = false, className }) {
  const t = useT()
  if (dotOnly) {
    return <span className={cn('inline-block w-2 h-2 rounded-full bg-primary', className)} role="img" aria-label={t('common.new')} />
  }
  return (
    <Tag tone="new" className={className}>
      {t('common.new')}
    </Tag>
  )
}

import { cn } from '../../lib/cn'

const paddings = { none: '', sm: 'p-3', md: 'p-[14px] 2xl:p-[22px]', lg: 'p-6' }
const tones = {
  plain: 'bg-surface border border-border',
  soft: 'bg-surface2',
  banner: 'bg-banner text-on-banner',
}

/**
 * Card: radius 12. tone "plain" (white, 1px border), "soft" (cream) or "banner" (chocolate).
 * Staff padding is 14px, 22px from 2xl. For a card with a title row use SectionCard.
 */
export default function Card({ children, className, hover = false, padding = 'md', tone = 'plain', as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-card min-w-0',
        tones[tone] ?? tones.plain,
        hover && 'transition-shadow duration-200 hover:shadow-pop cursor-pointer',
        paddings[padding] ?? paddings.md,
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

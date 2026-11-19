import clsx from 'clsx'
import { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Lifts on hover. Use when the whole card is a link. */
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** "plain": white with a border. "soft": cream panel. "banner": chocolate feature card. */
  tone?: 'plain' | 'soft' | 'banner'
}

const paddings = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' }
const tones = {
  plain: 'bg-surface border border-border',
  soft: 'bg-surface2',
  banner: 'bg-banner text-on-banner',
}

/** Card: radius 12, white with a 1px border by default. */
export default function Card({ children, className, hover = false, padding = 'md', tone = 'plain', ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-card',
        tones[tone],
        hover && 'transition-[box-shadow,transform] duration-200 hover:shadow-pop hover:-translate-y-0.5 cursor-pointer',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

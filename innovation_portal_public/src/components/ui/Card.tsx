import clsx from 'clsx'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export default function Card({ children, className, hover = false, padding = 'md' }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-gray-100 shadow-card',
        hover && 'transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 cursor-pointer',
        paddings[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}

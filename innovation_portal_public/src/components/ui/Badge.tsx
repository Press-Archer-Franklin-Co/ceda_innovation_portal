import clsx from 'clsx'

type BadgeVariant = 'open' | 'closed' | 'upcoming' | 'default' | 'green' | 'blue' | 'orange' | 'red'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  open: 'bg-green-100 text-green-700 border border-green-200',
  closed: 'bg-gray-100 text-gray-500 border border-gray-200',
  upcoming: 'bg-blue-100 text-blue-700 border border-blue-200',
  default: 'bg-gray-100 text-gray-600 border border-gray-200',
  green: 'bg-ceda-100 text-ceda-700 border border-ceda-200',
  blue: 'bg-blue-100 text-blue-700 border border-blue-200',
  orange: 'bg-orange-100 text-orange-700 border border-orange-200',
  red: 'bg-red-100 text-red-700 border border-red-200',
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
        styles[variant],
        className,
      )}
    >
      {(variant === 'open') && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {(variant === 'upcoming') && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
      )}
      {children}
    </span>
  )
}

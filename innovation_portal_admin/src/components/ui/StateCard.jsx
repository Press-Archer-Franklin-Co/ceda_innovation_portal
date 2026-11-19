import { Plus } from 'lucide-react'
import { cn } from '../../lib/cn'

// Figma Foundations › States: icon in a tinted circle, Montserrat title, muted body, next step.
// Used by EmptyState, ErrorState and ForbiddenState.

const circle = {
  neutral: 'bg-surface2 text-muted',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export default function StateCard({ icon: Icon = Plus, tone = 'neutral', title, body, children, framed = false, compact = false, className, role }) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        compact ? 'py-8' : 'py-12',
        framed && 'rounded-card border border-border bg-surface',
        className,
      )}
    >
      <span aria-hidden className={cn('rounded-full flex items-center justify-center mb-3', compact ? 'w-9 h-9' : 'w-10 h-10', circle[tone] ?? circle.neutral)}>
        <Icon size={compact ? 15 : 18} strokeWidth={2.25} />
      </span>
      <p className="font-heading font-bold text-[15px] leading-[22px] 2xl:text-[16px] text-text">{title}</p>
      {body && <p className="mt-1.5 text-[13px] leading-5 2xl:text-[14px] 2xl:leading-[22px] text-muted max-w-sm">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

import { Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'
import StateCard from './StateCard'

/**
 * Nothing here yet: say what is missing and what to do next. Never show this while loading or after a failure.
 * Props: icon, title, message, action (a node, e.g. <Button>), compact, framed, steps ([{ label, description? }]).
 */
export default function EmptyState({ icon = Inbox, title = 'Nothing here yet', message, action, className, compact = false, framed = false, steps }) {
  return (
    <StateCard icon={icon} title={title} body={message} compact={compact} framed={framed} className={className}>
      {steps && steps.length > 0 && (
        <ol className="w-full max-w-sm text-left space-y-0">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 relative">
              {i < steps.length - 1 && <span aria-hidden className="absolute left-[13px] top-6 bottom-0 w-px bg-border" />}
              <span className="flex-shrink-0 w-7 h-7 rounded-full border border-border bg-surface flex items-center justify-center z-10 text-[11px] font-bold text-muted tabular-nums">
                {i + 1}
              </span>
              <span className={cn('pb-4 pt-0.5 flex-1 min-w-0')}>
                <span className="block text-[13px] font-bold text-text leading-5">{step.label}</span>
                {step.description && <span className="block text-d-cap text-muted">{step.description}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {action}
    </StateCard>
  )
}

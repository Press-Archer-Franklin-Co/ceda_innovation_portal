import React from 'react'
import { CheckCircle2, Clock, Circle, AlertCircle, Lock } from 'lucide-react'
import { cn } from '../../lib/cn'


const STEP_CONFIG = {
  completed: {
    icon:      CheckCircle2,
    iconClass: 'text-ceda-green',
    ringClass: 'bg-ceda-green-pale ring-ceda-green/30',
    lineClass: 'bg-ceda-green',
    label:     'Completed',
  },
  active: {
    icon:      Clock,
    iconClass: 'text-ceda-indigo',
    ringClass: 'bg-ceda-indigo-pale ring-ceda-indigo/30',
    lineClass: 'bg-ceda-border',
    label:     'In Progress',
  },
  pending: {
    icon:      Circle,
    iconClass: 'text-ceda-muted',
    ringClass: 'bg-ceda-surface ring-ceda-border',
    lineClass: 'bg-ceda-border',
    label:     'Pending',
  },
  blocked: {
    icon:      Lock,
    iconClass: 'text-ceda-gold',
    ringClass: 'bg-ceda-gold-pale ring-ceda-gold/30',
    lineClass: 'bg-ceda-border',
    label:     'Blocked',
  },
  skipped: {
    icon:      AlertCircle,
    iconClass: 'text-ceda-muted',
    ringClass: 'bg-ceda-surface ring-ceda-border',
    lineClass: 'bg-ceda-border',
    label:     'Skipped',
  },
}

export default function WorkflowTimeline({ steps = [], className, collapsible = false }) {
  if (!steps.length) return null
  const [openId, setOpenId] = React.useState(null)

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, i) => {
        const cfg = STEP_CONFIG[step.status] ?? STEP_CONFIG.pending
        const Icon = cfg.icon
        const isLast = i === steps.length - 1
        const isOpen = !collapsible || openId === (step.id ?? i)

        return (
          <li key={step.id ?? i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center ring-1 z-10 flex-shrink-0',
                cfg.ringClass
              )}>
                <Icon size={15} className={cfg.iconClass} strokeWidth={2} />
              </div>
              {!isLast && (
                <div className={cn('w-0.5 flex-1 my-1 min-h-[20px]', cfg.lineClass)} />
              )}
            </div>

            <div className={cn('pb-5 min-w-0', isLast && 'pb-0')}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  if (!collapsible) return
                  const key = step.id ?? i
                  setOpenId((prev) => (prev === key ? null : key))
                }}
                aria-expanded={isOpen}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className={cn(
                    'text-sm font-semibold',
                    step.status === 'active' ? 'text-ceda-forest' :
                    step.status === 'completed' ? 'text-ceda-dark' : 'text-ceda-muted'
                  )}>
                    {step.label}
                  </p>
                  {step.status === 'active' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-ceda-indigo-pale text-ceda-indigo">
                      Current
                    </span>
                  )}
                  {collapsible && (
                    <span className="text-[10px] text-ceda-muted ml-auto">{isOpen ? 'Hide' : 'View'}</span>
                  )}
                </div>
              </button>
              {isOpen && step.description && (
                <p className="text-xs text-ceda-muted mt-0.5">{step.description}</p>
              )}
              {isOpen && (step.actor || step.completedAt) && (
                <p className="text-[11px] text-ceda-muted/70 mt-1">
                  {step.actor && <span>{step.actor}</span>}
                  {step.actor && step.completedAt && <span className="mx-1">·</span>}
                  {step.completedAt && <span>{step.completedAt}</span>}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

import { ReactNode } from 'react'
import { AlertCircle, Info, LucideIcon, Plus } from 'lucide-react'
import clsx from 'clsx'
import Button from './Button'
import { useT } from '../../i18n'

// Figma Foundations › States. Never show "empty" while loading or after a failure.
// Every state says what to do next.

type Tone = 'neutral' | 'danger' | 'info'

const circle: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

interface StateCardProps {
  icon?: LucideIcon
  tone?: Tone
  title: ReactNode
  body?: ReactNode
  children?: ReactNode
  /** Bordered card (default) or bare, for use inside an existing card. */
  framed?: boolean
  className?: string
  role?: string
}

function StateCard({ icon: Icon = Plus, tone = 'neutral', title, body, children, framed = true, className, role }: StateCardProps) {
  return (
    <div
      role={role}
      className={clsx(
        'flex flex-col items-center justify-center text-center px-6 py-10',
        framed && 'rounded-card border border-border bg-surface',
        className,
      )}
    >
      <span aria-hidden className={clsx('w-10 h-10 rounded-full flex items-center justify-center mb-4', circle[tone])}>
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <p className="font-heading font-bold text-[16px] leading-6 text-text">{title}</p>
      {body && <p className="mt-2 text-d-body-s text-muted max-w-sm">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

export interface EmptyStateProps {
  icon?: LucideIcon
  /** What is missing: "No partners yet". */
  title: string
  /** What would put something here, and the next step. */
  body?: string
  action?: { label: string; onClick: () => void }
  children?: ReactNode
  framed?: boolean
  className?: string
}

export default function EmptyState({ icon, title, body, action, children, framed = true, className }: EmptyStateProps) {
  return (
    <StateCard icon={icon} title={title} body={body} framed={framed} className={className}>
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </StateCard>
  )
}

export interface ErrorStateProps {
  /** What failed, in plain words: "We could not load the challenges". */
  title?: string
  body?: string
  onRetry?: () => void
  retrying?: boolean
  framed?: boolean
  className?: string
  /** Extra actions under the message (e.g. Reload). */
  children?: ReactNode
}

export function ErrorState({ title, body, onRetry, retrying, framed = true, className, children }: ErrorStateProps) {
  const t = useT()
  return (
    <StateCard icon={AlertCircle} tone="danger" title={title ?? t('common.somethingWrong')} body={body} framed={framed} className={className} role="alert">
      {onRetry && (
        <Button variant="soft" size="sm" onClick={onRetry} loading={retrying}>
          {t('common.retry')}
        </Button>
      )}
      {children}
    </StateCard>
  )
}

export interface ForbiddenStateProps {
  /** "This area is for administrators" */
  title: string
  /** Who to ask. */
  body: string
  framed?: boolean
  className?: string
}

export function ForbiddenState({ title, body, framed = true, className }: ForbiddenStateProps) {
  return <StateCard icon={Info} tone="info" title={title} body={body} framed={framed} className={className} />
}

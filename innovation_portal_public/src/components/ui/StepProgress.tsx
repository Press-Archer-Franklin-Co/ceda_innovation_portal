import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useT } from '../../i18n'

// Segmented progress (used on 2.3, 3.4b and 3.5): one bar per step on a cream band.
// Red = done (with a green "Done" label), amber = current, beige = to do. Labels "1 · About you" under each bar.

export interface StepProgressProps {
  /** Step names, in order: ['About you', 'Your idea', ...] */
  steps: string[]
  /** Index of the current step, from 0. */
  current: number
  /** Shows "Saved" at the right (each step saves on its own). */
  saved?: boolean
  /** Lets people jump back to a finished step. */
  onStepClick?: (index: number) => void
  className?: string
}

export default function StepProgress({ steps, current, saved = false, onStepClick, className }: StepProgressProps) {
  const t = useT()
  return (
    <nav aria-label={t('steps.label')} className={clsx('bg-surface2 rounded-card px-4 py-4 sm:px-6', className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-d-label-s text-muted">{t('steps.step', { n: Math.min(current + 1, steps.length), total: steps.length })}</p>
        {saved && (
          <p className="inline-flex items-center gap-1 text-d-label-s text-success" role="status">
            <Check size={14} strokeWidth={3} aria-hidden />
            {t('steps.saved')}
          </p>
        )}
      </div>
      <ol className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((name, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          const clickable = Boolean(onStepClick) && state === 'done'
          const content = (
            <>
              <span
                aria-hidden
                className={clsx('block h-1.5 rounded-full', state === 'done' ? 'bg-primary' : state === 'current' ? 'bg-amber' : 'bg-border')}
              />
              <span className="mt-2 flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                <span
                  className={clsx(
                    'text-d-label-s truncate',
                    state === 'todo' ? 'text-muted font-normal' : 'text-text',
                    // On phone only the current step's name is shown; the bars carry the rest.
                    state !== 'current' && 'hidden sm:block',
                  )}
                >
                  {i + 1} · {name}
                </span>
                {state === 'done' && <span className="hidden sm:inline text-d-label-s text-success">{t('common.done')}</span>}
              </span>
              <span className="sr-only">
                {state === 'done' ? `, ${t('common.done')}` : ''}
              </span>
            </>
          )
          return (
            <li key={i} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
              {clickable ? (
                <button type="button" onClick={() => onStepClick?.(i)} className="w-full text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

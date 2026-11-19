import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { StageDot } from '../../types/innovator'

/** The short stage bar on idea cards (Received → Decision). Status is in words for screen readers. */
export default function StageBar({ stages, className }: { stages: StageDot[]; className?: string }) {
  const { t } = useI18n()
  if (stages.length === 0) return null
  return (
    <ol aria-label={t('ideas.progress')} className={clsx('grid gap-1', className)} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((stage, i) => {
        const done = stage.status === 'done'
        const current = stage.status === 'current'
        return (
          <li key={stage.code || i} aria-current={current ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center text-center">
            {i > 0 && (
              <span aria-hidden className={clsx('absolute right-1/2 top-[10px] h-0.5 w-full', done || current ? 'bg-primary' : 'bg-border')} />
            )}
            <span
              aria-hidden
              className={clsx(
                'relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2',
                done ? 'border-primary bg-primary text-on-primary' : current ? 'border-amber bg-surface' : 'border-border bg-surface',
              )}
            >
              {done && <Check size={12} strokeWidth={3} />}
              {current && <span className="h-2 w-2 rounded-full bg-amber" />}
            </span>
            <span className={clsx('mt-1.5 w-full truncate text-d-cap', current ? 'text-text font-bold' : done ? 'text-text' : 'text-muted')}>
              {stage.name}
            </span>
            <span className="sr-only">
              {done ? `, ${t('common.done')}` : stage.status === 'skipped' ? `, ${t('track.skipped')}` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

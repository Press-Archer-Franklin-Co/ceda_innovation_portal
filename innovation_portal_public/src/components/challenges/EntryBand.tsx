import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useI18n } from '../../i18n'
import { daysLeft, formatDate } from '../../lib/dates'

/**
 * U10: the light band on top of entering a challenge (Figma 1.9 "Entry band" 106:779, 2.10 108:367).
 * Overline, the challenge (or "Your entry · <challenge>"), the closing tag, and the four-step bar that runs from
 * sign-in to sent: 1 Sign in, 2 Can you enter?, 3 Your entry, 4 Sent. `current` is the index of the step on screen.
 * Phone: the bars only, with "Step n of 4 · <name>" under them.
 */
export default function EntryBand({
  overline, title, titleId, closesAt, current, actions, below,
}: {
  overline?: string
  title: ReactNode
  titleId: string
  closesAt: string | null
  current: 1 | 2
  /** Right of the title (2.10: saved status and Save and exit). */
  actions?: ReactNode
  /** Under the bar (2.10: "Part 2 of 4 · Your idea"). */
  below?: ReactNode
}) {
  const { t } = useI18n()
  const steps = [t('ent.step.signIn'), t('ent.step.check'), t('ent.step.entry'), t('ent.step.sent')]
  const closes = closesAt ? <ClosesTag closesAt={closesAt} /> : null
  return (
    <section aria-labelledby={titleId} className="bg-accent-soft/55 border-b border-border">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-5 lg:py-7 flex flex-col gap-3 lg:gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            {overline && <p className="text-d-over uppercase font-heading text-accent">{overline}</p>}
            <h1 id={titleId} className="font-heading text-d-h4 lg:text-d-h3 text-text break-words">{title}</h1>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3 lg:gap-6">{actions}</div> : <div className="lg:order-none">{closes}</div>}
        </div>
        <nav aria-label={t('steps.label')}>
          <ol className="grid grid-cols-4 gap-1.5 lg:gap-3">
            {steps.map((name, i) => {
              const state = i < current ? 'done' : i === current ? 'current' : 'todo'
              return (
                <li key={name} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0 flex flex-col gap-2">
                  <span aria-hidden className={clsx('block h-1.5 rounded-full', state === 'done' ? 'bg-primary' : state === 'current' ? 'bg-amber' : 'bg-border')} />
                  <span className="hidden lg:flex items-center gap-1.5 text-d-body-s min-w-0">
                    <span className={clsx('truncate', state === 'todo' ? 'text-muted' : 'text-d-label text-text')}>{i + 1} · {name}</span>
                    {state === 'done' && <span className="text-d-label text-success">{t('common.done')}</span>}
                  </span>
                  <span className="sr-only lg:hidden">{i + 1} · {name}{state === 'done' ? `, ${t('common.done')}` : ''}</span>
                </li>
              )
            })}
          </ol>
          <p aria-hidden className="lg:hidden mt-2 text-d-label-s text-text">{t('steps.step', { n: current + 1, total: 4 })} · {steps[current]}</p>
        </nav>
        {(below || (actions && closes)) && (
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            {below}
            {actions && closes}
          </div>
        )}
      </div>
    </section>
  )
}

/** "Closes 15 Jan 2027 · 55 days left" (amber tag). */
export function ClosesTag({ closesAt }: { closesAt: string }) {
  const { t, lang } = useI18n()
  const left = daysLeft(closesAt)
  return (
    <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-1 text-d-label-s text-warning whitespace-nowrap">
      {t('ent.closes', { when: formatDate(closesAt, lang) })}
      {left !== null && left >= 0 && <span className="hidden sm:inline">&nbsp;·&nbsp;{left === 1 ? t('ent.dayLeft') : t('ent.daysLeft', { count: left })}</span>}
    </span>
  )
}

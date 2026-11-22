import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck } from 'lucide-react'
import clsx from 'clsx'
import Card from '../ui/Card'
import Logo from '../ui/Logo'
import { Spinner } from '../ui/Button'
import watermarkUrl from '../../assets/brand/ceda-watermark.png'
import { useI18n } from '../../i18n'

// The U7 sign-in layout (banner, watermark, headline on the left, card on the right) for the pages around sign-in
// that have no frame of their own: the email check and the sign-in return page. Calm states, never a blank page.

export function AuthStateShell({ start, highlight, children }: { start: string; highlight: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="relative min-h-screen overflow-hidden bg-banner">
      <img src={watermarkUrl} alt="" aria-hidden className="pointer-events-none absolute -bottom-40 -left-48 w-[760px] max-w-none select-none opacity-90 sm:w-[900px]" />
      <div className="relative mx-auto grid max-w-[1200px] gap-8 px-4 py-8 sm:px-6 lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-10 lg:py-20">
        <div>
          <Link to="/" className="inline-flex rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
            <Logo theme="dark" />
          </Link>
          <p className="mt-8 text-d-over uppercase text-amber">{t('authState.eyebrow')}</p>
          <h1 className="mt-3 font-heading text-d-mh1 text-on-banner sm:text-d-h1">
            {start} <span className="text-amber">{highlight}</span>
          </h1>
        </div>
        <Card padding="lg" className="shadow-card">{children}</Card>
      </div>
    </main>
  )
}

type Tone = 'loading' | 'success' | 'error'

/** Icon, title and words for one state, read out when they change. */
export function AuthState({ tone, title, body, children }: { tone: Tone; title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5" role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div>
        <span
          aria-hidden
          className={clsx(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            tone === 'loading' && 'bg-surface2 text-primary',
            tone === 'success' && 'bg-success-soft text-success',
            tone === 'error' && 'bg-primary-soft text-primary',
          )}
        >
          {tone === 'loading' ? <Spinner size={22} /> : tone === 'success' ? <CircleCheck size={24} /> : <CircleAlert size={24} />}
        </span>
        <h2 className="font-heading text-d-h3 text-text">{title}</h2>
        {body && <div className="mt-2 text-d-body-s text-muted">{body}</div>}
      </div>
      {children}
    </div>
  )
}

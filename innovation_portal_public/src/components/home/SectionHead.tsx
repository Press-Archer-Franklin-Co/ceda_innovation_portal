import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'

/** Section container used by every home section: 1200px column, 72px vertical rhythm (48px on phone). */
export function SectionShell({ tone = 'plain', children, className, labelledBy }: { tone?: 'plain' | 'soft' | 'banner'; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={clsx(tone === 'soft' && 'bg-surface2', tone === 'banner' && 'bg-banner text-on-banner', className)}
    >
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 py-12 lg:py-[72px]">{children}</div>
    </section>
  )
}

/** Overline, big title, optional sentence and a "See all" link on the right (Figma: Section head). */
export default function SectionHead({
  id, overline, title, subtitle, link, tone = 'light',
}: {
  id: string
  overline?: string
  title: string
  subtitle?: string
  link?: { to: string; label: string }
  tone?: 'light' | 'dark'
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6 lg:mb-8">
      <div className="flex flex-col gap-1.5 min-w-0">
        {overline && <p className="text-d-over uppercase font-heading text-accent">{overline}</p>}
        <h2 id={id} className={clsx('font-heading font-bold text-[28px] leading-9 lg:text-d-h2', tone === 'dark' ? 'text-on-banner' : 'text-text')}>
          {title}
        </h2>
        {subtitle && <p className={clsx('text-d-body max-w-[640px]', tone === 'dark' ? 'text-banner-muted' : 'text-muted')}>{subtitle}</p>}
      </div>
      {link && (
        <Link
          to={link.to}
          className="inline-flex items-center gap-1.5 shrink-0 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {link.label}
          <ArrowRight size={16} aria-hidden />
        </Link>
      )}
    </div>
  )
}

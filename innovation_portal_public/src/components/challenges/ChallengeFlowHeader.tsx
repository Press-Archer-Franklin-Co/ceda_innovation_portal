import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * U10: the banner on top of the challenge entry, results and my result pages (1.9, 1.9b, 1.10, 2.11).
 * Same banner as the challenge page (1.8), shorter: breadcrumb back to the challenge, an overline, the title
 * and one line under it.
 */
export default function ChallengeFlowHeader({
  slug, challenge, overline, title, children, titleId,
}: {
  slug: string
  challenge: string
  overline?: string
  title: string
  children?: ReactNode
  titleId: string
}) {
  const { t } = useI18n()
  return (
    <section aria-labelledby={titleId} className="bg-banner text-on-banner">
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pt-6 lg:pt-8 pb-8 lg:pb-10 flex flex-col gap-3">
        <nav aria-label={t('chd.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-2 text-d-cap text-banner-muted">
            <li><Link to="/challenges" className="hover:underline">{t('nav.challenges')}</Link></li>
            <li aria-hidden><ChevronRight size={12} /></li>
            <li><Link to={`/challenges/${slug}`} className="hover:underline truncate max-w-[220px] inline-block align-bottom">{challenge}</Link></li>
          </ol>
        </nav>
        {overline && <p className="text-d-over uppercase font-heading text-yellow">{overline}</p>}
        <h1 id={titleId} className="font-heading font-extrabold text-d-mh1 lg:text-d-h2 lg:max-w-[800px] break-words">{title}</h1>
        {children}
      </div>
    </section>
  )
}

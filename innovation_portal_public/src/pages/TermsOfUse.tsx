import { Link } from 'react-router-dom'
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react'
import LegalPage from '../components/legal/LegalPage'
import { useI18n } from '../i18n'

// Terms of use (footer "Terms"): the two documents that make up the terms, each as a card.

export default function TermsOfUse() {
  const { t } = useI18n()
  const docs = [
    { icon: FileText, title: t('legal.agreementTitle'), body: t('legal.agreementBody'), to: '/terms-of-agreement', cta: t('legal.agreementCta') },
    { icon: ShieldCheck, title: t('legal.privacyTitle'), body: t('legal.privacyBody'), to: '/privacy-policy', cta: t('legal.privacyCta') },
  ]
  return (
    <LegalPage id="terms-title" title={t('legal.useTitle')} subtitle={t('legal.useSub')}>
      <ul className="flex flex-col gap-4">
        {docs.map(({ icon: Icon, title, body, to, cta }) => (
          <li key={to}>
            <Link to={to} className="group flex items-start gap-4 p-6 rounded-card border border-border bg-surface transition-shadow hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span aria-hidden className="w-11 h-11 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Icon size={22} />
              </span>
              <span className="flex flex-col gap-1.5 min-w-0">
                <span className="text-d-h4 font-heading text-text">{title}</span>
                <span className="text-d-body-s text-muted">{body}</span>
                <span className="inline-flex items-center gap-1.5 text-d-label text-primary group-hover:underline underline-offset-4">
                  {cta} <ArrowRight size={16} aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </LegalPage>
  )
}

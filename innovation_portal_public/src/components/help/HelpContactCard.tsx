import { Link } from 'react-router-dom'
import { ArrowRight, Mail, MapPin, MessageCircle, Phone, Smartphone } from 'lucide-react'
import { buttonClasses } from '../ui/Button'
import { useI18n } from '../../i18n'
import { useShellSettings } from '../layout/shellData'
import { CONTACT_EMAIL } from '../../lib/contact'

// "Still need help?" at the foot of Help and in About › Contact. Email always shows; WhatsApp, the call
// centre, USSD and the office finder show when they are set in site settings. Live chat joins here once the
// API has a switch for it (none yet).

export default function HelpContactCard({ id, title, body, showGuide = true }: { id: string; title?: string; body?: string; showGuide?: boolean }) {
  const { t } = useI18n()
  const settings = useShellSettings()
  const ways = [
    { key: 'email', icon: Mail, label: t('help.email', { email: CONTACT_EMAIL }), href: `mailto:${CONTACT_EMAIL}` },
    settings.whatsapp_number && { key: 'wa', icon: MessageCircle, label: t('utility.whatsapp', { number: settings.whatsapp_number }), href: `https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`, external: true },
    settings.call_centre_number && { key: 'call', icon: Phone, label: t('footer.callCentreNumber', { number: settings.call_centre_number }), href: `tel:${settings.call_centre_number.replace(/\s/g, '')}` },
    settings.office_finder_url && { key: 'office', icon: MapPin, label: t('footer.offices'), href: settings.office_finder_url, external: true },
  ].filter(Boolean) as { key: string; icon: typeof Mail; label: string; href: string; external?: boolean }[]

  return (
    <section aria-labelledby={id} className="rounded-card bg-surface2 p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <span aria-hidden className="w-11 h-11 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center mb-1">
          <MessageCircle size={22} />
        </span>
        <h2 id={id} className="text-d-h3 font-heading text-text">{title ?? t('help.stillTitle')}</h2>
        <p className="text-d-body text-muted">{body ?? t('help.stillBody')}</p>
        {settings.ussd_code && (
          <p className="flex items-center gap-2 text-d-body-s text-muted">
            <Smartphone size={16} aria-hidden className="shrink-0" />
            {t('footer.ussd', { code: settings.ussd_code })}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2.5 lg:w-[360px] shrink-0">
        {ways.map(({ key, icon: Icon, label, href, external }, i) => (
          <li key={key}>
            <a
              href={href}
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className={buttonClasses({ variant: i === 0 ? 'primary' : 'secondary', block: true, className: '!justify-start' })}
            >
              <Icon size={18} aria-hidden className="shrink-0" />
              <span className="truncate">{label}</span>
            </a>
          </li>
        ))}
        {showGuide && (
          <li>
            <Link to="/guidelines" className="inline-flex items-center gap-1.5 mt-1 text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {t('help.guide')} <ArrowRight size={16} aria-hidden />
            </Link>
          </li>
        )}
      </ul>
    </section>
  )
}

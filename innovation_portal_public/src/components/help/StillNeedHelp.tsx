import { Globe, Mail, Megaphone, MessageCircle } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useShellSettings } from '../layout/shellData'
import { CONTACT_EMAIL } from '../../lib/contact'

// Figma 1.11 › "Still need help?" (138:1203): the chocolate card beside Popular questions. WhatsApp, the call
// centre and the office finder show when they are set in site settings; email always shows, so the card is
// never empty. Live chat ("Chat with an officer") joins at the top once the API has a switch for it (R-39).

export default function StillNeedHelp({ id }: { id: string }) {
  const { t } = useI18n()
  const settings = useShellSettings()
  const ways = [
    settings.whatsapp_number && {
      key: 'wa',
      icon: MessageCircle,
      label: t('utility.whatsapp', { number: settings.whatsapp_number }),
      note: t('help.whatsappWhen'),
      href: `https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`,
      external: true,
    },
    settings.call_centre_number && {
      key: 'call',
      icon: Megaphone,
      label: t('footer.callCentreNumber', { number: settings.call_centre_number }),
      note: t('help.callWhen'),
      href: `tel:${settings.call_centre_number.replace(/\s/g, '')}`,
    },
    settings.office_finder_url && {
      key: 'office',
      icon: Globe,
      label: t('footer.offices'),
      note: t('help.officeWhen'),
      href: settings.office_finder_url,
      external: true,
    },
    { key: 'email', icon: Mail, label: t('help.emailTitle'), note: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  ].filter(Boolean) as { key: string; icon: typeof Mail; label: string; note: string; href: string; external?: boolean }[]

  return (
    <section aria-labelledby={id} className="w-full lg:w-[380px] shrink-0 rounded-card bg-banner p-5 flex flex-col gap-3">
      <h2 id={id} className="font-heading text-d-h4 text-on-banner">{t('help.stillTitle')}</h2>
      <ul className="flex flex-col gap-3">
        {ways.map(({ key, icon: Icon, label, note, href, external }) => (
          <li key={key}>
            <a
              href={href}
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="flex items-center gap-2.5 rounded-[10px] bg-banner-deep p-3 hover:bg-banner-deep/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow"
            >
              <Icon size={16} aria-hidden className="shrink-0 text-amber" />
              <span className="min-w-0 flex flex-col">
                <span className="text-d-label text-on-banner truncate">{label}</span>
                <span className="text-d-cap text-banner-muted truncate">{note}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

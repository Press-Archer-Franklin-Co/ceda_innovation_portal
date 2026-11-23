import { MessageCircle, Phone } from 'lucide-react'
import Card from '../ui/Card'
import { buttonClasses } from '../ui/Button'
import { useI18n } from '../../i18n'
import { otherWays, type PublicChannels } from '../../services/channels.service'

// "Send your idea another way": WhatsApp and USSD, each only when it is live and has an address in the console's
// Channels settings. Nothing is hard-coded. When neither is live the block is not there at all.

export default function OtherWaysBlock({ channels, className }: { channels: PublicChannels | null | undefined; className?: string }) {
  const { t } = useI18n()
  const { whatsapp, ussd } = otherWays(channels)
  if (!whatsapp && !ussd) return null
  return (
    <section aria-labelledby="other-ways-title" className={className}>
      <h2 id="other-ways-title" className="mb-4 font-heading text-d-h4 text-text">{t('ways.title')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {whatsapp && (
          <Card padding="md" className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 font-heading text-d-h5 text-text"><MessageCircle size={20} aria-hidden className="text-success" />{t('ways.whatsapp')}</p>
            <p className="flex-1 text-d-body-s text-muted">{t('ways.whatsappBody', { number: whatsapp.number })}</p>
            <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>{t('ways.whatsappButton')}</a>
          </Card>
        )}
        {ussd && (
          <Card padding="md" className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 font-heading text-d-h5 text-text"><Phone size={20} aria-hidden className="text-primary" />{t('ways.ussd')}</p>
            <p className="flex-1 text-d-body-s text-muted">{t('ways.ussdBody', { code: ussd.code })}</p>
            <a href={ussd.href} className={buttonClasses({ variant: 'secondary', className: 'lg:hidden' })}>{t('ways.ussdButton', { code: ussd.code })}</a>
            <p className="hidden font-heading text-d-h4 text-text lg:block">{ussd.code}</p>
          </Card>
        )}
      </div>
    </section>
  )
}

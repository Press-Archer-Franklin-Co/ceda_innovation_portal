import PageBanner from '../components/layout/PageBanner'
import { useShellSettings } from '../components/layout/shellData'
import { useI18n } from '../i18n'
import { CONTACT_EMAIL } from '../lib/contact'
import { formatDate } from '../lib/dates'
import { usePageTitle } from '../lib/usePageTitle'

// Figma 1.12 › accessibility statement (138:1575 website, 138:1917 phone): what we support (WCAG 2.1 AA),
// known gaps, and how to ask for another format. The ways to reach us come from site settings; email
// always shows. The panel itself opens from "Accessibility" in the top bar (components/a11y).

/** Update when CEDA reviews this statement again. */
const REVIEWED = '2026-11-21'

export default function Accessibility() {
  const { t, lang } = useI18n()
  usePageTitle(t('a11y.title'))
  const settings = useShellSettings()
  const ways = [
    settings.whatsapp_number && t('a11y.askWhatsapp', { number: settings.whatsapp_number }),
    settings.call_centre_number && t('a11y.askCall', { number: settings.call_centre_number }),
    t('a11y.askEmail', { email: CONTACT_EMAIL }),
  ].filter(Boolean) as string[]
  const joined = ways.length > 1 ? `${ways.slice(0, -1).join(', ')}${t('a11y.or')}${ways[ways.length - 1]}` : ways[0]

  return (
    <>
      <PageBanner id="a11y-title" overline={t('a11y.over')} title={t('a11y.pageTitle')} subtitle={t('a11y.pageSub')} />
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 lg:py-12">
        <article aria-labelledby="a11y-title" className="max-w-[760px] flex flex-col gap-4">
          <h2 className="font-heading text-d-h4 text-text">{t('a11y.supportTitle')}</h2>
          <p className="text-d-body text-text">{t('a11y.supportBody')}</p>
          <h2 className="font-heading text-d-h4 text-text">{t('a11y.gapsTitle')}</h2>
          <p className="text-d-body text-text">{t('a11y.gapsBody')}</p>
          <h2 className="font-heading text-d-h4 text-text">{t('a11y.askTitle')}</h2>
          <p className="text-d-body text-text">
            {t('a11y.askLead', { ways: joined })} {settings.office_finder_url ? t('a11y.askOffice') : null}
          </p>
          <p className="text-d-cap text-muted">{t('a11y.reviewed', { date: formatDate(REVIEWED, lang) })}</p>
        </article>
      </div>
    </>
  )
}

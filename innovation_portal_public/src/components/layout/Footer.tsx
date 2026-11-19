import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import Logo from '../ui/Logo'
import { SUBMIT_PATH } from './Navbar'
import { useShellSettings } from './shellData'
import { TAB_BAR_SPACE } from './MobileTabBar'

// Figma 1 · Public home › Footer (10:762 website, 10:1324 phone). Chocolate banner, white headings,
// heroMuted links, yellow tagline. Contact lines show only when the site settings have them.

const link =
  'text-d-body-s text-banner-muted hover:text-on-banner hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="text-d-h5 font-heading text-on-banner">{title}</h2>
      <ul className="mt-2.5 flex flex-col gap-2.5">{children}</ul>
    </div>
  )
}

export default function Footer() {
  const { t } = useI18n()
  const settings = useShellSettings()
  const year = new Date().getFullYear()
  const hasOtherWays = Boolean(settings.whatsapp_number || settings.ussd_code || settings.office_finder_url || settings.call_centre_number)

  return (
    <footer className={`bg-banner text-banner-muted ${TAB_BAR_SPACE}`}>
      <div className="max-w-[1200px] mx-auto px-5 lg:px-6 pt-10 lg:pt-14 pb-8">
        <div className="grid gap-8 lg:gap-16 grid-cols-2 lg:grid-cols-[320px_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-3">
            <Logo theme="dark" className="!p-0 self-start" />
            <p className="text-d-h5 font-heading text-yellow">{t('footer.tagline')}</p>
            <p className="text-d-body-s">{t('footer.about')}</p>
          </div>

          <Group title={t('footer.explore')}>
            <li><Link className={link} to={SUBMIT_PATH}>{t('nav.submit')}</Link></li>
            <li><Link className={link} to="/challenges">{t('nav.challenges')}</Link></li>
            <li><Link className={link} to="/news">{t('nav.news')}</Link></li>
            <li><Link className={link} to="/stories">{t('footer.stories')}</Link></li>
          </Group>

          <Group title={t('footer.support')}>
            <li><Link className={link} to="/guidelines">{t('footer.howItWorks')}</Link></li>
            <li><Link className={link} to="/guidelines#criteria">{t('footer.criteria')}</Link></li>
            <li><Link className={link} to="/faq">{t('footer.faq')}</Link></li>
            <li><Link className={link} to="/about#contact">{t('footer.contact')}</Link></li>
          </Group>

          {hasOtherWays && (
            <Group title={t('footer.otherWays')}>
              {settings.whatsapp_number && (
                <li>
                  <a className={link} href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                    {t('utility.whatsapp', { number: settings.whatsapp_number })}
                  </a>
                </li>
              )}
              {settings.ussd_code && <li className="text-d-body-s">{t('footer.ussd', { code: settings.ussd_code })}</li>}
              {settings.office_finder_url && (
                <li>
                  <a className={link} href={settings.office_finder_url} target="_blank" rel="noreferrer">
                    {t('footer.offices')}
                  </a>
                </li>
              )}
              {settings.call_centre_number && (
                <li>
                  <a className={link} href={`tel:${settings.call_centre_number.replace(/\s/g, '')}`}>
                    {t('footer.callCentreNumber', { number: settings.call_centre_number })}
                  </a>
                </li>
              )}
            </Group>
          )}
        </div>

        <div className="mt-10 pt-4 border-t border-banner-muted/30 flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between text-d-cap">
          <p>{t('footer.rights', { year })}</p>
          <p className="flex flex-wrap items-center gap-x-1.5">
            <Link className={link + ' !text-d-cap'} to="/privacy-policy">{t('footer.privacy')}</Link>
            <span aria-hidden>·</span>
            <Link className={link + ' !text-d-cap'} to="/terms-of-use">{t('footer.terms')}</Link>
            <span aria-hidden>·</span>
            <Link className={link + ' !text-d-cap'} to="/privacy-policy#cookies">{t('footer.cookies')}</Link>
            <span aria-hidden>·</span>
            <Link className={link + ' !text-d-cap'} to={settings.accessibility_url ?? '/faq' /* TODO(U2): accessibility statement page */}>{t('utility.accessibility')}</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

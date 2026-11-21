import { ReactNode } from 'react'
import PageBanner from '../layout/PageBanner'
import { useI18n } from '../../i18n'
import { CONTACT_EMAIL } from '../../lib/contact'
import { usePageTitle } from '../../lib/usePageTitle'

// Frame for the legal pages (terms of use, terms of agreement, privacy policy) in the Option D look: the page
// banner, the "draft" notice until CEDA approves the text, and a contact line. The legal text itself is still
// the English placeholder; in Setswana the page says so instead of showing a made-up translation.

export default function LegalPage({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  const { t, lang } = useI18n()
  usePageTitle(title)
  // The sentence is translated as a whole; the address inside it becomes a link.
  const [before, after = ''] = t('legal.questions', { email: '\u0000' }).split('\u0000')
  return (
    <>
      <PageBanner id={id} overline={t('legal.over')} title={title} subtitle={subtitle} />
      <div className="max-w-[800px] mx-auto px-5 lg:px-6 py-10 lg:py-16 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p role="note" className="rounded-control bg-warning-soft text-warning px-4 py-3 text-d-body-s">{t('legal.draft')}</p>
          {lang !== 'en' && <p role="note" className="rounded-control bg-surface2 text-text px-4 py-3 text-d-body-s">{t('legal.englishOnly')}</p>}
        </div>
        <div lang="en" className="flex flex-col gap-8">{children}</div>
        <footer className="pt-6 border-t border-border flex flex-col gap-1 text-d-body-s text-muted">
          <p>
            {before}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline underline-offset-4">{CONTACT_EMAIL}</a>
            {after}
          </p>
          <p>{t('legal.org')}</p>
        </footer>
      </div>
    </>
  )
}

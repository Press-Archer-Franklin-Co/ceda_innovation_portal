import clsx from 'clsx'
import { Lang, LANGS, useI18n } from '../../i18n'

/** "English · Setswana" toggle for the utility bar. The current language is bold and not a button target. */
export default function LanguageSwitch({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('lang.label')} className={clsx('inline-flex items-center gap-1.5 text-d-cap', className)}>
      {LANGS.map((l: Lang, i) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className={tone === 'dark' ? 'text-banner-muted/60' : 'text-muted/60'}>
              ·
            </span>
          )}
          <button
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={clsx(
              'rounded px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2',
              tone === 'dark' ? 'focus-visible:ring-on-banner' : 'focus-visible:ring-primary',
              lang === l
                ? clsx('font-bold', tone === 'dark' ? 'text-on-banner' : 'text-text')
                : clsx('hover:underline', tone === 'dark' ? 'text-banner-muted' : 'text-muted'),
            )}
          >
            {t(l === 'en' ? 'lang.en' : 'lang.tn')}
          </button>
        </span>
      ))}
    </div>
  )
}

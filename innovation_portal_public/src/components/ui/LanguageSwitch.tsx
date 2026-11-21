import clsx from 'clsx'
import { Lang, LANGS, useI18n } from '../../i18n'

/** "English · Setswana" toggle for the utility bar. The current language is bold and not a button target.
 *  variant "pill": the two-part switch in the phone menu (Figma 11:694), the current language filled. */
export default function LanguageSwitch({ tone = 'light', variant = 'text', className }: { tone?: 'light' | 'dark'; variant?: 'text' | 'pill'; className?: string }) {
  const { lang, setLang, t } = useI18n()
  if (variant === 'pill') {
    return (
      <div role="group" aria-label={t('lang.label')} className={clsx('inline-flex items-center p-1 rounded-full border border-border bg-surface', className)}>
        {LANGS.map((l: Lang) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={clsx(
              'min-h-[28px] px-3.5 rounded-full text-d-label-s transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              lang === l ? 'bg-banner text-on-banner' : 'text-text hover:bg-surface2',
            )}
          >
            {t(l === 'en' ? 'lang.en' : 'lang.tn')}
          </button>
        ))}
      </div>
    )
  }
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

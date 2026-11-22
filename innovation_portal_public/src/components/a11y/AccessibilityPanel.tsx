import { RefObject, useId } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import Popover from '../ui/Popover'
import Modal from '../ui/Modal'
import { Lang, LANGS, useI18n } from '../../i18n'
import { TextSize, useA11yPrefs } from '../../lib/a11y'
import { useMediaQuery } from '../../lib/useMediaQuery'

// Figma 1.12 › Accessibility panel (138:1875 website, phone sheet in 138:1917). "Accessibility" in the top bar
// (the phone menu on phones) opens it on any page: text size, high contrast, less motion, underline links,
// easy-to-read font and language. Choices are remembered on this device (lib/a11y.ts).

const SIZES: { value: TextSize; label: string }[] = [
  { value: 'normal', label: 'A' },
  { value: 'large', label: 'A+' },
  { value: 'larger', label: 'A++' },
]

function Segmented<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: { value: V; label: string; lang?: string; aria?: string }[]; onChange: (v: V) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 p-[3px] rounded-[10px] bg-surface2 shrink-0">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.lang}
          aria-label={o.aria}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'px-3 py-1.5 rounded-control text-d-btn-s font-heading transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === o.value ? 'bg-bg text-text shadow-[0_10px_15px_rgb(46_26_15/0.08)]' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex-1 min-w-0 text-d-body-s text-text cursor-pointer">{label}</label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative w-10 h-[22px] rounded-full p-[3px] shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          checked ? 'bg-success' : 'bg-border',
        )}
      >
        <span aria-hidden className={clsx('block w-4 h-4 rounded-full bg-bg transition-transform', checked && 'translate-x-[18px]')} />
      </button>
    </div>
  )
}

function Settings({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n()
  const [prefs, setPrefs] = useA11yPrefs()
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-d-label text-text">{t('a11y.textSize')}</span>
        <Segmented
          label={t('a11y.textSize')}
          value={prefs.textSize}
          onChange={(textSize) => setPrefs({ textSize })}
          options={SIZES.map((s) => ({ ...s, aria: t(`a11y.size.${s.value}`) }))}
        />
      </div>
      <Toggle label={t('a11y.contrast')} checked={prefs.highContrast} onChange={(highContrast) => setPrefs({ highContrast })} />
      <Toggle label={t('a11y.motion')} checked={prefs.lessMotion} onChange={(lessMotion) => setPrefs({ lessMotion })} />
      <Toggle label={t('a11y.underline')} checked={prefs.underlineLinks} onChange={(underlineLinks) => setPrefs({ underlineLinks })} />
      <Toggle label={t('a11y.font')} checked={prefs.readableFont} onChange={(readableFont) => setPrefs({ readableFont })} />
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-d-label text-text">{t('lang.label')}</span>
        <Segmented<Lang>
          label={t('lang.label')}
          value={lang}
          onChange={setLang}
          options={LANGS.map((l) => ({ value: l, label: t(l === 'en' ? 'lang.en' : 'lang.tn'), lang: l }))}
        />
      </div>
      <Link to="/accessibility" onClick={onClose} className="self-start text-d-label text-primary hover:underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t('a11y.statementLink')}
      </Link>
    </div>
  )
}

export default function AccessibilityPanel({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; triggerRef: RefObject<HTMLElement | null> }) {
  const { t } = useI18n()
  const wide = useMediaQuery('(min-width: 1024px)')
  if (!wide) {
    return (
      <Modal open={open} onClose={onClose} title={t('a11y.title')} size="sm" triggerRef={triggerRef}>
        <div className="pb-2"><Settings onClose={onClose} /></div>
      </Modal>
    )
  }
  return (
    <Popover open={open} onClose={onClose} triggerRef={triggerRef} align="end" width={360} maxHeight={560} label={t('a11y.title')} className="!rounded-[16px] !border-0 p-5">
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 min-w-0 text-d-h5 font-heading text-text">{t('a11y.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-8 h-8 -m-1.5 rounded-control text-text hover:bg-surface2 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X size={18} aria-hidden />
          </button>
        </div>
        <Settings onClose={onClose} />
      </div>
    </Popover>
  )
}

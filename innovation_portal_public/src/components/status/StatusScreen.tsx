import { ReactNode, useCallback, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import markUrl from '../../assets/brand/ceda-mark.svg'
import Popover from '../ui/Popover'
import SiteSearch from '../search/SiteSearch'
import { useI18n } from '../../i18n'

// Figma 1.14 Page not found and error (138:2787 website, 138:3113 phone): the CEDA mark, calm words and the
// ways back, between the normal header and footer so people are never stuck.

export function StatusScreen({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-12 lg:py-24 flex flex-col items-center gap-7 text-center">
      <img src={markUrl} alt="" aria-hidden width={180} height={92} className="w-[140px] lg:w-[180px] h-auto" />
      <h1 className="font-heading font-bold text-[28px] leading-9 lg:text-d-h2 text-text">{title}</h1>
      <p className="max-w-[520px] text-d-body text-muted">{body}</p>
      {children}
    </div>
  )
}

/** Looks like a search field; opens the site search (1.3) out of itself. */
export function SearchField() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full max-w-[520px] flex items-center gap-2 px-[14px] py-3 rounded-card border border-border bg-bg text-left text-d-body-s text-muted hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Search size={18} aria-hidden className="shrink-0" />
        {t('notFound.search')}
      </button>
      <Popover open={open} onClose={close} triggerRef={ref} placement="center" scrim width={780} maxHeight={600} label={t('search.label')} className="!overflow-hidden flex flex-col">
        <SiteSearch variant="panel" onNavigate={close} />
      </Popover>
    </>
  )
}

import { forwardRef } from 'react'
import { Sparkles } from 'lucide-react'
import cn from 'clsx'
import { useGuide } from './guideContext'
import { useAnyOverlayOpen } from '../../lib/overlays'

/** The one "Need help?" pill, bottom right on every page (3.40 pin 3, 2.14 pin 3). */
const GuideButton = forwardRef<HTMLButtonElement, { className?: string; onClick?: () => void; hidden?: boolean }>(function GuideButton({ className, onClick, hidden }, ref) {
  const g = useGuide()
  // Under any open dialog, drawer or sheet it hides, so it never covers one. An open guide panel stays.
  const underDialog = useAnyOverlayOpen()
  return (
    <button
      ref={ref}
      type="button"
      data-guide-ui
      onClick={onClick ?? (() => g.setOpen((o: boolean) => !o))}
      aria-expanded={g.open}
      aria-controls="need-help-guide"
      className={cn(
        'fixed z-[65] inline-flex items-center gap-1.5 h-10 rounded-full bg-banner pl-3.5 pr-4 text-on-banner font-heading font-semibold text-[14px] shadow-pop',
        'transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        (hidden || underDialog) && 'hidden',
        className,
      )}
    >
      <Sparkles size={15} aria-hidden />
      {g.t('guide.button')}
    </button>
  )
})

export default GuideButton

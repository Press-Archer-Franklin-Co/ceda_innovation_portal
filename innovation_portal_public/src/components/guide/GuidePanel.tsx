import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useGenie } from '../../lib/motion/useGenie'
import { useGuide } from './guideContext'
import { AskBox, GuideAnswer, GuideHeader, StepActions, TalkLink } from './GuideContent'

/**
 * Website (640px and up): the guide panel, 380 wide, bottom right above the button (3.40, 2.14). It opens out of
 * the Need help? button with the genie and does not block the page: the person keeps working while it is open.
 */
export default function GuidePanel({ triggerRef }: { triggerRef: RefObject<HTMLButtonElement> }) {
  const g = useGuide()
  const { mounted, panelRef } = useGenie<HTMLElement>(g.open, triggerRef, {
    onOpened: () => panelRef.current?.querySelector<HTMLElement>('#guide-ask')?.focus(),
  })
  if (!mounted) return null
  return createPortal(
    // Not a dialog: the page stays usable while the guide is open, so it is a labelled side region.
    <aside
      ref={panelRef}
      id="need-help-guide"
      data-guide-ui
      aria-labelledby="guide-title"
      className="fixed right-8 bottom-[96px] z-[70] w-[380px] max-h-[calc(100vh-120px)] overflow-y-auto rounded-card bg-surface shadow-pop border border-border p-4 flex flex-col gap-4"
    >
      <GuideHeader titleId="guide-title" onClose={g.close} />
      <GuideAnswer />
      <StepActions />
      <AskBox />
      <TalkLink />
    </aside>,
    document.body,
  )
}

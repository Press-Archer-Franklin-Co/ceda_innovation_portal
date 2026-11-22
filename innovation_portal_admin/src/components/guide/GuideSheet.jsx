import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { useGenie } from '../../lib/motion/useGenie'
import { useGuide } from './guideContext'
import { AskBox, GuideAnswer, GuideHeader, StepActions, TalkLink } from './GuideContent'

/**
 * Phone (under 640px): the guide as a bottom sheet (3.40 and 2.14 phone frames). The ringed control stays visible
 * above it. Drag the handle down (or press it) to shrink the sheet while you work, up to grow it again.
 */
export default function GuideSheet({ triggerRef }) {
  const g = useGuide()
  const [small, setSmall] = useState(false)
  const [asking, setAsking] = useState(false)
  const drag = useRef(null)
  const { mounted, panelRef } = useGenie(g.open, triggerRef, {
    onOpened: () => panelRef.current?.querySelector('#guide-ask, [data-guide-primary]')?.focus(),
  })
  if (!mounted) return null
  const answered = g.status !== 'idle'
  const onDown = (e) => { drag.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const onUp = (e) => {
    if (drag.current == null) return
    const dy = e.clientY - drag.current
    drag.current = null
    if (dy > 30) setSmall(true)
    else if (dy < -30) setSmall(false)
  }
  return createPortal(
    // Not a dialog: the page stays usable while the guide is open, so it is a labelled side region.
    <aside
      ref={panelRef}
      id="need-help-guide"
      data-guide-ui
      aria-labelledby="guide-title"
      className="fixed inset-x-0 bottom-0 z-[70] max-h-[70vh] overflow-y-auto rounded-t-[20px] bg-surface shadow-pop border-t border-border px-4 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-3"
    >
      <button
        type="button"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onClick={() => setSmall((v) => !v)}
        aria-label={small ? g.t('guide.grow') : g.t('guide.shrink')}
        aria-expanded={!small}
        className="self-center pt-2.5 pb-1 px-6 touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        <span aria-hidden className="block w-9 h-1 rounded-full bg-border" />
      </button>
      <GuideHeader titleId="guide-title" onClose={g.close} />
      {!small && (
        <>
          {answered && g.question && <p className="font-bold text-[15px] text-text -mt-1">{g.question}</p>}
          {answered ? <SheetAnswer /> : <GuideAnswer list={false} />}
          <StepActions block />
          {(!answered || asking) && <AskBox autoFocus={asking} compact />}
          <p className={cn('flex items-center gap-1 text-[13px]', !g.canTalk && answered && asking && 'hidden')}>
            {answered && !asking && (
              <button type="button" onClick={() => setAsking(true)} className="font-bold text-primary hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {g.t('guide.askAnother')}
              </button>
            )}
            {answered && !asking && g.canTalk && <span aria-hidden className="text-primary">·</span>}
            <TalkLink inline />
          </p>
        </>
      )}
    </aside>,
    document.body,
  )
}

/** On a phone the sheet shows the current step only (the full list is on the website panel). */
function SheetAnswer() {
  return <GuideAnswer list={false} />
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { reducedMotion, scrollToTarget, useGuide } from './guideContext'

// The dim layer with a cut-out round the current step's control, the yellow ring and the "Step 1 of 4" tip
// (3.40 pin 1, 2.14 pin 1). Only a control that is in the page and visible is ever ringed. Clicks reach the ringed
// control; a click on the dim part only hides the ring (Show me brings it back), so the page is never stuck.
// Reduced motion: no pulse, no smooth scrolling.

const PAD = 6

/** The current step's control: waits up to waitMs for it to appear (after a page change), then reports missing. */
function useStepTarget() {
  const g = useGuide()
  const [el, setEl] = useState<HTMLElement | null>(null)
  const id = g.open && g.status === 'answered' && !g.finished ? g.step?.targetId : null
  useEffect(() => {
    setEl(null)
    g.setMissing(false)
    if (!id) return undefined
    const started = Date.now()
    let timer = 0
    const look = () => {
      const found = g.findTarget(id)
      if (found) {
        g.setMissing(false)
        setEl(found)
        scrollToTarget(found)
        return
      }
      // After 2 seconds offer Skip, but keep looking: the control may come with the next screen of a dialog.
      const late = Date.now() - started >= g.waitMs
      if (late) g.setMissing(true)
      timer = window.setTimeout(look, late ? 400 : 100)
    }
    look()
    return () => window.clearTimeout(timer)
  }, [id, g.current, g.guide]) // eslint-disable-line react-hooks/exhaustive-deps
  // A control that leaves the page (navigation, a closed menu) is looked for again.
  useEffect(() => {
    if (!el) return undefined
    const check = window.setInterval(() => { if (!el.isConnected) setEl(g.findTarget(id)) }, 300)
    return () => window.clearInterval(check)
  }, [el, id]) // eslint-disable-line react-hooks/exhaustive-deps
  return el
}

export default function Spotlight() {
  const g = useGuide()
  const el = useStepTarget()
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const show = Boolean(el && g.ringOn)
  const tipId = 'guide-step-tip'

  // Follow the control as the page scrolls or moves.
  useEffect(() => {
    if (!show) { setRect(null); return undefined }
    let frame = 0
    let last = ''
    const tick = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`
      if (key !== last) { last = key; setRect({ left: r.left, top: r.top, width: r.width, height: r.height }) }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [show, el])

  // The ringed control is described by the step text.
  useEffect(() => {
    if (!el) return undefined
    const before = el.getAttribute('aria-describedby')
    el.setAttribute('aria-describedby', [before, tipId].filter(Boolean).join(' '))
    return () => {
      if (before) el.setAttribute('aria-describedby', before)
      else el.removeAttribute('aria-describedby')
    }
  }, [el])

  const total = g.steps.length
  const text = g.step?.text ?? ''
  // The tip text always exists (for aria-describedby), visible on the website next to the ring.
  const srTip = <span id={tipId} className="sr-only">{g.t('guide.stepOf', { n: g.current + 1, total })}: {text}</span>
  if (!show || !rect) return el ? createPortal(<div data-guide-ui>{srTip}</div>, document.body) : null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const x = Math.max(0, rect.left - PAD)
  const y = Math.max(0, rect.top - PAD)
  const w = Math.min(vw - x, rect.width + PAD * 2)
  const h = Math.min(vh - y, rect.height + PAD * 2)
  const dim = 'fixed bg-scrim/45 pointer-events-auto'
  const hide = () => g.setRingOn(false)
  const tipBelow = y + h + 12 + 64 < vh
  const tipStyle = {
    top: tipBelow ? y + h + 12 : Math.max(8, y - 12 - 64),
    left: Math.min(Math.max(8, x + w - 260), vw - 268),
  }

  return createPortal(
    <div data-guide-ui aria-hidden={false}>
      <div className={dim} style={{ left: 0, top: 0, width: vw, height: y, zIndex: 60 }} onClick={hide} />
      <div className={dim} style={{ left: 0, top: y + h, width: vw, height: Math.max(0, vh - y - h), zIndex: 60 }} onClick={hide} />
      <div className={dim} style={{ left: 0, top: y, width: x, height: h, zIndex: 60 }} onClick={hide} />
      <div className={dim} style={{ left: x + w, top: y, width: Math.max(0, vw - x - w), height: h, zIndex: 60 }} onClick={hide} />
      <div
        aria-hidden
        className={`fixed pointer-events-none rounded-control border-[3px] border-yellow ${reducedMotion() ? '' : 'guide-ring-pulse'}`}
        style={{ left: x - 1, top: y - 1, width: w + 2, height: h + 2, zIndex: 61 }}
      />
      <div
        aria-hidden
        className="fixed hidden sm:block max-w-[260px] rounded-control bg-surface px-3 py-2.5 shadow-pop pointer-events-none"
        style={{ ...tipStyle, zIndex: 61 }}
      >
        <p className="text-[12px] leading-4 font-bold text-primary">{g.t('guide.stepOf', { n: g.current + 1, total })}</p>
        <p className="text-[14px] leading-5 font-bold text-text line-clamp-2">{text}</p>
      </div>
      {srTip}
    </div>,
    document.body,
  )
}

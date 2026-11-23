// The fallback motion when a panel has no trigger to come out of (opened by a route or a timer):
// it scales in from the centre and fades, and back out the same way. Same run shape as genie():
// { direction, finished, reverse(), cancel() }, so useGenie turns it round mid-flight the same way.
// Reduced motion: a 150ms fade. Keep this file the same in both apps.

export const SCALE = { openMs: 320, closeMs: 240, from: 0.94, reducedMs: 150 }

const ease = (t) => 1 - Math.pow(1 - t, 3)
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The panel's look at f (0 = gone, 1 = shown). Pure, for tests. */
export function scaleFrame(f, reduced = false) {
  const k = Math.min(1, Math.max(0, f))
  if (reduced) return { opacity: k, scale: 1 }
  const e = ease(k)
  return { opacity: e, scale: SCALE.from + (1 - SCALE.from) * e }
}

export function scaleFromCentre(panelEl, { direction = 'open', backdropEl = null, reduced = reducedMotion() } = {}) {
  let dir = direction
  let f = dir === 'open' ? 0 : 1
  let raf = 0
  let last = null
  let resolveDone
  const finished = new Promise((r) => { resolveDone = r })
  const dur = (d) => (reduced ? SCALE.reducedMs : d === 'open' ? SCALE.openMs : SCALE.closeMs)

  const paint = () => {
    const s = scaleFrame(f, reduced)
    panelEl.style.opacity = String(s.opacity)
    panelEl.style.transform = s.scale === 1 ? '' : `scale(${s.scale.toFixed(4)})`
    panelEl.style.transformOrigin = 'center'
    if (backdropEl) backdropEl.style.opacity = String(Math.min(1, Math.max(0, f)))
  }
  const done = () => {
    panelEl.style.transform = ''
    if (dir === 'open') panelEl.style.opacity = '1'
    resolveDone(dir)
  }
  const step = (t) => {
    if (last == null) last = t
    const delta = (t - last) / dur(dir)
    last = t
    f = Math.min(1, Math.max(0, dir === 'open' ? f + delta : f - delta))
    paint()
    if ((dir === 'open' && f >= 1) || (dir === 'close' && f <= 0)) return done()
    raf = requestAnimationFrame(step)
  }
  paint()
  raf = requestAnimationFrame(step)

  return {
    get direction() { return dir },
    finished,
    reverse() { dir = dir === 'open' ? 'close' : 'open' },
    cancel() {
      cancelAnimationFrame(raf)
      f = dir === 'open' ? 1 : 0
      paint()
      done()
    },
  }
}

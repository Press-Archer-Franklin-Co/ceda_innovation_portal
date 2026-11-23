// Where a modal, popover or drawer opens from (ceda-genie-motion). Keep this file the same in both apps
// (public: origin.ts).
//
// 1. The trigger the page names (triggerRef), while it is on screen.
// 2. Otherwise the control the person just pressed (pointer, Enter or Space, in the last 1.5 seconds): a page
//    that forgot its ref, or one ref shared by two buttons, still opens out of the button that was used.
// 3. Otherwise nothing (a modal opened by a route or a timer): the panel scales in from the centre.

const PRESSABLE = 'button,a[href],[role="button"],[role="menuitem"],[role="tab"],[role="option"],[data-genie-origin],tr,li'
export const RECENT_MS = 1500

let last = { el: null, at: -Infinity }
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function remember(e) {
  const el = e.target?.closest?.(PRESSABLE)
  if (el) last = { el, at: now() }
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') remember(e) }, true)
}

/** In the page and drawn with a size (a button hidden on a phone, or gone after a re-render, does not count). */
export function isOnScreen(el) {
  if (!el || !el.isConnected || typeof el.getBoundingClientRect !== 'function') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** The element to open out of, or null for the scale-from-centre fallback. */
export function pickOrigin(explicit, recent = last, at = now(), maxAgeMs = RECENT_MS) {
  if (isOnScreen(explicit)) return explicit
  if (recent?.el && at - recent.at <= maxAgeMs && isOnScreen(recent.el)) return recent.el
  return null
}

/**
 * Record the element an overlay should open out of when the pressed control is about to go away: a menu item
 * passes its menu's button (DropdownMenu does this), so a dialog picked from a "…" menu opens out of the "…".
 */
export function rememberOrigin(el) {
  if (el) last = { el, at: now() }
}

/** Tests only. */
export function rememberForTest(el, at = now()) {
  last = { el, at }
}

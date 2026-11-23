import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Scrolling that does not jump (both apps; admin: scrollKeeper.js). A new page starts at the top. Back and Forward go back to
// where the person was. A change of filter or tab on the same page (only the ?query) leaves the scroll alone.
// Positions are kept per history entry (location.key), for this browser tab only.

const STORE = 'ceda.scroll'
const MAX_ENTRIES = 60
const RESTORE_MS = 1500 // a page's data may arrive after it opens: keep trying this long

let memory: Record<string, number> | null = null
function positions(): Record<string, number> {
  if (memory) return memory
  try {
    memory = JSON.parse(sessionStorage.getItem(STORE) ?? '{}')
  } catch {
    memory = {}
  }
  return memory as Record<string, number>
}

export function savePosition(key: string, y: number) {
  const all = positions()
  delete all[key] // newest last, so the oldest entries drop first
  all[key] = Math.round(y)
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[old]
  try {
    sessionStorage.setItem(STORE, JSON.stringify(all))
  } catch {
    /* private mode: kept for this page load only */
  }
}

export const savedPosition = (key: string): number | undefined => positions()[key]

/** For tests. */
export function forgetPositions() {
  memory = null
  try {
    sessionStorage.removeItem(STORE)
  } catch {
    /* nothing kept */
  }
}

/** What to do when the location changes: 'top', 'restore' or 'stay'. */
export function scrollAction({ type, samePath, hash }: { type: string; samePath: boolean; hash?: string }): 'top' | 'restore' | 'stay' {
  if (type === 'POP') return 'restore'
  if (hash || samePath) return 'stay'
  return 'top'
}

const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'pointerdown']

const readY = (el: HTMLElement | null) => (el ? el.scrollTop : window.scrollY)
// "instant": the page's smooth scrolling must not animate a restore.
function writeY(el: HTMLElement | null, y: number) {
  if (el) el.scrollTop = y
  else window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior })
}

/**
 * Keeps the scroll of `getTarget()` (the element that scrolls), or of the window when it returns nothing.
 * Call it once, in the shell.
 */
export function useScrollKeeper(getTarget: () => HTMLElement | null = () => null) {
  const location = useLocation()
  const type = useNavigationType()
  const current = useRef(location.key)
  const lastPath = useRef<string | null>(null)
  const getter = useRef(getTarget)
  getter.current = getTarget

  // Save as the person scrolls, under the entry they are on.
  useLayoutEffect(() => {
    try {
      window.history.scrollRestoration = 'manual'
    } catch {
      /* not supported */
    }
    const el = getter.current()
    const source: HTMLElement | Window = el ?? window
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        savePosition(current.current, readY(getter.current()))
      })
    }
    source.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      source.removeEventListener('scroll', onScroll)
    }
  }, [])

  useLayoutEffect(() => {
    const previous = lastPath.current
    const samePath = previous === location.pathname
    lastPath.current = location.pathname
    current.current = location.key
    if (previous === null && type !== 'POP') return undefined // first load of a fresh link: the browser is at the top
    const action = scrollAction({ type, samePath, hash: location.hash })
    if (action === 'stay') return undefined
    const el = getter.current()
    if (action === 'top') {
      writeY(el, 0)
      return undefined
    }
    const wanted = savedPosition(location.key)
    if (wanted === undefined) {
      if (!samePath) writeY(el, 0)
      return undefined
    }
    // Restore, and keep trying while the page's content arrives, until the person scrolls themselves.
    let frame = 0
    const started = performance.now()
    const stop = () => {
      cancelAnimationFrame(frame)
      for (const name of USER_SCROLL) window.removeEventListener(name, stop)
    }
    for (const name of USER_SCROLL) window.addEventListener(name, stop, { passive: true, once: true })
    const attempt = () => {
      const target = getter.current()
      writeY(target, wanted)
      if (Math.abs(readY(target) - wanted) <= 1 || performance.now() - started > RESTORE_MS) stop()
      else frame = requestAnimationFrame(attempt)
    }
    attempt()
    return stop
  }, [location.key, location.pathname, location.hash, type])
}

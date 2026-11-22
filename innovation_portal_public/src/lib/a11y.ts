import { useCallback, useSyncExternalStore } from 'react'
import '../styles/a11y.css'

// U11C (Figma 1.12): the accessibility panel's choices. Remembered on this device (localStorage) and applied
// to <html> as data attributes that styles/a11y.css reads. Applied as soon as this file loads, so a page
// opens with the person's choices already on.

export type TextSize = 'normal' | 'large' | 'larger'

export interface A11yPrefs {
  textSize: TextSize
  highContrast: boolean
  lessMotion: boolean
  underlineLinks: boolean
  readableFont: boolean
}

const KEY = 'ceda_a11y'
export const DEFAULT_PREFS: A11yPrefs = { textSize: 'normal', highContrast: false, lessMotion: false, underlineLinks: false, readableFont: false }

function read(): A11yPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      textSize: raw.textSize === 'large' || raw.textSize === 'larger' ? raw.textSize : 'normal',
      highContrast: raw.highContrast === true,
      lessMotion: raw.lessMotion === true,
      underlineLinks: raw.underlineLinks === true,
      readableFont: raw.readableFont === true,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function applyPrefs(prefs: A11yPrefs, root: HTMLElement = document.documentElement) {
  const set = (name: string, value: string | null) => (value ? root.setAttribute(name, value) : root.removeAttribute(name))
  set('data-text-size', prefs.textSize === 'normal' ? null : prefs.textSize)
  set('data-contrast', prefs.highContrast ? 'high' : null)
  set('data-motion', prefs.lessMotion ? 'reduce' : null)
  set('data-underline', prefs.underlineLinks ? 'on' : null)
  set('data-font', prefs.readableFont ? 'readable' : null)
}

let current: A11yPrefs = typeof window === 'undefined' ? { ...DEFAULT_PREFS } : read()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') applyPrefs(current)

export function setPrefs(patch: Partial<A11yPrefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Private mode or storage off: the choice still applies until the page is closed.
  }
  applyPrefs(current)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useA11yPrefs(): [A11yPrefs, (patch: Partial<A11yPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, () => current, () => DEFAULT_PREFS)
  return [prefs, useCallback((patch: Partial<A11yPrefs>) => setPrefs(patch), [])]
}

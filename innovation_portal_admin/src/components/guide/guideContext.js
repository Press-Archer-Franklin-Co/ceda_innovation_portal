import { createContext, useContext } from 'react'

// The guide's shared state (GuideProvider) and small DOM helpers, kept apart from the components for fast refresh.

export const GuideContext = createContext(null)

export function useGuide() {
  return useContext(GuideContext)
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640

/** Bring a control into view: centred on the website, near the top on a phone (the sheet covers the bottom). */
export function scrollToTarget(el) {
  if (!el) return
  // On a phone the control goes near the top, clear of the sticky header; the sheet covers the bottom.
  if (isPhone()) el.style.scrollMarginTop = '96px'
  el.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: isPhone() ? 'start' : 'center', inline: 'nearest' })
}

export { reducedMotion }

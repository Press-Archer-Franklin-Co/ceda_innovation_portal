/**
 * Fixed position for a panel next to its trigger: below it, or above when there is no room.
 * align "start" lines up left edges, "end" lines up right edges. Stays 8px inside the window.
 */
import type { CSSProperties } from 'react'

export function anchorStyle(
  trigger: HTMLElement | null | undefined,
  { align = 'start', width = 320, maxHeight = 420, gap = 6 }: { align?: 'start' | 'end'; width?: number; maxHeight?: number; gap?: number } = {},
): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(width, vw - 16)
  if (!trigger) return { left: (vw - w) / 2, top: 80, width: w, maxHeight }
  const r = trigger.getBoundingClientRect()
  let left = align === 'end' ? r.right - w : r.left
  left = Math.max(8, Math.min(left, vw - w - 8))
  const below = vh - r.bottom - gap - 8
  const above = r.top - gap - 8
  const placeBelow = below >= Math.min(maxHeight, 240) || below >= above
  const h = Math.max(120, Math.min(maxHeight, placeBelow ? below : above))
  return placeBelow
    ? { left, top: r.bottom + gap, width: w, maxHeight: h }
    : { left, bottom: vh - r.top + gap, width: w, maxHeight: h }
}

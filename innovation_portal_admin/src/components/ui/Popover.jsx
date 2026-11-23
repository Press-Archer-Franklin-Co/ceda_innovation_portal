import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { useGenie } from '../../lib/motion/useGenie'
import { anchorStyle } from './anchor'

/**
 * Figma Foundations › Popover / Notifications. Grows out of its trigger with the small genie
 * (440 ms open, 380 ms close) and goes back into it. Esc and a click outside close it;
 * focus moves in when it has opened and back to the trigger when it closes.
 *
 *   const ref = useRef(null)
 *   <button ref={ref} aria-expanded={open} onClick={() => setOpen((o) => !o)}>…</button>
 *   <Popover open={open} onClose={() => setOpen(false)} triggerRef={ref} align="end" label="Notifications">…</Popover>
 *
 * inline: render in place instead of in a portal (use inside a Modal so it stays in the modal's DOM).
 */
export default function Popover({ open, onClose, triggerRef, align = 'start', width = 320, maxHeight = 420, inline = false, label, role = 'dialog', className, children }) {
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef } = useGenie(open, triggerRef, { small: true, onOpened })

  useEffect(() => {
    if (!open) { setSettled(false); return }
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose?.() } }
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef?.current?.contains(e.target)) return
      onClose?.()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose, panelRef, triggerRef])

  useEffect(() => {
    if (!settled) return
    const el = panelRef.current?.querySelector('[data-autofocus], [role="menuitem"], button, a[href], input, [tabindex]:not([tabindex="-1"])')
    ;(el ?? panelRef.current)?.focus({ preventScroll: true })
  }, [settled, panelRef])

  if (!mounted) return null

  const panel = (
    <div
      ref={panelRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      style={inline ? { width, maxHeight } : anchorStyle(triggerRef?.current, { align, width, maxHeight })}
      className={cn(
        'z-[55] bg-surface border border-border rounded-card shadow-pop overflow-y-auto overscroll-contain focus:outline-none',
        inline ? 'absolute mt-1.5 right-0' : 'fixed',
        className,
      )}
    >
      {children}
    </div>
  )
  return inline ? panel : createPortal(panel, document.body)
}

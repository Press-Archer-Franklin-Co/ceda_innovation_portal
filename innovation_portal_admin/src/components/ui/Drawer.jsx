import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { useGenie } from '../../lib/motion/useGenie'
import { useFocusTrap } from './useFocusTrap'

/**
 * A full-height panel at the side of the screen over a dimmed page (the phone menu, a detail drawer). Same rules
 * as Modal: it opens with the genie out of triggerRef and closes back into it (ceda-genie-motion), Esc and the
 * dim layer close it, focus is trapped once it has opened and goes back to the trigger, the page does not scroll
 * behind it. routeOpened: nothing is clicked to open it (it scales in from the centre instead).
 * Same component in both apps (public: Drawer.tsx).
 */
export default function Drawer({
  // routeOpened: nothing is clicked to open it; documented for the guard, the drawer then scales in from the centre.
  open, onClose, triggerRef, routeOpened, label, side = 'right', width = 390, className, children,
}) {
  void routeOpened
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef, backdropRef } = useGenie(open, triggerRef, { onOpened })

  useEffect(() => { if (!open) setSettled(false) }, [open])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])
  useFocusTrap(panelRef, open && settled)

  if (!mounted) return null
  return createPortal(
    <>
      <div ref={backdropRef} className="fixed inset-0 z-50 bg-scrim/45" style={{ opacity: 0 }} aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className={cn('fixed inset-y-0 z-50 w-full bg-bg shadow-pop flex flex-col focus:outline-none', side === 'right' ? 'right-0' : 'left-0', className)}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

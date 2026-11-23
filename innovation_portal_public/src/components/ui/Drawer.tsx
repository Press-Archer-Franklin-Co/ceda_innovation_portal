import { type ReactNode, type RefObject, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useGenie } from '../../lib/motion/useGenie'
import { useFocusTrap } from './useFocusTrap'

/**
 * A full-height panel at the side of the screen over a dimmed page (the phone menu, a detail drawer). Same rules
 * as Modal: it opens with the genie out of triggerRef and closes back into it (ceda-genie-motion), Esc and the
 * dim layer close it, focus is trapped once it has opened and goes back to the trigger, the page does not scroll
 * behind it. routeOpened: nothing is clicked to open it (it scales in from the centre instead).
 * Same component in both apps (admin: Drawer.jsx).
 */
export default function Drawer({
  open, onClose, triggerRef, label, side = 'right', width = 390, className, children,
}: {
  open: boolean
  onClose: () => void
  triggerRef?: RefObject<HTMLElement | null>
  /** Documents that nothing is clicked to open it; the guard then accepts no triggerRef. */
  routeOpened?: boolean
  label: string
  side?: 'left' | 'right'
  width?: number
  className?: string
  children: ReactNode
}) {
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef, backdropRef } = useGenie(open, triggerRef, { onOpened })

  useEffect(() => { if (!open) setSettled(false) }, [open])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
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
        className={clsx('fixed inset-y-0 z-50 w-full bg-bg shadow-pop flex flex-col focus:outline-none', side === 'right' ? 'right-0' : 'left-0', className)}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

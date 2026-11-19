import { ReactNode, RefObject, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useGenie } from '../../lib/motion/useGenie'
import { anchorStyle } from './anchor'

// Figma Foundations › Popover / Notifications. Grows out of its trigger with the small genie and goes back
// into it. Esc and a click outside close it; focus moves in once open and back to the trigger on close.
// inline: render in place (inside a Modal) instead of in a portal.

export interface PopoverProps {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  align?: 'start' | 'end'
  width?: number
  maxHeight?: number
  inline?: boolean
  label?: string
  role?: 'dialog' | 'menu' | 'listbox'
  className?: string
  children: ReactNode
}

export default function Popover({ open, onClose, triggerRef, align = 'start', width = 320, maxHeight = 420, inline = false, label, role = 'dialog', className, children }: PopoverProps) {
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef } = useGenie(open, triggerRef, { small: true, onOpened })

  useEffect(() => {
    if (!open) {
      setSettled(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onClose()
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
    const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], [role="menuitem"], button, a[href], input, [tabindex]:not([tabindex="-1"])')
    ;(el ?? panelRef.current)?.focus({ preventScroll: true })
  }, [settled, panelRef])

  if (!mounted) return null

  const panel = (
    <div
      ref={panelRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      style={inline ? { width, maxHeight } : anchorStyle(triggerRef.current, { align, width, maxHeight })}
      className={clsx(
        'z-[55] bg-surface border border-border rounded-card shadow-pop overflow-y-auto focus:outline-none',
        inline ? 'absolute mt-1.5 right-0' : 'fixed',
        className,
      )}
    >
      {children}
    </div>
  )
  return inline ? panel : createPortal(panel, document.body)
}

import { ReactNode, RefObject, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useGenie } from '../../lib/motion/useGenie'
import { anchorStyle } from './anchor'

// Figma Foundations › Popover / Notifications. Grows out of its trigger with the small genie and goes back
// into it. Esc and a click outside close it; focus moves in once open and back to the trigger on close.
// inline: render in place (inside a Modal) instead of in a portal.
// placement "center": centred under the site header instead of next to the trigger (1.3 search), still pouring
// out of the trigger. scrim: dims the page behind it.

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
  placement?: 'anchor' | 'center'
  scrim?: boolean
  className?: string
  children: ReactNode
}

export default function Popover({ open, onClose, triggerRef, align = 'start', width = 320, maxHeight = 420, inline = false, label, role = 'dialog', placement = 'anchor', scrim = false, className, children }: PopoverProps) {
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef } = useGenie(open, triggerRef, { small: true, onOpened })
  // The scrim fades in with the genie (one frame after mounting) and out as it closes.
  const [dim, setDim] = useState(false)
  useEffect(() => {
    if (!open) {
      setDim(false)
      return
    }
    const id = requestAnimationFrame(() => setDim(true))
    return () => cancelAnimationFrame(id)
  }, [open])

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
      style={inline ? { width, maxHeight } : placement === 'center' ? centredStyle(triggerRef.current, width, maxHeight) : anchorStyle(triggerRef.current, { align, width, maxHeight })}
      className={clsx(
        'z-[55] bg-surface border border-border rounded-card shadow-pop overflow-y-auto overscroll-contain focus:outline-none',
        inline ? 'absolute mt-1.5 right-0' : 'fixed',
        className,
      )}
    >
      {children}
    </div>
  )
  if (inline) return panel
  return createPortal(
    <>
      {scrim && (
        <div
          aria-hidden
          className={clsx('fixed inset-0 z-[54] bg-scrim/45 transition-opacity duration-300 motion-reduce:duration-150', dim ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {panel}
    </>,
    document.body,
  )
}

/** Centred under the header the trigger sits in, 16px inside the window at phone widths. Pixels, no transform, so the genie measures it exactly. */
function centredStyle(trigger: HTMLElement | null, width: number, maxHeight: number) {
  const vw = window.innerWidth
  const w = Math.min(width, vw - 32)
  const header = trigger?.closest('header')?.getBoundingClientRect().bottom ?? 80
  const top = header + 11
  return { left: Math.round((vw - w) / 2), top, width: w, maxHeight: Math.min(maxHeight, window.innerHeight - top - 16) }
}

import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import { useFocusTrap } from './useFocusTrap'
import { useGenie } from '../../lib/motion/useGenie'

const SIZE_MAP = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

/**
 * Figma Foundations › Modal and confirm dialog.
 * Header (title, muted description, square close), body, cream footer band (ghost Cancel, primary last).
 * Opens with the genie out of triggerRef and closes back into it (ceda-genie-motion).
 * Esc closes, focus is trapped once it has opened and returns to the trigger. Bottom sheet on phone.
 * Props: open, onClose, title, description, size sm|md|lg|xl, footer, triggerRef, closeOnBackdrop, alert.
 * routeOpened: nothing is clicked to open it (a route, a timer, after a save); it scales in from the centre.
 */
export default function Modal({ open, onClose, title, description, size = 'md', footer, children, closeOnBackdrop = true, alert = false, bodyClassName, triggerRef }) {
  const t = useT()
  const id = useId().replace(/:/g, '')
  const [settled, setSettled] = useState(false)
  const onOpened = useCallback(() => setSettled(true), [])
  const { mounted, panelRef, backdropRef } = useGenie(open, triggerRef, { onOpened })

  useEffect(() => {
    if (!open) setSettled(false)
  }, [open])

  // Esc works from the first frame (a control that handles Esc itself calls preventDefault);
  // the focus trap starts once the live panel is shown.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useFocusTrap(panelRef, open && settled)

  if (!mounted) return null

  return createPortal(
    <>
    <div ref={backdropRef} className="fixed inset-0 z-50 bg-scrim/45" style={{ opacity: 0 }} aria-hidden onClick={closeOnBackdrop ? onClose : undefined} />
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={cn(
          'pointer-events-auto relative w-full bg-surface shadow-pop flex flex-col overflow-hidden focus:outline-none',
          'rounded-t-card sm:rounded-card max-h-[92vh] sm:max-h-[90vh]',
          SIZE_MAP[size] ?? SIZE_MAP.md,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-2 2xl:px-6 2xl:pt-6 flex-shrink-0">
          <div className="min-w-0">
            {title && (
              <h2 id={`${id}-title`} className="font-heading font-bold text-[18px] leading-[26px] 2xl:text-[20px] 2xl:leading-7 text-text">
                {title}
              </h2>
            )}
            {description && (
              <p id={`${id}-desc`} className="mt-1 text-[13px] leading-5 2xl:text-d-body-s text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 w-8 h-8 rounded-control bg-surface2 text-text flex items-center justify-center hover:bg-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={16} strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto px-5 py-3 2xl:px-6 2xl:py-4', bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 2xl:px-6 2xl:py-4 bg-surface2 flex-shrink-0">{footer}</div>
        )}
      </div>
    </div>
    </>,
    document.body,
  )
}

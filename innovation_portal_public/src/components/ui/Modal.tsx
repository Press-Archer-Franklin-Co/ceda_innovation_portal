import { ReactNode, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useFocusTrap } from './useFocusTrap'
import { useT } from '../../i18n'

// Figma Foundations › Modal and confirm dialog. Header (title D/h4-ish 20px, muted description, square close),
// body, cream footer band with actions on the right (ghost Cancel, primary last).
// On phone it is a bottom sheet. Esc closes, focus is trapped and returns to the opener.
// U0 adds the genie motion; keep this structure (panel > header, body, footer).

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  /** Replaces the standard header (e.g. an image banner). The close button stays. */
  header?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bodyClassName?: string
  /** Clicking the backdrop closes it. Off for forms with unsaved input. */
  closeOnBackdrop?: boolean
  /** role="alertdialog" for confirmations. */
  alert?: boolean
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }

export default function Modal({
  open, onClose, title, description, header, footer, children, size = 'md', bodyClassName, closeOnBackdrop = true, alert = false,
}: ModalProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')
  useFocusTrap(panelRef, open, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-scrim/45 animate-fade-in" aria-hidden onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        className={clsx(
          'relative w-full bg-surface shadow-pop flex flex-col overflow-hidden focus:outline-none animate-slide-up',
          'rounded-t-card sm:rounded-card max-h-[92vh] sm:max-h-[calc(100vh-2rem)]',
          sizes[size],
        )}
      >
        {header ? (
          <div className="relative shrink-0">
            {header}
            <CloseButton onClose={onClose} label={t('common.close')} className="absolute right-4 top-4" />
          </div>
        ) : (
          (title || description) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 shrink-0">
              <div className="min-w-0">
                {title && (
                  <h2 id={`${id}-title`} className="font-heading font-bold text-[20px] leading-7 text-text">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={`${id}-desc`} className="mt-1 text-d-body-s text-muted">
                    {description}
                  </p>
                )}
              </div>
              <CloseButton onClose={onClose} label={t('common.close')} />
            </div>
          )
        )}
        {!header && !title && !description && <CloseButton onClose={onClose} label={t('common.close')} className="absolute right-4 top-4 z-10" />}
        <div className={clsx('px-6 py-4 overflow-y-auto min-h-0 flex-1', bodyClassName)}>{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 bg-surface2 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

function CloseButton({ onClose, label, className }: { onClose: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={clsx(
        'shrink-0 w-8 h-8 rounded-control bg-surface2 text-text flex items-center justify-center hover:bg-border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <X size={16} strokeWidth={2.25} aria-hidden />
    </button>
  )
}

import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

export default function ActionDrawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  widthClassName = 'max-w-md',
  bodyClassName,
  children,
}) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={ref}
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-full bg-white shadow-2xl',
          'flex flex-col transition-transform duration-300 ease-out',
          widthClassName,
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ceda-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ceda-dark">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-ceda-muted">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ceda-muted hover:text-ceda-dark hover:bg-ceda-surface transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className={cn('flex-1 overflow-y-auto p-6', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div className="border-t border-ceda-border bg-white px-6 py-4 flex-shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  )
}

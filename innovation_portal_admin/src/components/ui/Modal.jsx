import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, size = 'md', footer, children }) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />

      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-modal flex flex-col max-h-[90vh] animate-slide-up',
          SIZE_MAP[size] ?? SIZE_MAP.md
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ceda-border flex-shrink-0">
          <h2 className="text-base font-semibold text-ceda-dark">{title}</h2>
          <button
            onClick={onClose}
            className="btn-icon -mr-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-ceda-border flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  header?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bodyClassName?: string
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
}

export default function Modal({ open, onClose, title, header, children, size = 'md', bodyClassName }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative bg-white rounded-2xl shadow-2xl w-full max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col animate-slide-up',
          sizes[size],
        )}
      >
        {header ? (
          <div className="relative shrink-0">
            {header}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        ) : title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className={clsx('p-4 sm:p-6 overflow-y-auto min-h-0', bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}

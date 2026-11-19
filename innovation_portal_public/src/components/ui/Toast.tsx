import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '../../i18n'

// Figma Foundations › Toast: white card, tinted dot for the tone, bold title, body, optional red action.
// Bottom right on desktop, top on phone. 6 s, errors 8 s. U0 adds the genie motion.

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastInput {
  title: string
  body?: string
  tone?: ToastTone
  /** e.g. { label: 'Undo', onClick } or { label: 'Try again', onClick } */
  action?: { label: string; onClick: () => void }
  /** ms; default 6000, errors 8000. 0 keeps it until closed. */
  duration?: number
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastApi {
  show: (toast: ToastInput) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const dot: Record<ToastTone, string> = {
  success: 'bg-success-soft [&>span]:bg-success',
  info: 'bg-info-soft [&>span]:bg-info',
  warning: 'bg-warning-soft [&>span]:bg-warning',
  error: 'bg-danger-soft [&>span]:bg-danger',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback((toast: ToastInput) => {
    const id = next.current++
    setItems((list) => [...list.slice(-2), { ...toast, id }])
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed z-[60] inset-x-4 top-4 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:right-6 flex flex-col gap-3 sm:w-[360px] pointer-events-none">
          {items.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** const toast = useToast(); toast.show({ title: 'Partner saved', tone: 'success' }) */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast needs <ToastProvider> above it')
  return ctx
}

export function ToastCard({ toast, onClose }: { toast: ToastInput; onClose: () => void }) {
  const t = useT()
  const tone = toast.tone ?? 'success'
  const duration = toast.duration ?? (tone === 'error' ? 8000 : 6000)
  const [paused, setPaused] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!duration || paused) return
    const timer = window.setTimeout(() => closeRef.current(), duration)
    return () => window.clearTimeout(timer)
  }, [duration, paused])

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-card bg-surface border border-border shadow-pop p-4 animate-slide-up"
    >
      <span aria-hidden className={clsx('mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0', dot[tone])}>
        <span className="w-2.5 h-2.5 rounded-full" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-d-label text-text">{toast.title}</p>
        {toast.body && <p className="text-d-body-s text-muted mt-0.5">{toast.body}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action?.onClick(); onClose() }}
            className="mt-1 text-d-label text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.dismiss')}
        className="shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-control text-muted hover:bg-surface2 hover:text-text flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}

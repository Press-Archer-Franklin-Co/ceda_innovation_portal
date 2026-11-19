import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import { ToastContext } from './toast'

// Figma Foundations › Toast: white card, tinted dot for the tone, bold title, body, optional red action.
// Bottom right on desktop, top on phone. U0 adds the genie motion.

const dot = {
  success: 'bg-success-soft [&>span]:bg-success',
  info: 'bg-info-soft [&>span]:bg-info',
  warning: 'bg-warning-soft [&>span]:bg-warning',
  error: 'bg-danger-soft [&>span]:bg-danger',
}

export default function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const next = useRef(1)

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback((toast) => {
    const id = next.current++
    setItems((list) => [...list.slice(-2), { ...toast, id }])
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed z-[60] inset-x-4 top-4 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:right-6 flex flex-col gap-2.5 sm:w-[360px] pointer-events-none">
          {items.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function ToastCard({ toast, onClose }) {
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
      className="pointer-events-auto flex items-start gap-3 rounded-card bg-surface border border-border shadow-pop p-3.5 animate-slide-up"
    >
      <span aria-hidden className={cn('mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0', dot[tone] ?? dot.success)}>
        <span className="w-2.5 h-2.5 rounded-full" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] leading-5 font-bold text-text">{toast.title}</p>
        {toast.body && <p className="text-[13px] leading-5 text-muted mt-0.5">{toast.body}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action.onClick(); onClose() }}
            className="mt-1 text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
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

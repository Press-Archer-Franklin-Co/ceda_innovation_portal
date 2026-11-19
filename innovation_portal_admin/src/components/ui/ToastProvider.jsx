import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import { genie } from '../../lib/motion/genie'
import { ToastContext } from './toast'

// Figma Foundations › Toast: white card, tinted dot for the tone, bold title, body, optional red action.
// Motion (ceda-genie-motion): grows out of the button that caused it (whatever had focus, or `origin`),
// and leaves into the bell (an element with data-toast-target) or slides right. Bottom right on desktop,
// top on phone. 6 s, errors 8 s. The same toast twice restarts its timer instead of stacking a copy.

const dot = {
  success: 'bg-success-soft [&>span]:bg-success',
  info: 'bg-info-soft [&>span]:bg-info',
  warning: 'bg-warning-soft [&>span]:bg-warning',
  error: 'bg-danger-soft [&>span]:bg-danger',
}

const sameToast = (a, b) => a.title === b.title && a.body === b.body && (a.tone ?? 'success') === (b.tone ?? 'success')

export default function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const next = useRef(1)

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback((toast) => {
    const origin = toast.origin ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null)
    let id = next.current++
    setItems((list) => {
      const twin = list.find((t) => sameToast(t, toast))
      if (twin) {
        id = twin.id
        return list.map((t) => (t.id === twin.id ? { ...t, repeat: (t.repeat ?? 0) + 1 } : t))
      }
      return [...list.slice(-2), { ...toast, id, origin, repeat: 0 }]
    })
    return id
  }, [])
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed z-[60] inset-x-4 top-4 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:right-6 flex flex-col gap-2.5 sm:w-[360px] pointer-events-none">
          {items.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} animate />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** One toast. With `animate`, it plays the genie in and out; the styleguide shows it static. */
export function ToastCard({ toast, onClose, animate = false }) {
  const t = useT()
  const tone = toast.tone ?? 'success'
  const duration = toast.duration ?? (tone === 'error' ? 8000 : 6000)
  const [paused, setPaused] = useState(false)
  const ref = useRef(null)
  const leaving = useRef(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    if (!animate || !ref.current) return
    const run = genie(ref.current, toast.origin && document.contains(toast.origin) ? toast.origin : null, { direction: 'open', small: true })
    return () => run.cancel()
    // Plays once, on arrival.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const el = ref.current
    if (!animate || !el) { closeRef.current(); return }
    const bell = [...document.querySelectorAll('[data-toast-target]')].find((b) => b.offsetParent !== null)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (bell && !reduced) {
      genie(el, bell, { direction: 'close', small: true }).finished.then(() => closeRef.current())
    } else {
      el.style.transition = `transform ${reduced ? 150 : 380}ms ease-in, opacity ${reduced ? 150 : 380}ms ease-in`
      el.style.transform = reduced ? 'none' : 'translateX(110%)'
      el.style.opacity = '0'
      setTimeout(() => closeRef.current(), reduced ? 160 : 390)
    }
  }, [animate])

  useEffect(() => {
    if (!duration || paused) return
    const timer = window.setTimeout(leave, duration)
    return () => window.clearTimeout(timer)
  }, [duration, paused, leave, toast.repeat])

  return (
    <div
      ref={ref}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-card bg-surface border border-border shadow-pop p-3.5"
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
            onClick={() => { toast.action.onClick(); leave() }}
            className="mt-1 text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={leave}
        aria-label={t('common.dismiss')}
        className="shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-control text-muted hover:bg-surface2 hover:text-text flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}

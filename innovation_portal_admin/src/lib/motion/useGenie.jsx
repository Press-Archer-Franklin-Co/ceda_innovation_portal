/**
 * React wrapper for genie.js. Works in the admin app (JSX) and the public app
 * (rename to .tsx and add the types from genie.d.ts).
 *
 *   const { mounted, panelRef, backdropRef } = useGenie(open, triggerRef)
 *   {mounted && createPortal(<><div ref={backdropRef} className="backdrop"/>
 *                              <div ref={panelRef} role="dialog">...</div></>, document.body)}
 *
 * - Mounts the panel when `open` turns true, plays the genie out of the
 *   trigger, then shows the live panel.
 * - When `open` turns false it plays back into the trigger, then unmounts.
 * - Turning round mid-flight reverses from the current shape. No jump.
 * - Reduced motion: a 150ms fade.
 * - It opens out of triggerRef while that is on screen, else out of the control just pressed (origin.js),
 *   else it scales in from the centre (scaleFromCentre.js): never a page's own animation, never none.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { genie } from './genie';
import { isOnScreen, pickOrigin } from './origin';
import { scaleFromCentre } from './scaleFromCentre';

export function useGenie(open, triggerRef, { small = false, onOpened, onClosed } = {}) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const runRef = useRef(null);
  const originRef = useRef(null);

  // Remember where it came from at the moment of opening (the trigger may
  // scroll or re-render later; we close back into the same element).
  useEffect(() => { if (open) { originRef.current = pickOrigin(triggerRef?.current ?? null); setMounted(true); } }, [open, triggerRef]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!mounted || !panel) return;
    // A panel mounted already open: this runs before the effect above, so take its origin here.
    if (open && !originRef.current) originRef.current = pickOrigin(triggerRef?.current ?? null);
    const origin = originRef.current;
    const run = runRef.current;

    if (open) {
      if (run && run.direction === 'open') return;
      if (run && run.direction === 'close') run.reverse();
      else runRef.current = origin
        ? genie(panel, origin, { direction: 'open', backdropEl: backdropRef.current, small })
        : scaleFromCentre(panel, { direction: 'open', backdropEl: backdropRef.current });
      runRef.current.finished.then((dir) => {
        if (dir === 'open') { runRef.current = null; onOpened?.(); }
      });
    } else {
      if (run && run.direction === 'open') { run.reverse(); }
      else if (!run) runRef.current = isOnScreen(origin)
        ? genie(panel, origin, { direction: 'close', backdropEl: backdropRef.current, small })
        : scaleFromCentre(panel, { direction: 'close', backdropEl: backdropRef.current });
      runRef.current.finished.then((dir) => {
        if (dir === 'close') { runRef.current = null; setMounted(false); onClosed?.(); if (isOnScreen(origin)) origin.focus?.(); }
      });
    }
  }, [open, mounted, small, onOpened, onClosed, triggerRef]);

  useEffect(() => () => runRef.current?.cancel(), []);

  return { mounted, panelRef, backdropRef };
}

/* ------------------------------------------------------------------ */
/* Example: the shared Modal in innovation_portal_admin                */
/* ------------------------------------------------------------------ */
/*
import { createPortal } from 'react-dom'
import { useGenie } from '../../lib/motion/useGenie'
import { useFocusTrap } from '../../lib/a11y/useFocusTrap'

export default function Modal({ open, onClose, title, description, size = 'md', footer, triggerRef, children }) {
  const { mounted, panelRef, backdropRef } = useGenie(open, triggerRef, {
    onOpened: () => panelRef.current?.querySelector('[data-autofocus],input,select,textarea,button')?.focus(),
  })
  useFocusTrap(panelRef, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!mounted) return null
  return createPortal(
    <>
      <div ref={backdropRef} className="fixed inset-0 z-50 bg-black/40" style={{ opacity: 0 }} onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"
             className={cn('pointer-events-auto w-full bg-surface rounded-2xl shadow-modal flex flex-col max-h-[90vh]', SIZE_MAP[size])}>
          ...header, body, footer exactly as today...
        </div>
      </div>
    </>,
    document.body,
  )
}
*/

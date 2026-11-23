/**
 * Copied from .claude/skills/ceda-genie-motion/reference/useGenie.jsx with TypeScript types added.
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
 */
import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { genie, GenieRun } from './genie';
import { isOnScreen, pickOrigin } from './origin';
import { scaleFromCentre, type ScaleRun } from './scaleFromCentre';

export interface UseGenieOptions {
  small?: boolean;
  onOpened?: () => void;
  onClosed?: () => void;
}

export function useGenie<P extends HTMLElement = HTMLDivElement, B extends HTMLElement = HTMLDivElement>(
  open: boolean,
  triggerRef?: RefObject<HTMLElement | null> | null,
  { small = false, onOpened, onClosed }: UseGenieOptions = {},
) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<P>(null);
  const backdropRef = useRef<B>(null);
  const runRef = useRef<GenieRun | ScaleRun | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  // Remember where it came from at the moment of opening (the trigger may
  // scroll or re-render later; we close back into the same element).
  useEffect(() => { if (open) { originRef.current = pickOrigin(triggerRef?.current ?? null); setMounted(true); } }, [open, triggerRef]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!mounted || !panel) return;
    const origin = originRef.current;
    const run = runRef.current;

    if (open) {
      if (run && run.direction === 'open') return;
      if (run && run.direction === 'close') run.reverse();
      else runRef.current = origin
        ? genie(panel, origin, { direction: 'open', backdropEl: backdropRef.current, small })
        : scaleFromCentre(panel, { direction: 'open', backdropEl: backdropRef.current });
      runRef.current?.finished.then((dir) => {
        if (dir === 'open') { runRef.current = null; onOpened?.(); }
      });
    } else {
      if (run && run.direction === 'open') { run.reverse(); }
      else if (!run) runRef.current = isOnScreen(origin)
        ? genie(panel, origin, { direction: 'close', backdropEl: backdropRef.current, small })
        : scaleFromCentre(panel, { direction: 'close', backdropEl: backdropRef.current });
      runRef.current?.finished.then((dir) => {
        if (dir === 'close') { runRef.current = null; setMounted(false); onClosed?.(); if (isOnScreen(origin)) origin.focus?.(); }
      });
    }
  }, [open, mounted, small, onOpened, onClosed]);

  useEffect(() => () => runRef.current?.cancel(), []);

  return { mounted, panelRef, backdropRef };
}

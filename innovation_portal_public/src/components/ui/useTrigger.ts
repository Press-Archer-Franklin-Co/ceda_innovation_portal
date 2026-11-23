import { type SyntheticEvent, useCallback, useRef } from 'react'

/**
 * The trigger a modal, popover or drawer opens out of (ceda-genie-motion). One per overlay:
 *   const create = useTrigger()
 *   <Button ref={create.ref} onClick={() => setOpen(true)}>Create</Button>      one button
 *   <Card onClick={(e) => { create.from(e); setOpen(true) }} />                  several, or rows
 *   <Modal open={open} triggerRef={create.ref} ... />
 * from(e) remembers the element that was used, so the panel opens out of that one (never another button's).
 */
export function useTrigger<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null)
  const from = useCallback((e: SyntheticEvent<Element>) => {
    if (e?.currentTarget) ref.current = e.currentTarget as T
  }, [])
  /** For a wrapper around many cards: remembers the link or button inside it that was pressed. */
  const fromInside = useCallback((e: SyntheticEvent<Element>) => {
    const hit = (e.target as Element | null)?.closest?.('a,button')
    if (hit) ref.current = hit as unknown as T
  }, [])
  return { ref, from, fromInside }
}

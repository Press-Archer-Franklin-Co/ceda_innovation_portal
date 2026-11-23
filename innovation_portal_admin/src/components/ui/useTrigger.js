import { useCallback, useRef } from 'react'

/**
 * The trigger a modal, popover or drawer opens out of (ceda-genie-motion). One per overlay:
 *   const create = useTrigger()
 *   <Button ref={create.ref} onClick={() => setOpen(true)}>Create</Button>      one button
 *   <Card onClick={(e) => { create.from(e); setOpen(true) }} />                  several, or rows
 *   <Modal open={open} triggerRef={create.ref} ... />
 * from(e) remembers the element that was used, so the panel opens out of that one (never another button's).
 */
export function useTrigger() {
  const ref = useRef(null)
  const from = useCallback((e) => {
    if (e?.currentTarget) ref.current = e.currentTarget
  }, [])
  return { ref, from }
}

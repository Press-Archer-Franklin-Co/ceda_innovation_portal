import { useEffect, useSyncExternalStore } from 'react'

// Which full-screen layers are open (Modal, Drawer, phone sheets). The "Need help?" button hides while any is,
// so it never sits on top of a dialog. Same file in both apps (admin: overlays.js).

let open = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Count this layer as open while `isOpen` is true (use the mounted flag, so the closing motion counts too). */
export function useOverlay(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return undefined
    open += 1
    emit()
    return () => {
      open -= 1
      emit()
    }
  }, [isOpen])
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True while any Modal, Drawer or sheet is open. */
export function useAnyOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open > 0, () => false)
}

import { useEffect, useSyncExternalStore } from 'react'

// Which full-screen layers are open (Modal, Drawer, phone sheets, the phone menu). The "Need help?" button hides
// while any is, so it never sits on top of a dialog. Same file in both apps (public: overlays.ts).

let open = 0
const listeners = new Set()
const emit = () => listeners.forEach((listener) => listener())

/** Count this layer as open while `isOpen` is true (use the mounted flag, so the closing motion counts too). */
export function useOverlay(isOpen) {
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

const subscribe = (listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True while any Modal, Drawer or sheet is open. */
export function useAnyOverlayOpen() {
  return useSyncExternalStore(subscribe, () => open > 0, () => false)
}

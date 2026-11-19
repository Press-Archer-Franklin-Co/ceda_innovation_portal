import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { ConfirmContext } from './confirm'

/** Provides useConfirm(). The dialog grows out of whatever had focus when it was asked (the button pressed). */
export default function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, options: {} })
  const resolver = useRef(null)
  const triggerRef = useRef(null)

  const confirm = useCallback((options = {}) => {
    resolver.current?.(false)
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setState({ open: true, options })
    return new Promise((resolve) => { resolver.current = resolve })
  }, [])

  const answer = useCallback((value) => {
    resolver.current?.(value)
    resolver.current = null
    setState((s) => ({ ...s, open: false }))
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        {...state.options}
        open={state.open}
        triggerRef={triggerRef}
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    </ConfirmContext.Provider>
  )
}

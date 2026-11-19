import { createContext, useContext } from 'react'

export const ConfirmContext = createContext(null)

/**
 * Ask a yes/no question with the shared ConfirmDialog and wait for the answer.
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Delete this FAQ?', body: 'It disappears from the help page.',
 *                         confirmLabel: 'Delete FAQ', note: 'This cannot be undone.' }))) return
 *
 * Options: title, body, note, confirmLabel, cancelLabel, tone ('danger' default, or 'primary').
 * Resolves true on confirm, false on cancel, Esc or backdrop.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm needs <ConfirmProvider> above it')
  return ctx
}

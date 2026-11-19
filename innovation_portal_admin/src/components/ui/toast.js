import { createContext, useContext } from 'react'

export const ToastContext = createContext(null)

/**
 * const toast = useToast()
 * toast.show({ title: 'Partner saved', body: 'Debswana now shows on the home page.', tone: 'success', action: { label: 'Undo', onClick } })
 * tone: success | info | warning | error. Lasts 6 s (errors 8 s); duration: 0 keeps it until closed.
 */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast needs <ToastProvider> above it')
  return ctx
}

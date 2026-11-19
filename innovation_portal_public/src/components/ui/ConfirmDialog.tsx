import { createContext, ReactNode, RefObject, useCallback, useContext, useRef, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { useT } from '../../i18n'

// Figma Foundations › Confirm dialog. Never use window.confirm.
// A destructive confirmation names the thing, says what happens, and puts the red action last.

export interface ConfirmOptions {
  title: ReactNode
  body?: ReactNode
  /** Red band under the text, e.g. "This cannot be undone." */
  note?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  triggerRef?: RefObject<HTMLElement | null>
}

export default function ConfirmDialog({
  open, onConfirm, onCancel, title, body, note, confirmLabel, cancelLabel, tone = 'danger', loading = false, triggerRef,
}: ConfirmDialogProps) {
  const t = useT()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      size="sm"
      alert
      triggerRef={triggerRef}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading} data-autofocus>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {note ? <p className="rounded-control bg-danger-soft text-danger text-d-label-s px-3 py-2.5">{note}</p> : null}
    </Modal>
  )
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Provides useConfirm(). The dialog grows out of whatever had focus when it was asked. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions }>({ open: false, options: { title: '' } })
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    resolver.current?.(false)
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setState({ open: true, options })
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setState((s) => ({ ...s, open: false }))
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog {...state.options} open={state.open} triggerRef={triggerRef} onConfirm={() => answer(true)} onCancel={() => answer(false)} />
    </ConfirmContext.Provider>
  )
}

/** if (!(await confirm({ title: 'Delete this draft?', confirmLabel: 'Delete draft' }))) return */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm needs <ConfirmProvider> above it')
  return ctx
}

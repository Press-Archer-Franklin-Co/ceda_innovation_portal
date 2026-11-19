import Modal from './Modal'
import Button from './Button'
import { useT } from '../../i18n/context'

/**
 * Figma Foundations › Confirm dialog. Replaces window.confirm everywhere.
 * A destructive confirmation names the thing ("Delete the partner Debswana?"), says what happens,
 * and puts the red action last. `note` shows in a red band ("This cannot be undone.").
 *
 *   <ConfirmDialog open={open} onCancel={close} onConfirm={remove} tone="danger"
 *     title="Delete the partner Debswana?" body="It disappears from the home page straight away."
 *     note="This cannot be undone." confirmLabel="Delete partner" cancelLabel="Keep it" triggerRef={btn} />
 *
 * For a one-off question inside a handler, use `const confirm = useConfirm()` (ConfirmProvider).
 */
export default function ConfirmDialog({
  open, onConfirm, onCancel, title, body, note, confirmLabel, cancelLabel, tone = 'danger', loading = false, triggerRef,
}) {
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

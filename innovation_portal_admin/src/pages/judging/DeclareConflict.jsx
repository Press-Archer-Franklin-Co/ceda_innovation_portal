import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Textarea from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/toast'
import { useT } from '../../i18n/context'
import { judgingApi } from '../../lib/api/ideas'

/** Declare a conflict of interest on one idea (3.17 pin 2, 3.18 pin 1). The idea then goes to another judge. */
export function DeclareConflict({ idea, onClose, onDone, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (idea) { setDetails(''); setError('') } }, [idea])

  async function save() {
    if (!details.trim()) { setError(t('judging.conflictNeeded')); return }
    setBusy(true)
    try {
      await judgingApi.declareConflict(idea.assignment_id, details.trim())
      toast.show({ tone: 'success', title: t('judging.conflictSaved') })
      onDone?.()
    } catch (err) {
      setError(err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(idea)}
      onClose={onClose}
      triggerRef={triggerRef}
      title={t('judging.declareTitle')}
      description={idea ? t('judging.declareHint', { title: idea.title }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={save} loading={busy}>{t('judging.declare')}</Button>
        </>
      }
    >
      <Textarea label={t('judging.conflictWhat')} hint={t('judging.conflictWhatHint')} required rows={3} value={details} onChange={(e) => { setDetails(e.target.value); setError('') }} error={error || undefined} />
    </Modal>
  )
}

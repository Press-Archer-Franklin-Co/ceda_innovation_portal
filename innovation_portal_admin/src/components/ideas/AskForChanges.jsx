import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { ideaApi } from '../../lib/api/ideas'
import { sendBackBody } from '../../lib/ideas/sendBack'

// 3.16 "Ask for more": the step's request info action, with the reason, the fix-by date and exactly what to change.
// The innovator sees this on 2.4b, and only these parts unlock.

const NEW_DOCUMENT = '__new_document__'
const emptyItem = () => ({ key: crypto.randomUUID(), choice: NEW_DOCUMENT, label: '' })

export default function AskForChanges({ open, onClose, triggerRef, id, onJustMessage }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [fixBy, setFixBy] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const info = useQuery({ queryKey: ['ideas', id, 'send-back'], queryFn: () => ideaApi.sendBackInfo(id), enabled: open })
  const questions = info.data?.questions ?? []
  const options = [{ value: NEW_DOCUMENT, label: t('ideas.back.newDocument') }, ...questions.map((q) => ({ value: q.field_key, label: q.label }))]
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Gaborone' })

  useEffect(() => {
    if (!open) return
    setReason('')
    setFixBy('')
    setItems([emptyItem()])
    setErrors({})
    setFailure('')
  }, [open])

  const change = (key, patch) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  const choose = (item, choice) => {
    const question = questions.find((q) => q.field_key === choice)
    const previous = questions.find((q) => q.field_key === item.choice)
    change(item.key, { choice, label: !item.label || item.label === previous?.label ? question?.label ?? '' : item.label })
  }

  async function save() {
    const next = {}
    if (!reason.trim()) next.reason = t('ideas.back.reasonNeeded')
    items.forEach((item, index) => { if (!item.label.trim()) next[`items[${index}].label`] = t('ideas.back.itemNeeded') })
    setErrors(next)
    setFailure('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await ideaApi.sendBack(id, sendBackBody({ reason, fixBy, items, questions, newDocument: NEW_DOCUMENT }))
      qc.invalidateQueries({ queryKey: ['ideas'] })
      toast.show({ tone: 'success', title: t('ideas.back.sent') })
      onClose()
    } catch (err) {
      setFailure(err?.message || t('ideas.back.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      size="lg"
      closeOnBackdrop={false}
      title={t('ideas.back.title')}
      description={t('ideas.back.body')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={busy} disabled={info.isLoading || info.isError}>{t('ideas.back.send')}</Button></>}
    >
      {info.isLoading ? (
        <div aria-hidden className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : info.isError ? (
        <ErrorState compact title={t('ideas.back.loadError')} onRetry={info.refetch} />
      ) : (
        <div className="flex flex-col gap-4">
          <Textarea label={t('ideas.back.reason')} hint={t('ideas.back.reasonHint')} required rows={3} maxChars={1000} value={reason} error={errors.reason} onChange={(e) => setReason(e.target.value)} />
          <Input type="date" label={t('ideas.back.fixBy')} optional min={today} value={fixBy} onChange={(e) => setFixBy(e.target.value)} fieldClassName="sm:max-w-[220px]" />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-bold text-text">{t('ideas.back.items')}</legend>
            {items.map((item, index) => (
              <div key={item.key} className="grid items-start gap-2 rounded-control border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_36px]">
                <Select label={t('ideas.back.what')} options={options} value={item.choice} onChange={(value) => choose(item, value)} />
                <Input label={t('ideas.back.ask')} maxLength={200} value={item.label} error={errors[`items[${index}].label`]} placeholder={t('ideas.back.askExample')} onChange={(e) => change(item.key, { label: e.target.value })} />
                <button type="button" disabled={items.length === 1} onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))} aria-label={t('ideas.back.remove', { n: index + 1 })} className="mt-6 flex h-9 w-9 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-danger disabled:opacity-40">
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
            {items.length < 10 && (
              <Button variant="ghost" size="sm" className="self-start" icon={<Plus size={15} aria-hidden />} onClick={() => setItems((list) => [...list, emptyItem()])}>{t('ideas.back.add')}</Button>
            )}
          </fieldset>
          {failure && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">{failure}</p>}
          <button type="button" onClick={() => { onClose(); onJustMessage() }} className="self-start text-[13px] font-bold text-primary hover:underline">{t('ideas.back.justMessage')}</button>
        </div>
      )}
    </Modal>
  )
}

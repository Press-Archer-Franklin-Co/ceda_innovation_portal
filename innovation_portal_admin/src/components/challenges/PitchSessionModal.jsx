import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Textarea from '../ui/Textarea'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { useConfirm } from '../ui/confirm'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { bodyFromForm, formFromSession, formProblems, pitchApi } from '../../lib/api/pitch'

// Set or change one person's pitch time (Nshathisi, 23 Nov: per person; innovators cannot pick or change it).
// The shared Modal opens with the genie from the row or "Change" button; on a phone it is the bottom sheet.
// Save: PUT the idea's own session (audited, tells only this person). Remove: DELETE, after the shared confirm.

const errorText = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}

export default function PitchSessionModal({ open, onClose, programId, submissionId, name, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const current = useQuery({ queryKey: ['pitch', programId, submissionId], queryFn: () => pitchApi.get(programId, submissionId), enabled: open && !!submissionId })
  const [form, setForm] = useState(null)
  const [show, setShow] = useState(false)
  useEffect(() => { if (open && current.data) { setForm(formFromSession(current.data.own)); setShow(false) } }, [open, current.data])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const done = () => {
    qc.invalidateQueries({ queryKey: ['pitch', programId] })
    onClose()
  }
  const save = useMutation({
    mutationFn: () => pitchApi.save(programId, submissionId, bodyFromForm(form)),
    onSuccess: () => { toast.show({ tone: 'success', title: t('pitch.saved', { name }) }); done() },
    onError: (e) => toast.show({ tone: 'error', title: t('pitch.failed', { message: errorText(e) }) }),
  })
  const remove = useMutation({
    mutationFn: () => pitchApi.remove(programId, submissionId),
    onSuccess: () => { toast.show({ tone: 'success', title: t('pitch.removed', { name }) }); done() },
    onError: (e) => toast.show({ tone: 'error', title: t('pitch.failed', { message: errorText(e) }) }),
  })
  const problems = form ? formProblems(form) : []
  const submit = () => {
    setShow(true)
    if (!problems.length) save.mutate()
  }
  const askRemove = async () => {
    if (await confirm({ title: t('pitch.removeTitle', { name }), body: t('pitch.removeBody', { name }), confirmLabel: t('pitch.remove') })) remove.mutate()
  }
  const has = !!current.data?.own
  const busy = save.isPending || remove.isPending

  return (
    <Modal open={open} onClose={onClose} title={t('pitch.modalTitle', { name })} description={t('pitch.modalHint', { name })} size="lg" triggerRef={triggerRef}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span>{has && <Button variant="ghost" onClick={askRemove} loading={remove.isPending} disabled={busy}>{t('pitch.remove')}</Button>}</span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
            <Button onClick={submit} loading={save.isPending} disabled={!form || busy}>{t('common.save')}</Button>
          </span>
        </div>
      )}>
      {current.isError ? (
        <ErrorState compact title={t('pitch.loadError')} message={current.error?.message} onRetry={current.refetch} />
      ) : !form ? (
        <Skeleton className="h-72 rounded-card" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:col-span-2">
            <Input type="datetime-local" label={t('pitch.when')} required value={form.when} onChange={(e) => set({ when: e.target.value })}
              error={show && problems.includes('when') ? t('pitch.needWhen') : undefined} />
            <Input type="number" min="5" max="600" label={t('pitch.minutes')} optional value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} className="w-[96px]" />
          </div>
          <Select label={t('pitch.format')} options={['in_person', 'online'].map((v) => ({ value: v, label: t(`pitch.format.${v}`) }))} value={form.format} onChange={(v) => set({ format: v ?? 'in_person' })} />
          {form.format === 'online' ? (
            <Input type="url" label={t('pitch.link')} placeholder="https://" required value={form.link} onChange={(e) => set({ link: e.target.value })}
              error={show && problems.includes('link') ? t('pitch.needLink') : undefined} />
          ) : (
            <>
              <Input label={t('pitch.place')} required value={form.place_en} maxLength={300} onChange={(e) => set({ place_en: e.target.value })}
                error={show && problems.includes('place') ? t('pitch.needPlace') : undefined} />
              <Input label={t('pitch.placeTn')} optional value={form.place_tn} maxLength={300} onChange={(e) => set({ place_tn: e.target.value })} />
            </>
          )}
          <Textarea label={t('pitch.instructions')} optional rows={3} maxLength={1500} value={form.text_en} onChange={(e) => set({ text_en: e.target.value })} />
          <Textarea label={t('pitch.instructionsTn')} optional rows={3} maxLength={1500} value={form.text_tn} onChange={(e) => set({ text_tn: e.target.value })} />
        </div>
      )}
    </Modal>
  )
}

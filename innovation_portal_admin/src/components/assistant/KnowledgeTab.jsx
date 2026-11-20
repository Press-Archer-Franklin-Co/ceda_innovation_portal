import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button'
import { Toggle } from '../ui/Choice'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import SectionCard from '../ui/SectionCard'
import Select from '../ui/Select'
import Skeleton from '../ui/Skeleton'
import Textarea from '../ui/Textarea'
import { useConfirm } from '../ui/confirm'
import { useToast } from '../ui/toast'
import { useI18n } from '../../i18n/context'
import { useAssistantAdminAction, useKnowledge } from '../../lib/queries/assistant'
import { audienceOptions, languageOptions } from './options'

const EMPTY = { title: '', text: '', audience: 'everyone', language: 'any', is_active: true }

/** Guidance lines the helper follows. Each save changes the next answer. */
export default function KnowledgeTab() {
  const { t } = useI18n()
  const list = useKnowledge()
  const action = useAssistantAdminAction()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // { id?, values, trigger }
  const addButton = useRef(null)

  async function run(args, ok = t('ai.admin.saved')) {
    try {
      await action.mutateAsync(args)
      toast.show({ title: ok, tone: 'success' })
      return true
    } catch {
      toast.show({ title: t('ai.admin.saveFailed'), tone: 'error' })
      return false
    }
  }

  async function move(index, step) {
    const ids = list.data.map((entry) => entry.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + step, 0, item)
    await run({ action: 'orderKnowledge', value: ids })
  }

  async function remove(entry) {
    const yes = await confirm({ title: t('ai.kb.deleteTitle', { title: entry.title }), body: t('ai.kb.deleteBody'), confirmLabel: t('ai.kb.delete') })
    if (yes) await run({ action: 'dropKnowledge', id: entry.id })
  }

  return (
    <SectionCard
      title={t('ai.admin.tabKnowledge')}
      actions={
        <Button ref={addButton} size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setEditing({ values: EMPTY, trigger: addButton })}>
          {t('ai.kb.add')}
        </Button>
      }
    >
      {list.isLoading && <div className="space-y-2" role="status">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {list.isError && <ErrorState compact message={t('ai.kb.failed')} onRetry={() => list.refetch()} retrying={list.isFetching} />}
      {list.isSuccess && list.data.length === 0 && <EmptyState compact title={t('ai.kb.empty')} />}
      {list.isSuccess && list.data.length > 0 && (
        <ul className="divide-y divide-ceda-border">
          {list.data.map((entry, index) => (
            <KnowledgeRow
              key={entry.id}
              entry={entry}
              first={index === 0}
              last={index === list.data.length - 1}
              busy={action.isPending}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onEdit={(trigger) => setEditing({ id: entry.id, values: entry, trigger })}
              onDelete={() => remove(entry)}
            />
          ))}
        </ul>
      )}
      <KnowledgeDialog
        editing={editing}
        busy={action.isPending}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          const ok = await run(editing.id ? { action: 'editKnowledge', id: editing.id, value: values } : { action: 'addKnowledge', value: values })
          if (ok) setEditing(null)
        }}
      />
    </SectionCard>
  )
}

function KnowledgeRow({ entry, first, last, busy, onUp, onDown, onEdit, onDelete }) {
  const { t } = useI18n()
  const edit = useRef(null)
  return (
    <li className="flex flex-wrap items-start gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ceda-dark">{entry.title}</p>
        <p className="mt-0.5 whitespace-pre-line text-ceda-dark">{entry.text}</p>
        <p className="mt-1 text-xs text-ceda-muted">
          {t(`ai.audience.${entry.audience}`)} · {t(`ai.language.${entry.language}`)} · {entry.is_active ? t('ai.kb.active') : t('ai.kb.notActive')}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label={t('ai.kb.up')} disabled={first || busy} onClick={onUp} icon={<ArrowUp size={14} />} />
        <Button size="sm" variant="ghost" aria-label={t('ai.kb.down')} disabled={last || busy} onClick={onDown} icon={<ArrowDown size={14} />} />
        <Button ref={edit} size="sm" variant="ghost" aria-label={t('ai.kb.edit')} onClick={() => onEdit(edit)} icon={<Pencil size={14} />} />
        <Button size="sm" variant="ghost" aria-label={t('ai.kb.delete')} onClick={onDelete} icon={<Trash2 size={14} />} />
      </div>
    </li>
  )
}

function KnowledgeDialog({ editing, busy, onClose, onSave }) {
  const { t } = useI18n()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [openedFor, setOpenedFor] = useState(null)

  // Start from the entry each time the dialog opens for a different one.
  if (editing && openedFor !== editing) {
    setOpenedFor(editing)
    setValues({ ...EMPTY, ...editing.values })
    setErrors({})
  }
  if (!editing && openedFor) setOpenedFor(null)

  const set = (key) => (value) => setValues((prev) => ({ ...prev, [key]: value }))

  function submit(e) {
    e.preventDefault()
    const next = {}
    if (!values.title.trim()) next.title = t('ai.kb.needTitle')
    if (!values.text.trim()) next.text = t('ai.kb.needText')
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({ title: values.title.trim(), text: values.text.trim(), audience: values.audience, language: values.language, is_active: values.is_active })
  }

  return (
    <Modal
      open={Boolean(editing)}
      onClose={onClose}
      triggerRef={editing?.trigger}
      title={editing?.id ? t('ai.kb.editTitle') : t('ai.kb.addTitle')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('ai.kb.cancel')}</Button>
          <Button type="submit" form="ai-knowledge-form" loading={busy}>{t('ai.kb.save')}</Button>
        </div>
      }
    >
      <form id="ai-knowledge-form" onSubmit={submit} className="space-y-3">
        <Input label={t('ai.kb.titleField')} value={values.title} onChange={(e) => set('title')(e.target.value)} error={errors.title} maxLength={160} required />
        <Textarea label={t('ai.kb.textField')} hint={t('ai.kb.textHint')} value={values.text} onChange={(e) => set('text')(e.target.value)} error={errors.text} rows={4} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t('ai.kb.audience')} options={audienceOptions(t)} value={values.audience} onChange={set('audience')} />
          <Select label={t('ai.kb.language')} options={languageOptions(t)} value={values.language} onChange={set('language')} />
        </div>
        <Toggle label={t('ai.kb.active')} checked={values.is_active} onChange={set('is_active')} />
      </form>
    </Modal>
  )
}

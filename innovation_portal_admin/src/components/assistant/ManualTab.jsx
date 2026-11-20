import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
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
import { useAssistantAdminAction, useManualPages } from '../../lib/queries/assistant'
import { audienceOptions, languageOptions } from './options'

const EMPTY = { title: '', text: '', portal_path: '', audience: 'everyone', language: 'any', is_active: true }

/** The user manual the helper answers from: one page per task, with screenshots. */
export default function ManualTab() {
  const { t } = useI18n()
  const pages = useManualPages()
  const action = useAssistantAdminAction()
  const confirm = useConfirm()
  const toast = useToast()
  const [editingId, setEditingId] = useState(null) // 'new' or a page id
  const [trigger, setTrigger] = useState(null)
  const [fresh, setFresh] = useState(null) // a page just added, until the list refreshes
  const addButton = useRef(null)

  async function run(args) {
    try {
      const result = await action.mutateAsync(args)
      toast.show({ title: t('ai.admin.saved'), tone: 'success' })
      return result ?? true
    } catch (err) {
      toast.show({ title: t('ai.admin.saveFailed'), body: err?.message, tone: 'error' })
      return null
    }
  }

  async function move(index, step) {
    const ids = pages.data.map((page) => page.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + step, 0, item)
    await run({ action: 'orderPages', value: ids })
  }

  async function remove(page) {
    const yes = await confirm({ title: t('ai.manual.deleteTitle', { title: page.title }), body: t('ai.manual.deleteBody'), confirmLabel: t('ai.kb.delete') })
    if (yes) await run({ action: 'dropPage', id: page.id })
  }

  const editing =
    editingId === 'new'
      ? { ...EMPTY }
      : pages.data?.find((page) => page.id === editingId) ?? (fresh?.id === editingId ? fresh : null)

  return (
    <SectionCard
      title={t('ai.admin.tabManual')}
      actions={
        <Button ref={addButton} size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => { setTrigger(addButton); setEditingId('new') }}>
          {t('ai.manual.add')}
        </Button>
      }
    >
      {pages.isLoading && <div className="space-y-2" role="status">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {pages.isError && <ErrorState compact message={t('ai.manual.failed')} onRetry={() => pages.refetch()} retrying={pages.isFetching} />}
      {pages.isSuccess && pages.data.length === 0 && <EmptyState compact title={t('ai.manual.empty')} />}
      {pages.isSuccess && pages.data.length > 0 && (
        <ul className="divide-y divide-ceda-border">
          {pages.data.map((page, index) => (
            <PageRow
              key={page.id}
              page={page}
              first={index === 0}
              last={index === pages.data.length - 1}
              busy={action.isPending}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onEdit={(ref) => { setTrigger(ref); setEditingId(page.id) }}
              onDelete={() => remove(page)}
            />
          ))}
        </ul>
      )}
      <PageDialog
        key={editingId ?? 'closed'}
        page={editing}
        isNew={editingId === 'new'}
        trigger={trigger}
        busy={action.isPending}
        run={run}
        onSaved={(saved) => { setFresh(saved); setEditingId(saved?.id ?? null) }}
        onClose={() => setEditingId(null)}
      />
    </SectionCard>
  )
}

function PageRow({ page, first, last, busy, onUp, onDown, onEdit, onDelete }) {
  const { t } = useI18n()
  const edit = useRef(null)
  return (
    <li className="flex flex-wrap items-start gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ceda-dark">{page.title}</p>
        <p className="mt-0.5 line-clamp-2 text-ceda-dark">{page.text}</p>
        <p className="mt-1 text-xs text-ceda-muted">
          {[page.portal_path, t(`ai.audience.${page.audience}`), t('ai.manual.shotCount', { count: page.screenshots?.length ?? 0 }), page.is_active ? t('ai.kb.active') : t('ai.kb.notActive')]
            .filter(Boolean)
            .join(' · ')}
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

function PageDialog({ page, isNew, trigger, busy, run, onSaved, onClose }) {
  const { t } = useI18n()
  const [values, setValues] = useState(() => ({ ...EMPTY, ...(page ?? {}) }))
  const [errors, setErrors] = useState({})
  const set = (key) => (value) => setValues((prev) => ({ ...prev, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    const next = {}
    if (!values.title.trim()) next.title = t('ai.kb.needTitle')
    if (!values.text.trim()) next.text = t('ai.kb.needText')
    if (values.portal_path && !values.portal_path.startsWith('/')) next.portal_path = t('ai.manual.pathHint')
    setErrors(next)
    if (Object.keys(next).length) return
    const body = {
      title: values.title.trim(), text: values.text.trim(), portal_path: values.portal_path.trim(),
      audience: values.audience, language: values.language, is_active: values.is_active,
    }
    const saved = await run(isNew ? { action: 'addPage', value: body } : { action: 'editPage', id: page.id, value: body })
    // A new page stays open so screenshots can be added to it.
    if (saved) isNew ? onSaved(saved) : onClose()
  }

  return (
    <Modal
      open={Boolean(page)}
      onClose={onClose}
      triggerRef={trigger}
      size="lg"
      title={isNew ? t('ai.manual.addTitle') : t('ai.manual.editTitle')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('ai.kb.cancel')}</Button>
          <Button type="submit" form="ai-manual-form" loading={busy}>{t('ai.kb.save')}</Button>
        </div>
      }
    >
      <form id="ai-manual-form" onSubmit={submit} className="space-y-3">
        <Input label={t('ai.manual.pageTitle')} value={values.title} onChange={(e) => set('title')(e.target.value)} error={errors.title} maxLength={160} required />
        <Textarea label={t('ai.manual.text')} hint={t('ai.manual.textHint')} value={values.text} onChange={(e) => set('text')(e.target.value)} error={errors.text} rows={6} required />
        <Input label={t('ai.manual.path')} hint={t('ai.manual.pathHint')} value={values.portal_path} onChange={(e) => set('portal_path')(e.target.value)} error={errors.portal_path} maxLength={255} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t('ai.kb.audience')} options={audienceOptions(t)} value={values.audience} onChange={set('audience')} />
          <Select label={t('ai.kb.language')} options={languageOptions(t)} value={values.language} onChange={set('language')} />
        </div>
        <Toggle label={t('ai.kb.active')} checked={values.is_active} onChange={set('is_active')} />
      </form>
      {!isNew && page && <Screenshots page={page} run={run} busy={busy} />}
    </Modal>
  )
}

function Screenshots({ page, run, busy }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [file, setFile] = useState(null)
  const [captions, setCaptions] = useState({ en: '', tn: '' })
  const input = useRef(null)

  async function upload(e) {
    e.preventDefault()
    if (!file) return
    const ok = await run({ action: 'addScreenshot', id: page.id, value: { file, captions } })
    if (ok) {
      setFile(null)
      setCaptions({ en: '', tn: '' })
      if (input.current) input.current.value = ''
    }
  }

  async function remove(shot) {
    if (await confirm({ title: t('ai.manual.removeTitle'), body: t('ai.manual.removeBody'), confirmLabel: t('ai.manual.removeShot') })) {
      await run({ action: 'dropScreenshot', id: shot.id })
    }
  }

  return (
    <div className="mt-5 border-t border-ceda-border pt-4">
      <p className="text-sm font-semibold text-ceda-dark">{t('ai.manual.screenshots')}</p>
      {(page.screenshots ?? []).length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {page.screenshots.map((shot) => (
            <li key={shot.id} className="relative rounded-lg border border-ceda-border p-2">
              <img src={shot.url} alt={shot.caption?.en ?? ''} className="h-auto w-full rounded" loading="lazy" />
              <p className="mt-1 text-xs text-ceda-dark">{shot.caption?.en}</p>
              {shot.caption?.tn && <p className="text-xs text-ceda-muted">{shot.caption.tn}</p>}
              <Button size="sm" variant="ghost" className="absolute right-1 top-1 bg-white/90" aria-label={t('ai.manual.removeShot')} onClick={() => remove(shot)} icon={<X size={14} />} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} className="mt-3 space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
          <ImagePlus size={16} aria-hidden />
          {file ? file.name : t('ai.manual.addShot')}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('ai.manual.captionEn')} value={captions.en} onChange={(e) => setCaptions((c) => ({ ...c, en: e.target.value }))} maxLength={300} />
              <Input label={t('ai.manual.captionTn')} value={captions.tn} onChange={(e) => setCaptions((c) => ({ ...c, tn: e.target.value }))} maxLength={300} />
            </div>
            <Button type="submit" size="sm" variant="secondary" loading={busy}>{t('ai.manual.upload')}</Button>
          </>
        )}
      </form>
    </div>
  )
}

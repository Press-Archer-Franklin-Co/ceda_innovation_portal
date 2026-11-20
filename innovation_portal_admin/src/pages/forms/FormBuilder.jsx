import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Check, Eye, Globe, Monitor, Pencil, Redo2, Smartphone, Undo2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import Palette from '../../components/forms/builder/Palette'
import Canvas from '../../components/forms/builder/Canvas'
import FieldSettings from '../../components/forms/builder/FieldSettings'
import TranslationsPanel from '../../components/forms/builder/TranslationsPanel'
import PreviewFrame from '../../components/forms/builder/PreviewFrame'
import { TYPE_ICON } from '../../components/forms/builder/icons'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { pick } from '../../lib/forms/format'
import { forms as formsApi } from '../../lib/api/formBuilder'
import { useFormDraft, useSaveFormDraft, usePublishForm } from '../../lib/queries/forms'
import {
  addField, addStep, commit, duplicateField, findField, history, moveField, newField, redo, removeField,
  removeStep, renameKey, setText, setWidth, textRows, undo, updateField, updateStep,
} from '../../lib/forms/document'

const AUTOSAVE_MS = 1000

/** Parses a drop target id from the canvas into a document target. */
function targetFrom(id) {
  const [kind, ...rest] = String(id).split(':')
  const n = rest.map(Number)
  if (kind === 'newrow') return { stepIndex: n[0], newRowAt: n[1] }
  if (kind === 'beside') return { stepIndex: n[0], rowIndex: n[1], index: n[2] }
  return null
}

/** Problems from a refused publish or save: [{ message, field?, step? }]. */
function problemsFrom(err) {
  const data = err?.data ?? {}
  const list = data.problems ?? data.errors?.problems ?? data.errors?.errors ?? data.errors ?? []
  if (!Array.isArray(list)) return err?.message ? [{ message: err.message }] : []
  return list.map((p) => (typeof p === 'string' ? { message: p } : { message: p.message || p.detail || '', field: p.field, step: p.step }))
}

/** 3.5 and 3.5b: the drag-and-drop form builder, in English or Setswana. */
export default function FormBuilder() {
  const { id } = useParams()
  const t = useT()
  const confirm = useConfirm()
  const toast = useToast()
  const draft = useFormDraft(id)
  const save = useSaveFormDraft(id)
  const publish = usePublishForm(id)

  const [h, setH] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [selectedKey, setSelectedKey] = useState(null)
  const [lang, setLang] = useState('en')
  const [device, setDevice] = useState('desktop')
  const [previewing, setPreviewing] = useState(false)
  const [active, setActive] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [problems, setProblems] = useState([])
  const [suggestions, setSuggestions] = useState({})
  const [suggestOff, setSuggestOff] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const lastSaved = useRef(null)
  const announce = useRef(null)

  // Start the history once, from the server's draft.
  useEffect(() => {
    if (draft.data && !h) {
      setH(history(draft.data))
      lastSaved.current = draft.data
    }
  }, [draft.data, h])

  const doc = h?.present
  const apply = useCallback((fn) => setH((prev) => (prev ? commit(prev, fn(prev.present)) : prev)), [])

  // Autosave a moment after the last change.
  const runSave = useCallback(async (document) => {
    setSaveState('saving')
    try {
      await save.mutateAsync(document)
      lastSaved.current = document
      setSaveState('saved')
      setSaveMessage('')
      return true
    } catch (err) {
      if (err?.status === 400) {
        setSaveState('rejected')
        setSaveMessage(problemsFrom(err)[0]?.message || err.message)
      } else {
        setSaveState('failed')
      }
      return false
    }
  }, [save])

  useEffect(() => {
    if (!doc || doc === lastSaved.current) return
    const timer = setTimeout(() => runSave(doc), saveState === 'failed' ? 5000 : AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [doc, runSave, saveState])

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo (not while typing in a field).
  useEffect(() => {
    function onKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable
      if (typing || !(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); setH((prev) => prev && undo(prev)) }
      if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); setH((prev) => prev && redo(prev)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (doc) document.title = `${pick(doc.name, 'en')} · CEDA Innovation`
  }, [doc])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor))
  const rows = useMemo(() => (doc ? textRows(doc) : []), [doc])
  const selected = doc && selectedKey ? findField(doc, selectedKey) : null
  const withTn = (doc?.languages ?? []).includes('tn')

  if (draft.isLoading || (draft.data && !h)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-4 lg:grid-cols-[256px_minmax(0,1fr)_310px]">
          <Skeleton className="h-[520px] rounded-card" />
          <Skeleton className="h-[520px] rounded-card" />
          <Skeleton className="h-[520px] rounded-card" />
        </div>
      </div>
    )
  }
  if (draft.isError || !doc) {
    return <ErrorState title={t('builder.loadError')} message={draft.error?.message} onRetry={draft.refetch} framed />
  }
  const archived = doc.status === 'archived'

  function say(text) {
    if (announce.current) announce.current.textContent = text
  }

  function addAtEnd(type) {
    const field = newField(doc, type, { en: t(`builder.type.${type}`) })
    apply((d) => addField(d, field, { stepIndex, newRowAt: d.steps[stepIndex]?.rows.length ?? 0 }))
    setSelectedKey(field.key)
    say(t('builder.added', { name: t(`builder.type.${type}`) }))
  }

  function onDragEnd(event) {
    setActive(null)
    const target = event.over ? targetFrom(event.over.id) : null
    if (!target) return
    const [kind, value] = String(event.active.id).split(/:(.*)/s)
    if (kind === 'palette') {
      const field = newField(doc, value, { en: t(`builder.type.${value}`) })
      apply((d) => addField(d, field, target))
      setSelectedKey(field.key)
      say(t('builder.added', { name: t(`builder.type.${value}`) }))
    } else if (kind === 'field') {
      apply((d) => moveField(d, value, target))
      say(t('builder.moved', { name: pick(findField(doc, value)?.label, 'en') }))
    }
  }

  function changeField(patch) {
    if (!selected) return
    const { key, ...rest } = patch
    apply((d) => {
      let next = Object.keys(rest).length ? updateField(d, selected.key, rest) : d
      if (key && key !== selected.key) next = renameKey(next, selected.key, key)
      return next
    })
    if (key && key !== selected.key) setSelectedKey(key)
  }

  async function deleteSelected() {
    if (!selected) return
    const ok = await confirm({ title: t('settings.deleteTitle', { name: pick(selected.label, 'en') || t('builder.untitled') }), body: t('settings.deleteBody'), confirmLabel: t('settings.delete') })
    if (!ok) return
    apply((d) => removeField(d, selected.key))
    setSelectedKey(null)
  }

  async function onRemoveStep(index) {
    const step = doc.steps[index]
    const count = step.rows.reduce((n, r) => n + r.fields.length, 0)
    const ok = await confirm({ title: t('builder.removeStepTitle', { name: pick(step.title, 'en') }), body: t('builder.removeStepBody', { count }), confirmLabel: t('builder.removeStep') })
    if (!ok) return
    apply((d) => removeStep(d, index))
    setStepIndex(Math.max(0, index - 1))
  }

  async function ensureSaved() {
    if (doc === lastSaved.current) return true
    return runSave(doc)
  }

  async function onPublish() {
    setProblems([])
    if (!(await ensureSaved())) return
    try {
      const version = await publish.mutateAsync()
      toast.show({ tone: 'success', title: t('builder.published', { n: version?.number ?? '' }) })
    } catch (err) {
      const list = problemsFrom(err)
      setProblems(list.length ? list : [{ message: t('common.somethingWrong') }])
    }
  }

  async function onSuggest(keys) {
    if (!(await ensureSaved())) return
    setSuggesting(true)
    try {
      const data = await formsApi.suggest(id, keys)
      const next = {}
      for (const s of data?.suggestions ?? []) next[s.key] = s.suggested
      setSuggestions((prev) => ({ ...prev, ...next }))
    } catch (err) {
      if (err?.status === 501) setSuggestOff(true)
      else toast.show({ tone: 'error', title: err?.message || t('common.somethingWrong') })
    } finally {
      setSuggesting(false)
    }
  }

  async function onRequestReview(role) {
    if (!(await ensureSaved())) return
    setReviewing(true)
    try {
      await formsApi.requestReview(id, { role })
      toast.show({ tone: 'success', title: t('tr.reviewSent') })
    } catch (err) {
      toast.show({ tone: 'error', title: err?.message || t('tr.reviewError') })
    } finally {
      setReviewing(false)
    }
  }

  const status =
    saveState === 'saving' ? t('builder.saving')
    : saveState === 'saved' ? t('builder.saved')
    : saveState === 'failed' ? t('builder.saveFailed')
    : saveState === 'rejected' ? t('builder.saveRejected', { message: saveMessage })
    : ''
  const activeType = active?.startsWith('palette:') ? active.slice(8) : active?.startsWith('field:') ? findField(doc, active.slice(6))?.type : null
  const ActiveIcon = activeType ? TYPE_ICON[activeType] : null
  const labelRow = selected ? rows.find((r) => r.key === `field.${selected.key}.label`) : null

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <p ref={announce} className="sr-only" aria-live="polite" />
      <PageHeader
        back={<Link to="/forms" className="text-[12px] text-muted hover:text-text hover:underline">{t('builder.crumb', { name: pick(doc.name, 'en') })}</Link>}
        title={pick(doc.name, 'en')}
        subtitle={t('builder.intro')}
        actions={
          // TODO(R-24): max-w lets the actions wrap on a phone until PageHeader's actions can shrink.
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
            {status && (
              <span role="status" className={cn('inline-flex items-center gap-1 text-[12px]', saveState === 'failed' || saveState === 'rejected' ? 'text-danger' : 'text-muted')}>
                {saveState === 'saved' && <Check size={14} aria-hidden className="text-success" />}
                {status}
              </span>
            )}
            <button type="button" onClick={() => setH((prev) => undo(prev))} disabled={!h.past.length} aria-label={t('builder.undo')} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text disabled:opacity-40">
              <Undo2 size={16} aria-hidden />
            </button>
            <button type="button" onClick={() => setH((prev) => redo(prev))} disabled={!h.future.length} aria-label={t('builder.redo')} className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text disabled:opacity-40">
              <Redo2 size={16} aria-hidden />
            </button>
            {withTn && (
              <div role="radiogroup" aria-label={t('lang.label')} className="flex items-center gap-1 rounded-control bg-surface2 p-1">
                <Globe size={14} aria-hidden className="ml-1 text-muted" />
                {['en', 'tn'].map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                    className={cn('h-7 rounded px-2.5 text-[12px]', lang === l ? 'bg-surface font-bold text-text shadow-sm' : 'text-muted hover:text-text')}>
                    {t(`lang.${l}`)}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={() => setPreviewing((p) => !p)}>
              {previewing ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              {previewing ? t('builder.edit') : t('builder.preview')}
            </Button>
            <Button size="sm" onClick={onPublish} loading={publish.isPending} disabled={archived}>{t('builder.publish')}</Button>
          </div>
        }
      />

      {archived && <p role="alert" className="rounded-control bg-warning-soft px-3 py-2 text-[13px] text-text">{t('builder.archived')}</p>}

      {problems.length > 0 && (
        <div role="alert" className="rounded-card border border-danger/40 bg-danger-soft p-3">
          <p className="text-[13px] font-bold text-danger">{t('builder.publishProblems')}</p>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-text">
            {problems.map((p, i) => {
              const field = p.field ? findField(doc, p.field) : null
              const stepAt = doc.steps.findIndex((s) => s.code === p.step || (field && s.rows.some((r) => r.fields.some((f) => f.key === field.key))))
              const text = field ? `${pick(field.label, 'en') || field.key}: ${p.message}` : p.message
              return (
                <li key={i}>
                  {field || stepAt >= 0 ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => {
                      if (stepAt >= 0) setStepIndex(stepAt)
                      if (field) setSelectedKey(field.key)
                      setPreviewing(false)
                    }}>{text}</button>
                  ) : text}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-1">
        <span className="mr-1 text-[12px] text-muted">{t('builder.device')}</span>
        {[{ key: 'desktop', icon: Monitor }, { key: 'phone', icon: Smartphone }].map(({ key, icon: Icon }) => (
          <button key={key} type="button" aria-pressed={device === key} aria-label={t(`builder.${key}`)} onClick={() => setDevice(key)}
            className={cn('flex h-8 w-8 items-center justify-center rounded-control', device === key ? 'bg-surface2 text-text' : 'text-muted hover:text-text')}>
            <Icon size={16} aria-hidden />
          </button>
        ))}
      </div>

      {previewing ? (
        <PreviewFrame doc={doc} lang={lang} device={device} stepIndex={stepIndex} />
      ) : (
        <DndContext sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}>
          <div className="grid items-start gap-4 lg:grid-cols-[236px_minmax(0,1fr)_300px] 2xl:grid-cols-[256px_minmax(0,1fr)_310px]">
            <Palette onAdd={addAtEnd} disabled={archived} />
            <Canvas
              doc={doc}
              stepIndex={Math.min(stepIndex, doc.steps.length - 1)}
              onStepChange={setStepIndex}
              onAddStep={() => { apply((d) => addStep(d, { en: t('builder.newStep') })); setStepIndex(doc.steps.length) }}
              onRemoveStep={onRemoveStep}
              onRenameStep={(i, l, text) => apply((d) => updateStep(d, i, { title: { ...(d.steps[i].title ?? {}), [l]: text } }))}
              lang={lang}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              dragging={Boolean(active)}
              onWidth={(key, width) => apply((d) => setWidth(d, key, width))}
              device={device}
            />
            {lang === 'tn' ? (
              <TranslationsPanel
                rows={rows}
                onText={(row, text) => apply((d) => setText(d, row, 'tn', text))}
                suggestions={suggestions}
                onSuggest={() => onSuggest()}
                suggesting={suggesting}
                suggestOff={suggestOff}
                onRequestReview={onRequestReview}
                reviewing={reviewing}
                focusKey={selectedKey}
              />
            ) : (
              <FieldSettings
                doc={doc}
                field={selected}
                onChange={changeField}
                onClose={() => setSelectedKey(null)}
                onDuplicate={() => apply((d) => duplicateField(d, selected.key))}
                onDelete={deleteSelected}
                onSuggest={suggestOff || !labelRow ? undefined : () => onSuggest([labelRow.key])}
                suggestion={labelRow ? suggestions[labelRow.key] : undefined}
              />
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeType && (
              <div className="flex items-center gap-2 rounded-control border border-primary bg-surface px-3 py-2 text-[13px] font-bold text-text shadow-card">
                {ActiveIcon && <ActiveIcon size={16} aria-hidden className="text-primary" />}
                {t(`builder.type.${activeType}`)}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

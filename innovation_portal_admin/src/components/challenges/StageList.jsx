import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Layers } from 'lucide-react'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Tag from '../ui/Tag'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import EmptyState from '../ui/EmptyState'
import { Toggle } from '../ui/Choice'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { useForms } from '../../lib/queries/forms'
import { cn } from '../../lib/cn'

// 3.6c Stages and forms (Figma 135:1555 website, 135:1800 phone), on R-48's GET /api/programs/{id}/stages/ and
// PATCH /api/programs/{id}/stages/{step_id}/. ① Each stage in the workflow's order, with its form and dates.
// ② Open a stage to change its form, dates, ③ who takes part and what moves an idea on, and the "tell applicants" switch.
// ④ The stages follow the workflow: adding or reordering a stage happens there. The first stage's form is the
// challenge's entry form (set under Judging), so it shows here read-only.

const TAKES_PART = ['all', 'shortlisted']
const MOVES_ON = ['automatic', 'officer', 'manager', 'panel_score']
const day = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) : null)

function toInput(value) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function draftOf(stage) {
  return {
    form: stage.form?.id ?? '',
    opens_at: toInput(stage.opens_at),
    closes_at: toInput(stage.closes_at),
    takes_part: stage.takes_part ?? 'all',
    kind: stage.moves_on?.kind ?? 'officer',
    pass_mark: stage.moves_on?.pass_mark == null ? '' : String(Number(stage.moves_on.pass_mark)),
    notify_applicants: !!stage.notify_applicants,
  }
}

function StageCard({ stage, programId, entryForm, open, onToggle, formOptions }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [draft, setDraft] = useState(() => draftOf(stage))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(draftOf(stage)) }, [stage])
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const first = stage.order === 1
  const formName = first ? entryForm : stage.form ? (stage.form.version ? `${stage.form.title} v${stage.form.version}` : stage.form.title) : null
  const dates = stage.opens_at && stage.closes_at ? t('stg.range', { from: day(stage.opens_at), to: day(stage.closes_at) }) : stage.closes_at ? t('stg.by', { date: day(stage.closes_at) }) : null
  const panelId = `stage-${stage.step_id}`

  async function save() {
    setError('')
    if (draft.opens_at && draft.closes_at && new Date(draft.closes_at) <= new Date(draft.opens_at)) { setError(t('stg.datesError')); return }
    if (draft.kind === 'panel_score' && draft.pass_mark !== '' && (Number(draft.pass_mark) < 0 || Number(draft.pass_mark) > 100)) { setError(t('stg.passMarkError')); return }
    setBusy(true)
    try {
      const body = {
        opens_at: draft.opens_at ? new Date(draft.opens_at).toISOString() : null,
        closes_at: draft.closes_at ? new Date(draft.closes_at).toISOString() : null,
        takes_part: draft.takes_part,
        moves_on: { kind: draft.kind, ...(draft.kind === 'panel_score' ? { pass_mark: draft.pass_mark === '' ? null : Number(draft.pass_mark) } : {}) },
        notify_applicants: draft.notify_applicants,
        ...(first ? {} : { form: draft.form || null }),
      }
      await client.patch(`/api/programs/${programId}/stages/${stage.step_id}/`, body)
      qc.invalidateQueries({ queryKey: ['programs', programId, 'stages'] })
      qc.invalidateQueries({ queryKey: ['programs', programId] })
      toast.show({ tone: 'success', title: t('stg.saved', { name: stage.name }) })
      onToggle()
    } catch (err) {
      const data = err?.data?.errors ?? err?.data ?? {}
      const firstMsg = typeof data === 'object' ? Object.values(data).flat()[0] : null
      setError(typeof firstMsg === 'string' ? firstMsg : err?.message || t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('rounded-card border bg-surface', open ? 'border-primary' : 'border-border')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-3 rounded-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-banner text-[12px] font-bold text-on-banner">{stage.order}</span>
        <span className="min-w-0 flex-1 text-[15px] font-bold text-text">{stage.name}</span>
        <span className="flex flex-wrap items-center gap-2">
          {formName ? <Tag tone="blue">{formName}</Tag> : <Tag>{t('cbs.noForm')}</Tag>}
          {dates && <span className="text-[12px] text-muted">{dates}</span>}
          <ChevronDown size={16} aria-hidden className={cn('text-muted transition-transform', open && 'rotate-180')} />
        </span>
        {!open && (
          <span className="flex w-full flex-wrap gap-x-4 pl-10 text-[12px] text-muted">
            <span>{stage.takes_part === 'shortlisted' ? t('stg.takes.shortlisted') : first ? t('stg.everyone') : stage.reviewers_label || t('stg.takes.all')}</span>
            <span>{t(`stg.moves.${stage.moves_on?.kind ?? 'officer'}`, { mark: stage.moves_on?.pass_mark == null ? '' : Number(stage.moves_on.pass_mark) })}</span>
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          {first ? (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-bold text-text">{t('stg.form')}</span>
              <p className="text-[13px] text-muted">{t('stg.entryFormHere')}</p>
            </div>
          ) : (
            <Select label={t('stg.form')} options={[{ value: '', label: t('cbs.noForm') }, ...formOptions]} value={draft.form} onChange={(v) => set({ form: v })} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" label={t('stg.opens')} optional value={draft.opens_at} onChange={(e) => set({ opens_at: e.target.value })} />
            <Input type="datetime-local" label={t('stg.closes')} optional value={draft.closes_at} onChange={(e) => set({ closes_at: e.target.value })} />
          </div>
          <Select label={t('stg.takesPart')} options={TAKES_PART.map((v) => ({ value: v, label: t(`stg.takes.${v}`) }))} value={draft.takes_part} onChange={(v) => set({ takes_part: v })} />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Select label={t('stg.movesOn')} options={MOVES_ON.map((v) => ({ value: v, label: t(`stg.movesPick.${v}`) }))} value={draft.kind} onChange={(v) => set({ kind: v })} />
            {draft.kind === 'panel_score' && (
              <Input type="number" min="0" max="100" label={t('stg.passMark')} value={draft.pass_mark} onChange={(e) => set({ pass_mark: e.target.value })} className="w-[96px]" />
            )}
          </div>
          <Toggle className="sm:col-span-2" label={t('stg.notify')} checked={draft.notify_applicants} onChange={(v) => set({ notify_applicants: v })} />
          {error && <p role="alert" className="text-[13px] font-bold text-danger sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={save} loading={busy}>{t('stg.save')}</Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function StageList({ program, onGoWorkflow, fallback }) {
  const t = useT()
  const [open, setOpen] = useState(null)
  const stages = useQuery({
    queryKey: ['programs', program.id, 'stages'],
    queryFn: async () => {
      try {
        return await client.get(`/api/programs/${program.id}/stages/`)
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true }
        throw err
      }
    },
  })
  const forms = useForms({ status: 'live' })
  const formOptions = (forms.data?.results ?? []).filter((f) => !f.is_template).map((f) => ({ value: String(f.id), label: f.name ?? f.title }))

  if (stages.isLoading) return <Skeleton className="h-64 rounded-card" />
  if (stages.isError) return <ErrorState framed compact title={t('stg.loadError')} message={stages.error?.message} onRetry={stages.refetch} />
  if (stages.data?.unavailable) return fallback
  const { workflow, stages: items = [] } = stages.data
  if (!workflow) {
    return (
      <section className="rounded-card border border-border bg-surface p-4">
        <EmptyState compact title={t('cbs.noWorkflow')} message={t('cbs.noWorkflowBody')} action={<Button variant="secondary" size="sm" onClick={onGoWorkflow}>{t('cbs.chooseWorkflow')}</Button>} />
      </section>
    )
  }
  const summary = program.form_summary
  const entryForm = summary ? (summary.version_number ? `${summary.name} v${summary.version_number}` : summary.name) : null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-info-soft px-4 py-3 text-[14px] text-text">
        <span className="flex items-center gap-2"><Layers size={16} aria-hidden className="text-info" />{t('cbs.follows', { name: workflow.name, n: workflow.step_count ?? items.length })}</span>
        <Link to={`/admin/workflows/${workflow.id}/builder`} className="font-bold text-primary hover:underline">{t('cbs.openWorkflow')}</Link>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((s) => (
          <StageCard
            key={s.step_id}
            stage={s}
            programId={program.id}
            entryForm={entryForm}
            formOptions={formOptions}
            open={open === s.step_id}
            onToggle={() => setOpen((o) => (o === s.step_id ? null : s.step_id))}
          />
        ))}
      </ol>
      <Link to={`/admin/workflows/${workflow.id}/builder`} className="self-start text-[13px] font-bold text-primary hover:underline">{t('stg.addInWorkflow')}</Link>
      <p className="text-[12px] text-muted">{t('stg.notEnforced')}</p>
    </>
  )
}

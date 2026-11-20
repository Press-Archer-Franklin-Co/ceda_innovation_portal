import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Layers, Plus } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { Checkbox } from '../ui/Choice'
import ErrorState from '../ui/ErrorState'
import Skeleton from '../ui/Skeleton'
import LayoutThumb from './LayoutThumb'
import { useT } from '../../i18n/context'
import { useCreateForm, useForms, useFormTemplates } from '../../lib/queries/forms'
import { usePrograms } from '../../lib/queries/programs'
import { cn } from '../../lib/cn'

const STARTS = [
  { key: 'template', icon: Layers, title: 'wizard.template', body: 'wizard.templateBody' },
  { key: 'scratch', icon: Plus, title: 'wizard.scratch', body: 'wizard.scratchBody' },
  { key: 'copy', icon: Copy, title: 'wizard.copy', body: 'wizard.copyBody' },
]

/**
 * 3.4b: start from a template, from scratch or from a past form; then name and
 * challenge; then languages (English and Setswana on by default).
 */
export default function CreateFormWizard({ open, onClose, triggerRef }) {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateForm()
  const [step, setStep] = useState(0)
  const [start, setStart] = useState('template')
  const [sourceId, setSourceId] = useState(null)
  const [name, setName] = useState('')
  const [programId, setProgramId] = useState(null)
  const [setswana, setSetswana] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setStart('template')
    setSourceId(null)
    setName('')
    setProgramId(null)
    setSetswana(true)
    setError('')
  }, [open])

  function next() {
    setError('')
    if (step === 0 && start !== 'scratch' && !sourceId) return setError(t('wizard.chooseError'))
    if (step === 1 && !name.trim()) return setError(t('wizard.nameError'))
    setStep((s) => s + 1)
  }

  async function submit() {
    setError('')
    try {
      const form = await create.mutateAsync({
        start,
        source_id: start === 'scratch' ? null : sourceId,
        name: name.trim(),
        program_id: programId || null,
        languages: setswana ? ['en', 'tn'] : ['en'],
      })
      onClose()
      navigate(`/forms/${form.id}`)
    } catch (err) {
      setError(err?.message || t('wizard.createError'))
    }
  }

  const stepNames = [t('wizard.step1'), t('wizard.step2'), t('wizard.step3')]

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={t('wizard.title')}
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[12px] text-muted">{t('wizard.stepOf', { n: step + 1 })}</span>
          <div className="flex gap-2">
            {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>{t('wizard.back')}</Button>}
            {step < 2 ? (
              <Button onClick={next}>{t('wizard.next')}</Button>
            ) : (
              <Button onClick={submit} loading={create.isPending}>{t('wizard.create')}</Button>
            )}
          </div>
        </div>
      }
    >
      <ol className="mb-5 flex flex-wrap items-center gap-2" aria-label={t('steps.label')}>
        {stepNames.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold',
                i < step ? 'bg-primary text-on-primary' : i === step ? 'bg-amber text-text' : 'bg-surface2 text-muted',
              )}
            >
              {i < step ? <Check size={12} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-[13px]', i === step ? 'font-bold text-text' : 'text-muted')}>{label}</span>
            {i < 2 && <span aria-hidden className="mx-1 hidden h-px w-10 bg-border sm:block" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <StartStep start={start} setStart={(s) => { setStart(s); setSourceId(null) }} sourceId={sourceId} setSourceId={setSourceId} />
      )}

      {step === 1 && <NameStep name={name} setName={setName} programId={programId} setProgramId={setProgramId} />}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">{t('wizard.languagesIntro')}</p>
          <Checkbox label={t('lang.en')} checked disabled onChange={() => undefined} />
          <Checkbox label={t('lang.tn')} checked={setswana} onChange={(e) => setSetswana(e.target.checked)} />
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-[13px] text-danger">{error}</p>}
    </Modal>
  )
}

function StartStep({ start, setStart, sourceId, setSourceId }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label={t('wizard.step1')} className="grid gap-3 sm:grid-cols-3">
        {STARTS.map(({ key, icon: Icon, title, body }) => {
          const selected = start === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStart(key)}
              className={cn(
                'flex flex-col items-start gap-2 rounded-card border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'border-2 border-primary bg-primary-soft' : 'border-border hover:bg-surface2',
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-surface2 text-text">
                <Icon size={18} aria-hidden />
              </span>
              <span className="text-[14px] font-bold text-text">{t(title)}</span>
              <span className="text-[12px] text-muted">{t(body)}</span>
            </button>
          )
        })}
      </div>
      {start === 'template' && <TemplatePicker sourceId={sourceId} setSourceId={setSourceId} />}
      {start === 'copy' && <CopyPicker sourceId={sourceId} setSourceId={setSourceId} />}
    </div>
  )
}

function SourceGrid({ title, items, sourceId, setSourceId, meta }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-bold text-text">{title}</p>
      <div role="radiogroup" aria-label={title} className="grid max-h-[300px] gap-3 overflow-y-auto sm:grid-cols-3">
        {items.map((item) => {
          const selected = sourceId === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSourceId(item.id)}
              className={cn(
                'overflow-hidden rounded-card border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'border-2 border-primary' : 'border-border hover:shadow-card',
              )}
            >
              <LayoutThumb rows={item.layout_preview} />
              <span className="flex items-center justify-between gap-2 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-text">{item.name}</span>
                  <span className="block truncate text-[12px] text-muted">{meta(item)}</span>
                </span>
                {selected && <Check size={16} aria-hidden className="shrink-0 text-primary" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TemplatePicker({ sourceId, setSourceId }) {
  const t = useT()
  const { data, isLoading, isError, refetch } = useFormTemplates()
  if (isLoading) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)}</div>
  if (isError) return <ErrorState title={t('forms.loadError')} onRetry={refetch} compact />
  const templates = Array.isArray(data) ? data : data?.results ?? []
  if (templates.length === 0) return <p className="text-[13px] text-muted">{t('wizard.noTemplates')}</p>
  const meta = (item) => {
    const parts = [t('forms.questions', { count: item.question_count ?? 0 })]
    if ((item.step_count ?? 0) > 1) parts.push(t('forms.steps', { count: item.step_count }))
    if (item.template_meta?.estimated_minutes) parts.push(t('wizard.minutes', { count: item.template_meta.estimated_minutes }))
    if (item.template_meta?.works_on_ussd) parts.push(t('wizard.ussd'))
    return parts.join(' · ')
  }
  return <SourceGrid title={t('wizard.pickTemplate')} items={templates} sourceId={sourceId} setSourceId={setSourceId} meta={meta} />
}

function CopyPicker({ sourceId, setSourceId }) {
  const t = useT()
  const { data, isLoading, isError, refetch } = useForms({})
  if (isLoading) return <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-card" />)}</div>
  if (isError) return <ErrorState title={t('forms.loadError')} onRetry={refetch} compact />
  const forms = (data?.results ?? []).filter((f) => f.status !== 'archived')
  if (forms.length === 0) return <p className="text-[13px] text-muted">{t('forms.empty')}</p>
  const meta = (item) => [t('forms.questions', { count: item.question_count ?? 0 }), ...(item.linked_programs ?? []).map((p) => p.title)].join(' · ')
  return <SourceGrid title={t('wizard.pickForm')} items={forms} sourceId={sourceId} setSourceId={setSourceId} meta={meta} />
}

function NameStep({ name, setName, programId, setProgramId }) {
  const t = useT()
  const { data } = usePrograms({ page_size: 100 })
  const programs = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.results ?? []
    return list.filter((p) => p.status !== 'archived')
  }, [data])
  return (
    <div className="flex flex-col gap-4">
      <Input label={t('wizard.name')} hint={t('wizard.nameHint')} value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={255} />
      <Select
        label={t('wizard.challenge')}
        hint={t('wizard.challengeHint')}
        optional
        options={[{ value: '', label: t('wizard.noChallenge') }, ...programs.map((p) => ({ value: p.id, label: p.title }))]}
        value={programId ?? ''}
        onChange={(v) => setProgramId(v || null)}
      />
    </div>
  )
}

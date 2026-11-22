import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layers, Plus } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import Tag from '../../../components/ui/Tag'
import StatusPill from '../../../components/ui/StatusPill'
import DropdownMenu from '../../../components/ui/DropdownMenu'
import Modal from '../../../components/ui/Modal'
import StepProgress from '../../../components/ui/StepProgress'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import EmptyState from '../../../components/ui/EmptyState'
import ErrorState from '../../../components/ui/ErrorState'
import Skeleton from '../../../components/ui/Skeleton'
import { RadioGroup } from '../../../components/ui/Choice'
import { useConfirm } from '../../../components/ui/confirm'
import { useToast } from '../../../components/ui/toast'
import { useT } from '../../../i18n/context'
import { client } from '../../../lib/api/client'
import { workflows as wfApi } from '../../../lib/api/endpoints'
import { usePrograms } from '../../../lib/queries/programs'
import { useActivateWorkflowDef, useArchiveWorkflow, useCloneWorkflow, useCreateWorkflow, useWorkflowDefinitions } from '../../../lib/queries/workflowBuilder'
import { cn } from '../../../lib/cn'

// 3.21a Workflows: list and create (Figma 143:1561 website, 143:1824 phone). ① Every workflow with where it is used
// and how many steps. ② "Create workflow" opens a short wizard, like forms: from a template, from scratch, or a
// copy. ③ Name it and pick which challenge (or general ideas) uses it; the builder (3.21) opens. ④ Card menu:
// open, duplicate, see the ideas in it (3.22), archive. Phone: the list; building is done on a computer.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function programTypeOf(program) {
  return typeof program?.program_type === 'object' ? program?.program_type?.code : program?.program_type
}

/** The create wizard: 1 · How to start, 2 · Name and use. */
function CreateWorkflow({ open, onClose, triggerRef, workflows }) {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateWorkflow()
  const clone = useCloneWorkflow()
  const programs = usePrograms()
  const [step, setStep] = useState(0)
  const [start, setStart] = useState('template')
  const [template, setTemplate] = useState('')
  const [copyOf, setCopyOf] = useState('')
  const [name, setName] = useState('')
  const [program, setProgram] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // GET /api/workflow-templates/ (R-48). Before the API has it (404), "From a template" says so.
  const templates = useQuery({ queryKey: ['workflow-templates'], queryFn: () => client.get('/api/workflow-templates/'), enabled: open, retry: false })
  const templateList = asList(templates.data)
  const templatesMissing = templates.isError

  useEffect(() => {
    if (!open) return
    setStep(0)
    setStart('template')
    setTemplate('')
    setCopyOf('')
    setName('')
    setProgram('')
    setErrors({})
  }, [open])

  const programList = asList(programs.data)
  const programOptions = programList.map((p) => ({ value: p.id, label: p.is_general_intake ? t('wfl.generalIdeas') : p.title }))

  function next() {
    const e = {}
    if (start === 'template' && (templatesMissing || !template)) e.start = templatesMissing ? t('wfl.templatesMissing') : t('wfl.pickTemplate')
    if (start === 'copy' && !copyOf) e.start = t('wfl.pickCopy')
    setErrors(e)
    if (Object.keys(e).length) return
    if (start === 'copy' && !name) setName(t('wfl.copyName', { name: workflows.find((w) => w.id === copyOf)?.name ?? '' }))
    setStep(1)
  }

  async function finish() {
    const e = {}
    if (!name.trim()) e.name = t('wfl.nameNeeded')
    if (!program) e.program = t('wfl.programNeeded')
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const chosen = programList.find((p) => p.id === program)
      let result
      if (start === 'copy') {
        const copy = await clone.mutateAsync(copyOf)
        result = await wfApi.update(copy.id, { name: name.trim(), program })
      } else {
        result = await create.mutateAsync({
          name: name.trim(),
          program,
          ...(programTypeOf(chosen) ? { workflow_type: programTypeOf(chosen) } : {}),
          ...(start === 'template' ? { from_template: template } : {}),
        })
      }
      onClose()
      if (result?.id) navigate(`/admin/workflows/${result.id}/builder`)
    } catch (err) {
      toast.show({ tone: 'error', title: t('wfl.createError'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  const ways = [
    { value: 'template', label: t('wfl.fromTemplate'), description: t('wfl.fromTemplateHint') },
    { value: 'scratch', label: t('wfl.fromScratch'), description: t('wfl.fromScratchHint') },
    { value: 'copy', label: t('wfl.copyOne'), description: t('wfl.copyOneHint') },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      size="lg"
      title={t('wfl.createTitle')}
      footer={
        step === 0 ? (
          <>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button data-guide="workflows.next" onClick={next}>{t('wfl.next')}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep(0)}>{t('wfl.back')}</Button>
            <Button data-guide="workflows.createAndOpen" onClick={finish} loading={busy}>{t('wfl.createAndOpen')}</Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <StepProgress steps={[t('wfl.stepHow'), t('wfl.stepName')]} current={step} className="!bg-transparent !p-0" />
        {step === 0 ? (
          <>
            <RadioGroup name="wf-start" legend={t('wfl.howToStart')} variant="cards" options={ways} value={start} onChange={(v) => { setStart(v); setErrors({}) }} />
            {start === 'template' &&
              (templates.isLoading ? (
                <Skeleton className="h-24" />
              ) : templatesMissing ? (
                <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{t('wfl.templatesMissing')}</p>
              ) : (
                <RadioGroup
                  name="wf-template"
                  legend={t('wfl.templates')}
                  options={templateList.map((x) => ({ value: x.id ?? x.code, label: x.name, description: [x.description, (x.steps ?? []).map((st) => st.name).join(' › ')].filter(Boolean).join(' ') }))}
                  value={template}
                  onChange={setTemplate}
                />
              ))}
            {start === 'copy' && (
              <RadioGroup
                name="wf-copy"
                legend={t('wfl.copyWhich')}
                options={workflows.filter((w) => w.status !== 'archived').map((w) => ({ value: w.id, label: w.name, description: t('wfl.stepsCount', { n: w.step_count ?? w.steps?.length ?? 0 }) }))}
                value={copyOf}
                onChange={setCopyOf}
              />
            )}
            {errors.start && <p role="alert" className="text-[13px] font-bold text-danger">{errors.start}</p>}
          </>
        ) : (
          <>
            <Input data-guide="workflows.name" label={t('wfl.name')} required value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })) }} error={errors.name} maxLength={255} />
            <Select
              label={t('wfl.usedBy')}
              hint={t('wfl.usedByHint')}
              required
              options={programOptions}
              value={program}
              onChange={(v) => { setProgram(v); setErrors((x) => ({ ...x, program: undefined })) }}
              placeholder={t('wfl.chooseProgram')}
              error={errors.program}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Workflows() {
  const t = useT()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const createRef = useRef(null)
  const [creating, setCreating] = useState(false)
  const list = useWorkflowDefinitions()
  const clone = useCloneWorkflow()
  const archive = useArchiveWorkflow()
  const activate = useActivateWorkflowDef()
  const workflows = useMemo(() => asList(list.data), [list.data])
  const shown = workflows.filter((w) => w.status !== 'archived')

  useEffect(() => {
    document.title = `${t('wfl.title')} · CEDA Innovation`
  }, [t])

  async function run(fn, success, wf) {
    try {
      await fn()
      toast.show({ tone: 'success', title: t(success, { name: wf.name }) })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  async function archiveOne(wf) {
    const ok = await confirm({ title: t('wfl.archiveTitle', { name: wf.name }), body: t('wfl.archiveBody'), confirmLabel: t('wfl.archive') })
    if (ok) run(() => archive.mutateAsync(wf.id), 'wfl.archived', wf)
  }

  const usedBy = (wf) => {
    if (Array.isArray(wf.used_by)) return wf.used_by.map((u) => (u.general_ideas ? t('wfl.generalIdeas') : u.title)).join(', ') || null
    return (wf.program_detail?.is_general_intake ? t('wfl.generalIdeas') : wf.program_detail?.title) ?? null
  }

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('wfl.crumb')}</span>}
        title={t('wfl.title')}
        subtitle={t('wfl.subtitle')}
        actions={
          <Button ref={createRef} data-guide="workflows.create" onClick={() => setCreating(true)} className="hidden md:inline-flex">
            <Plus size={16} aria-hidden />
            {t('wfl.create')}
          </Button>
        }
      />
      <p className="text-[13px] text-muted md:hidden">{t('wfl.phoneNote')}</p>

      {list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[170px] rounded-card" />)}</div>
      ) : list.isError ? (
        <ErrorState framed title={t('wfl.loadError')} message={list.error?.message} onRetry={list.refetch} />
      ) : shown.length === 0 ? (
        <EmptyState framed icon={Layers} title={t('wfl.empty')} message={t('wfl.emptyBody')} action={<Button data-guide="workflows.create" onClick={() => setCreating(true)}>{t('wfl.create')}</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((wf) => (
            <li key={wf.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                    <Layers size={20} />
                  </span>
                  <DropdownMenu
                    label={t('wfl.menu', { name: wf.name })}
                    items={[
                      { key: 'open', label: t('wfl.open'), onSelect: () => navigate(`/admin/workflows/${wf.id}/builder`) },
                      { key: 'copy', label: t('wfl.duplicate'), onSelect: () => run(() => clone.mutateAsync(wf.id), 'wfl.duplicated', wf) },
                      { key: 'ideas', label: t('wfl.seeIdeas'), onSelect: () => navigate(`/admin/workflows/${wf.id}/instances`) },
                      { key: 'activate', label: t('wfl.activate'), hidden: wf.status !== 'published', onSelect: () => run(() => activate.mutateAsync(wf.id), 'wfl.activated', wf) },
                      { key: 'archive', label: t('wfl.archive'), danger: true, onSelect: () => archiveOne(wf) },
                    ]}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/workflows/${wf.id}/builder`)}
                  className="text-left text-[17px] font-heading font-bold text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  {wf.name}
                </button>
                <p className="text-[13px] text-muted">{usedBy(wf) ? t('wfl.usedByValue', { list: usedBy(wf) }) : t('wfl.notUsed')}</p>
                <div className={cn('mt-auto flex flex-wrap items-center gap-2')}>
                  <StatusPill status={wf.status} />
                  <Tag>{t('wfl.stepsCount', { n: wf.step_count ?? wf.steps?.length ?? 0 })}</Tag>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CreateWorkflow open={creating} onClose={() => setCreating(false)} triggerRef={createRef} workflows={workflows} />
    </div>
  )
}

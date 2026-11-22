import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, FileText, MessageCircle, Plus, Star, Trash2 } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import Textarea from '../../../components/ui/Textarea'
import Tag from '../../../components/ui/Tag'
import StatusPill from '../../../components/ui/StatusPill'
import Skeleton from '../../../components/ui/Skeleton'
import EmptyState from '../../../components/ui/EmptyState'
import ErrorState from '../../../components/ui/ErrorState'
import { Checkbox, Toggle } from '../../../components/ui/Choice'
import { useConfirm } from '../../../components/ui/confirm'
import { useToast } from '../../../components/ui/toast'
import { cn } from '../../../lib/cn'
import {
  useActivateWorkflowDef,
  useCreateWorkflowStep,
  usePublishWorkflow,
  useUpdateWorkflow,
  useUpdateWorkflowStep,
  useDeleteWorkflowStep,
  useValidateWorkflow,
  useWorkflowDefinition,
  useWorkflowSteps,
} from '../../../lib/queries/workflowBuilder'
import { useMarkingCriteriaList, useSetStageConfig, useStageConfig } from '../../../lib/queries/evaluations'
import { useT } from '../../../i18n/context'
import StepExtras from '../../../components/workflow/StepExtras'
import useStepExtras from '../../../components/workflow/useStepExtras'

// 3.21 Workflow builder (Figma 143:1902 website, 143:2270 phone). A restyle of the step builder: same steps,
// same save logic, laid out as the frame. ① A palette of steps to add. ② Each step card shows who has it, what
// they do and which marking criteria it uses. ③ Who has it (role and how many). ④ What they do (the buttons they
// get, and whether the idea moves on by itself). ⑤ Marking criteria from 3.7 with the pass mark. ⑥ Time limit.
// A plain-words summary sits under the steps. Phone: read the flow; building is done on a computer.

const ROLE_OPTIONS = ['innovator', 'innovation_officer', 'innovation_manager', 'judge', 'specialist', 'mentor', 'administrator']
const EXECUTION_OPTIONS = ['sequential', 'parallel_all', 'parallel_any', 'parallel_minimum']
const ASSIGNMENT_ROLE_OPTIONS = ['reviewer', 'officer', 'manager', 'judge', 'specialist', 'mentor', 'analyst', 'staff', 'exo']
const ACTION_OPTIONS = ['approve', 'return', 'reject']
const STATUS_OPTIONS = ['submitted', 'screening', 'under_review', 'assigned_to_judges', 'under_judging', 'approved', 'rejected', 'finalist', 'winner', 'selected_for_hackathon']
const AGGREGATION_OPTIONS = ['average', 'min', 'max', 'median']

// ① The palette: each kind adds a step with sensible settings that can then be changed.
const PALETTE = [
  { kind: 'form', icon: FileText, preset: { role_required: 'innovator', actions_allowed: ['approve'] } },
  { kind: 'officer', icon: Eye, preset: { role_required: 'innovation_officer', requires_assignment: true, assignment_role: 'officer', minimum_assignments: 1, actions_allowed: ['approve', 'reject', 'return'] } },
  { kind: 'panel', icon: Star, preset: { role_required: 'judge', requires_assignment: true, assignment_role: 'judge', minimum_assignments: 3, requires_evaluation: true, minimum_evaluations: 3, execution_mode: 'parallel_all', actions_allowed: ['approve', 'reject'] } },
  { kind: 'askInfo', icon: MessageCircle, preset: { role_required: 'innovation_officer', actions_allowed: ['approve', 'return'] } },
  { kind: 'decision', icon: CheckCircle2, preset: { role_required: 'innovation_manager', actions_allowed: ['approve', 'reject'] } },
]

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normaliseActions(actions) {
  return [...new Set((actions ?? []).filter(Boolean))].sort()
}

function buildStepPayload(draft) {
  return {
    name: draft.name.trim(),
    code: draft.code.trim() || slugify(draft.name),
    order: Number(draft.order || 1),
    role_required: draft.role_required || '',
    actions_allowed: normaliseActions(draft.actions_allowed),
    submission_status: draft.submission_status || '',
    due_in_hours: draft.due_in_hours === '' ? null : Number(draft.due_in_hours),
    execution_mode: draft.execution_mode,
    minimum_completions_required: Number(draft.minimum_completions_required || 1),
    advance_automatically: !!draft.advance_automatically,
    requires_assignment: draft.requires_assignment,
    assignment_role: draft.requires_assignment ? draft.assignment_role || null : null,
    minimum_assignments: draft.requires_assignment ? Number(draft.minimum_assignments || 1) : 0,
    requires_evaluation: draft.requires_evaluation,
    minimum_evaluations: draft.requires_evaluation ? Number(draft.minimum_evaluations || 1) : 0,
    evaluation_round: draft.requires_evaluation && draft.evaluation_round ? draft.evaluation_round : null,
    is_active: draft.is_active,
  }
}

function stepToDraft(step) {
  return {
    name: step.name ?? '',
    code: step.code ?? '',
    order: step.order ?? 1,
    role_required: step.role_required ?? '',
    actions_allowed: normaliseActions(step.actions_allowed ?? []),
    submission_status: step.submission_status ?? '',
    due_in_hours: step.due_in_hours ?? '',
    execution_mode: step.execution_mode ?? 'sequential',
    minimum_completions_required: step.minimum_completions_required ?? 1,
    // R-30: off means an officer moves the idea on once enough reviewers are done; new steps start off.
    advance_automatically: !!step.advance_automatically,
    requires_assignment: !!step.requires_assignment,
    assignment_role: step.assignment_role ?? '',
    minimum_assignments: step.minimum_assignments ?? 1,
    requires_evaluation: !!step.requires_evaluation,
    minimum_evaluations: step.minimum_evaluations ?? 1,
    evaluation_round: step.evaluation_round ?? '',
    is_active: step.is_active ?? true,
  }
}

function stageConfigToDraft(config) {
  return {
    scoring_mode: config?.marking_criteria ? 'criteria' : 'manual',
    marking_criteria: config?.marking_criteria ?? '',
    required_reviewer_count: config?.required_reviewer_count ?? 1,
    review_mode: config?.review_mode ?? 'fixed_count',
    review_window_hours: config?.review_window_hours ?? '',
    minimum_reviews_required: config?.minimum_reviews_required ?? 1,
    maximum_reviews_allowed: config?.maximum_reviews_allowed ?? '',
    aggregation_method: config?.aggregation_method ?? 'average',
    threshold_reject_below: config?.threshold_reject_below ?? '40.00',
    threshold_pass_above: config?.threshold_pass_above ?? '70.00',
    blind_scoring: !!config?.blind_scoring,
    allow_applicant_feedback: !!config?.allow_applicant_feedback,
    max_score_override: config?.max_score_override ?? '',
  }
}

function buildStageConfigPayload(draft) {
  const isCriteria = draft.scoring_mode === 'criteria'
  return {
    marking_criteria: isCriteria ? (draft.marking_criteria || null) : null,
    rubric: null,
    required_reviewer_count: Number(draft.required_reviewer_count || 1),
    review_mode: draft.review_mode || 'fixed_count',
    review_window_hours: draft.review_window_hours !== '' ? Number(draft.review_window_hours) : 0,
    minimum_reviews_required: Number(draft.minimum_reviews_required || 1),
    maximum_reviews_allowed: draft.maximum_reviews_allowed === '' ? null : Number(draft.maximum_reviews_allowed),
    aggregation_method: draft.aggregation_method || 'average',
    threshold_reject_below: draft.threshold_reject_below !== '' ? Number(draft.threshold_reject_below) : 40,
    threshold_pass_above: draft.threshold_pass_above !== '' ? Number(draft.threshold_pass_above) : 70,
    blind_scoring: !!draft.blind_scoring,
    allow_applicant_feedback: !!draft.allow_applicant_feedback,
    max_score_override: draft.max_score_override === '' ? null : Number(draft.max_score_override),
  }
}

function isPayloadEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function sortSteps(items) {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function reorderSteps(items, movingId, targetPosition) {
  const sorted = sortSteps(items)
  const currentIndex = sorted.findIndex((step) => step.id === movingId)
  const targetIndex = Number(targetPosition) - 1
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sorted.length || currentIndex === targetIndex) {
    return sortSteps(items)
  }
  const reordered = [...sorted]
  const [moving] = reordered.splice(currentIndex, 1)
  reordered.splice(targetIndex, 0, moving)
  return reordered.map((step, index) => ({ ...step, order: index + 1 }))
}


/** Setup problems as i18n keys (shown on the card and in the panel). */
function getStepIssues(step) {
  const issues = []
  if (!step.name?.trim()) issues.push('wfb.issue.name')
  if (!step.actions_allowed?.length) issues.push('wfb.issue.buttons')
  if (step.requires_assignment && !step.assignment_role) issues.push('wfb.issue.who')
  if (step.requires_assignment && Number(step.minimum_assignments || 0) < 1) issues.push('wfb.issue.howMany')
  if (step.requires_evaluation && Number(step.minimum_evaluations || 0) < 1) issues.push('wfb.issue.scorers')
  return issues
}

const roleWord = (t, role) => (role ? t(`wfb.role.${role}`) : t('wfb.anyone'))

function whoLine(t, step) {
  if (step.requires_assignment) {
    const n = Number(step.minimum_assignments || 1)
    return t('wfb.whoAssigned', { n, role: t(`wfb.assignRole.${step.assignment_role || 'reviewer'}`) })
  }
  return roleWord(t, step.role_required)
}

function doesLine(t, step) {
  const buttons = ACTION_OPTIONS.filter((a) => (step.actions_allowed ?? []).includes(a)).map((a) => t(`wfb.action.${a}`))
  return buttons.length ? buttons.join(', ') : t('wfb.noButtons')
}

/** The plain-words summary under the steps. */
function plainWords(t, steps) {
  if (!steps.length) return ''
  return steps
    .filter((s) => s.is_active !== false)
    .map((s, i) => t(i === 0 ? 'wfb.plainFirst' : 'wfb.plainNext', { name: s.name, who: whoLine(t, s), scoring: s.requires_evaluation ? t('wfb.plainScored') : '' }))
    .join(' ')
}

function StepCard({ step, index, count, selected, onSelect, onMove, busy }) {
  const t = useT()
  const issues = getStepIssues(step)
  // The step list does not carry the stage config; scoring steps read theirs (cached, shared with the panel).
  const { data: stageConfig } = useStageConfig(step.requires_evaluation ? step.id : null)
  const criteriaName = stageConfig?.marking_criteria_detail?.title
  const passMark = stageConfig?.threshold_pass_above != null ? Math.round(Number(stageConfig.threshold_pass_above)) : null
  return (
    <li className="relative">
      {index > 0 && <span aria-hidden className="absolute -top-3 left-1/2 h-3 w-px bg-border" />}
      <div className={cn('rounded-card border bg-surface p-4', selected ? 'border-primary ring-1 ring-primary' : 'border-border')}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-banner text-[12px] font-bold text-on-banner">{index + 1}</span>
          <button type="button" onClick={onSelect} aria-pressed={selected} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-text">{step.name || t('wfb.untitled')}</span>
              {step.is_active === false && <Tag tone="neutral">{t('wfb.off')}</Tag>}
              {issues.length > 0 && <Tag tone="amber">{t('wfb.needsSetup')}</Tag>}
            </span>
            <dl className="mt-2 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted">{t('wfb.who')}</dt>
              <dd className="text-text">{whoLine(t, step)}</dd>
              <dt className="text-muted">{t('wfb.does')}</dt>
              <dd className="text-text">{doesLine(t, step)}</dd>
              {step.requires_evaluation && (
                <>
                  <dt className="text-muted">{t('wfb.marking')}</dt>
                  <dd className="text-text">{criteriaName ? (passMark != null ? t('wfb.markingValue', { name: criteriaName, pass: passMark }) : criteriaName) : t('wfb.markingNotSet')}</dd>
                </>
              )}
            </dl>
          </button>
          <span className="flex shrink-0 flex-col gap-1">
            <button type="button" disabled={busy || index === 0} onClick={() => onMove(index)} aria-label={t('wfb.moveUp', { name: step.name })} className="flex h-7 w-7 items-center justify-center rounded-control text-muted hover:bg-surface2 disabled:opacity-40">
              <ArrowUp size={15} aria-hidden />
            </button>
            <button type="button" disabled={busy || index === count - 1} onClick={() => onMove(index + 2)} aria-label={t('wfb.moveDown', { name: step.name })} className="flex h-7 w-7 items-center justify-center rounded-control text-muted hover:bg-surface2 disabled:opacity-40">
              <ArrowDown size={15} aria-hidden />
            </button>
          </span>
        </div>
      </div>
    </li>
  )
}

/** ③ to ⑥: the selected step. Same fields and save as the old drawer, grouped as the frame. */
function StepPanel({ step, busy, allSteps, onSave, onDelete, onDirtyChange }) {
  const t = useT()
  const { data: stageConfig } = useStageConfig(step?.id)
  const extras = useStepExtras(step?.id)
  const toast = useToast()
  const [savingExtras, setSavingExtras] = useState(false)
  const criteriaList = useMarkingCriteriaList({ active_only: true })
  const criteria = Array.isArray(criteriaList.data) ? criteriaList.data : criteriaList.data?.data ?? criteriaList.data?.results ?? []
  const [draft, setDraft] = useState(() => stepToDraft(step ?? {}))
  const [stageDraft, setStageDraft] = useState(() => stageConfigToDraft(null))
  const payload = buildStepPayload(draft)
  const initialPayload = buildStepPayload(stepToDraft(step ?? {}))
  const initialStagePayload = buildStageConfigPayload(stageConfigToDraft(stageConfig ?? null))
  const currentStagePayload = buildStageConfigPayload(stageDraft)
  const stepDirty = !!step && !isPayloadEqual(payload, initialPayload)
  const stageDirty = !!step && !isPayloadEqual(currentStagePayload, initialStagePayload)
  const isDirty = stepDirty || stageDirty || extras.dirty

  useEffect(() => { if (step) setDraft(stepToDraft(step)) }, [step])
  useEffect(() => { setStageDraft(stageConfigToDraft(stageConfig ?? null)) }, [stageConfig, step?.id])
  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  if (!step) return null
  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }))
  const setStage = (patch) => setStageDraft((prev) => ({ ...prev, ...patch }))
  const scoring = stageDraft.scoring_mode === 'criteria'
  const issues = getStepIssues({ ...step, ...payload })
  const chosenCriteria = criteria.find((c) => c.id === stageDraft.marking_criteria) ?? stageConfig?.marking_criteria_detail ?? null

  const toggleAction = (key) => set({ actions_allowed: draft.actions_allowed.includes(key) ? draft.actions_allowed.filter((a) => a !== key) : normaliseActions([...draft.actions_allowed, key]) })
  const setScoring = (on) => {
    setStage({ scoring_mode: on ? 'criteria' : 'manual', marking_criteria: on ? stageDraft.marking_criteria : '' })
    set({ requires_evaluation: on, minimum_evaluations: on ? Number(stageDraft.required_reviewer_count) || 1 : 0 })
  }

  async function saveAll() {
    const ok = stepDirty || stageDirty ? await onSave(payload, currentStagePayload, stageDirty) : true
    if (ok === false || !extras.dirty) return
    setSavingExtras(true)
    try {
      await extras.save(payload.role_required)
      if (!stepDirty && !stageDirty) toast.show({ tone: 'success', title: t('wfx.saved') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('wfx.saveError'), body: err?.message })
    } finally {
      setSavingExtras(false)
    }
  }

  return (
    <section aria-label={t('wfb.stepSettings')} className="flex flex-col gap-5 rounded-card border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-[17px] font-heading font-bold text-text">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[12px] text-on-primary">{draft.order}</span>
        {draft.name || t('wfb.untitled')}
      </h2>
      {issues.length > 0 && <p role="note" className="rounded-control bg-warning-soft px-3 py-2 text-[13px] text-warning">{issues.map((k) => t(k)).join(' · ')}</p>}

      <div className="flex flex-col gap-3">
        <Input
          label={t('wfb.stepName')}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value, code: step.id || (draft.code && draft.code !== slugify(draft.name)) ? draft.code : slugify(e.target.value) })}
          required
        />
        <Toggle label={t('wfb.stepOn')} checked={!!draft.is_active} onChange={(on) => set({ is_active: on })} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-bold text-text">{t('wfb.whoHasIt')}</legend>
        <Select label={t('wfb.role')} options={[{ value: '', label: t('wfb.anyone') }, ...ROLE_OPTIONS.map((r) => ({ value: r, label: t(`wfb.role.${r}`) }))]} value={draft.role_required} onChange={(v) => set({ role_required: v })} />
        <Toggle label={t('wfb.assignPeople')} description={t('wfb.assignPeopleHint')} checked={!!draft.requires_assignment} onChange={(on) => set({ requires_assignment: on })} />
        {draft.requires_assignment && (
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('wfb.assignTo')} options={ASSIGNMENT_ROLE_OPTIONS.map((r) => ({ value: r, label: t(`wfb.assignRole.${r}`) }))} value={draft.assignment_role} onChange={(v) => set({ assignment_role: v })} />
            <Input label={t('wfb.howMany')} type="number" min="1" value={String(draft.minimum_assignments)} onChange={(e) => set({ minimum_assignments: e.target.value })} />
          </div>
        )}
        <Select label={t('wfb.shareOut')} hint={t('wfb.shareOutHint')} options={EXECUTION_OPTIONS.map((m) => ({ value: m, label: t(`wfb.mode.${m}`) }))} value={draft.execution_mode} onChange={(v) => set({ execution_mode: v })} />
        {draft.execution_mode === 'parallel_minimum' && (
          <Input label={t('wfb.minDone')} type="number" min="1" value={String(draft.minimum_completions_required)} onChange={(e) => set({ minimum_completions_required: e.target.value })} />
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-bold text-text">{t('wfb.whatTheyDo')}</legend>
        <p className="text-[12px] text-muted">{t('wfb.buttonsHint')}</p>
        <div className="flex flex-col gap-1.5">
          {ACTION_OPTIONS.map((a) => (
            <Checkbox key={a} label={t(`wfb.action.${a}`)} checked={draft.actions_allowed.includes(a)} onChange={() => toggleAction(a)} />
          ))}
        </div>
        <Toggle label={t('wf.advanceAuto')} description={draft.advance_automatically ? t('wf.advanceAutoOn') : t('wf.advanceAutoOff')} checked={!!draft.advance_automatically} onChange={(on) => set({ advance_automatically: on })} />
        <Select label={t('wfb.statusAfter')} options={[{ value: '', label: t('wfb.noStatus') }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: t(`wfb.status.${s}`) }))]} value={draft.submission_status} onChange={(v) => set({ submission_status: v })} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-bold text-text">{t('wfb.markingCriteria')}</legend>
        <Toggle label={t('wfb.scoreWithCriteria')} description={scoring ? t('wfb.scoreOn') : t('wfb.scoreOff')} checked={scoring} onChange={setScoring} />
        {scoring && (
          <>
            <Select
              label={t('wfb.criteriaSet')}
              options={criteria.map((c) => ({ value: c.id, label: c.title }))}
              value={stageDraft.marking_criteria}
              onChange={(v) => setStage({ marking_criteria: v })}
              placeholder={t('wfb.chooseSet')}
              error={!stageDraft.marking_criteria ? t('wfb.setNeeded') : undefined}
            />
            {chosenCriteria?.items?.length > 0 && (
              <ul className="flex flex-col gap-1 text-[13px]">
                {chosenCriteria.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2"><span className="text-text">{item.name}</span><span className="text-muted">{Number(item.weight)}%</span></li>
                ))}
              </ul>
            )}
            <Link to="/marking-criteria" className="self-start text-[13px] font-bold text-primary hover:underline">{t('wfb.manageCriteria')}</Link>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('wfb.scorers')} type="number" min="1" value={String(stageDraft.required_reviewer_count)} onChange={(e) => { setStage({ required_reviewer_count: e.target.value }); set({ minimum_evaluations: Number(e.target.value) || 1 }) }} />
              <Select label={t('wfb.combine')} options={AGGREGATION_OPTIONS.map((a) => ({ value: a, label: t(`wfb.agg.${a}`) }))} value={stageDraft.aggregation_method} onChange={(v) => setStage({ aggregation_method: v })} />
              <Input label={t('wfb.passMark')} type="number" min="0" max="100" value={String(stageDraft.threshold_pass_above)} onChange={(e) => setStage({ threshold_pass_above: e.target.value })} />
              <Input label={t('wfb.rejectBelow')} type="number" min="0" max="100" value={String(stageDraft.threshold_reject_below)} onChange={(e) => setStage({ threshold_reject_below: e.target.value })} />
            </div>
            <p className="text-[12px] text-muted">{t('wfb.betweenNote', { low: stageDraft.threshold_reject_below, high: stageDraft.threshold_pass_above })}</p>
            <Checkbox label={t('wfb.blind')} checked={!!stageDraft.blind_scoring} onChange={(e) => setStage({ blind_scoring: e.target.checked })} />
            <Checkbox label={t('wfb.feedback')} checked={!!stageDraft.allow_applicant_feedback} onChange={(e) => setStage({ allow_applicant_feedback: e.target.checked })} />
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-bold text-text">{t('wfb.timeLimit')}</legend>
        <Input label={t('wfb.dueHours')} hint={t('wfb.dueHoursHint')} type="number" min="1" value={String(draft.due_in_hours ?? '')} onChange={(e) => set({ due_in_hours: e.target.value })} />
        <Select label={t('wfb.position')} options={allSteps.map((_, i) => ({ value: String(i + 1), label: t('wfb.positionN', { n: i + 1 }) }))} value={String(draft.order)} onChange={(v) => set({ order: Number(v) })} />
      </fieldset>

      <StepExtras extras={extras} scoring={scoring} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onDelete} disabled={busy} className="text-danger"><Trash2 size={15} aria-hidden />{t('wfb.remove')}</Button>
        <Button onClick={saveAll} loading={busy || savingExtras} disabled={!payload.name || !isDirty}>{t('wfb.saveStep')}</Button>
      </div>
    </section>
  )
}

function DetailsPanel({ definition, meta, setMeta, onSave, saving }) {
  const t = useT()
  return (
    <section aria-label={t('wfb.details')} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-[17px] font-heading font-bold text-text">{t('wfb.details')}</h2>
      <p className="text-[13px] text-muted">{t('wfb.detailsHint')}</p>
      <Input label={t('wfl.name')} value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} required />
      <Textarea label={t('wfb.description')} optional rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} />
      <Button variant="secondary" onClick={onSave} loading={saving} disabled={!meta.name.trim() || (meta.name === (definition.name ?? '') && meta.description === (definition.description ?? ''))} className="self-start">{t('common.save')}</Button>
    </section>
  )
}

export default function WorkflowBuilder() {
  const t = useT()
  const confirm = useConfirm()
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: definition, isLoading, error, refetch } = useWorkflowDefinition(id)
  const { data: stepsData, isLoading: stepsLoading, refetch: refetchSteps } = useWorkflowSteps(id)
  const updateWorkflow = useUpdateWorkflow()
  const createStep = useCreateWorkflowStep(id)
  const updateStep = useUpdateWorkflowStep(id)
  const deleteStep = useDeleteWorkflowStep(id)
  const validateWorkflow = useValidateWorkflow()
  const publishWorkflow = usePublishWorkflow()
  const activateWorkflow = useActivateWorkflowDef()
  const setStageConfig = useSetStageConfig()

  const [meta, setMeta] = useState({ name: '', code: '', description: '', workflow_type: '' })
  const [editingStepId, setEditingStepId] = useState(null)
  const [reordering, setReordering] = useState(false)
  const [panelDirty, setPanelDirty] = useState(false)
  const [localSteps, setLocalSteps] = useState([])
  const panelRef = useRef(null)

  const serverSteps = useMemo(() => sortSteps(Array.isArray(stepsData) ? stepsData : stepsData?.results ?? []), [stepsData])
  useEffect(() => { setLocalSteps(serverSteps) }, [serverSteps])
  const steps = localSteps
  const editingStep = useMemo(() => steps.find((s) => s.id === editingStepId) ?? null, [editingStepId, steps])

  useEffect(() => {
    if (!definition) return
    setMeta({ name: definition.name ?? '', code: definition.code ?? '', description: definition.description ?? '', workflow_type: definition.workflow_type ?? '' })
    document.title = `${definition.name} · CEDA Innovation`
  }, [definition])

  useEffect(() => {
    if (editingStepId && !steps.some((s) => s.id === editingStepId)) setEditingStepId(null)
  }, [editingStepId, steps])

  useEffect(() => {
    if (!panelDirty) return undefined
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [panelDirty])


  const ok = (title) => toast.show({ tone: 'success', title })
  const fail = (err) => toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })

  const confirmDiscardChanges = async () => (
    !panelDirty || confirm({ title: t('wfb.discardTitle'), body: t('wfb.discardBody'), confirmLabel: t('wfb.discard'), cancelLabel: t('wfb.keepEditing') })
  )

  // A change to a published workflow makes a new version; follow it.
  const handleVersionedResult = (result, fallbackId = id) => {
    if (result?.workflow_definition_id && result.workflow_definition_id !== fallbackId) {
      navigate(`/admin/workflows/${result.workflow_definition_id}/builder`, { replace: true })
      return true
    }
    return false
  }

  const selectStep = async (stepId) => {
    if (stepId === editingStepId) return
    if (!(await confirmDiscardChanges())) return
    setEditingStepId(stepId)
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const runAction = async (action) => {
    try {
      let result = null
      if (action === 'save-meta') {
        result = await updateWorkflow.mutateAsync({ id, ...meta })
        ok(t('wfb.saved'))
      }
      if (action === 'validate') {
        result = await validateWorkflow.mutateAsync(id)
        if (result.valid) ok(t('wfb.checkPassed'))
        else toast.show({ tone: 'error', title: t('wfb.checkFailed'), body: [].concat(result.errors ?? result.issues ?? []).slice(0, 3).join(' ') || undefined })
      }
      if (action === 'publish') {
        result = await publishWorkflow.mutateAsync(id)
        ok(t('wfb.published'))
      }
      if (action === 'activate') {
        result = await activateWorkflow.mutateAsync(id)
        ok(t('wfb.activated'))
      }
      handleVersionedResult(result)
      refetch()
      refetchSteps()
    } catch (err) {
      fail(err)
    }
  }

  const addStep = async (kind) => {
    if (!(await confirmDiscardChanges())) return
    const preset = PALETTE.find((p) => p.kind === kind)?.preset ?? {}
    const nextOrder = steps.length ? Math.max(...steps.map((s) => s.order ?? 0)) + 1 : 1
    const name = t(`wfb.palette.${kind}`)
    try {
      const result = await createStep.mutateAsync({
        name,
        code: `${slugify(name)}_${nextOrder}`,
        order: nextOrder,
        actions_allowed: ['approve', 'reject', 'return'],
        execution_mode: 'sequential',
        minimum_completions_required: 1,
        requires_assignment: false,
        minimum_assignments: 0,
        requires_evaluation: false,
        minimum_evaluations: 0,
        is_active: true,
        ...preset,
      })
      if (!handleVersionedResult(result) && result?.id) {
        setLocalSteps((prev) => sortSteps([...prev, result]))
        setEditingStepId(result.id)
        refetchSteps()
      }
      ok(t('wfb.added', { name }))
    } catch (err) {
      fail(err)
    }
  }

  const moveStepToPosition = async (stepId, targetPosition) => {
    const nextSteps = reorderSteps(steps, stepId, targetPosition)
    if (isPayloadEqual(nextSteps, steps)) return
    const previousSteps = steps
    setReordering(true)
    setLocalSteps(nextSteps)
    try {
      let versionChanged = false
      for (const step of nextSteps) {
        const previous = previousSteps.find((item) => item.id === step.id)
        if (previous?.order === step.order) continue
        const result = await updateStep.mutateAsync({ id: step.id, ...buildStepPayload(stepToDraft(step)) })
        versionChanged = handleVersionedResult(result) || versionChanged
      }
      if (!versionChanged) refetchSteps()
    } catch (err) {
      setLocalSteps(previousSteps)
      fail(err)
    } finally {
      setReordering(false)
    }
  }

  const saveStep = async (payload, stagePayload, isStageConfigDirty) => {
    if (!editingStep) return false
    const previousSteps = steps
    const withChanges = { ...editingStep, ...payload }
    const optimistic = payload.order !== editingStep.order
      ? reorderSteps(previousSteps.map((s) => (s.id === editingStep.id ? withChanges : s)), editingStep.id, payload.order)
      : sortSteps(previousSteps.map((s) => (s.id === editingStep.id ? withChanges : s)))
    setLocalSteps(optimistic)
    try {
      const result = await updateStep.mutateAsync({ id: editingStep.id, ...payload })
      if (payload.order !== editingStep.order) {
        for (const step of optimistic) {
          if (step.id === editingStep.id) continue
          const previous = previousSteps.find((item) => item.id === step.id)
          if (previous?.order === step.order) continue
          await updateStep.mutateAsync({ id: step.id, ...buildStepPayload(stepToDraft(step)) })
        }
      }
      if (isStageConfigDirty) await setStageConfig.mutateAsync({ stepId: editingStep.id, body: stagePayload })
      if (!handleVersionedResult(result)) refetchSteps()
      setPanelDirty(false)
      ok(t('wfb.stepSaved', { name: payload.name }))
      return true
    } catch (err) {
      setLocalSteps(previousSteps)
      fail(err)
      return false
    }
  }

  const removeStep = async () => {
    if (!editingStep) return
    if (!(await confirm({ title: t('wfb.removeTitle', { name: editingStep.name }), body: t('wfb.removeBody'), confirmLabel: t('wfb.remove') }))) return
    const removed = editingStep
    const previousSteps = steps
    setLocalSteps(steps.filter((s) => s.id !== removed.id))
    setEditingStepId(null)
    try {
      const result = await deleteStep.mutateAsync(removed.id)
      if (!handleVersionedResult(result)) refetchSteps()
      ok(t('wfb.removed', { name: removed.name }))
    } catch (err) {
      setLocalSteps(previousSteps)
      setEditingStepId(removed.id)
      fail(err)
    }
  }

  if (isLoading) return <div aria-hidden className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-96 rounded-card" /></div>
  if (error || !definition) return <ErrorState framed title={t('wfb.loadError')} message={error?.message} onRetry={refetch} />

  const usedBy = definition.program_detail?.is_general_intake ? t('wfl.generalIdeas') : definition.program_detail?.title
  const summary = plainWords(t, steps)

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={
          <span className="text-[12px] text-muted">
            <Link to="/admin/workflows" className="hover:text-text hover:underline">{t('wfl.crumb')}</Link> / {definition.name}
          </span>
        }
        title={definition.name}
        subtitle={[usedBy ? t('wfl.usedByValue', { list: usedBy }) : t('wfl.notUsed'), t('wfb.subtitle')].join(' ')}
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <StatusPill status={definition.status} />
            <Button variant="link" onClick={() => runAction('validate')} loading={validateWorkflow.isPending}>{t('wfb.check')}</Button>
            {definition.status === 'draft' && <Button onClick={() => runAction('publish')} loading={publishWorkflow.isPending}>{t('wfb.publish')}</Button>}
            {definition.status === 'published' && <Button onClick={() => runAction('activate')} loading={activateWorkflow.isPending}>{t('wfl.activate')}</Button>}
            <Link to={`/admin/workflows/${id}/instances`} className="text-[13px] font-bold text-primary hover:underline">{t('wfl.seeIdeas')}</Link>
          </div>
        }
      />
      <p className="text-[13px] text-muted md:hidden">{t('wfb.phoneNote')}</p>

      <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_360px] 2xl:gap-[22px]">
        <nav aria-label={t('wfb.addStep')} className="hidden md:block">
          <p className="mb-2 text-[12px] font-bold text-muted">{t('wfb.addStep')}</p>
          <ul className="flex flex-col gap-2">
            {PALETTE.map(({ kind, icon: Icon }) => (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => addStep(kind)}
                  disabled={createStep.isPending}
                  className="flex w-full items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-2.5 text-left text-[14px] text-text hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  <Icon size={16} aria-hidden className="shrink-0 text-muted" />
                  {t(`wfb.palette.${kind}`)}
                  <Plus size={14} aria-hidden className="ml-auto text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface2 p-4">
          {stepsLoading ? (
            <div aria-hidden className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
          ) : steps.length === 0 ? (
            <EmptyState title={t('wfb.empty')} message={t('wfb.emptyBody')} />
          ) : (
            <ol className="mx-auto flex w-full max-w-[420px] flex-col gap-3">
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  count={steps.length}
                  selected={step.id === editingStepId}
                  onSelect={() => selectStep(step.id)}
                  onMove={(pos) => moveStepToPosition(step.id, pos)}
                  busy={reordering}
                />
              ))}
            </ol>
          )}
          {summary && (
            <div className="mx-auto mt-2 w-full max-w-[560px] rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-[12px] font-bold text-muted">{t('wfb.plainWords')}</p>
              <p className="mt-1 text-[13px] text-text">{summary}</p>
            </div>
          )}
        </div>

        <div ref={panelRef} className="hidden md:col-span-2 md:block xl:col-span-1">
          {editingStep ? (
            <StepPanel
              step={editingStep}
              busy={updateStep.isPending || deleteStep.isPending || setStageConfig.isPending}
              allSteps={steps}
              onSave={saveStep}
              onDelete={removeStep}
              onDirtyChange={setPanelDirty}
            />
          ) : (
            <DetailsPanel definition={definition} meta={meta} setMeta={setMeta} onSave={() => runAction('save-meta')} saving={updateWorkflow.isPending} />
          )}
        </div>
      </div>
    </div>
  )
}

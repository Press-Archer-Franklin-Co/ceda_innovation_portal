import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileSearch,
  Filter,
  GitBranch,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import SectionCard from '../../../components/ui/SectionCard'
import ErrorState from '../../../components/ui/ErrorState'
import StatusPill from '../../../components/ui/StatusPill'
import Tabs from '../../../components/ui/Tabs'
import ActionDrawer from '../../../components/assignments/ActionDrawer'
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
import {
  useMarkingCriteriaList,
  useSetStageConfig,
  useStageConfig,
} from '../../../lib/queries/evaluations'
import { useConfirm } from '../../../components/ui/confirm'

const ROLE_OPTIONS = ['', 'innovator', 'innovation_officer', 'innovation_manager', 'judge', 'specialist', 'mentor', 'administrator']
const EXECUTION_OPTIONS = ['sequential', 'parallel_all', 'parallel_any', 'parallel_minimum']
const ASSIGNMENT_ROLE_OPTIONS = ['', 'reviewer', 'officer', 'manager', 'judge', 'specialist', 'mentor', 'analyst', 'staff', 'exo']
const ACTION_OPTIONS = ['approve', 'reject', 'return']
const STATUS_OPTIONS = ['', 'submitted', 'screening', 'under_review', 'assigned_to_judges', 'under_judging', 'approved', 'rejected', 'finalist', 'winner', 'selected_for_hackathon']
const OVERVIEW_TABS = [
  { key: 'overview', label: 'Workflow Overview' },
  { key: 'steps', label: 'Workflow Steps' },
]
const STEP_TYPE_FILTERS = [
  { value: 'all', label: 'All steps' },
  { value: 'assignment', label: 'Assignment steps' },
  { value: 'evaluation', label: 'Scoring steps' },
  { value: 'inactive', label: 'Inactive steps' },
]
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
]
const HEALTH_FILTER_OPTIONS = [
  { value: 'all', label: 'Any setup' },
  { value: 'attention', label: 'Needs setup' },
  { value: 'ready', label: 'Ready' },
]
const AGGREGATION_OPTIONS = [
  { value: 'average', label: 'Average score' },
  { value: 'min', label: 'Lowest score' },
  { value: 'max', label: 'Highest score' },
  { value: 'median', label: 'Median score' },
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

function formatExecutionMode(value) {
  return String(value || 'sequential')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatStatus(value) {
  if (!value) return 'No status'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getStepIssues(step) {
  const issues = []
  if (!step.name?.trim()) issues.push('Add a step name')
  if (!step.code?.trim()) issues.push('Add a step code')
  if (!step.actions_allowed?.length) issues.push('Choose at least one outcome')
  if (step.requires_assignment && !step.assignment_role) issues.push('Choose who this step is assigned to')
  if (step.requires_assignment && Number(step.minimum_assignments || 0) < 1) issues.push('Assignment count must be at least 1')
  if (step.requires_evaluation && Number(step.minimum_evaluations || 0) < 1) issues.push('Scoring count must be at least 1')
  return issues
}

function SummaryStat({ icon: Icon, label, value, tone = 'default' }) {
  const toneClass = {
    default: 'text-ceda-forest bg-ceda-green-pale/60',
    muted: 'text-ceda-muted bg-ceda-surface',
    accent: 'text-blue-700 bg-blue-50',
  }

  return (
    <div className="rounded-2xl border border-ceda-border bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', toneClass[tone] ?? toneClass.default)}>
          <Icon size={17} />
        </div>
        <div>
          <p className="text-lg font-semibold text-ceda-dark leading-none">{value}</p>
          <p className="mt-1 text-xs text-ceda-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}

function StepChip({ children, tone = 'default' }) {
  const toneClass = {
    default: 'border-ceda-border bg-ceda-surface text-ceda-muted',
    green: 'border-ceda-green/20 bg-ceda-green-pale text-ceda-forest',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    red: 'border-ceda-red/20 bg-ceda-red-pale text-ceda-red',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium', toneClass[tone] ?? toneClass.default)}>
      {children}
    </span>
  )
}

function WorkflowMetaCard({ definition, meta, setMeta, onSave, saving }) {
  return (
    <SectionCard
      title="Workflow Details"
      subtitle="Edit workflow-level information here. Steps are managed separately in the Workflow Steps tab."
      actions={(
        <button className="btn-secondary btn-sm" disabled={saving} onClick={onSave}>
          <Save size={14} /> Save Details
        </button>
      )}
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={meta.name} onChange={(e) => setMeta((prev) => ({ ...prev, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Code</label>
            <input className="input font-mono text-sm" value={meta.code} onChange={(e) => setMeta((prev) => ({ ...prev, code: slugify(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Workflow Type</label>
            <input className="input" value={meta.workflow_type} onChange={(e) => setMeta((prev) => ({ ...prev, workflow_type: e.target.value }))} placeholder="e.g. idea, hackathon" />
          </div>
          <div>
            <label className="label">Program</label>
            <div className="rounded-xl border border-ceda-border bg-ceda-surface px-4 py-3 text-sm text-ceda-dark">
              {definition.program_detail?.title ?? 'Not linked'}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <textarea className="input min-h-28 resize-y" value={meta.description} onChange={(e) => setMeta((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
        </div>

        <div className="rounded-2xl border border-ceda-border bg-ceda-surface/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ceda-muted">Current Snapshot</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-ceda-border bg-white px-4 py-3">
              <p className="text-xs text-ceda-muted">Version</p>
              <p className="mt-1 text-sm font-medium text-ceda-dark">v{definition.version ?? 1}</p>
            </div>
            <div className="rounded-xl border border-ceda-border bg-white px-4 py-3">
              <p className="text-xs text-ceda-muted">Status</p>
              <p className="mt-1 text-sm font-medium text-ceda-dark">{formatStatus(definition.status)}</p>
            </div>
            <div className="rounded-xl border border-ceda-border bg-white px-4 py-3">
              <p className="text-xs text-ceda-muted">Active Program</p>
              <p className="mt-1 text-sm font-medium text-ceda-dark">{definition.program_detail?.title ?? 'Not linked'}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function ActiveFilterChips({ filters, onClear }) {
  const chips = []
  if (filters.stepType !== 'all') chips.push({ key: 'stepType', label: STEP_TYPE_FILTERS.find((item) => item.value === filters.stepType)?.label })
  if (filters.status !== 'all') chips.push({ key: 'status', label: STATUS_FILTER_OPTIONS.find((item) => item.value === filters.status)?.label })
  if (filters.health !== 'all') chips.push({ key: 'health', label: HEALTH_FILTER_OPTIONS.find((item) => item.value === filters.health)?.label })

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="inline-flex items-center rounded-full border border-ceda-border bg-ceda-surface px-3 py-1 text-xs text-ceda-muted hover:bg-white"
          onClick={() => onClear(chip.key)}
        >
          {chip.label} ×
        </button>
      ))}
    </div>
  )
}

function CriteriaLinkField({ value, detail, onChange, disabled }) {
  const { data: raw } = useMarkingCriteriaList({ active_only: true })
  const criteria = Array.isArray(raw) ? raw : raw?.data ?? []

  return (
    <div className="rounded-2xl border border-ceda-border bg-ceda-surface/20 p-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-ceda-dark">Linked Criteria</p>
        <p className="mt-1 text-xs text-ceda-muted">Choose one criteria set from the library for this step. Create or edit criteria on the dedicated criteria page.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="label">Criteria Set</label>
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            <option value="">No criteria linked</option>
            {criteria.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <a href="/marking-criteria" target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
          Manage Criteria
        </a>
      </div>

      <div className="rounded-xl border border-ceda-border bg-white px-4 py-3">
        <p className="text-xs text-ceda-muted">Current Link</p>
        <p className="mt-1 text-sm font-medium text-ceda-dark">{detail?.title || 'No criteria linked'}</p>
        {detail ? (
          <p className="mt-1 text-xs text-ceda-muted">
            {detail.items?.length ?? 0} item{(detail.items?.length ?? 0) === 1 ? '' : 's'} · Max score {detail.total_max_score}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ceda-muted">This step will not have scoring criteria until a criteria set is linked.</p>
        )}
      </div>
    </div>
  )
}

function StepEditorDrawer({ step, open, busy, allSteps, onClose, onSave, onDelete, onDirtyChange }) {
  const { data: stageConfig } = useStageConfig(step?.id)
  const [draft, setDraft] = useState(() => stepToDraft(step ?? {}))
  const [stageDraft, setStageDraft] = useState(() => stageConfigToDraft(null))
  const payload = buildStepPayload(draft)
  const initialPayload = buildStepPayload(stepToDraft(step ?? {}))
  const initialStagePayload = buildStageConfigPayload(stageConfigToDraft(stageConfig ?? null))
  const currentStagePayload = buildStageConfigPayload(stageDraft)
  const stepDirty = !!step && !isPayloadEqual(payload, initialPayload)
  const stageDirty = !!step && !isPayloadEqual(currentStagePayload, initialStagePayload)
  const isDirty = stepDirty || stageDirty
  const currentIndex = step ? allSteps.findIndex((item) => item.id === step.id) : -1
  const previousStep = currentIndex > 0 ? allSteps[currentIndex - 1] : null
  const nextStep = currentIndex >= 0 && currentIndex < allSteps.length - 1 ? allSteps[currentIndex + 1] : null

  useEffect(() => {
    if (!step) return
    setDraft(stepToDraft(step))
  }, [step])

  useEffect(() => {
    setStageDraft(stageConfigToDraft(stageConfig ?? null))
  }, [stageConfig, step?.id])

  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  if (!step) return null

  const issues = getStepIssues({ ...(step ?? {}), ...payload })
  const linkedCriteriaMissing = stageDraft.scoring_mode === 'criteria' && !stageDraft.marking_criteria

  const toggleAction = (actionKey) => {
    setDraft((prev) => ({
      ...prev,
      actions_allowed: prev.actions_allowed.includes(actionKey)
        ? prev.actions_allowed.filter((item) => item !== actionKey)
        : normaliseActions([...prev.actions_allowed, actionKey]),
    }))
  }

  return (
    <ActionDrawer
      open={open}
      onClose={onClose}
      title={draft.name || 'Untitled Step'}
      subtitle={`Step ${draft.order} · ${draft.code || 'code pending'}`}
      widthClassName="max-w-2xl"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <button className="btn-ghost btn-sm text-ceda-red" disabled={busy} onClick={onDelete}>
            <Trash2 size={14} /> Remove Step
          </button>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" disabled={busy || !payload.name || !payload.code || (!stepDirty && !stageDirty)} onClick={() => onSave(payload, currentStagePayload, stageDirty)}>
              <Save size={14} /> {busy ? 'Saving…' : 'Save Step'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-ceda-border bg-ceda-surface/30 px-4 py-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Previous</p>
              <p className="mt-1 font-medium text-ceda-dark">{previousStep?.name ?? 'Start of workflow'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Current</p>
              <p className="mt-1 font-medium text-ceda-dark">{draft.name || 'Untitled step'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Next</p>
              <p className="mt-1 font-medium text-ceda-dark">{nextStep?.name ?? 'End of workflow'}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!draft.is_active ? <StepChip tone="red">Inactive</StepChip> : null}
            {issues.length > 0 ? <StepChip tone="amber">{issues.length} setup item{issues.length === 1 ? '' : 's'}</StepChip> : null}
            {linkedCriteriaMissing ? <StepChip tone="amber">No criteria linked</StepChip> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Step Name</label>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({
                ...prev,
                name: e.target.value,
                code: step?.id || (prev.code && prev.code !== slugify(prev.name)) ? prev.code : slugify(e.target.value),
              }))}
            />
          </div>
          <div>
            <label className="label">Code</label>
            <input
              className="input font-mono text-sm"
              value={draft.code}
              onChange={(e) => setDraft((prev) => ({ ...prev, code: slugify(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">Position</label>
            <select className="input" value={draft.order} onChange={(e) => setDraft((prev) => ({ ...prev, order: Number(e.target.value) }))}>
              {allSteps.map((item, index) => (
                <option key={item.id} value={index + 1}>
                  Position {index + 1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due in Hours</label>
            <input
              className="input"
              type="number"
              value={draft.due_in_hours}
              onChange={(e) => setDraft((prev) => ({ ...prev, due_in_hours: e.target.value }))}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-ceda-border p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ceda-dark">Step Behavior</p>
              <p className="mt-1 text-xs text-ceda-muted">Choose what this step can do and what status it moves the submission to.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-ceda-dark">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Submission Status</label>
              <select className="input" value={draft.submission_status} onChange={(e) => setDraft((prev) => ({ ...prev, submission_status: e.target.value }))}>
                {STATUS_OPTIONS.map((option) => <option key={option || 'none'} value={option}>{option || 'None'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Execution Mode</label>
              <select className="input" value={draft.execution_mode} onChange={(e) => setDraft((prev) => ({ ...prev, execution_mode: e.target.value }))}>
                {EXECUTION_OPTIONS.map((option) => <option key={option} value={option}>{formatExecutionMode(option)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Role Required</label>
              <select className="input" value={draft.role_required} onChange={(e) => setDraft((prev) => ({ ...prev, role_required: e.target.value }))}>
                {ROLE_OPTIONS.map((option) => <option key={option || 'none'} value={option}>{option || 'None'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Minimum Completions</label>
              <p className="text-[11px] text-ceda-muted mb-1">Tasks that must finish before this step advances (used in Parallel Minimum mode)</p>
              <input
                className="input"
                type="number"
                min="1"
                value={draft.minimum_completions_required}
                onChange={(e) => setDraft((prev) => ({ ...prev, minimum_completions_required: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="label">Allowed Outcomes</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACTION_OPTIONS.map((action) => {
                const active = draft.actions_allowed.includes(action)
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => toggleAction(action)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'border-ceda-forest bg-ceda-green-pale text-ceda-forest'
                        : 'border-ceda-border bg-white text-ceda-muted hover:bg-ceda-surface'
                    )}
                  >
                    {action}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ceda-border p-4 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ceda-dark">
            <input
              type="checkbox"
              checked={draft.requires_assignment}
              onChange={(e) => setDraft((prev) => ({ ...prev, requires_assignment: e.target.checked }))}
            />
            This step needs assignment
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Assign To</label>
              <select
                className="input"
                value={draft.assignment_role}
                onChange={(e) => setDraft((prev) => ({ ...prev, assignment_role: e.target.value }))}
                disabled={!draft.requires_assignment}
              >
                {ASSIGNMENT_ROLE_OPTIONS.map((option) => <option key={option || 'none'} value={option}>{option || 'None'}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Minimum Assignments</label>
              <p className="text-[11px] text-ceda-muted mb-1">How many people must be assigned a task for this step</p>
              <input
                className="input"
                type="number"
                min="0"
                value={draft.minimum_assignments}
                onChange={(e) => setDraft((prev) => ({ ...prev, minimum_assignments: e.target.value }))}
                disabled={!draft.requires_assignment}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ceda-border p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-ceda-dark">Step Scoring</p>
            <p className="mt-1 text-xs text-ceda-muted">
              Choose how this step reviews submissions. Criteria-based steps score against a linked
              criteria set — any assignee role can be used. Manual steps rely on direct actions only.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'manual',   label: 'Manual (Actions Only)' },
              { key: 'criteria', label: 'Criteria-Based Scoring' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setStageDraft((prev) => ({
                    ...prev,
                    scoring_mode: key,
                    marking_criteria: key === 'manual' ? '' : prev.marking_criteria,
                  }))
                  setDraft((prev) => ({
                    ...prev,
                    requires_evaluation: key === 'criteria',
                    minimum_evaluations: key === 'criteria' ? (Number(stageDraft.required_reviewer_count) || 1) : 0,
                  }))
                }}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs font-medium transition-colors text-center',
                  stageDraft.scoring_mode === key
                    ? 'border-ceda-forest bg-ceda-green-pale text-ceda-forest'
                    : 'border-ceda-border bg-white text-ceda-muted hover:bg-ceda-surface'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {stageDraft.scoring_mode === 'manual' ? (
            <div className="rounded-xl border border-ceda-border bg-ceda-surface/40 px-4 py-3">
              <p className="text-xs text-ceda-muted">
                <strong className="text-ceda-dark">Manual mode:</strong> Assignees will use
                Approve, Return for Correction, or Reject actions directly. No scoring criteria required.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <CriteriaLinkField
                value={stageDraft.marking_criteria}
                detail={stageConfig?.marking_criteria_detail ?? null}
                onChange={(value) => setStageDraft((prev) => ({ ...prev, marking_criteria: value }))}
                disabled={false}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Review Mode</label>
                  <select
                    className="input"
                    value={stageDraft.review_mode}
                    onChange={(e) => setStageDraft((prev) => ({ ...prev, review_mode: e.target.value }))}
                  >
                    <option value="fixed_count">Fixed reviewer count</option>
                    <option value="time_window">Timed review window</option>
                  </select>
                </div>
                <div>
                  <label className="label">{stageDraft.review_mode === 'time_window' ? 'Minimum Reviews' : 'Required Reviewers'}</label>
                  <p className="text-[11px] text-ceda-muted mb-1">
                    {stageDraft.review_mode === 'time_window' ? 'Minimum scorecards before auto-decision' : 'How many must submit a completed score sheet'}
                  </p>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={stageDraft.review_mode === 'time_window' ? stageDraft.minimum_reviews_required : stageDraft.required_reviewer_count}
                    onChange={(e) => {
                      setStageDraft((prev) => (
                        prev.review_mode === 'time_window'
                          ? ({ ...prev, minimum_reviews_required: e.target.value })
                          : ({ ...prev, required_reviewer_count: e.target.value })
                      ))
                      setDraft((prev) => ({ ...prev, minimum_evaluations: Number(e.target.value) || 1 }))
                    }}
                  />
                </div>
                {stageDraft.review_mode === 'time_window' && (
                  <>
                    <div>
                      <label className="label">Review Window Hours</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={stageDraft.review_window_hours}
                        onChange={(e) => setStageDraft((prev) => ({ ...prev, review_window_hours: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label">Maximum Reviewers</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        placeholder="Optional"
                        value={stageDraft.maximum_reviews_allowed}
                        onChange={(e) => setStageDraft((prev) => ({ ...prev, maximum_reviews_allowed: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Score Aggregation</label>
                  <select
                    className="input"
                    value={stageDraft.aggregation_method}
                    onChange={(e) => setStageDraft((prev) => ({ ...prev, aggregation_method: e.target.value }))}
                  >
                    {AGGREGATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-ceda-border bg-ceda-surface/40 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ceda-muted">
                  Score Thresholds (%)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Reject if below</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={stageDraft.threshold_reject_below}
                      onChange={(e) => setStageDraft((prev) => ({ ...prev, threshold_reject_below: e.target.value }))}
                      placeholder="e.g. 40"
                    />
                  </div>
                  <div>
                    <label className="label">Proceed if above</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={stageDraft.threshold_pass_above}
                      onChange={(e) => setStageDraft((prev) => ({ ...prev, threshold_pass_above: e.target.value }))}
                      placeholder="e.g. 70"
                    />
                  </div>
                </div>
                {stageDraft.threshold_reject_below !== '' && stageDraft.threshold_pass_above !== '' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <strong>Return for Correction</strong> when score is between {stageDraft.threshold_reject_below}% and {stageDraft.threshold_pass_above}%
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-ceda-dark cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageDraft.blind_scoring}
                    onChange={(e) => setStageDraft((prev) => ({ ...prev, blind_scoring: e.target.checked }))}
                  />
                  Blind Scoring
                </label>
                <label className="flex items-center gap-2 text-sm text-ceda-dark cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageDraft.allow_applicant_feedback}
                    onChange={(e) => setStageDraft((prev) => ({ ...prev, allow_applicant_feedback: e.target.checked }))}
                  />
                  Share Feedback with Applicant
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </ActionDrawer>
  )
}

export default function WorkflowBuilder() {
  const confirm = useConfirm()
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
  const [message, setMessage] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [activeTab, setActiveTab] = useState('steps')
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState({ stepType: 'all', status: 'all', health: 'all' })
  const [expandedStepIds, setExpandedStepIds] = useState([])
  const [editingStepId, setEditingStepId] = useState(null)
  const [reorderingId, setReorderingId] = useState(null)
  const [recentlySavedStepId, setRecentlySavedStepId] = useState(null)
  const [drawerDirty, setDrawerDirty] = useState(false)
  const [localSteps, setLocalSteps] = useState([])

  const deferredSearch = useDeferredValue(search)
  const serverSteps = useMemo(() => {
    const items = Array.isArray(stepsData) ? stepsData : stepsData?.results ?? []
    return sortSteps(items)
  }, [stepsData])

  useEffect(() => {
    setLocalSteps(serverSteps)
  }, [serverSteps])

  const steps = localSteps

  const filteredSteps = useMemo(() => {
    const searchTerm = deferredSearch.trim().toLowerCase()
    return steps.filter((step) => {
      if (filters.stepType === 'assignment' && !step.requires_assignment) return false
      if (filters.stepType === 'evaluation' && !step.requires_evaluation) return false
      if (filters.stepType === 'inactive' && step.is_active) return false
      if (filters.status === 'active' && !step.is_active) return false
      if (filters.status === 'inactive' && step.is_active) return false
      const hasIssues = getStepIssues(step).length > 0
      if (filters.health === 'attention' && !hasIssues) return false
      if (filters.health === 'ready' && hasIssues) return false
      if (!searchTerm) return true
      return [step.name, step.code, step.role_required, step.submission_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchTerm))
    })
  }, [deferredSearch, filters, steps])

  const editingStep = useMemo(
    () => steps.find((step) => step.id === editingStepId) ?? null,
    [editingStepId, steps],
  )

  useEffect(() => {
    if (!definition) return
    setMeta({
      name: definition.name ?? '',
      code: definition.code ?? '',
      description: definition.description ?? '',
      workflow_type: definition.workflow_type ?? '',
    })
  }, [definition])

  useEffect(() => {
    if (editingStepId && !steps.some((step) => step.id === editingStepId)) {
      setEditingStepId(null)
    }
  }, [editingStepId, steps])

  useEffect(() => {
    if (!recentlySavedStepId) return undefined
    const timeoutId = window.setTimeout(() => setRecentlySavedStepId(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [recentlySavedStepId])

  useEffect(() => {
    if (!drawerDirty) return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [drawerDirty])

  const confirmDiscardChanges = async () => (
    !drawerDirty || confirm({ title: 'Discard your step changes?', body: 'You have changes to this step that are not saved.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing' })
  )

  const handleVersionedResult = (result, fallbackId = id) => {
    if (result?.workflow_definition_id && result.workflow_definition_id !== fallbackId) {
      navigate(`/admin/workflows/${result.workflow_definition_id}/builder`, { replace: true })
      return true
    }
    return false
  }

  const clearFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: 'all' }))
  }

  const toggleExpanded = (stepId) => {
    setExpandedStepIds((prev) => (
      prev.includes(stepId)
        ? prev.filter((item) => item !== stepId)
        : [...prev, stepId]
    ))
  }

  const openEditor = async (stepId) => {
    if (!(await confirmDiscardChanges())) return
    setEditingStepId(stepId)
  }

  const runAction = async (action) => {
    setActionError(null)
    setMessage(null)
    try {
      let result = null
      if (action === 'save-meta') {
        result = await updateWorkflow.mutateAsync({ id, ...meta })
        setMessage('Workflow details saved.')
      }
      if (action === 'validate') {
        result = await validateWorkflow.mutateAsync(id)
        setMessage(result.valid ? 'Workflow validation passed.' : 'Workflow validation reported issues.')
      }
      if (action === 'publish') {
        result = await publishWorkflow.mutateAsync(id)
        setMessage('Workflow published.')
      }
      if (action === 'activate') {
        result = await activateWorkflow.mutateAsync(id)
        setMessage('Workflow activated for its program.')
      }
      handleVersionedResult(result)
      refetch()
      refetchSteps()
    } catch (err) {
      setActionError(err.message)
    }
  }

  const addStep = async () => {
    if (!(await confirmDiscardChanges())) return
    setActionError(null)
    setMessage(null)
    try {
      const nextOrder = steps.length ? Math.max(...steps.map((item) => item.order ?? 0)) + 1 : 1
      const result = await createStep.mutateAsync({
        name: `Step ${nextOrder}`,
        code: `step_${nextOrder}`,
        order: nextOrder,
        actions_allowed: ['approve', 'reject', 'return'],
        execution_mode: 'sequential',
        minimum_completions_required: 1,
        requires_assignment: false,
        minimum_assignments: 0,
        requires_evaluation: false,
        minimum_evaluations: 0,
        is_active: true,
      })
      if (!handleVersionedResult(result)) {
        const nextStep = result?.id ? result : {
          id: `tmp-${Date.now()}`,
          name: `Step ${nextOrder}`,
          code: `step_${nextOrder}`,
          order: nextOrder,
          actions_allowed: ['approve', 'reject', 'return'],
          execution_mode: 'sequential',
          minimum_completions_required: 1,
          requires_assignment: false,
          minimum_assignments: 0,
          requires_evaluation: false,
          minimum_evaluations: 0,
          is_active: true,
        }
        setLocalSteps((prev) => sortSteps([...prev, nextStep]))
        setExpandedStepIds((prev) => [...new Set([...prev, nextStep.id])])
        setEditingStepId(nextStep.id)
        setRecentlySavedStepId(nextStep.id)
        refetchSteps()
      }
      setActiveTab('steps')
      setMessage('Workflow step created.')
    } catch (err) {
      setActionError(err.message)
    }
  }

  const moveStepToPosition = async (stepId, targetPosition) => {
    const nextSteps = reorderSteps(steps, stepId, targetPosition)
    if (isPayloadEqual(nextSteps, steps)) return
    const previousSteps = steps
    const movedStep = previousSteps.find((item) => item.id === stepId)

    setActionError(null)
    setMessage(null)
    setReorderingId(stepId)
    setLocalSteps(nextSteps)
    setRecentlySavedStepId(stepId)

    try {
      let versionChanged = false
      for (const step of nextSteps) {
        const previous = previousSteps.find((item) => item.id === step.id)
        if (previous?.order === step.order) continue
        const result = await updateStep.mutateAsync({ id: step.id, ...buildStepPayload(stepToDraft(step)) })
        versionChanged = handleVersionedResult(result) || versionChanged
      }
      if (!versionChanged) {
        refetchSteps()
      }
      setMessage(`Moved ${movedStep?.name || 'step'} to position ${targetPosition}.`)
    } catch (err) {
      setLocalSteps(previousSteps)
      setActionError(err.message)
    } finally {
      setReorderingId(null)
    }
  }

  const saveStep = async (payload, stagePayload, isStageConfigDirty) => {
    if (!editingStep) return
    const previousStep = editingStep
    const previousSteps = steps
    const stepWithChanges = { ...editingStep, ...payload }
    const optimisticSteps = payload.order !== editingStep.order
      ? reorderSteps(
          previousSteps.map((step) => (step.id === editingStep.id ? stepWithChanges : step)),
          editingStep.id,
          payload.order,
        )
      : sortSteps(previousSteps.map((step) => (
          step.id === editingStep.id ? stepWithChanges : step
        )))

    setActionError(null)
    setMessage(null)
    setLocalSteps(optimisticSteps)
    setRecentlySavedStepId(editingStep.id)

    try {
      const result = await updateStep.mutateAsync({ id: editingStep.id, ...payload })
      if (payload.order !== editingStep.order) {
        for (const step of optimisticSteps) {
          if (step.id === editingStep.id) continue
          const previous = previousSteps.find((item) => item.id === step.id)
          if (previous?.order === step.order) continue
          await updateStep.mutateAsync({ id: step.id, ...buildStepPayload(stepToDraft(step)) })
        }
      }
      if (isStageConfigDirty) {
        await setStageConfig.mutateAsync({ stepId: editingStep.id, body: stagePayload })
      }
      if (!handleVersionedResult(result)) {
        refetchSteps()
      }
      setDrawerDirty(false)
      setMessage(`Saved step ${payload.name}.`)
      return true
    } catch (err) {
      setLocalSteps(previousSteps.map((step) => (
        step.id === previousStep.id ? previousStep : step
      )))
      setActionError(err.message)
      return false
    }
  }

  const removeStep = async () => {
    if (!editingStep) return
    if (!(await confirm({ title: `Remove the step "${editingStep.name}"?`, note: 'This cannot be undone.', confirmLabel: 'Remove step' }))) return
    const removedStep = editingStep
    const previousSteps = steps

    setActionError(null)
    setMessage(null)
    setLocalSteps(steps.filter((step) => step.id !== editingStep.id))
    setEditingStepId(null)

    try {
      const result = await deleteStep.mutateAsync(removedStep.id)
      if (!handleVersionedResult(result)) {
        refetchSteps()
      }
      setMessage(`Removed step ${removedStep.name}.`)
    } catch (err) {
      setLocalSteps(previousSteps)
      setEditingStepId(removedStep.id)
      setActionError(err.message)
    }
  }

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-ceda-border/30 animate-pulse" />
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  if (!definition) {
    return <ErrorState message="Workflow definition not found." onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={definition.name}
        subtitle={`${definition.program_detail?.title ?? 'No program'} · Workflow overview and step management`}
        back={(
          <button onClick={async () => {
            if (!(await confirmDiscardChanges())) return
            navigate('/admin/workflows')
          }} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> Workflows
          </button>
        )}
        badge={<StatusPill status={definition.status} />}
        actions={(
          <>
            <button className="btn-secondary btn-sm" disabled={validateWorkflow.isPending} onClick={() => runAction('validate')}>
              <CheckCircle2 size={14} /> Validate
            </button>
            {definition.status === 'draft' && (
              <button className="btn-secondary btn-sm" disabled={publishWorkflow.isPending} onClick={() => runAction('publish')}>
                Publish
              </button>
            )}
            {definition.status === 'published' && (
              <button className="btn-primary btn-sm" disabled={activateWorkflow.isPending} onClick={() => runAction('activate')}>
                Activate
              </button>
            )}
          </>
        )}
      />

      {(message || actionError) ? (
        <div className={cn(
          'mb-5 rounded-xl px-4 py-3 text-sm',
          actionError
            ? 'border border-ceda-red/20 bg-ceda-red-pale text-ceda-red'
            : 'border border-ceda-green/20 bg-ceda-green-pale text-ceda-forest'
        )}>
          {actionError || message}
        </div>
      ) : null}

      <Tabs tabs={OVERVIEW_TABS} active={activeTab} onChange={setActiveTab} className="mb-5" />

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryStat icon={GitBranch} label="Total Steps" value={steps.length} />
            <SummaryStat icon={Users} label="Assignment Steps" value={steps.filter((step) => step.requires_assignment).length} tone="accent" />
            <SummaryStat icon={FileSearch} label="Scoring Steps" value={steps.filter((step) => step.requires_evaluation).length} tone="accent" />
            <SummaryStat icon={Clock3} label="Inactive Steps" value={steps.filter((step) => !step.is_active).length} tone="muted" />
          </div>

          <WorkflowMetaCard
            definition={definition}
            meta={meta}
            setMeta={setMeta}
            onSave={() => runAction('save-meta')}
            saving={updateWorkflow.isPending}
          />
        </div>
      ) : (
        <SectionCard
          title="Workflow Steps"
          subtitle="Inspect steps here first. Expand a step for quick details, then open the editor only when you need to change it."
          actions={(
            <button className="btn-primary btn-sm" disabled={createStep.isPending} onClick={addStep}>
              <Plus size={14} /> Add Step
            </button>
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="relative w-full md:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ceda-muted" />
                <input
                  className="input w-full pl-9"
                  placeholder="Search steps"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setFiltersOpen((prev) => !prev)}>
                  <Filter size={14} /> Filters
                </button>
              </div>
            </div>

            {filtersOpen ? (
              <div className="rounded-2xl border border-ceda-border bg-ceda-surface/20 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Step Type</label>
                    <select className="input" value={filters.stepType} onChange={(e) => setFilters((prev) => ({ ...prev, stepType: e.target.value }))}>
                      {STEP_TYPE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                      {STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Setup</label>
                    <select className="input" value={filters.health} onChange={(e) => setFilters((prev) => ({ ...prev, health: e.target.value }))}>
                      {HEALTH_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            <ActiveFilterChips filters={filters} onClear={clearFilter} />

            {stepsLoading ? (
              <div className="h-20 rounded-xl bg-ceda-border/20 animate-pulse" />
            ) : filteredSteps.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ceda-border bg-ceda-surface/20 px-5 py-10 text-center">
                <p className="text-sm font-medium text-ceda-dark">
                  {steps.length === 0 ? 'No steps configured yet.' : 'No steps match the current search or filters.'}
                </p>
                <p className="mt-1 text-xs text-ceda-muted">
                  {steps.length === 0
                    ? 'Add the first step to start building the workflow.'
                    : 'Clear a filter or try a different search term.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSteps.map((step) => {
                  const expanded = expandedStepIds.includes(step.id)
                  const moveTarget = String(step.order ?? 1)
                  return (
                    <div key={step.id} className="rounded-2xl border border-ceda-border bg-white">
                      <div className={cn(recentlySavedStepId === step.id && 'rounded-2xl ring-1 ring-ceda-green/40')}>
                        <div className="flex items-start gap-4 px-4 py-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ceda-surface text-sm font-semibold text-ceda-dark">
                            {step.order}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-ceda-dark truncate">{step.name || 'Untitled step'}</p>
                                  {!step.is_active ? <StepChip tone="red">Inactive</StepChip> : null}
                                  {getStepIssues(step).length > 0 ? <StepChip tone="amber">Needs setup</StepChip> : null}
                                  {recentlySavedStepId === step.id ? <StepChip tone="green">Updated</StepChip> : null}
                                </div>
                                <p className="mt-1 text-xs font-mono text-ceda-muted">{step.code || 'No code yet'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="button" className="btn-secondary btn-sm" onClick={() => openEditor(step.id)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-ceda-border p-2 text-ceda-muted hover:bg-ceda-surface"
                                  onClick={() => toggleExpanded(step.id)}
                                  aria-label={expanded ? `Collapse ${step.name}` : `Expand ${step.name}`}
                                >
                                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <StepChip>{step.submission_status ? formatStatus(step.submission_status) : 'No status selected'}</StepChip>
                              <StepChip>{formatExecutionMode(step.execution_mode)}</StepChip>
                              {step.requires_assignment ? <StepChip tone="blue">Assign to {step.assignment_role || 'role needed'}</StepChip> : null}
                              {step.requires_evaluation ? <StepChip tone="green">Scoring × {step.minimum_evaluations || 1}</StepChip> : null}
                              {step.due_in_hours ? <StepChip tone="amber">Due in {step.due_in_hours}h</StepChip> : null}
                            </div>

                            {getStepIssues(step).length > 0 ? (
                              <p className="mt-3 text-xs text-amber-700">{getStepIssues(step)[0]}</p>
                            ) : null}
                          </div>
                        </div>

                        {expanded ? (
                          <div className="border-t border-ceda-border bg-ceda-surface/20 px-4 py-4">
                            <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Actions</p>
                                  <p className="mt-1 text-sm text-ceda-dark">{step.actions_allowed?.length ? normaliseActions(step.actions_allowed).join(', ') : 'None set'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Role Gate</p>
                                  <p className="mt-1 text-sm text-ceda-dark">{step.role_required || 'No role gate'}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Assignment</p>
                                  <p className="mt-1 text-sm text-ceda-dark">
                                    {step.requires_assignment
                                      ? `${step.assignment_role || 'Role needed'} · min ${step.minimum_assignments || 1}`
                                      : 'Not required'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide text-ceda-muted">Scoring</p>
                                  <p className="mt-1 text-sm text-ceda-dark">
                                    {step.requires_evaluation
                                      ? `Criteria-based · ${step.minimum_evaluations || 1} reviewer${Number(step.minimum_evaluations || 1) === 1 ? '' : 's'}`
                                      : 'Manual actions'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-end gap-2">
                                <div className="min-w-[160px]">
                                  <label className="label">Move Step To</label>
                                  <select
                                    className="input"
                                    defaultValue={moveTarget}
                                    onChange={(e) => moveStepToPosition(step.id, e.target.value)}
                                    disabled={reorderingId === step.id || updateStep.isPending}
                                  >
                                    {steps.map((item, index) => (
                                      <option key={item.id} value={index + 1}>
                                        Position {index + 1}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <StepEditorDrawer
        step={editingStep}
        open={!!editingStep}
        busy={updateStep.isPending || deleteStep.isPending || setStageConfig.isPending}
        allSteps={steps}
        onClose={async () => {
          if (!(await confirmDiscardChanges())) return
          setDrawerDirty(false)
          setEditingStepId(null)
        }}
        onSave={saveStep}
        onDelete={removeStep}
        onDirtyChange={setDrawerDirty}
      />
    </div>
  )
}

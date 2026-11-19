import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Save, ChevronDown, ChevronUp, AlertCircle, BookOpen, X } from 'lucide-react'
import SectionCard from '../ui/SectionCard'
import {
  useStageConfig, useSetStageConfig, useAddCriterion, useUpdateCriterion, useDeleteCriterion,
  useMarkingCriteriaList,
} from '../../lib/queries/evaluations'
import { useConfirm } from '../../components/ui/confirm'

const AGGREGATION_OPTIONS = [
  { value: 'average', label: 'Average' },
  { value: 'min',     label: 'Minimum' },
  { value: 'max',     label: 'Maximum' },
  { value: 'median',  label: 'Median' },
]

function CriterionRow({ criterion, stepId, onDelete }) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name:                  criterion.name,
    description:           criterion.description ?? '',
    max_score:             String(criterion.max_score),
    min_score:             String(criterion.min_score ?? 0),
    weight:                String(criterion.weight ?? 1),
    ordering:              String(criterion.ordering ?? 1),
    comment_required_below: criterion.comment_required_below != null ? String(criterion.comment_required_below) : '',
  })
  const updateMutation = useUpdateCriterion()
  const deleteMutation = useDeleteCriterion()

  const handleSave = () => {
    const body = {
      name:       form.name,
      description: form.description,
      max_score:  form.max_score,
      min_score:  form.min_score,
      weight:     form.weight,
      ordering:   parseInt(form.ordering, 10) || 1,
      comment_required_below: form.comment_required_below !== '' ? form.comment_required_below : null,
    }
    updateMutation.mutate({ stepId, crId: criterion.id, body }, { onSuccess: () => setEditing(false) })
  }

  const handleDelete = async () => {
    const ok = await confirm({ title: `Delete the criterion "${criterion.name}"?`, body: 'It is removed from this step.', confirmLabel: 'Delete criterion' })
    if (!ok) return
    deleteMutation.mutate({ stepId, crId: criterion.id }, { onSuccess: onDelete })
  }

  return (
    <div className="border border-ceda-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ceda-dark">{criterion.name}</p>
          <p className="text-xs text-ceda-muted">
            Max: {criterion.max_score} · Weight: {criterion.weight}
            {criterion.comment_required_below != null && ` · Comment req. below ${criterion.comment_required_below}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setEditing(p => !p)}
            className="btn-ghost btn-sm"
          >
            {editing ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="btn-ghost btn-sm text-ceda-red"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-ceda-border bg-ceda-surface/40 px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Ordering</label>
              <input type="number" className="input" value={form.ordering} onChange={e => setForm(p => ({ ...p, ordering: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label text-xs">Description (shown to reviewer)</label>
            <textarea className="textarea text-sm" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label text-xs">Min Score</label>
              <input type="number" className="input" value={form.min_score} onChange={e => setForm(p => ({ ...p, min_score: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Max Score *</label>
              <input type="number" className="input" value={form.max_score} onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Weight</label>
              <input type="number" step="0.5" className="input" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label text-xs">Comment required below (optional)</label>
            <input type="number" className="input" placeholder="e.g. 5" value={form.comment_required_below} onChange={e => setForm(p => ({ ...p, comment_required_below: e.target.value }))} />
          </div>
          {updateMutation.isError && (
            <p className="text-xs text-ceda-red">{updateMutation.error?.message}</p>
          )}
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !form.name || !form.max_score}
            className="btn-primary btn-sm"
          >
            <Save size={12} />
            {updateMutation.isPending ? 'Saving…' : 'Save Criterion'}
          </button>
        </div>
      )}
    </div>
  )
}

function AddCriterionForm({ stepId, nextOrder, onCancel }) {
  const [form, setForm] = useState({
    name: '', description: '', max_score: '', min_score: '0', weight: '1',
    ordering: String(nextOrder), comment_required_below: '',
  })
  const addMutation = useAddCriterion()

  const handleAdd = () => {
    const body = {
      name:       form.name,
      description: form.description,
      max_score:  form.max_score,
      min_score:  form.min_score,
      weight:     form.weight,
      ordering:   parseInt(form.ordering, 10) || nextOrder,
      comment_required_below: form.comment_required_below !== '' ? form.comment_required_below : null,
    }
    addMutation.mutate({ stepId, body }, { onSuccess: onCancel })
  }

  return (
    <div className="border border-ceda-border rounded-xl border-dashed bg-ceda-surface/40 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">New Criterion</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Name *</label>
          <input className="input" placeholder="e.g. Innovation" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs">Ordering</label>
          <input type="number" className="input" value={form.ordering} onChange={e => setForm(p => ({ ...p, ordering: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label text-xs">Description</label>
        <textarea className="textarea text-sm" rows={2} placeholder="Guidance shown to the reviewer" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label text-xs">Min</label>
          <input type="number" className="input" value={form.min_score} onChange={e => setForm(p => ({ ...p, min_score: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs">Max *</label>
          <input type="number" className="input" placeholder="10" value={form.max_score} onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs">Weight</label>
          <input type="number" step="0.5" className="input" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label text-xs">Require comment below</label>
        <input type="number" className="input" placeholder="Leave blank to not require" value={form.comment_required_below} onChange={e => setForm(p => ({ ...p, comment_required_below: e.target.value }))} />
      </div>
      {addMutation.isError && (
        <p className="text-xs text-ceda-red flex items-center gap-1"><AlertCircle size={11} /> {addMutation.error?.message}</p>
      )}
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={addMutation.isPending || !form.name || !form.max_score} className="btn-primary btn-sm">
          <Plus size={12} />
          {addMutation.isPending ? 'Adding…' : 'Add Criterion'}
        </button>
        <button onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  )
}

function LibraryCriteriaPicker({ currentId, onLink, onUnlink, saving }) {
  const { data: raw } = useMarkingCriteriaList({ active_only: true })
  const allCriteria = Array.isArray(raw) ? raw : raw?.data ?? []
  const [selected, setSelected] = useState(currentId ?? '')

  useEffect(() => { setSelected(currentId ?? '') }, [currentId])

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label text-xs">Link to library criteria (reusable)</label>
          <select
            className="input"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">No library criteria (use custom or manual)</option>
            {allCriteria.map(c => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.items?.length ?? 0} items, max {c.total_max_score})
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary btn-sm"
          disabled={saving || selected === (currentId ?? '')}
          onClick={() => selected ? onLink(selected) : onUnlink()}
        >
          <Save size={12} />
          {saving ? 'Saving…' : 'Apply'}
        </button>
        {currentId && (
          <button className="btn-ghost btn-sm text-ceda-red" onClick={onUnlink} disabled={saving}>
            <X size={12} /> Unlink
          </button>
        )}
      </div>
      {currentId && (
        <p className="text-xs text-blue-700 flex items-center gap-1">
          <BookOpen size={11} /> Linked library criteria is active. Custom per-step criteria below are ignored.
        </p>
      )}
      {!currentId && (
        <p className="text-xs text-ceda-muted">
          No library criteria linked. Use custom criteria below, or link one from the{' '}
          <a href="/marking-criteria" className="text-blue-600 underline" target="_blank" rel="noreferrer">criteria library</a>.
        </p>
      )}
    </div>
  )
}


export default function StageConfigPanel({ stepId }) {
  const { data: configRaw, isLoading, refetch } = useStageConfig(stepId)
  const config = configRaw?.data ?? configRaw
  const setConfig = useSetStageConfig()
  const [showAddForm, setShowAddForm] = useState(false)
  const [configForm, setConfigForm] = useState({
    required_reviewer_count:  '1',
    aggregation_method:       'average',
    threshold_reject_below:   '40.00',
    threshold_pass_above:     '70.00',
    blind_scoring:            true,
    allow_applicant_feedback: true,
  })
  const [configSaved, setConfigSaved] = useState(false)
  const [configError, setConfigError] = useState(null)

  useEffect(() => {
    if (config) {
      setConfigForm({
        required_reviewer_count:  String(config.required_reviewer_count ?? 1),
        aggregation_method:       config.aggregation_method ?? 'average',
        threshold_reject_below:   String(config.threshold_reject_below ?? '40.00'),
        threshold_pass_above:     String(config.threshold_pass_above ?? '70.00'),
        blind_scoring:            config.blind_scoring ?? true,
        allow_applicant_feedback: config.allow_applicant_feedback ?? true,
      })
    }
  }, [config])

  const handleSaveConfig = (overrides = {}) => {
    setConfigError(null)
    setConfig.mutate(
      {
        stepId,
        body: {
          required_reviewer_count:  parseInt(configForm.required_reviewer_count, 10) || 1,
          aggregation_method:       configForm.aggregation_method,
          threshold_reject_below:   configForm.threshold_reject_below,
          threshold_pass_above:     configForm.threshold_pass_above,
          blind_scoring:            configForm.blind_scoring,
          allow_applicant_feedback: configForm.allow_applicant_feedback,
          ...overrides,
        },
      },
      {
        onSuccess: () => { setConfigSaved(true); setTimeout(() => setConfigSaved(false), 3000) },
        onError: (e) => setConfigError(e?.message ?? 'Failed to save config'),
      }
    )
  }

  const handleLinkLibraryCriteria = (criteriaId) => {
    handleSaveConfig({ marking_criteria: criteriaId })
  }

  const handleUnlinkLibraryCriteria = () => {
    handleSaveConfig({ marking_criteria: null })
  }

  if (!stepId) return null

  const criteria = config?.custom_criteria ?? []
  const nextOrder = (criteria.length ? Math.max(...criteria.map(c => c.ordering)) : 0) + 1
  const linkedCriteriaId = config?.marking_criteria ?? null

  return (
    <div className="space-y-5">
      <SectionCard title="Evaluation Config" subtitle="Reviewer requirements and auto-decision thresholds for this stage">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-ceda-border/40 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Required reviewers</label>
                <input
                  type="number" min={1} className="input"
                  value={configForm.required_reviewer_count}
                  onChange={e => setConfigForm(p => ({ ...p, required_reviewer_count: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Aggregation method</label>
                <select
                  className="input"
                  value={configForm.aggregation_method}
                  onChange={e => setConfigForm(p => ({ ...p, aggregation_method: e.target.value }))}
                >
                  {AGGREGATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Reject below (%)</label>
                <input
                  type="number" step="1" min="0" max="100" className="input"
                  value={configForm.threshold_reject_below}
                  onChange={e => setConfigForm(p => ({ ...p, threshold_reject_below: e.target.value }))}
                />
                <p className="text-[11px] text-ceda-muted mt-1">Score% strictly below → auto-reject</p>
              </div>
              <div>
                <label className="label text-xs">Pass above (%)</label>
                <input
                  type="number" step="1" min="0" max="100" className="input"
                  value={configForm.threshold_pass_above}
                  onChange={e => setConfigForm(p => ({ ...p, threshold_pass_above: e.target.value }))}
                />
                <p className="text-[11px] text-ceda-muted mt-1">Score% at or above → advance to next step</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" className="rounded"
                  checked={configForm.blind_scoring}
                  onChange={e => setConfigForm(p => ({ ...p, blind_scoring: e.target.checked }))}
                />
                <span className="text-sm text-ceda-dark">Blind scoring</span>
                <span className="text-xs text-ceda-muted">(hide peer scores until reviewer submits)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" className="rounded"
                  checked={configForm.allow_applicant_feedback}
                  onChange={e => setConfigForm(p => ({ ...p, allow_applicant_feedback: e.target.checked }))}
                />
                <span className="text-sm text-ceda-dark">Applicant feedback</span>
                <span className="text-xs text-ceda-muted">(show criterion feedback to applicant)</span>
              </label>
            </div>

            {configError && (
              <p className="text-xs text-ceda-red flex items-center gap-1.5">
                <AlertCircle size={12} /> {configError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSaveConfig()}
                disabled={setConfig.isPending}
                className="btn-primary btn-sm"
              >
                <Save size={12} />
                {setConfig.isPending ? 'Saving…' : configSaved ? '✓ Saved' : 'Save Config'}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {config && (
        <SectionCard
          title="Marking Criteria"
          subtitle="Link a reusable criteria from the library (recommended), or define custom criteria below."
        >
          <LibraryCriteriaPicker
            currentId={linkedCriteriaId}
            onLink={handleLinkLibraryCriteria}
            onUnlink={handleUnlinkLibraryCriteria}
            saving={setConfig.isPending}
          />

          {linkedCriteriaId && config.marking_criteria_detail && (
            <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50/60 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-blue-800">{config.marking_criteria_detail.title}: items</p>
              {(config.marking_criteria_detail.items ?? []).map(item => (
                <div key={item.id} className="flex items-center justify-between text-xs text-blue-700">
                  <span>{item.name}</span>
                  <span className="text-blue-500">Max {item.max_score} · Weight {item.weight}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {config && !linkedCriteriaId && (
        <SectionCard
          title="Custom Criteria (per-step)"
          subtitle="These apply only to this stage. Use library criteria above for reusable scoring."
          actions={
            !showAddForm && (
              <button onClick={() => setShowAddForm(true)} className="btn-secondary btn-sm">
                <Plus size={12} /> Add Criterion
              </button>
            )
          }
        >
          <div className="space-y-2">
            {criteria.length === 0 && !showAddForm && (
              <p className="text-sm text-ceda-muted text-center py-4">
                No custom criteria. Link a library criteria above, or add custom criteria here.
              </p>
            )}
            {criteria.map(c => (
              <CriterionRow key={c.id} criterion={c} stepId={stepId} onDelete={refetch} />
            ))}
            {showAddForm && (
              <AddCriterionForm stepId={stepId} nextOrder={nextOrder} onCancel={() => setShowAddForm(false)} />
            )}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

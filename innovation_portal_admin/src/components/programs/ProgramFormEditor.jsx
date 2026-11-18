import React, { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Eye, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import SectionCard from '../ui/SectionCard'
import ErrorState from '../ui/ErrorState'
import {
  useCreateFieldOption,
  useCreateFormField,
  useCreateFormSection,
  useDeleteFieldOption,
  useDeleteFormField,
  useDeleteFormSection,
  useProgramForm,
  useUpdateFieldOption,
  useUpdateFormField,
  useUpdateFormSection,
} from '../../lib/queries/programs'

const FIELD_TYPES = [
  'text', 'textarea', 'number', 'date', 'email', 'phone',
  'boolean', 'select', 'multiselect', 'file', 'url',
]

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function followLabel(current, previousLabel, nextLabel) {
  return !current || current === slugify(previousLabel) ? slugify(nextLabel) : current
}

function emptyField(sectionId, ordering = 1) {
  return {
    section: sectionId,
    label: '',
    key: '',
    field_type: 'text',
    required: false,
    help_text: '',
    placeholder: '',
    link_url: '',
    default_value: '',
    ordering,
    is_active: true,
  }
}

function cleanFieldPayload(field) {
  const label = String(field.label || '').trim()
  const key = slugify(field.key || label)

  return {
    ...field,
    label,
    key,
    ordering: Number(field.ordering || 0),
    visible_if: field.visible_if ?? {},
    required_if: field.required_if ?? {},
  }
}

function isFieldPayloadReady(field) {
  const payload = cleanFieldPayload(field)
  return Boolean(payload.label && payload.key)
}

function OptionEditor({ option, onSave, onDelete, busy }) {
  const [draft, setDraft] = useState({
    label: option.label ?? '',
    value: option.value ?? '',
    ordering: option.ordering ?? 0,
  })
  const canSave = draft.label.trim() && draft.value.trim()
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_auto_auto] gap-2 items-end">
      <div>
        <label className="label">Label</label>
        <input className="input" value={draft.label} onChange={(e) => setDraft(p => ({ ...p, label: e.target.value, value: followLabel(p.value, p.label, e.target.value) }))} />
      </div>
      <div>
        <label className="label">Value</label>
        <input className="input" value={draft.value} onChange={(e) => setDraft(p => ({ ...p, value: e.target.value }))} />
      </div>
      <div>
        <label className="label">Order</label>
        <input className="input" type="number" value={draft.ordering} onChange={(e) => setDraft(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
      </div>
      <button className="btn-secondary btn-sm" disabled={busy || !canSave} onClick={() => onSave({ label: draft.label.trim(), value: draft.value.trim(), ordering: Number(draft.ordering || 0) })}>
        <Save size={14} /> Save
      </button>
      <button className="btn-ghost btn-sm text-ceda-red" disabled={busy} onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

const CONDITION_OPERATORS = [
  { value: 'equals',              label: 'equals' },
  { value: 'not_equals',          label: 'does not equal' },
  { value: 'exists',              label: 'has any value' },
  { value: 'not_exists',          label: 'is empty' },
  { value: 'contains',            label: 'contains' },
  { value: 'not_contains',        label: 'does not contain' },
  { value: 'greater_than',        label: 'greater than' },
  { value: 'less_than',           label: 'less than' },
]
const NO_VALUE_OPS = new Set(['exists', 'not_exists'])

function parseCondition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.field) {
    return { field: '', operator: 'equals', value: '' }
  }
  return { field: raw.field ?? '', operator: raw.operator ?? 'equals', value: raw.value ?? '' }
}

function buildCondition(cond) {
  if (!cond.field.trim()) return {}
  const out = { field: cond.field.trim(), operator: cond.operator }
  if (!NO_VALUE_OPS.has(cond.operator)) out.value = cond.value
  return out
}

function ConditionBuilder({ label, condition, onChange }) {
  const cond = parseCondition(condition)
  const hasCondition = !!cond.field

  return (
    <div className="rounded-lg border border-ceda-border bg-ceda-surface/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ceda-muted uppercase tracking-wide">
          <Eye size={12} />
          {label}
        </div>
        {hasCondition && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs text-ceda-red hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {!hasCondition ? (
        <p className="text-xs text-ceda-muted mb-2">No condition — always applied.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="label text-[11px]">When field key</label>
          <input
            className="input text-sm font-mono"
            placeholder="e.g. person_type"
            value={cond.field}
            onChange={(e) => onChange(buildCondition({ ...cond, field: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-[11px]">Operator</label>
            <select
              className="input text-sm"
              value={cond.operator}
              onChange={(e) => onChange(buildCondition({ ...cond, operator: e.target.value }))}
            >
              {CONDITION_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>
          {!NO_VALUE_OPS.has(cond.operator) && (
            <div>
              <label className="label text-[11px]">Value</label>
              <input
                className="input text-sm"
                placeholder="e.g. other"
                value={cond.value ?? ''}
                onChange={(e) => onChange(buildCondition({ ...cond, value: e.target.value }))}
              />
            </div>
          )}
        </div>
        {!hasCondition && (
          <button
            type="button"
            onClick={() => onChange({ field: '', operator: 'equals', value: '' })}
            className="text-xs text-ceda-forest hover:underline text-left"
          >
            + Add condition
          </button>
        )}
      </div>
    </div>
  )
}

function FieldCard({ field, onSave, onDelete, onCreateOption, onSaveOption, onDeleteOption, busy }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    label: field.label ?? '',
    key: field.key ?? '',
    field_type: field.field_type ?? 'text',
    required: !!field.required,
    help_text: field.help_text ?? '',
    placeholder: field.placeholder ?? '',
    link_url: field.link_url ?? '',
    default_value: field.default_value != null && typeof field.default_value === 'object'
      ? JSON.stringify(field.default_value)
      : (field.default_value ?? ''),
    ordering: field.ordering ?? 0,
    is_active: field.is_active ?? true,
    visible_if: field.visible_if ?? {},
    required_if: field.required_if ?? {},
  })
  const [newOption, setNewOption] = useState({ label: '', value: '', ordering: (field.options?.length ?? 0) + 1 })
  const supportsOptions = ['select', 'multiselect'].includes(draft.field_type)
  const duplicateOptionValue = Boolean(newOption.value) && (field.options ?? []).some(option => option.value === newOption.value)
  const canSaveField = isFieldPayloadReady(draft)

  return (
    <div className="border border-ceda-border rounded-xl bg-white overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-ceda-surface/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <GripVertical size={14} className="text-ceda-muted flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-sm font-medium text-ceda-dark truncate">{field.label || 'Untitled field'}</span>
          <span className="text-[10px] font-mono text-ceda-muted bg-ceda-surface px-1.5 py-0.5 rounded">{field.field_type}</span>
          {field.required && <span className="text-[10px] font-semibold text-ceda-red">required</span>}
          {!field.is_active && <span className="text-[10px] text-ceda-muted italic">inactive</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button className="btn-ghost btn-sm text-ceda-red" disabled={busy} onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
        {open ? <ChevronDown size={14} className="text-ceda-muted flex-shrink-0" /> : <ChevronRight size={14} className="text-ceda-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-ceda-border/50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={draft.label}
                onChange={(e) => setDraft(p => ({ ...p, label: e.target.value, key: p.key || slugify(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Key</label>
              <input className="input font-mono text-sm" value={draft.key} onChange={(e) => setDraft(p => ({ ...p, key: slugify(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Field Type</label>
              <select className="input" value={draft.field_type} onChange={(e) => setDraft(p => ({ ...p, field_type: e.target.value }))}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Order</label>
              <input className="input" type="number" value={draft.ordering} onChange={(e) => setDraft(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
            </div>
            <div>
              <label className="label">Help Text</label>
              <input className="input" value={draft.help_text} onChange={(e) => setDraft(p => ({ ...p, help_text: e.target.value }))} />
            </div>
            {draft.field_type === 'boolean' && (
              <div>
                <label className="label">Link URL <span className="text-ceda-muted font-normal">(optional — shown as "View" next to label)</span></label>
                <input className="input" type="url" placeholder="https://..." value={draft.link_url} onChange={(e) => setDraft(p => ({ ...p, link_url: e.target.value }))} />
              </div>
            )}
            {draft.field_type !== 'boolean' && (
              <div>
                <label className="label">Placeholder</label>
                <input className="input" value={draft.placeholder} onChange={(e) => setDraft(p => ({ ...p, placeholder: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="label">Default Value</label>
              <input className="input" value={draft.default_value} onChange={(e) => setDraft(p => ({ ...p, default_value: e.target.value }))} />
            </div>
            <div className="flex items-center gap-5 pt-6">
              <label className="flex items-center gap-2 text-sm text-ceda-dark">
                <input type="checkbox" checked={draft.required} onChange={(e) => setDraft(p => ({ ...p, required: e.target.checked }))} />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-ceda-dark">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft(p => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <ConditionBuilder
              label="Show field when…"
              condition={draft.visible_if}
              onChange={(val) => setDraft(p => ({ ...p, visible_if: val }))}
            />
            <ConditionBuilder
              label="Make required when…"
              condition={draft.required_if}
              onChange={(val) => setDraft(p => ({ ...p, required_if: val }))}
            />
          </div>

          <button className="btn-secondary btn-sm" disabled={busy || !canSaveField} onClick={() => onSave(cleanFieldPayload(draft))}>
            <Save size={14} /> Save Field
          </button>
          {!canSaveField && (
            <p className="text-xs text-ceda-red">Enter a field label. The key will be generated automatically if left blank.</p>
          )}

          {supportsOptions && (
            <div className="pt-3 border-t border-ceda-border">
              <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide mb-3">Options</p>
              <div className="space-y-2">
                {(field.options ?? []).map(option => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    busy={busy}
                    onSave={(payload) => onSaveOption(option.id, payload)}
                    onDelete={() => onDeleteOption(option.id)}
                  />
                ))}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_auto] gap-2 items-end pt-1">
                  <div>
                    <label className="label">New Label</label>
                    <input className="input" value={newOption.label} onChange={(e) => setNewOption(p => ({ ...p, label: e.target.value, value: followLabel(p.value, p.label, e.target.value) }))} />
                  </div>
                  <div>
                    <label className="label">Value</label>
                    <input className="input" value={newOption.value} onChange={(e) => setNewOption(p => ({ ...p, value: slugify(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="label">Order</label>
                    <input className="input" type="number" value={newOption.ordering} onChange={(e) => setNewOption(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    disabled={busy || !newOption.label.trim() || !newOption.value.trim() || duplicateOptionValue}
                    onClick={() => {
                      onCreateOption({ label: newOption.label.trim(), value: newOption.value.trim(), ordering: Number(newOption.ordering || 0) })
                      setNewOption({ label: '', value: '', ordering: (field.options?.length ?? 0) + 2 })
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                {duplicateOptionValue && (
                  <p className="text-xs text-ceda-red">Another option already uses the value "{newOption.value}". Change the label or value.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionEditor({
  section,
  onSaveSection,
  onDeleteSection,
  onCreateField,
  onSaveField,
  onDeleteField,
  onCreateOption,
  onSaveOption,
  onDeleteOption,
  busy,
}) {
  const [open, setOpen] = useState(true)
  const [editingMeta, setEditingMeta] = useState(false)
  const [draft, setDraft] = useState({
    title: section.title ?? '',
    code: section.code ?? '',
    description: section.description ?? '',
    ordering: section.ordering ?? 0,
    is_active: section.is_active ?? true,
  })
  const [addingField, setAddingField] = useState(false)
  const nextOrder = useMemo(() => {
    const fields = [...(section.fields ?? [])]
    return fields.length ? Math.max(...fields.map(f => f.ordering ?? 0)) + 1 : 1
  }, [section.fields])
  const [newField, setNewField] = useState(() => emptyField(section.id, nextOrder))
  const canCreateField = isFieldPayloadReady(newField)

  return (
    <div className="border border-ceda-border rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-4 py-3 bg-ceda-surface/60 border-b border-ceda-border">
        <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={() => setOpen(o => !o)}>
          {open ? <ChevronDown size={15} className="text-ceda-muted flex-shrink-0" /> : <ChevronRight size={15} className="text-ceda-muted flex-shrink-0" />}
          <span className="font-semibold text-ceda-dark text-sm truncate">{section.title || 'Untitled Section'}</span>
          <span className="text-[10px] font-mono text-ceda-muted">{section.code}</span>
          {!section.is_active && <span className="text-[10px] text-ceda-muted italic">inactive</span>}
          <span className="ml-2 text-[11px] text-ceda-muted">{(section.fields ?? []).length} field{(section.fields ?? []).length !== 1 ? 's' : ''}</span>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            className="btn-ghost btn-sm text-ceda-muted"
            onClick={() => setEditingMeta(o => !o)}
            title="Edit section settings"
          >
            Edit
          </button>
          <button className="btn-ghost btn-sm text-ceda-red" disabled={busy} onClick={onDeleteSection}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {editingMeta && (
        <div className="px-4 py-4 border-b border-ceda-border bg-ceda-surface/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Section Title</label>
              <input className="input" value={draft.title} onChange={(e) => setDraft(p => ({ ...p, title: e.target.value, code: p.code || slugify(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Code</label>
              <input className="input font-mono text-sm" value={draft.code} onChange={(e) => setDraft(p => ({ ...p, code: slugify(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={draft.description} onChange={(e) => setDraft(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Order</label>
                <input className="input" type="number" value={draft.ordering} onChange={(e) => setDraft(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ceda-dark pt-6">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft(p => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button className="btn-secondary btn-sm" disabled={busy} onClick={() => { onSaveSection(draft); setEditingMeta(false) }}>
              <Save size={14} /> Save Section
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setEditingMeta(false)}>Cancel</button>
          </div>
        </div>
      )}

      {open && (
        <div className="p-4 space-y-2">
          {(section.fields ?? []).slice().sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)).map(field => (
            <FieldCard
              key={field.id}
              field={field}
              busy={busy}
              onSave={(payload) => onSaveField(field.id, payload)}
              onDelete={() => onDeleteField(field.id)}
              onCreateOption={(payload) => onCreateOption(field.id, payload)}
              onSaveOption={(optionId, payload) => onSaveOption(optionId, payload)}
              onDeleteOption={(optionId) => onDeleteOption(optionId)}
            />
          ))}

          {(section.fields ?? []).length === 0 && (
            <p className="text-sm text-ceda-muted text-center py-4">No fields yet. Add one below.</p>
          )}

          {addingField && (
            <div className="mt-3 rounded-xl border border-ceda-border bg-ceda-surface/40 p-4 space-y-3">
              <p className="text-sm font-semibold text-ceda-dark">New Field</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Label</label>
                  <input
                    className="input"
                    value={newField.label}
                    autoFocus
                    onChange={(e) => setNewField(p => ({ ...p, label: e.target.value, key: followLabel(p.key, p.label, e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label">Key</label>
                  <input
                    className="input font-mono text-sm"
                    value={newField.key}
                    onChange={(e) => setNewField(p => ({ ...p, key: slugify(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="label">Field Type</label>
                  <select className="input" value={newField.field_type} onChange={(e) => setNewField(p => ({ ...p, field_type: e.target.value }))}>
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Order</label>
                  <input className="input" type="number" value={newField.ordering} onChange={(e) => setNewField(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={busy || !canCreateField}
                  onClick={() => {
                    onCreateField(cleanFieldPayload(newField))
                    setNewField(emptyField(section.id, nextOrder + 1))
                    setAddingField(false)
                  }}
                >
                  <Plus size={14} /> Create Field
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setNewField(emptyField(section.id, nextOrder))
                    setAddingField(false)
                  }}
                >
                  Cancel
                </button>
              </div>
              {!canCreateField && (
                <p className="text-xs text-ceda-muted">A field label is required. The key can be left blank and generated from the label.</p>
              )}
            </div>
          )}

          {!addingField && (
            <button
              className="btn-primary btn-sm mt-1"
              disabled={busy}
              onClick={() => {
                setNewField(emptyField(section.id, nextOrder))
                setAddingField(true)
              }}
            >
              <Plus size={14} /> Add Field
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProgramFormEditor({ programId }) {
  const { data: form, error: formError } = useProgramForm(programId)
  const sections = useMemo(
    () => [...(form?.sections ?? [])].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0)),
    [form]
  )

  const createSection = useCreateFormSection(programId)
  const updateSection = useUpdateFormSection(programId)
  const deleteSection = useDeleteFormSection(programId)
  const createField = useCreateFormField(programId)
  const updateField = useUpdateFormField(programId)
  const deleteField = useDeleteFormField(programId)
  const createOption = useCreateFieldOption(programId)
  const updateOption = useUpdateFieldOption(programId)
  const deleteOption = useDeleteFieldOption(programId)

  const [addingSection, setAddingSection] = useState(false)
  const [newSection, setNewSection] = useState({ title: '', code: '', description: '', ordering: 1, is_active: true })

  const isBusy = [
    createSection.isPending, updateSection.isPending, deleteSection.isPending,
    createField.isPending, updateField.isPending, deleteField.isPending,
    createOption.isPending, updateOption.isPending, deleteOption.isPending,
  ].some(Boolean)

  const mutationError =
    createSection.error || updateSection.error || deleteSection.error ||
    createField.error || updateField.error || deleteField.error ||
    createOption.error || updateOption.error || deleteOption.error

  const nextSectionOrder = sections.length ? Math.max(...sections.map(s => s.ordering ?? 0)) + 1 : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ceda-dark">
            {form ? `Version ${form.version} · ${sections.length} section${sections.length !== 1 ? 's' : ''}` : 'No submission form yet'}
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setAddingSection(o => !o)}>
          <Plus size={14} /> Add Section
        </button>
      </div>

      {formError && formError.status !== 404 && <ErrorState message={formError.message} />}

      {mutationError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{mutationError.message}</span>
        </div>
      )}

      {addingSection && (
        <div className="border border-ceda-border rounded-xl p-4 bg-ceda-surface/30 space-y-3">
          <p className="text-sm font-semibold text-ceda-dark">New Section</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Title</label>
              <input className="input" value={newSection.title} autoFocus onChange={(e) => setNewSection(p => ({ ...p, title: e.target.value, code: followLabel(p.code, p.title, e.target.value) }))} />
            </div>
            <div>
              <label className="label">Code</label>
              <input className="input font-mono text-sm" value={newSection.code} onChange={(e) => setNewSection(p => ({ ...p, code: slugify(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={newSection.description} onChange={(e) => setNewSection(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="label">Order</label>
              <input className="input" type="number" value={newSection.ordering} onChange={(e) => setNewSection(p => ({ ...p, ordering: Number(e.target.value || 0) }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={isBusy || !newSection.title.trim()}
              onClick={() => {
                createSection.mutate({
                  title: newSection.title.trim(),
                  code: newSection.code.trim() || slugify(newSection.title),
                  description: newSection.description.trim(),
                  ordering: Number(newSection.ordering || nextSectionOrder),
                  is_active: true,
                })
                setNewSection({ title: '', code: '', description: '', ordering: nextSectionOrder + 1, is_active: true })
                setAddingSection(false)
              }}
            >
              <Plus size={14} /> Create Section
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setAddingSection(false)}>Cancel</button>
          </div>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="rounded-xl border border-ceda-border bg-ceda-surface px-5 py-8 text-center">
          <GripVertical size={22} className="text-ceda-muted mx-auto mb-2" />
          <p className="text-sm text-ceda-muted">No sections yet. Click "Add Section" to build your submission form.</p>
        </div>
      ) : (
        sections.map(section => (
          <SectionEditor
            key={section.id}
            section={section}
            busy={isBusy}
            onSaveSection={(payload) => updateSection.mutate({ id: section.id, ...payload })}
            onDeleteSection={() => deleteSection.mutate(section.id)}
            onCreateField={(payload) => createField.mutate({ sectionId: section.id, ...payload })}
            onSaveField={(fieldId, payload) => updateField.mutate({ id: fieldId, ...payload })}
            onDeleteField={(fieldId) => deleteField.mutate(fieldId)}
            onCreateOption={(fieldId, payload) => createOption.mutate({ fieldId, ...payload })}
            onSaveOption={(optionId, payload) => updateOption.mutate({ id: optionId, ...payload })}
            onDeleteOption={(optionId) => deleteOption.mutate(optionId)}
          />
        ))
      )}
    </div>
  )
}

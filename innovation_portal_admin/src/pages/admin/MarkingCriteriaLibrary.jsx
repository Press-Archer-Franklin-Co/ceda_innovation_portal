import React, { useState } from 'react'
import { Plus, Trash2, Save, ChevronDown, ChevronUp, AlertCircle, BookOpen, Link } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import {
  useMarkingCriteriaList,
  useCreateMarkingCriteria,
  useUpdateMarkingCriteria,
  useDeleteMarkingCriteria,
  useAddMarkingCriteriaItem,
  useUpdateMarkingCriteriaItem,
  useDeleteMarkingCriteriaItem,
} from '../../lib/queries/evaluations'
import { useConfirm } from '../../components/ui/confirm'

function ItemRow({ criteriaId, item, onDelete }) {
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    name:                  item.name,
    description:           item.description ?? '',
    max_score:             String(item.max_score),
    min_score:             String(item.min_score ?? 0),
    weight:                String(item.weight ?? 1),
    ordering:              String(item.ordering ?? 1),
    comment_required_below: item.comment_required_below != null ? String(item.comment_required_below) : '',
  })
  const update = useUpdateMarkingCriteriaItem()
  const del    = useDeleteMarkingCriteriaItem()

  const handleSave = () => {
    update.mutate(
      {
        criteriaId,
        itemId: item.id,
        body: {
          name:       form.name,
          description: form.description,
          max_score:  form.max_score,
          min_score:  form.min_score,
          weight:     form.weight,
          ordering:   parseInt(form.ordering, 10) || 1,
          comment_required_below: form.comment_required_below !== '' ? form.comment_required_below : null,
        },
      },
      { onSuccess: () => setExpanded(false) },
    )
  }

  const handleDelete = async () => {
    const ok = await confirm({ title: `Delete the item "${item.name}"?`, body: 'It is removed from this set of marking criteria.', confirmLabel: 'Delete item' })
    if (!ok) return
    del.mutate({ criteriaId, itemId: item.id }, { onSuccess: onDelete })
  }

  return (
    <div className="border border-ceda-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ceda-dark">{item.name}</p>
          <p className="text-xs text-ceda-muted">
            Max: {item.max_score} · Weight: {item.weight}
            {item.comment_required_below != null && ` · Comment req. below ${item.comment_required_below}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setExpanded(p => !p)} className="btn-ghost btn-sm">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={handleDelete} disabled={del.isPending} className="btn-ghost btn-sm text-ceda-red">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ceda-border bg-ceda-surface/40 px-4 py-3 space-y-3">
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
            <input type="number" className="input" placeholder="Leave blank to not require" value={form.comment_required_below} onChange={e => setForm(p => ({ ...p, comment_required_below: e.target.value }))} />
          </div>
          {update.isError && <p className="text-xs text-ceda-red">{update.error?.message}</p>}
          <button onClick={handleSave} disabled={update.isPending || !form.name || !form.max_score} className="btn-primary btn-sm">
            <Save size={12} />
            {update.isPending ? 'Saving…' : 'Save Item'}
          </button>
        </div>
      )}
    </div>
  )
}

function AddItemForm({ criteriaId, nextOrder, onCancel }) {
  const [form, setForm] = useState({
    name: '', description: '', max_score: '', min_score: '0', weight: '1',
    ordering: String(nextOrder), comment_required_below: '',
  })
  const add = useAddMarkingCriteriaItem()

  const handleAdd = () => {
    add.mutate(
      {
        criteriaId,
        body: {
          name:       form.name,
          description: form.description,
          max_score:  form.max_score,
          min_score:  form.min_score,
          weight:     form.weight,
          ordering:   parseInt(form.ordering, 10) || nextOrder,
          comment_required_below: form.comment_required_below !== '' ? form.comment_required_below : null,
        },
      },
      { onSuccess: onCancel },
    )
  }

  return (
    <div className="border border-ceda-border border-dashed rounded-lg bg-ceda-surface/40 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">New Item</p>
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
        <textarea className="textarea text-sm" rows={2} placeholder="Guidance for the reviewer" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
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
        <input type="number" className="input" placeholder="Leave blank" value={form.comment_required_below} onChange={e => setForm(p => ({ ...p, comment_required_below: e.target.value }))} />
      </div>
      {add.isError && (
        <p className="text-xs text-ceda-red flex items-center gap-1"><AlertCircle size={11} />{add.error?.message}</p>
      )}
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={add.isPending || !form.name || !form.max_score} className="btn-primary btn-sm">
          <Plus size={12} />
          {add.isPending ? 'Adding…' : 'Add Item'}
        </button>
        <button onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  )
}

function CriteriaCard({ criteria, onDeleted }) {
  const confirm = useConfirm()
  const [open, setOpen]         = useState(false)
  const [editMeta, setEditMeta] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [meta, setMeta] = useState({ title: criteria.title, description: criteria.description ?? '' })

  const update = useUpdateMarkingCriteria()
  const del    = useDeleteMarkingCriteria()

  const items     = criteria.items ?? []
  const nextOrder = (items.length ? Math.max(...items.map(i => i.ordering)) : 0) + 1

  const handleSaveMeta = () => {
    update.mutate(
      { id: criteria.id, body: meta },
      { onSuccess: () => setEditMeta(false) },
    )
  }

  const handleDelete = async () => {
    const inUse = criteria.step_count > 0
    const ok = await confirm(inUse
      ? { title: `Switch off "${criteria.title}"?`, body: `It is used by ${criteria.step_count} workflow step(s), so it is switched off instead of deleted.`, confirmLabel: 'Switch off' }
      : { title: `Delete the marking criteria "${criteria.title}"?`, note: 'This cannot be undone.', confirmLabel: 'Delete criteria' })
    if (!ok) return
    del.mutate(criteria.id, { onSuccess: onDeleted })
  }

  return (
    <div className="border border-ceda-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ceda-dark">{criteria.title}</p>
            {!criteria.is_active && (
              <span className="text-[10px] font-medium bg-ceda-border/60 text-ceda-muted px-1.5 py-0.5 rounded">Inactive</span>
            )}
          </div>
          <p className="text-xs text-ceda-muted">
            {items.length} item{items.length !== 1 ? 's' : ''} · Max: {criteria.total_max_score}
            {criteria.step_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                <Link size={10} /> {criteria.step_count} step{criteria.step_count !== 1 ? 's' : ''}
              </span>
            )}
          </p>
          {criteria.description && (
            <p className="text-xs text-ceda-muted mt-0.5 truncate max-w-md">{criteria.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setOpen(p => !p)} className="btn-secondary btn-sm">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {open ? 'Collapse' : 'Manage Items'}
          </button>
          <button onClick={() => { setEditMeta(p => !p); setOpen(true) }} className="btn-ghost btn-sm">
            Edit
          </button>
          <button onClick={handleDelete} disabled={del.isPending} className="btn-ghost btn-sm text-ceda-red">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {editMeta && (
        <div className="border-t border-ceda-border bg-ceda-surface/40 px-5 py-3 space-y-3">
          <div>
            <label className="label text-xs">Title *</label>
            <input className="input" value={meta.title} onChange={e => setMeta(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">Description</label>
            <textarea className="textarea text-sm" rows={2} value={meta.description} onChange={e => setMeta(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveMeta} disabled={update.isPending || !meta.title} className="btn-primary btn-sm">
              <Save size={12} />
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditMeta(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-ceda-border px-5 py-4 space-y-2">
          {items.length === 0 && !showAddItem && (
            <p className="text-sm text-ceda-muted py-2">No scoring items yet. Add at least one item.</p>
          )}
          {items.map(item => (
            <ItemRow key={item.id} criteriaId={criteria.id} item={item} onDelete={() => {}} />
          ))}
          {showAddItem && (
            <AddItemForm criteriaId={criteria.id} nextOrder={nextOrder} onCancel={() => setShowAddItem(false)} />
          )}
          {!showAddItem && (
            <button onClick={() => setShowAddItem(true)} className="btn-secondary btn-sm mt-1">
              <Plus size={12} /> Add Item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CreateCriteriaForm({ onCancel }) {
  const [form, setForm] = useState({ title: '', description: '' })
  const create = useCreateMarkingCriteria()

  const handleCreate = () => {
    create.mutate(form, { onSuccess: onCancel })
  }

  return (
    <div className="border border-ceda-border border-dashed rounded-xl bg-ceda-surface/40 px-5 py-4 space-y-3">
      <p className="text-sm font-semibold text-ceda-dark">New Marking Criteria</p>
      <div>
        <label className="label text-xs">Title *</label>
        <input className="input" placeholder="e.g. Innovation Review Criteria" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
      </div>
      <div>
        <label className="label text-xs">Description (optional)</label>
        <textarea className="textarea text-sm" rows={2} placeholder="What this set of criteria is for" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      {create.isError && (
        <p className="text-xs text-ceda-red flex items-center gap-1"><AlertCircle size={11} /> {create.error?.message}</p>
      )}
      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={create.isPending || !form.title} className="btn-primary btn-sm">
          <Plus size={12} />
          {create.isPending ? 'Creating…' : 'Create Criteria'}
        </button>
        <button onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  )
}

export default function MarkingCriteriaLibrary() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: raw, isLoading, refetch } = useMarkingCriteriaList()
  const criteria = Array.isArray(raw) ? raw : raw?.data ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6 px-4">
      <PageHeader
        title="Marking Criteria Library"
        subtitle="Create reusable scoring criteria that can be linked to any workflow step."
        icon={<BookOpen size={20} />}
      />

      <SectionCard
        title="All Criteria"
        subtitle="Each criteria can be linked to one or more workflow steps. Edit items to update scoring guidance."
        actions={
          !showCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
              <Plus size={12} /> New Criteria
            </button>
          )
        }
      >
        <div className="space-y-3">
          {showCreate && (
            <CreateCriteriaForm onCancel={() => { setShowCreate(false); refetch() }} />
          )}

          {isLoading ? (
            [1, 2, 3].map(i => <div key={i} className="h-16 bg-ceda-border/30 rounded-xl animate-pulse" />)
          ) : criteria.length === 0 && !showCreate ? (
            <div className="text-center py-10 text-ceda-muted">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No marking criteria in the library yet.</p>
              <p className="text-xs mt-1">Create criteria here, then link them to workflow steps in the Workflow Builder.</p>
            </div>
          ) : (
            criteria.map(c => (
              <CriteriaCard key={c.id} criteria={c} onDeleted={refetch} />
            ))
          )}
        </div>
      </SectionCard>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-blue-800 mb-1">How reusable criteria works</p>
        <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
          <li>Create criteria once here with its scoring items.</li>
          <li>In the Workflow Builder, open any step and link it to a criteria from this library.</li>
          <li>When a reviewer or officer opens a task for that step, the linked criteria is loaded automatically.</li>
          <li>The same criteria can be linked to multiple steps across different workflows.</li>
          <li>Editing criteria items here updates all future review cycles. Historical cycles are not affected.</li>
        </ul>
      </div>
    </div>
  )
}

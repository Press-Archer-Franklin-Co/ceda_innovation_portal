import React, { useState } from 'react'
import { ExternalLink, FileText, Plus, Save, Trash2, X, Upload } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import ErrorState from '../../components/ui/ErrorState'
import { termsAndConditions as tcApi } from '../../lib/api/endpoints'
import {
  useTermsAndConditionsList,
  useCreateTermsAndConditions,
  useUpdateTermsAndConditions,
  useDeleteTermsAndConditions,
} from '../../lib/queries/programs'

const EMPTY = { title: '', content: '', document_url: '', pdf_file: null, active: true }

function TCForm({ initial = EMPTY, onSave, onCancel, busy }) {
  const [form, setForm] = useState({ ...initial, pdf_file: null })
  const [docMode, setDocMode] = useState(initial.document_url ? 'url' : initial.pdf_file ? 'file' : 'url')

  const handleSubmit = () => {
    const fd = new FormData()
    fd.append('title', form.title.trim())
    fd.append('content', form.content.trim())
    fd.append('active', form.active)
    if (docMode === 'url') {
      fd.append('document_url', form.document_url.trim())
    } else if (form.pdf_file instanceof File) {
      fd.append('pdf_file', form.pdf_file)
      fd.append('document_url', '')
    }
    onSave(fd)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input
          className="input"
          value={form.title}
          onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="e.g. CEDA Innovation Portal – Idea Submission Terms"
        />
      </div>

      <div>
        <label className="label">Document</label>
        <div className="flex gap-2 mb-3">
          <button
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${docMode === 'url' ? 'bg-ceda-forest text-white border-ceda-forest' : 'border-ceda-border text-ceda-muted hover:bg-ceda-surface'}`}
            onClick={() => setDocMode('url')}
          >
            External URL
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${docMode === 'file' ? 'bg-ceda-forest text-white border-ceda-forest' : 'border-ceda-border text-ceda-muted hover:bg-ceda-surface'}`}
            onClick={() => setDocMode('file')}
          >
            Upload PDF
          </button>
        </div>

        {docMode === 'url' ? (
          <input
            className="input"
            type="url"
            value={form.document_url}
            onChange={(e) => setForm(p => ({ ...p, document_url: e.target.value }))}
            placeholder="https://example.com/terms.pdf"
          />
        ) : (
          <label className="flex items-center gap-3 cursor-pointer border border-dashed border-ceda-border rounded-xl px-4 py-4 hover:bg-ceda-surface/50 transition-colors">
            <Upload size={16} className="text-ceda-muted flex-shrink-0" />
            <span className="text-sm text-ceda-muted">
              {form.pdf_file instanceof File ? form.pdf_file.name : initial.pdf_file ? 'Replace current file' : 'Click to choose a PDF file'}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => setForm(p => ({ ...p, pdf_file: e.target.files?.[0] ?? null }))}
            />
          </label>
        )}
      </div>

      <div>
        <label className="label">Description / Summary <span className="text-ceda-muted font-normal">(optional)</span></label>
        <textarea
          className="input min-h-[80px] resize-y"
          value={form.content}
          onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
          placeholder="Brief description of what this document covers…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ceda-dark">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm(p => ({ ...p, active: e.target.checked }))} />
        Active (visible for selection on programs)
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button className="btn-primary btn-sm" disabled={busy || !form.title.trim()} onClick={handleSubmit}>
          <Save size={14} /> {busy ? 'Saving…' : 'Save'}
        </button>
        {onCancel && <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

function TCRow({ tc, onEdit, onDelete, busy }) {
  const link = tc.document_link
  return (
    <div className="flex items-start gap-4 py-3 border-b border-ceda-border last:border-b-0">
      <div className="w-9 h-9 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0 mt-0.5">
        <FileText size={16} className="text-ceda-forest" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-ceda-dark">{tc.title}</p>
          {!tc.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-ceda-surface text-ceda-muted font-medium">Inactive</span>}
        </div>
        {tc.content && <p className="text-xs text-ceda-muted mt-0.5 line-clamp-1">{tc.content}</p>}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-ceda-forest hover:underline mt-1"
          >
            <ExternalLink size={11} /> {tc.pdf_file ? 'View PDF' : 'Open document'}
          </a>
        )}
        {!link && <p className="text-xs text-ceda-muted/60 mt-1 italic">No document attached</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button className="btn-ghost btn-sm" onClick={() => onEdit(tc)}>Edit</button>
        <button className="btn-ghost btn-sm text-ceda-red" disabled={busy} onClick={() => onDelete(tc.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export default function TermsManager() {
  const { data: list, error, isLoading } = useTermsAndConditionsList()
  const createTC = useCreateTermsAndConditions()
  const updateTC = useUpdateTermsAndConditions()
  const deleteTC = useDeleteTermsAndConditions()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  const items = Array.isArray(list) ? list : list?.results ?? []
  const busy = createTC.isPending || updateTC.isPending || deleteTC.isPending

  const handleCreate = async (fd) => {
    await createTC.mutateAsync(fd)
    setAdding(false)
  }

  const handleUpdate = async (fd) => {
    await updateTC.mutateAsync({ id: editing.id, body: fd })
    setEditing(null)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Terms & Conditions"
        subtitle="Manage T&C documents that can be linked to programs."
        actions={
          <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null) }}>
            <Plus size={14} /> New Document
          </button>
        }
      />

      {adding && (
        <SectionCard title="New Document" className="mb-5">
          <TCForm
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
            busy={createTC.isPending}
          />
        </SectionCard>
      )}

      <SectionCard title="Documents">
        {isLoading && <div className="h-20 animate-pulse bg-ceda-surface rounded-xl" />}
        {error && <ErrorState message={error.message} />}
        {!isLoading && items.length === 0 && !adding && (
          <p className="text-sm text-ceda-muted text-center py-6">No documents yet. Click "New Document" to add one.</p>
        )}
        {items.map(tc =>
          editing?.id === tc.id ? (
            <div key={tc.id} className="py-3 border-b border-ceda-border last:border-b-0">
              <TCForm
                initial={tc}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
                busy={updateTC.isPending}
              />
            </div>
          ) : (
            <TCRow
              key={tc.id}
              tc={tc}
              busy={busy}
              onEdit={setEditing}
              onDelete={(id) => deleteTC.mutate(id)}
            />
          )
        )}
      </SectionCard>
    </div>
  )
}

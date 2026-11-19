import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Save, Trash2, Image, Eye, EyeOff,
  ChevronUp, ChevronDown, GripVertical, Plus, User,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import { content } from '../../lib/api/endpoints'
import { useConfirm } from '../../components/ui/confirm'

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-ceda-dark">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ceda-muted">{hint}</p>}
    </div>
  )
}

function CardPreview({ card, photoPreview }) {
  const photo = photoPreview || card?.photo_url || null
  return (
    <div
      className="rounded-2xl overflow-hidden p-6 flex flex-col sm:flex-row items-center gap-6"
      style={{ background: 'radial-gradient(ellipse at 72% 50%, #6B4A3E 0%, #5A3C32 52%, #2E1E18 100%)' }}
    >
      <div className="shrink-0">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 shadow-lg bg-white/10 flex items-center justify-center">
          {photo
            ? <img src={photo} alt={card?.full_name || 'Preview'} className="w-full h-full object-cover object-top" />
            : <User size={28} className="text-white/30" />
          }
        </div>
      </div>
      <div className="shrink-0 sm:w-44 text-center sm:text-left">
        <p className="text-white font-bold text-sm leading-snug">{card?.full_name || 'Full Name'}</p>
        <p className="text-white/60 text-[11px] mt-1 leading-relaxed">{card?.job_title || 'Job Title'}</p>
        {(card?.committee_role) && (
          <p className="text-white/40 text-[10px] mt-0.5 leading-relaxed">({card.committee_role})</p>
        )}
      </div>
      <div className="hidden sm:block w-px self-stretch bg-white/10" />
      <p className="text-white/70 text-[12px] leading-relaxed italic flex-1 text-center sm:text-left line-clamp-4">
        {card?.quote ? `"${card.quote}"` : '"Your quote will appear here..."'}
      </p>
    </div>
  )
}

export function LeadershipCardEditor() {
  const confirm = useConfirm()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const photoRef = useRef()

  const [form, setForm] = useState({
    full_name: '',
    job_title: '',
    committee_role: '',
    quote: '',
    sort_order: 0,
    is_active: true,
    start_at: '',
    end_at: '',
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [showPreview, setShowPreview] = useState(true)
  const [error, setError] = useState(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['leadership-card', id],
    queryFn: () => content.getLeadershipCard(id),
    enabled: !isNew,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        full_name:       existing.full_name       ?? '',
        job_title:       existing.job_title       ?? '',
        committee_role:  existing.committee_role  ?? '',
        quote:           existing.quote           ?? '',
        sort_order:      existing.sort_order      ?? 0,
        is_active:       existing.is_active       ?? true,
        start_at:        existing.start_at ? existing.start_at.slice(0, 16) : '',
        end_at:          existing.end_at   ? existing.end_at.slice(0, 16)   : '',
      })
    }
  }, [existing])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const buildFormData = () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => {
      if ((k === 'start_at' || k === 'end_at') && !v) return
      if (v === null || v === undefined) return
      fd.append(k, v)
    })
    if (photoFile) fd.append('photo', photoFile)
    return fd
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = buildFormData()
      return isNew
        ? content.createLeadership(fd)
        : content.updateLeadership(id, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leadership'] })
      if (!isNew) qc.invalidateQueries({ queryKey: ['leadership-card', id] })
      navigate('/content?tab=leadership')
    },
    onError: (err) => {
      const detail = err?.data
      if (detail && typeof detail === 'object') {
        const msgs = Object.entries(detail).map(([f, v]) => `${f}: ${Array.isArray(v) ? v.join(', ') : v}`)
        setError(msgs.join('\n'))
      } else {
        setError(String(detail || err?.message || 'Save failed.'))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => content.deleteLeadership(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leadership'] })
      navigate('/content?tab=leadership')
    },
    onError: () => setError('Delete failed.'),
  })

  const handleDelete = async () => {
    const ok = await confirm({ title: `Delete the card for ${form.full_name}?`, note: 'This cannot be undone.', confirmLabel: 'Delete card' })
    if (!ok) return
    deleteMutation.mutate()
  }

  if (!isNew && isLoading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-48 bg-gray-200 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'New Leadership Card' : 'Edit Leadership Card'}
        subtitle="Manage the executive testimonial shown in the homepage carousel."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/content?tab=leadership')}
              className="btn btn-ghost gap-1.5"
            >
              <ArrowLeft size={14} /> Back
            </button>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="btn btn-ghost text-red-600 hover:bg-red-50 gap-1.5"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn btn-primary gap-1.5"
            >
              <Save size={14} /> {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-5">
          <SectionCard title="Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <input
                  className="input"
                  value={form.full_name}
                  onChange={e => set('full_name', e.target.value)}
                  placeholder="e.g. Mr. John Smith"
                />
              </Field>
              <Field label="Job Title" required>
                <input
                  className="input"
                  value={form.job_title}
                  onChange={e => set('job_title', e.target.value)}
                  placeholder="e.g. Chief Executive Officer"
                />
              </Field>
              <Field label="Committee Role / Subtitle" hint="Shown in smaller text under the title">
                <input
                  className="input"
                  value={form.committee_role}
                  onChange={e => set('committee_role', e.target.value)}
                  placeholder="e.g. Innovation Committee Chairperson"
                />
              </Field>
              <Field label="Display Order" hint="Lower number = appears earlier in carousel">
                <input
                  type="number"
                  className="input"
                  min="0"
                  value={form.sort_order}
                  onChange={e => set('sort_order', parseInt(e.target.value) || 0)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Quote / Message" description="The testimonial shown on the right side of the card.">
            <textarea
              className="input resize-none"
              rows={5}
              value={form.quote}
              onChange={e => set('quote', e.target.value)}
              placeholder="Enter the leader's message or quote here…"
            />
            <p className="text-[11px] text-ceda-muted mt-1">{form.quote.length} characters</p>
          </SectionCard>

          <SectionCard title="Profile Photo">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-ceda-border bg-ceda-surface flex items-center justify-center shrink-0">
                {photoPreview || existing?.photo_url
                  ? <img src={photoPreview || existing?.photo_url} alt="Preview" className="w-full h-full object-cover object-top" />
                  : <User size={24} className="text-ceda-muted" />
                }
              </div>
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="btn btn-secondary gap-1.5 text-sm"
                >
                  <Image size={14} />
                  {photoPreview || existing?.photo_url ? 'Change Photo' : 'Upload Photo'}
                </button>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                <p className="text-[11px] text-ceda-muted">
                  Displayed as a circle. Recommended: square portrait, minimum 200×200px.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Visibility">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ceda-dark">Active</p>
                  <p className="text-[11px] text-ceda-muted mt-0.5">Show this card in the carousel</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('is_active', !form.is_active)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-ceda-green' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Field label="Show From" hint="Leave blank to show immediately">
                  <input
                    type="datetime-local"
                    className="input text-sm"
                    value={form.start_at}
                    onChange={e => set('start_at', e.target.value)}
                  />
                </Field>
                <Field label="Show Until" hint="Leave blank to show indefinitely">
                  <input
                    type="datetime-local"
                    className="input text-sm"
                    value={form.end_at}
                    onChange={e => set('end_at', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Live Preview"
            actions={
              <button
                type="button"
                onClick={() => setShowPreview(p => !p)}
                className="btn btn-ghost btn-xs gap-1"
              >
                {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                {showPreview ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showPreview
              ? <CardPreview card={form} photoPreview={photoPreview} />
              : <p className="text-[11px] text-ceda-muted text-center py-4">Preview hidden</p>
            }
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function CardRow({ card, onEdit, onToggle, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-ceda-border bg-white hover:bg-ceda-surface/40 transition-colors group">
      <div className="flex flex-col gap-0.5 text-ceda-muted">
        <button onClick={onMoveUp} disabled={isFirst} className="disabled:opacity-20 hover:text-ceda-dark transition-colors">
          <ChevronUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="disabled:opacity-20 hover:text-ceda-dark transition-colors">
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="w-10 h-10 rounded-full overflow-hidden bg-ceda-surface border border-ceda-border shrink-0 flex items-center justify-center">
        {card.photo_url
          ? <img src={card.photo_url} alt={card.full_name} className="w-full h-full object-cover object-top" />
          : <User size={16} className="text-ceda-muted" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ceda-dark truncate">{card.full_name}</p>
        <p className="text-[11px] text-ceda-muted truncate">{card.job_title}{card.committee_role ? ` · ${card.committee_role}` : ''}</p>
      </div>

      <p className="hidden md:block text-[11px] text-ceda-muted italic line-clamp-1 flex-1 max-w-xs">
        "{card.quote}"
      </p>

      <span className={`badge text-[10px] shrink-0 ${card.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {card.is_active ? 'Active' : 'Inactive'}
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onToggle}
          className="btn btn-ghost btn-xs gap-1 text-ceda-muted"
          title={card.is_active ? 'Deactivate' : 'Activate'}
        >
          {card.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={onEdit} className="btn btn-ghost btn-xs">Edit</button>
        <button onClick={onDelete} className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

export default function LeadershipList({ embedded = false }) {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cards = [], isLoading, isError } = useQuery({
    queryKey: ['leadership'],
    queryFn: () => content.leadership(),
    select: (d) => Array.isArray(d) ? d : d?.results ?? [],
  })

  const [ordered, setOrdered] = useState([])
  useEffect(() => { setOrdered(cards) }, [cards])

  const reorderMutation = useMutation({
    mutationFn: (items) => content.reorderLeadership(items.map((c, i) => ({ id: c.id, sort_order: i }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leadership'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => content.updateLeadership(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leadership'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => content.deleteLeadership(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leadership'] }),
  })

  const move = (idx, dir) => {
    const next = [...ordered]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setOrdered(next)
    reorderMutation.mutate(next)
  }

  const handleDelete = async (card) => {
    const ok = await confirm({ title: `Delete the card for ${card.full_name}?`, note: 'This cannot be undone.', confirmLabel: 'Delete card' })
    if (!ok) return
    deleteMutation.mutate(card.id)
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <PageHeader
          title="Leadership Carousel"
          subtitle="Manage executive testimonial cards shown on the public homepage."
          actions={
            <button
              onClick={() => navigate('/content/leadership/new')}
              className="btn btn-primary gap-1.5"
            >
              <Plus size={14} /> Add Card
            </button>
          }
        />
      )}

      <SectionCard title={`Cards (${ordered.length})`} description="Reorder with arrows. Only active cards are shown publicly.">
        {isLoading && (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
          </div>
        )}

        {isError && (
          <p className="text-sm text-red-600 py-4 text-center">Failed to load cards. Please refresh.</p>
        )}

        {!isLoading && !isError && ordered.length === 0 && (
          <div className="text-center py-10">
            <User size={32} className="text-ceda-muted mx-auto mb-3" />
            <p className="text-sm text-ceda-muted">No leadership cards yet.</p>
            <button
              onClick={() => navigate('/content/leadership/new')}
              className="btn btn-primary mt-4 gap-1.5"
            >
              <Plus size={14} /> Add First Card
            </button>
          </div>
        )}

        {!isLoading && ordered.length > 0 && (
          <div className="space-y-2">
            {ordered.map((card, idx) => (
              <CardRow
                key={card.id}
                card={card}
                isFirst={idx === 0}
                isLast={idx === ordered.length - 1}
                onEdit={() => navigate(`/content/leadership/${card.id}`)}
                onToggle={() => toggleMutation.mutate({ id: card.id, is_active: !card.is_active })}
                onDelete={() => handleDelete(card)}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {ordered.filter(c => c.is_active).length > 0 && (
        <SectionCard title="Carousel Preview" description="How the first active card looks on the homepage.">
          <CardPreview card={ordered.find(c => c.is_active)} photoPreview={null} />
        </SectionCard>
      )}
    </div>
  )
}

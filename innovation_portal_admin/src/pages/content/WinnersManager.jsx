import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Trash2, Star, X, Image } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import { content, programs } from '../../lib/api/endpoints'
import { useConfirm } from '../../components/ui/confirm'

const POSITIONS = [
  { value: '1st',       label: '1st Place' },
  { value: '2nd',       label: '2nd Place' },
  { value: '3rd',       label: '3rd Place' },
  { value: 'runner_up', label: 'Runner-up' },
  { value: 'special',   label: 'Special Award' },
]

function Field({ label, required, children, hint }) {
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

export default function WinnersManager() {
  const confirm = useConfirm()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const photoRef = useRef()

  const [form, setForm] = useState({
    program: '',
    team_name: '',
    project_name: '',
    description: '',
    position: '1st',
    members_count: 1,
    year: new Date().getFullYear(),
    tags: '',
    is_featured: false,
  })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [error, setError] = useState(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['winner', id],
    queryFn: () => content.getWinner(id),
    enabled: !isNew,
  })

  const { data: allPrograms } = useQuery({
    queryKey: ['programs-all'],
    queryFn: () => programs.list({ page_size: 200 }),
    select: (d) => Array.isArray(d) ? d : d?.results ?? [],
  })

  useEffect(() => {
    if (existing) {
      setForm({
        program:       String(existing.program ?? ''),
        team_name:     existing.team_name ?? '',
        project_name:  existing.project_name ?? '',
        description:   existing.description ?? '',
        position:      existing.position ?? '1st',
        members_count: existing.members_count ?? 1,
        year:          existing.year ?? new Date().getFullYear(),
        tags:          Array.isArray(existing.tags) ? existing.tags.join(', ') : (existing.tags ?? ''),
        is_featured:   existing.is_featured ?? false,
      })
      if (existing.photo_url) setPhotoPreview(existing.photo_url)
    }
  }, [existing])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  function buildFormData() {
    const fd = new FormData()
    fd.append('program', form.program)
    fd.append('team_name', form.team_name)
    fd.append('project_name', form.project_name)
    fd.append('description', form.description)
    fd.append('position', form.position)
    fd.append('members_count', String(form.members_count))
    fd.append('year', String(form.year))
    fd.append('is_featured', form.is_featured ? 'true' : 'false')
    const tagsArr = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    fd.append('tags', JSON.stringify(tagsArr))
    if (photoFile) fd.append('photo', photoFile)
    return fd
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = buildFormData()
      return isNew ? content.createWinner(fd) : content.updateWinner(id, fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-winners'] })
      navigate('/content')
    },
    onError: (err) => {
      setError(err?.response?.data?.detail ?? JSON.stringify(err?.response?.data) ?? 'Failed to save')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => content.deleteWinner(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-winners'] })
      navigate('/content')
    },
  })

  if (!isNew && isLoading) {
    return <div className="p-6 animate-pulse space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-ceda-surface rounded-lg" />)}</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={isNew ? 'Add Winner' : 'Edit Winner'}
        subtitle="Feature a winning team on the public portal"
        icon={<ArrowLeft size={18} className="cursor-pointer" onClick={() => navigate('/content')} />}
        actions={
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                className="btn-ghost text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                onClick={async () => { if (await confirm({ title: 'Delete this winner?', body: 'It disappears from the public results straight away.', note: 'This cannot be undone.', confirmLabel: 'Delete winner' })) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} />Delete
              </button>
            )}
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.program || !form.team_name}
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          {error}
          <button className="ml-auto" onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Winner Details">
            <div className="space-y-4">
              <Field label="Program / Challenge" required>
                <select className="input w-full" value={form.program} onChange={set('program')}>
                  <option value="">— Select a program —</option>
                  {(allPrograms ?? []).map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Team / Individual Name" required>
                  <input className="input w-full" placeholder="Team GaboroneTech" value={form.team_name} onChange={set('team_name')} />
                </Field>
                <Field label="Project Name" required>
                  <input className="input w-full" placeholder="AI Traffic Management" value={form.project_name} onChange={set('project_name')} />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  className="input w-full resize-none"
                  rows={4}
                  placeholder="What the team built and the impact achieved…"
                  value={form.description}
                  onChange={set('description')}
                />
              </Field>
              <Field label="Tags" hint="Comma-separated">
                <input className="input w-full" placeholder="AI, Smart City, Impact" value={form.tags} onChange={set('tags')} />
              </Field>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Award Details">
            <div className="space-y-4">
              <Field label="Position">
                <select className="input w-full" value={form.position} onChange={set('position')}>
                  {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year">
                  <input className="input w-full" type="number" min={2020} max={2030} value={form.year} onChange={set('year')} />
                </Field>
                <Field label="Team Size">
                  <input className="input w-full" type="number" min={1} value={form.members_count} onChange={set('members_count')} />
                </Field>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-ceda-green"
                  checked={form.is_featured}
                  onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))}
                />
                <div>
                  <span className="text-sm font-medium text-ceda-dark flex items-center gap-1">
                    <Star size={13} className="text-amber-500" />Feature on homepage
                  </span>
                  <p className="text-[11px] text-ceda-muted mt-0.5">Show in the Featured Winners section</p>
                </div>
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Team Photo">
            <div
              className="border-2 border-dashed border-ceda-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-ceda-green transition-colors"
              onClick={() => photoRef.current?.click()}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="team" className="max-h-36 rounded object-cover w-full" />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-ceda-surface flex items-center justify-center">
                    <Image size={18} className="text-ceda-muted" />
                  </div>
                  <p className="text-xs text-ceda-muted text-center">Click to upload team photo</p>
                </>
              )}
            </div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) } }}
            />
            {photoPreview && (
              <button className="mt-2 text-xs text-red-500 hover:underline" onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}>
                Remove photo
              </button>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

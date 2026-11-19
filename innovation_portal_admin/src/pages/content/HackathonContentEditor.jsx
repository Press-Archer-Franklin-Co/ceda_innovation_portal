import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Trash2, Plus, X, Image, Upload, Crop } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import ImageCropModal from '../../components/ui/ImageCropModal'
import Tabs from '../../components/ui/Tabs'
import { content, programs } from '../../lib/api/endpoints'
import { useConfirm } from '../../components/ui/confirm'

const EDITOR_TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'prizes',    label: 'Prizes' },
  { key: 'faq',       label: 'FAQ' },
  { key: 'judges',    label: 'Judges' },
  { key: 'schedule',  label: 'Schedule' },
  { key: 'media',     label: 'Media' },
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

function ListEditor({ items, onChange, fields, addLabel }) {
  const add = () => onChange([...items, Object.fromEntries(fields.map(f => [f.key, '']))])
  const update = (i, k, v) => onChange(items.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-ceda-surface rounded-lg p-4 space-y-3 relative">
          <button
            className="absolute top-3 right-3 text-ceda-muted hover:text-red-500 transition-colors"
            onClick={() => remove(i)}
          >
            <X size={14} />
          </button>
          {fields.map(f => (
            <div key={f.key} className="space-y-1">
              <label className="text-[11px] font-semibold text-ceda-muted uppercase tracking-wide">{f.label}</label>
              {f.multiline ? (
                <textarea
                  className="input w-full text-sm resize-none"
                  rows={3}
                  value={item[f.key] ?? ''}
                  onChange={e => update(i, f.key, e.target.value)}
                  placeholder={f.placeholder ?? ''}
                />
              ) : (
                <input
                  className="input w-full text-sm"
                  value={item[f.key] ?? ''}
                  onChange={e => update(i, f.key, e.target.value)}
                  placeholder={f.placeholder ?? ''}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        className="btn-ghost flex items-center gap-1.5 text-sm"
        onClick={add}
      >
        <Plus size={14} />{addLabel}
      </button>
    </div>
  )
}

function MediaSection({ detailId, mediaItems, onRefresh }) {
  const confirm = useConfirm()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  const [mediaError, setMediaError] = useState(null)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !detailId) return
    setUploading(true)
    setMediaError(null)
    const fd = new FormData()
    fd.append('hackathon_detail', detailId)
    fd.append('file', file)
    fd.append('caption', caption)
    fd.append('media_type', file.type.startsWith('video/') ? 'video' : 'photo')
    try {
      await content.uploadMedia(fd)
      setCaption('')
      onRefresh()
    } catch (err) {
      setMediaError(err?.response?.data?.detail ?? err?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(mediaId) {
    if (!(await confirm({ title: 'Remove this file?', body: 'It is taken off this hackathon page.', confirmLabel: 'Remove file' }))) return
    setMediaError(null)
    try {
      await content.deleteMedia(mediaId)
      onRefresh()
    } catch (err) {
      setMediaError(err?.response?.data?.detail ?? err?.message ?? 'Delete failed')
    }
  }

  return (
    <div className="space-y-5">
      {mediaError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          {mediaError}
          <button className="ml-auto" onClick={() => setMediaError(null)}><X size={12} /></button>
        </div>
      )}
      <SectionCard title="Upload Media">
        <div className="space-y-3">
          <Field label="Caption (optional)">
            <input className="input w-full" placeholder="Photo caption…" value={caption} onChange={e => setCaption(e.target.value)} />
          </Field>
          <button
            className="btn-ghost flex items-center gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !detailId}
          >
            <Upload size={14} />{uploading ? 'Uploading…' : 'Choose file'}
          </button>
          {!detailId && <p className="text-xs text-amber-600">Save the overview first before uploading media.</p>}
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
        </div>
      </SectionCard>

      {mediaItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {mediaItems.map(m => (
            <div key={m.id} className="relative group rounded-lg overflow-hidden border border-ceda-border">
              {m.media_type === 'photo' ? (
                <img src={m.file_url ?? m.file} alt={m.caption} className="w-full h-32 object-cover" />
              ) : (
                <video src={m.file_url ?? m.file} className="w-full h-32 object-cover" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  className="text-white bg-red-500 rounded p-1.5"
                  onClick={() => handleDelete(m.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {m.caption && (
                <p className="p-2 text-[11px] text-ceda-muted truncate">{m.caption}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HackathonContentEditor() {
  const confirm = useConfirm()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const preselectedProgram = searchParams.get('program') ?? ''
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const bannerRef = useRef()

  const [tab, setTab] = useState('overview')
  const [error, setError] = useState(null)
  const [savedId, setSavedId] = useState(isNew ? null : id)
  const [originProgram, setOriginProgram] = useState(preselectedProgram)

  const [form, setForm] = useState({
    program: preselectedProgram,
    theme: '',
    description: '',
    rules: '',
    eligibility: '',
    is_published: false,
  })
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [prizes, setPrizes] = useState([])
  const [faq, setFaq] = useState([])
  const [judges, setJudges] = useState([])
  const [schedule, setSchedule] = useState([])

  const { data: existing, isLoading, refetch } = useQuery({
    queryKey: ['hackathon-detail', savedId],
    queryFn: () => content.getHackathon(savedId),
    enabled: !!savedId && !isNew,
  })

  const { data: hackathonPrograms } = useQuery({
    queryKey: ['programs-hackathon'],
    queryFn: () => programs.list({ page_size: 100 }),
    select: (d) => (Array.isArray(d) ? d : d?.results ?? []).filter(p => {
      const code = typeof p.program_type === 'object' && p.program_type !== null
        ? p.program_type?.code
        : String(p.program_type ?? '')
      return code === 'hackathon' || code === 'innovation_challenge'
    }),
  })

  useEffect(() => {
    if (existing) {
      const programId = String(existing.program ?? '')
      setForm({
        program:      programId,
        theme:        existing.theme ?? '',
        description:  existing.description ?? '',
        rules:        existing.rules ?? '',
        eligibility:  existing.eligibility ?? '',
        is_published: existing.is_published ?? false,
      })
      setPrizes(existing.prizes ?? [])
      setFaq(existing.faq ?? [])
      setJudges(existing.judges ?? [])
      setSchedule(existing.schedule ?? [])
      if (existing.banner_image_url) setBannerPreview(existing.banner_image_url)
      if (!originProgram && programId) setOriginProgram(programId)
    }
  }, [existing])

  function buildFormData() {
    const fd = new FormData()
    fd.append('program', form.program)
    fd.append('theme', form.theme)
    fd.append('description', form.description)
    fd.append('rules', form.rules)
    fd.append('eligibility', form.eligibility)
    fd.append('is_published', form.is_published ? 'true' : 'false')
    fd.append('prizes', JSON.stringify(prizes))
    fd.append('faq', JSON.stringify(faq))
    fd.append('judges', JSON.stringify(judges))
    fd.append('schedule', JSON.stringify(schedule))
    if (bannerFile) fd.append('banner_image', bannerFile)
    return fd
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = buildFormData()
      return savedId && !isNew ? content.updateHackathon(savedId, fd) : content.createHackathon(fd)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['content-hackathons'] })
      const prog = originProgram || data.program
      if (prog) qc.invalidateQueries({ queryKey: ['hackathon-content-by-program', prog] })
      if (!savedId || isNew) {
        setSavedId(data.id)
        navigate(`/content/hackathons/${data.id}`, { replace: true })
      } else {
        refetch()
      }
    },
    onError: (err) => {
      setError(err?.response?.data?.detail ?? JSON.stringify(err?.response?.data) ?? 'Failed to save')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => content.deleteHackathon(savedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-hackathons'] })
      navigate('/content')
    },
  })

  const selectedProgramItem = hackathonPrograms?.find(p => String(p.id) === String(form.program))
  const programLabel = String(existing?.program_title ?? selectedProgramItem?.title ?? '')

  if (!isNew && isLoading) {
    return <div className="p-6 animate-pulse space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-ceda-surface rounded-lg" />)}</div>
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={isNew ? 'New Hackathon Page' : 'Edit Hackathon Page'}
        subtitle={programLabel || (isNew ? 'Select a hackathon program below' : 'Hackathon detail page')}
        icon={
          <ArrowLeft
            size={18}
            className="cursor-pointer"
            onClick={() => originProgram
              ? navigate(`/programs/${originProgram}`)
              : navigate('/content')
            }
          />
        }
        actions={
          <div className="flex items-center gap-2">
            {!isNew && savedId && (
              <button
                className="btn-ghost text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                onClick={async () => { if (await confirm({ title: 'Delete this hackathon page?', note: 'This cannot be undone.', confirmLabel: 'Delete page' })) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} />Delete
              </button>
            )}
            {savedId && form.is_published && (
              <a
                href={`${import.meta.env.VITE_PUBLIC_URL ?? ''}/hackathons/${originProgram || form.program || savedId}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-[#A01E0A]"
              >
                <Save size={14} style={{ transform: 'rotate(-45deg)' }} />View Public Page
              </a>
            )}
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.program}
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

      <Tabs tabs={EDITOR_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <SectionCard title="Basic Info">
              <div className="space-y-4">
                <Field label="Hackathon / Innovation Challenge" required>
                  <select
                    className="input w-full"
                    value={form.program}
                    onChange={e => setForm(f => ({ ...f, program: e.target.value }))}
                  >
                    <option value="">— Select a hackathon or challenge —</option>
                    {(hackathonPrograms ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Theme / Tagline">
                  <input className="input w-full" placeholder="e.g. Innovating for Digital Inclusion" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} />
                </Field>
                <Field label="Description">
                  <textarea className="input w-full resize-y" rows={6} placeholder="Public-facing overview of this hackathon…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </Field>
                <Field label="Rules">
                  <textarea className="input w-full resize-y font-mono text-sm" rows={8} placeholder="Rules and submission requirements…" value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} />
                </Field>
                <Field label="Eligibility">
                  <textarea className="input w-full resize-y text-sm" rows={4} placeholder="Who can enter, e.g. permanent CEDA employees, teams of up to 5…" value={form.eligibility} onChange={e => setForm(f => ({ ...f, eligibility: e.target.value }))} />
                </Field>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard title="Banner Image">
              <div
                className="border-2 border-dashed border-ceda-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-ceda-green transition-colors"
                onClick={() => bannerRef.current?.click()}
              >
                {bannerPreview ? (
                  <img src={bannerPreview} alt="banner" className="w-full aspect-[4/1] rounded object-cover" />
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-ceda-surface flex items-center justify-center">
                      <Image size={18} className="text-ceda-muted" />
                    </div>
                    <p className="text-xs text-ceda-muted text-center">Click to upload banner</p>
                  </>
                )}
              </div>
              <input
                ref={bannerRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setCropSource({ src: URL.createObjectURL(f), name: f.name })
                  e.target.value = ''
                }}
              />
              {bannerPreview && (
                <div className="flex gap-2 mt-3">
                  <button type="button" className="btn-secondary btn-sm flex-1 justify-center" onClick={() => setCropSource({ src: bannerPreview, name: 'banner.jpg' })}>
                    <Crop size={13} /> Adjust &amp; crop
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => bannerRef.current?.click()}>Replace</button>
                </div>
              )}
              <p className="text-[11px] text-ceda-muted mt-2">Click Save after cropping to update the public page.</p>
              {cropSource && (
                <ImageCropModal
                  src={cropSource.src}
                  fileName={cropSource.name}
                  onCancel={() => setCropSource(null)}
                  onApply={(file) => {
                    setBannerFile(file)
                    setBannerPreview(URL.createObjectURL(file))
                    setCropSource(null)
                  }}
                />
              )}
            </SectionCard>

            <SectionCard title="Publishing">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-ceda-green" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium text-ceda-dark">Published</p>
                  <p className="text-[11px] text-ceda-muted">Visible on the public hackathon detail page</p>
                </div>
              </label>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'prizes' && (
        <SectionCard title="Prize Structure">
          <p className="text-xs text-ceda-muted mb-3">
            For Innovation Challenges, list prizes from first place down. Winners are picked automatically:
            the highest-scoring entry gets the first prize, and so on. The number of prizes is the number of winners (3 if none are listed).
          </p>
          <ListEditor
            items={prizes}
            onChange={setPrizes}
            addLabel="Add prize"
            fields={[
              { key: 'position', label: 'Position', placeholder: 'e.g. 1st Place' },
              { key: 'label',    label: 'Award label', placeholder: 'e.g. Grand Prize' },
              { key: 'amount',   label: 'Amount', placeholder: 'e.g. BWP 50,000' },
              { key: 'description', label: 'Description', placeholder: 'What the winner receives…', multiline: true },
            ]}
          />
        </SectionCard>
      )}

      {tab === 'faq' && (
        <SectionCard title="Frequently Asked Questions">
          <ListEditor
            items={faq}
            onChange={setFaq}
            addLabel="Add FAQ"
            fields={[
              { key: 'question', label: 'Question', placeholder: 'Question…' },
              { key: 'answer',   label: 'Answer', placeholder: 'Answer…', multiline: true },
            ]}
          />
        </SectionCard>
      )}

      {tab === 'judges' && (
        <SectionCard title="Judges / Panel">
          <ListEditor
            items={judges}
            onChange={setJudges}
            addLabel="Add judge"
            fields={[
              { key: 'name',     label: 'Full name', placeholder: 'Dr. Jane Doe' },
              { key: 'title',    label: 'Title / Organisation', placeholder: 'CTO at CEDA' },
              { key: 'bio',      label: 'Bio', placeholder: 'Short biography…', multiline: true },
              { key: 'photo_url',label: 'Photo URL (optional)', placeholder: 'https://…' },
            ]}
          />
        </SectionCard>
      )}

      {tab === 'schedule' && (
        <SectionCard title="Event Schedule / Timeline">
          <ListEditor
            items={schedule}
            onChange={setSchedule}
            addLabel="Add milestone"
            fields={[
              { key: 'date',        label: 'Date', placeholder: '2026-05-01' },
              { key: 'label',       label: 'Milestone label', placeholder: 'Registration Closes' },
              { key: 'description', label: 'Details (optional)', placeholder: 'Further information…', multiline: true },
            ]}
          />
        </SectionCard>
      )}

      {tab === 'media' && (
        <MediaSection
          detailId={savedId}
          mediaItems={existing?.media ?? []}
          onRefresh={refetch}
        />
      )}
    </div>
  )
}

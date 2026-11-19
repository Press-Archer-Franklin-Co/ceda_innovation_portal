import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Trash2, Eye, Image, Star, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import { content } from '../../lib/api/endpoints'
import { cn } from '../../lib/cn'
import { useConfirm } from '../../components/ui/confirm'

const CATEGORIES = [
  { value: 'announcement',    label: 'Announcement' },
  { value: 'challenge_update',label: 'Challenge Update' },
  { value: 'winners',         label: 'Winners' },
  { value: 'partnership',     label: 'Partnership' },
  { value: 'success_story',   label: 'Success Story' },
]

const STATUS_OPTIONS = [
  { value: 'draft',     label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived',  label: 'Archived' },
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

export default function ContentEditor() {
  const confirm = useConfirm()
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef()

  function todayDateValue() {
    return new Date().toISOString().slice(0, 16)
  }

  const [form, setForm] = useState({
    title: '',
    excerpt: '',
    body: '',
    category: 'announcement',
    status: 'draft',
    read_time: '',
    tags: '',
    is_highlighted: false,
    highlight_priority: '',
    published_at: todayDateValue(),
  })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [coverIsVideo, setCoverIsVideo] = useState(false)
  const [error, setError] = useState(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['content-item', id],
    queryFn: () => content.get(id),
    enabled: !isNew,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        title:        existing.title ?? '',
        excerpt:      existing.excerpt ?? '',
        body:         existing.body ?? '',
        category:     existing.category ?? 'announcement',
        status:       existing.status ?? 'draft',
        read_time:    existing.read_time ?? '',
        tags:         Array.isArray(existing.tags) ? existing.tags.join(', ') : (existing.tags ?? ''),
        is_highlighted: existing.is_highlighted ?? false,
        highlight_priority: existing.highlight_priority ? String(existing.highlight_priority) : '',
        published_at: existing.published_at
          ? new Date(existing.published_at).toISOString().slice(0, 16)
          : todayDateValue(),
      })
      if (existing.image_url) {
        setImagePreview(existing.image_url)
        setCoverIsVideo(existing.cover_is_video ?? false)
      }
    }
  }, [existing])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }))

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setCoverIsVideo(file.type.startsWith('video/'))
  }

  function buildFormData() {
    const fd = new FormData()
    fd.append('title', form.title)
    fd.append('excerpt', form.excerpt)
    fd.append('body', form.body)
    fd.append('category', form.category)
    fd.append('status', form.status)
    fd.append('read_time', form.read_time)
    fd.append('is_highlighted', form.is_highlighted ? 'true' : 'false')
    if (form.is_highlighted && form.highlight_priority) {
      fd.append('highlight_priority', form.highlight_priority)
    } else {
      fd.append('highlight_priority', '')
    }
    const tagsArr = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    fd.append('tags', JSON.stringify(tagsArr))
    if (form.published_at) fd.append('published_at', new Date(form.published_at).toISOString())
    if (imageFile) fd.append('image', imageFile)
    return fd
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const fd = buildFormData()
      return isNew ? content.create(fd) : content.update(id, fd)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['content-news'] })
      navigate('/content')
    },
    onError: (err) => {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to save')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => content.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-news'] })
      navigate('/content')
    },
  })

  if (!isNew && isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-ceda-surface rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={isNew ? 'New Article' : 'Edit Article'}
        subtitle={isNew ? 'Create a news article or announcement' : form.title}
        icon={<ArrowLeft size={18} className="cursor-pointer" onClick={() => navigate('/content')} />}
        actions={
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                className="btn-ghost text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                onClick={async () => { if (await confirm({ title: 'Delete this article?', body: 'It disappears from the public site straight away.', note: 'This cannot be undone.', confirmLabel: 'Delete article' })) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} />Delete
              </button>
            )}
            <button
              className="btn-primary flex items-center gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.title || !form.excerpt}
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <X size={14} className="flex-shrink-0" />
          {error}
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Article Content">
            <div className="space-y-4">
              <Field label="Title" required>
                <input
                  className="input w-full"
                  placeholder="Article headline…"
                  value={form.title}
                  onChange={set('title')}
                />
              </Field>
              <Field label="Excerpt" required hint="Short summary shown in the feed card (max 500 chars)">
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  maxLength={500}
                  placeholder="Short description shown in the feed…"
                  value={form.excerpt}
                  onChange={set('excerpt')}
                />
                <p className="text-[11px] text-ceda-muted text-right">{form.excerpt.length}/500</p>
              </Field>
              <Field label="Body" hint="Full article body — supports plain text or Markdown">
                <textarea
                  className="input w-full resize-y font-mono text-sm"
                  rows={14}
                  placeholder="Full article content…"
                  value={form.body}
                  onChange={set('body')}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Cover Media">
            <div
              className="border-2 border-dashed border-ceda-border rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-ceda-green transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                coverIsVideo ? (
                  <video src={imagePreview} className="max-h-52 rounded object-cover w-full" controls muted />
                ) : (
                  <img src={imagePreview} alt="preview" className="max-h-52 rounded object-cover" />
                )
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-ceda-surface flex items-center justify-center">
                    <Image size={20} className="text-ceda-muted" />
                  </div>
                  <p className="text-sm text-ceda-muted">Click to upload a cover image or video</p>
                  <p className="text-xs text-ceda-muted">PNG, JPG, WebP, MP4, WebM — max 200 MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleImageChange} />
            {imagePreview && (
              <button
                className="mt-2 text-xs text-red-500 hover:underline"
                onClick={() => { setImageFile(null); setImagePreview(null); setCoverIsVideo(false) }}
              >
                Remove {coverIsVideo ? 'video' : 'image'}
              </button>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Publishing">
            <div className="space-y-4">
              <Field label="Status">
                <select className="input w-full" value={form.status} onChange={set('status')}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Article Date" hint="Shown publicly as the article date. Defaults to today.">
                <input
                  type="datetime-local"
                  className="input w-full"
                  value={form.published_at}
                  onChange={set('published_at')}
                />
              </Field>
              <Field label="Category">
                <select className="input w-full" value={form.category} onChange={set('category')}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Read Time" hint="e.g. '4 min read'">
                <input className="input w-full" placeholder="4 min read" value={form.read_time} onChange={set('read_time')} />
              </Field>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-ceda-green"
                  checked={form.is_highlighted}
                  onChange={setCheck('is_highlighted')}
                />
                <div>
                  <span className="text-sm font-medium text-ceda-dark flex items-center gap-1">
                    <Star size={13} className="text-amber-500" />Highlight on homepage
                  </span>
                  <p className="text-[11px] text-ceda-muted mt-0.5">Max 5 items can be highlighted at once</p>
                </div>
              </label>
              <Field label="Homepage highlight slot" hint="Choose which highlighted card appears first on the homepage. 1 is the lead story.">
                <select
                  className="input w-full"
                  value={form.highlight_priority}
                  onChange={set('highlight_priority')}
                  disabled={!form.is_highlighted}
                >
                  <option value="">Auto / not set</option>
                  <option value="1">1. Lead story</option>
                  <option value="2">2. Highlight slot</option>
                  <option value="3">3. Highlight slot</option>
                  <option value="4">4. Highlight slot</option>
                  <option value="5">5. Highlight slot</option>
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Tags">
            <Field hint="Comma-separated tags, e.g. AI, Innovation, Fintech">
              <input
                className="input w-full"
                placeholder="AI, Fintech, Impact"
                value={form.tags}
                onChange={set('tags')}
              />
            </Field>
            {form.tags && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className="badge bg-ceda-surface text-ceda-muted text-[11px]">{t}</span>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

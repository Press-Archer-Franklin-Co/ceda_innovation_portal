import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Globe, Link2, Plus, Search, Send, Star, Trash2, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { useTrigger } from '../../components/ui/useTrigger'
import Input, { InputControl } from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Tag from '../../components/ui/Tag'
import StatusPill from '../../components/ui/StatusPill'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { Checkbox, Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import CoverPicker from '../../components/challenges/CoverPicker'
import { useI18n, useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { programs as programsApi } from '../../lib/api/endpoints'
import { storiesApi } from '../../lib/api/websiteContent'
import { cn } from '../../lib/cn'
import { MAX_FEATURED, MAX_STATS, QUOTE_MAX, STORY_PLACES, canAskConsent, canFeature, fromStory, needsConsent, storyProblems, toStoryPayload } from '../../lib/content/stories'
import { useStories, useStoryAction } from '../../lib/queries/websiteContent'

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const pick = (v, lang) => (v && typeof v === 'object' ? (lang === 'tn' && v.tn?.trim() ? v.tn : v.en ?? '') : v ?? '')
const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = Array.isArray(data) ? data[0] : typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}
const CONSENT_TONE = { not_needed: 'neutral', not_asked: 'amber', requested: 'blue', given: 'green', declined: 'red' }

/** Search the staff idea list and link the story to an idea and its innovator. */
function IdeaLink({ value, onChange }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const timer = useRef(null)
  const ideas = useQuery({ queryKey: ['stories', 'ideas', term], queryFn: () => storiesApi.ideas(term), enabled: term.length >= 2 })
  const list = rows(ideas.data).filter((s) => s.innovator)
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-control bg-surface2 px-3 py-2">
        <Link2 size={14} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-text">{value.label}</span>
        <Button variant="ghost" size="sm" icon={<X size={13} aria-hidden />} onClick={() => onChange(null)}>{t('stories.unlink')}</Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <InputControl type="search" value={q} placeholder={t('stories.findIdea')} aria-label={t('stories.findIdea')} leading={<Search size={14} aria-hidden />}
        onChange={(e) => { setQ(e.target.value); clearTimeout(timer.current); timer.current = setTimeout(() => setTerm(e.target.value.trim()), 300) }} />
      {term.length >= 2 && !ideas.isLoading && (
        list.length ? (
          <ul className="flex max-h-48 flex-col overflow-y-auto overscroll-contain rounded-control border border-border">
            {list.map((s) => {
              const label = t('stories.linkedTo', { reference: s.reference_number ?? '', title: s.title ?? '', name: s.innovator_detail?.full_name ?? '' }).replace(/ \(\)$/, '')
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onChange({ submission: s.id, user: s.innovator, label })} className="w-full px-3 py-2 text-left text-[13px] hover:bg-surface2">{label}</button>
                </li>
              )
            })}
          </ul>
        ) : <p className="text-[12px] text-muted">{t('stories.noIdeas')}</p>
      )}
    </div>
  )
}

function StoryEditor({ story, stories, open, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const act = useStoryAction()
  const [form, setForm] = useState(() => fromStory(story))
  const [lang, setLang] = useState('en')
  const [show, setShow] = useState(false)
  const [apiErrors, setApiErrors] = useState({})
  const [link, setLink] = useState(story?.user ? { submission: story.submission, user: story.user, label: t('stories.linkedSaved') } : null)
  const sectors = useQuery({ queryKey: ['reference', 'sectors'], queryFn: () => client.get('/api/reference/sectors/'), staleTime: 10 * 60 * 1000 })
  const programs = useQuery({ queryKey: ['programs', 'for-stories'], queryFn: () => programsApi.list({ page_size: 100 }), staleTime: 5 * 60 * 1000 })
  const problems = storyProblems(form, story)
  const err = (k) => apiErrors[k] || (show && problems[k] ? t(problems[k]) : undefined)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setText = (key, value) => setForm((f) => ({ ...f, [key]: { ...f[key], [lang]: value } }))
  const consentBlocked = form.user && needsConsent(story?.user === form.user ? story : { user: form.user })

  async function save() {
    setShow(true)
    if (form.is_featured && !canFeature(stories, story?.id)) return toast.show({ tone: 'error', title: t('stories.maxFeatured') })
    if (Object.keys(problems).length) return
    try {
      const body = toStoryPayload(form)
      if (story?.id) await act.mutateAsync({ action: 'update', id: story.id, value: body })
      else await act.mutateAsync({ action: 'create', value: body })
      toast.show({ tone: 'success', title: t('stories.saved') })
      onClose()
    } catch (e) {
      const data = e?.data?.errors ?? e?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) setApiErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k === 'consent' ? 'status' : k, Array.isArray(v) ? String(v[0]) : String(v)])))
      toast.show({ tone: 'error', title: t('stories.failed', { message: apiMessage(e) }) })
    }
  }
  async function askConsent() {
    try {
      await act.mutateAsync({ action: 'consent', id: story.id })
      toast.show({ tone: 'success', title: t('stories.consentAsked') })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: t('stories.failed', { message: apiMessage(e) }) })
    }
  }
  async function remove() {
    const ok = await confirm({ title: t('stories.deleteTitle', { name: story.person_name }), body: t('stories.deleteBody'), confirmLabel: t('stories.delete') })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'remove', id: story.id })
      toast.show({ tone: 'success', title: t('stories.deleted') })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: t('stories.failed', { message: apiMessage(e) }) })
    }
  }

  const missingTn = ['business', 'place', 'quote'].some((k) => form[k].en.trim() && !form[k].tn.trim())
  const englishHint = (k) => (lang === 'tn' && form[k].en ? `${t('lang.en')}: ${form[k].en}` : undefined)
  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} title={story?.id ? t('stories.edit') : t('stories.add')} size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {story?.id ? <Button variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={remove}>{t('stories.delete')}</Button> : <span />}
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={act.isPending}>{t('stories.save')}</Button></div>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Input label={t('stories.person')} value={form.person_name} onChange={(e) => set({ person_name: e.target.value })} maxLength={255} required error={err('person_name')} fieldClassName="flex-1" />
        </div>
        <div role="radiogroup" aria-label={t('lang.label')} className="flex items-center gap-1 self-start rounded-control bg-surface2 p-1">
          <Globe size={14} aria-hidden className="ml-1 text-muted" />
          {['en', 'tn'].map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={cn('h-7 rounded px-2.5 text-[12px]', lang === l ? 'bg-surface font-bold text-text shadow-sm' : 'text-muted hover:text-text')}>{t(`lang.${l}`)}</button>
          ))}
        </div>
        {missingTn && <p className="text-[12px] text-muted">{t('stories.missingTn')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('stories.business')} value={form.business[lang]} onChange={(e) => setText('business', e.target.value)} maxLength={255} hint={englishHint('business')} />
          <Input label={t('stories.place')} value={form.place[lang]} onChange={(e) => setText('place', e.target.value)} maxLength={255} hint={englishHint('place')} />
        </div>
        <Textarea label={t('stories.quote')} value={form.quote[lang]} onChange={(e) => setText('quote', e.target.value)} rows={3} maxChars={QUOTE_MAX} hint={englishHint('quote')} error={err('quote')} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-bold text-text">{t('stories.results')}</legend>
          <p className="text-[12px] text-muted">{t('stories.resultsHint')}</p>
          {form.stats.map((x, i) => (
            <div key={i} className="grid grid-cols-[96px_1fr_auto] items-end gap-2">
              <Input label={t('stories.resultValue')} value={x.value} onChange={(e) => set({ stats: form.stats.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} maxLength={12} />
              <Input label={t('stories.resultLabel')} value={x.label[lang]} onChange={(e) => set({ stats: form.stats.map((y, j) => (j === i ? { ...y, label: { ...y.label, [lang]: e.target.value } } : y)) })} maxLength={40} />
              <button type="button" onClick={() => set({ stats: form.stats.filter((_, j) => j !== i) })} aria-label={t('stories.removeResult', { n: i + 1 })} className="mb-1 flex h-8 w-8 items-center justify-center rounded text-muted hover:text-danger"><X size={15} aria-hidden /></button>
            </div>
          ))}
          {form.stats.length < MAX_STATS && (
            <button type="button" onClick={() => set({ stats: [...form.stats, { value: '', label: { en: '', tn: '' } }] })} className="inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline"><Plus size={13} aria-hidden /> {t('stories.addResult')}</button>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t('stories.sector')} options={rows(sectors.data).map((s) => ({ value: String(s.id), label: s.name }))} value={form.sector} onChange={(v) => set({ sector: v })} optional />
          <Select label={t('stories.program')} hint={t('stories.programHint')} options={rows(programs.data).filter((p) => !p.is_general_intake).map((p) => ({ value: String(p.id), label: p.title }))} value={form.program} onChange={(v) => set({ program: v })} optional />
        </div>
        <CoverPicker value={form.cover_id} onChange={(id) => set({ cover_id: id })} altText={form.person_name} />
        <fieldset>
          <legend className="mb-1 text-[13px] font-bold text-text">{t('stories.showsOn')}</legend>
          <div className="grid gap-1 sm:grid-cols-3">
            {STORY_PLACES.map((p) => <Checkbox key={p} label={t(`stories.place.${p}`)} checked={form.shows_on.includes(p)} onChange={(e) => set({ shows_on: e.target.checked ? [...new Set([...form.shows_on, p])] : form.shows_on.filter((x) => x !== p) })} />)}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold text-text">{t('stories.linked')}</p>
          <p className="text-[12px] text-muted">{t('stories.linkedHint')}</p>
          <IdeaLink value={link} onChange={(v) => { setLink(v); set({ user: v?.user ?? null, submission: v?.submission ?? null }) }} />
        </div>
        {form.user && (
          <div className="flex flex-wrap items-center gap-2 rounded-control bg-surface2 px-3 py-2.5">
            <span className="text-[13px] text-text">{t('stories.consent')}:</span>
            <Tag tone={CONSENT_TONE[story?.user === form.user ? story?.consent_status : 'not_asked'] ?? 'neutral'}>{t(`stories.consent.${story?.user === form.user ? story?.consent_status ?? 'not_asked' : 'not_asked'}`)}</Tag>
            {canAskConsent(story) && story.user === form.user ? (
              <Button variant="secondary" size="sm" icon={<Send size={13} aria-hidden />} className="ml-auto" onClick={askConsent} loading={act.isPending}>{t('stories.askConsent')}</Button>
            ) : !story?.id || story.user !== form.user ? <span className="ml-auto text-[12px] text-muted">{t('stories.saveBeforeConsent')}</span> : null}
          </div>
        )}
        <Toggle label={t('stories.publish')} description={consentBlocked ? t('stories.needConsent') : t('stories.publishHint')} checked={form.status === 'published'}
          disabled={consentBlocked && form.status !== 'published'} onChange={(v) => set({ status: v ? 'published' : 'draft' })} />
        {err('status') && <p role="alert" className="text-[12px] text-danger">{err('status')}</p>}
        <Toggle label={t('stories.featured')} checked={form.is_featured} onChange={(v) => {
          if (v && !canFeature(stories, story?.id)) return toast.show({ tone: 'error', title: t('stories.maxFeatured') })
          set({ is_featured: v })
        }} />
      </div>
    </Modal>
  )
}

/** 3.11 Stories (Figma 30:422). */
export default function Stories() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const list = useStories()
  const act = useStoryAction()
  const [editing, setEditing] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false) // kept apart from editing so the panel can close into its button
  const [session, setSession] = useState(0) // each opening starts from the saved story
  const trigger = useTrigger()
  const edit = (e, item) => { trigger.from(e); setEditing(item); setSession((n) => n + 1); setPanelOpen(true) }
  const stories = useMemo(() => [...(list.data ?? [])].sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || String(b.updated_at).localeCompare(String(a.updated_at))), [list.data])
  const featured = stories.filter((s) => s.is_featured).length

  const star = async (s) => {
    const on = !s.is_featured
    if (on && !canFeature(stories, s.id)) return toast.show({ tone: 'error', title: t('stories.maxFeatured') })
    try {
      await act.mutateAsync({ action: 'update', id: s.id, value: { is_featured: on } })
      toast.show({ tone: 'success', title: on ? t('stories.featured') : t('stories.unfeatured'), duration: 2000 })
    } catch (e) {
      toast.show({ tone: 'error', title: t('stories.failed', { message: apiMessage(e) }) })
    }
  }

  if (list.isError) return <ErrorState title={t('stories.loadError')} onRetry={() => list.refetch()} />

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted"><Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / {t('stories.title')}</p>
      <PageHeader title={t('stories.title')} subtitle={t('stories.subtitle')}
        actions={<Button icon={<Plus size={15} aria-hidden />} onClick={(e) => edit(e, 'new')}>{t('stories.add')}</Button>} />
      {!list.isLoading && stories.length > 0 && (
        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted"><Star size={14} aria-hidden className="fill-amber text-amber" /> {t('stories.featuredCount', { count: featured })}</p>
      )}
      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-card" />)}</div>
      ) : stories.length === 0 ? (
        <EmptyState title={t('stories.empty')} message={t('stories.emptyBody')} framed action={<Button onClick={(e) => edit(e, 'new')}>{t('stories.add')}</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stories.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={(e) => edit(e, s)} className="min-w-0 text-left">
                  <span className="block text-[15px] font-bold text-text hover:underline">{s.person_name}</span>
                  <span className="block text-[12px] text-muted">{[pick(s.business, lang), pick(s.place, lang)].filter(Boolean).join(', ')}</span>
                </button>
                <button type="button" onClick={() => star(s)} aria-pressed={!!s.is_featured}
                  aria-label={s.is_featured ? t('stories.unfeature', { name: s.person_name }) : t('stories.feature', { name: s.person_name })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control hover:bg-surface2">
                  <Star size={18} aria-hidden className={s.is_featured ? 'fill-amber text-amber' : 'text-muted'} />
                </button>
              </div>
              {pick(s.quote, lang) && <p className="line-clamp-3 text-[13px] text-text">“{pick(s.quote, lang)}”</p>}
              {s.stats?.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {s.stats.map((x, i) => <Tag key={i} tone="neutral"><b>{x.value}</b>&nbsp;{pick(x.label, lang)}</Tag>)}
                </span>
              )}
              <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                <StatusPill status={s.status} />
                {s.user && <Tag tone={CONSENT_TONE[s.consent_status] ?? 'neutral'}>{t('stories.consent')}: {t(`stories.consent.${s.consent_status}`)}</Tag>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <StoryEditor key={`${editing === 'new' ? 'new' : editing.id}-${session}`} story={editing === 'new' ? null : editing} stories={stories} open={panelOpen} triggerRef={trigger.ref} onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

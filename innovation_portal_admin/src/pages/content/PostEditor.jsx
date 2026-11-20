import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Eye, Globe, Send } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import MultiSelect from '../../components/ui/MultiSelect'
import Modal from '../../components/ui/Modal'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import StatusPill from '../../components/ui/StatusPill'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import PostCover from '../../components/content/PostCover'
import { useI18n, useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { statusWord } from '../../lib/status'
import { POST_TYPES, autosaves, canKeep, fromPost, missingSetswana, postProblems, toPostPayload } from '../../lib/content/posts'
import { usePost, usePostAction, useSubscriberCounts } from '../../lib/queries/websiteContent'

const AUTOSAVE_MS = 1000
const QUICK_TYPES = ['notice', 'event', 'news']
const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const fmt = (value, lang) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}
/** API field errors as { field: message }. */
const apiFieldErrors = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : typeof v === 'string' ? v : '']).filter(([, v]) => v))
}

function TypeChips({ types, value, onChange }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('post.kind')} className="flex flex-wrap gap-2">
      {types.map((x) => (
        <button key={x} type="button" role="radio" aria-checked={value === x} onClick={() => onChange(x)}
          className={cn('h-9 rounded-full border px-4 text-[14px] font-semibold transition-colors', value === x ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:border-muted')}>
          {t(`post.type.${x}`)}
        </button>
      ))}
    </div>
  )
}

function LangSwitch({ lang, onChange }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('lang.label')} className="flex items-center gap-1 rounded-control bg-surface2 p-1">
      <Globe size={14} aria-hidden className="ml-1 text-muted" />
      {['en', 'tn'].map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onChange(l)}
          className={cn('h-7 rounded px-2.5 text-[12px]', lang === l ? 'bg-surface font-bold text-text shadow-sm' : 'text-muted hover:text-text')}>
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  )
}

function PreviewBody({ form, cover, lang }) {
  const pick = (v) => (v?.[lang]?.trim() ? v[lang] : v?.en ?? '')
  return (
    <article className="flex flex-col gap-3">
      {cover?.url && (cover.kind === 'video'
        ? <video src={cover.url} className="aspect-[16/9] w-full rounded-card object-cover" controls preload="metadata" />
        : <img src={cover.url} alt="" className="aspect-[16/9] w-full rounded-card object-cover" />)}
      <h2 className="font-heading text-[24px] font-extrabold text-text">{pick(form.title)}</h2>
      {pick(form.excerpt) && <p className="text-[15px] text-muted">{pick(form.excerpt)}</p>}
      {pick(form.body).split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i} className="whitespace-pre-line text-[15px] text-text">{para}</p>)}
    </article>
  )
}

/** 3.10 News post editor (Figma 20:285 website, 20:508 quick notice). One editor for every post type. */
export default function PostEditor() {
  const t = useT()
  const { lang: uiLang } = useI18n()
  const { id: routeId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const quick = params.get('quick') === '1'
  const startType = POST_TYPES.includes(params.get('type')) ? params.get('type') : quick ? 'notice' : 'news'

  const [createdId, setCreatedId] = useState(null)
  const id = routeId ?? createdId
  const post = usePost(routeId)
  const act = usePostAction()
  const audience = useSubscriberCounts()
  const sectors = useQuery({ queryKey: ['reference', 'sectors'], queryFn: () => client.get('/api/reference/sectors/'), staleTime: 10 * 60 * 1000 })

  const [form, setForm] = useState(routeId ? null : () => fromPost(null, startType))
  const [cover, setCover] = useState(null)
  const [lang, setLang] = useState('en')
  const [saveState, setSaveState] = useState('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [previewing, setPreviewing] = useState(false)
  const lastSaved = useRef(routeId ? null : JSON.stringify(toPostPayload(fromPost(null, startType))))
  const latest = useRef(null)
  const creating = useRef(false)
  const previewTrigger = useRef(null)

  useEffect(() => {
    if (post.data && !form) {
      const f = fromPost(post.data)
      setForm(f)
      setCover(post.data.cover ?? null)
      lastSaved.current = JSON.stringify(toPostPayload(f))
    }
  }, [post.data, form])
  latest.current = form

  const status = post.data?.status ?? (id ? 'draft' : undefined)
  const canAutosave = autosaves(status)
  const payload = useMemo(() => (form ? JSON.stringify(toPostPayload(form)) : null), [form])
  const dirty = !!form && payload !== lastSaved.current
  const problems = form ? postProblems(form) : {}
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setText = (key, value) => setForm((f) => ({ ...f, [key]: { ...f[key], [lang]: value } }))

  const save = useCallback(async (f) => {
    const body = toPostPayload(f)
    const print = JSON.stringify(body)
    setSaveState('saving')
    try {
      if (!id) {
        if (creating.current) return false
        creating.current = true
        const created = await act.mutateAsync({ action: 'create', value: body })
        setCreatedId(created.id)
        navigate(`/content/news/${created.id}${quick ? '?quick=1' : ''}`, { replace: true })
      } else {
        await act.mutateAsync({ action: 'update', id, value: body })
      }
      lastSaved.current = print
      setFieldErrors({})
      setSaveState('saved')
      return true
    } catch (err) {
      if (err?.status === 400) {
        setFieldErrors(apiFieldErrors(err))
        setSaveState('rejected')
        setSaveMessage(apiMessage(err))
        lastSaved.current = print
      } else {
        setSaveState('failed')
      }
      return false
    } finally {
      creating.current = false
    }
  }, [act, id, navigate, quick])

  // Drafts autosave once they have a title and summary (the API needs both); sent, scheduled and live posts save only on purpose.
  useEffect(() => {
    if (!form || !dirty || !canAutosave || !canKeep(form)) return
    const timer = setTimeout(() => save(form), saveState === 'failed' ? 5000 : AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [form, dirty, canAutosave, save, saveState])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      const f = latest.current
      if (f && JSON.stringify(toPostPayload(f)) !== lastSaved.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  async function saveLive() {
    const word = t(statusWord(status).labelKey).toLowerCase()
    const ok = await confirm({ title: t('post.saveLiveTitle', { status: word }), body: t('post.saveLiveBody'), confirmLabel: t('post.saveChanges'), tone: 'primary' })
    if (!ok) return
    if (await save(form)) toast.show({ tone: 'success', title: t('post.savedChanges') })
  }

  async function send() {
    setShowProblems(true)
    if (Object.keys(problems).length) {
      toast.show({ tone: 'error', title: t('post.fixFirst') })
      return
    }
    if ((dirty || !id) && !(await save(form))) {
      toast.show({ tone: 'error', title: t('post.fixFirst') })
      return
    }
    const postId = id ?? createdId
    const when = form.publish_at ? t('post.sendWhen', { date: fmt(form.publish_at, uiLang) }) : ''
    const ok = await confirm({ title: t('post.sendTitle'), body: t('post.sendBody', { when }), confirmLabel: form.publish_at ? t('post.schedule') : t('post.send'), tone: 'primary' })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'submit', id: postId, value: form.publish_at ? new Date(form.publish_at).toISOString() : null })
      toast.show({ tone: 'success', title: t('post.sent') })
      navigate('/content/news')
    } catch (err) {
      setFieldErrors(apiFieldErrors(err))
      toast.show({ tone: 'error', title: t('news.failed', { message: apiMessage(err) }) })
    }
  }

  async function sendNow() {
    const ok = await confirm({
      title: t('news.sendTitle', { title: form.title.en }),
      body: t('news.sendBody', { email: audience.data?.email ?? 0, whatsapp: audience.data?.whatsapp ?? 0 }),
      confirmLabel: t('news.send'), tone: 'primary',
    })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'blast', id })
      toast.show({ tone: 'success', title: t('news.sent') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('news.failed', { message: apiMessage(err) }) })
    }
  }

  if (routeId && post.isError) return <ErrorState title={t('post.loadError')} onRetry={() => post.refetch()} />
  if (!form) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3"><Skeleton className="h-9 w-80" /><Skeleton className="h-14" /><Skeleton className="h-48 rounded-card" /><Skeleton className="h-40 rounded-card" /></div>
        <Skeleton className="h-96 rounded-card" />
      </div>
    )
  }

  const err = (key) => fieldErrors[key] || (showProblems && problems[key] ? t(problems[key]) : undefined)
  const englishHint = (key) => (lang === 'tn' && form[key].en ? `${t('lang.en')}: ${form[key].en}` : undefined)
  const missing = missingSetswana(form)
  const live = status === 'published' || status === 'scheduled'
  const waiting = status === 'pending_approval'
  const statusText =
    saveState === 'saving' ? t('post.saving')
    : !canAutosave && dirty ? t('post.unsaved')
    : saveState === 'saved' && !dirty ? t('post.saved')
    : saveState === 'failed' ? t('post.saveFailed')
    : saveState === 'rejected' ? t('post.saveRejected', { message: saveMessage })
    : !id ? t('post.startTyping')
    : ''
  const sectorOptions = [...new Set([...list(sectors.data).map((s) => s.name), ...form.tags])].map((name) => ({ value: name, label: name }))
  const title = quick ? t('post.quickTitle') : id ? t('post.editTitle') : t('post.newTitle')

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {statusText && (
        <span role="status" className={cn('inline-flex items-center gap-1 text-[12px]', saveState === 'failed' || saveState === 'rejected' ? 'text-danger' : 'text-muted')}>
          {saveState === 'saved' && !dirty && <Check size={14} aria-hidden className="text-success" />}
          {statusText}
        </span>
      )}
      {!quick && <Button ref={previewTrigger} variant="secondary" icon={<Eye size={15} aria-hidden />} onClick={() => setPreviewing(true)} disabled={!form.title.en.trim()}>{t('post.preview')}</Button>}
      {live ? (
        <Button onClick={saveLive} loading={act.isPending} disabled={!dirty}>{t('post.saveChanges')}</Button>
      ) : (
        <Button onClick={send} loading={act.isPending} disabled={waiting} icon={<Send size={15} aria-hidden />}>{form.publish_at ? t('post.schedule') : t('post.send')}</Button>
      )}
    </div>
  )

  const textFields = (
    <>
      <Input label={t('post.title')} value={form.title[lang]} onChange={(e) => setText('title', e.target.value)} maxLength={255} required={lang === 'en'}
        placeholder={t('post.titlePlaceholder')} hint={englishHint('title')} error={err('title')} className={quick ? undefined : 'h-12 text-[20px] font-bold'} />
      {quick ? (
        <Textarea label={t('post.message')} value={form.excerpt[lang]} onChange={(e) => setText('excerpt', e.target.value)} rows={4} maxChars={500} hint={englishHint('excerpt')} error={err('excerpt')} required={lang === 'en'} />
      ) : (
        <Textarea label={t('post.summary')} value={form.excerpt[lang]} onChange={(e) => setText('excerpt', e.target.value)} rows={2} maxChars={500} hint={englishHint('excerpt') ?? t('post.summaryHint')} error={err('excerpt')} required={lang === 'en'} />
      )}
    </>
  )

  const eventFields = form.type === 'event' && (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input type="datetime-local" label={t('post.eventDate')} value={form.event_starts_at} onChange={(e) => set({ event_starts_at: e.target.value })} required error={err('event_starts_at')} />
      <Input label={t('post.eventPlace')} value={form.event_place} onChange={(e) => set({ event_place: e.target.value })} maxLength={200} required error={err('event_place')} />
    </div>
  )

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted">
        <Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / <Link to="/content/news" className="hover:underline">{t('news.title')}</Link> / {title}
      </p>
      <PageHeader title={title} actions={actions} />

      {live && <p className="mb-4 rounded-card bg-warning-soft px-4 py-3 text-[13px] text-text">{t('post.liveWarning', { status: t(statusWord(status).labelKey).toLowerCase() })}</p>}
      {waiting && post.data?.approval && <p className="mb-4 rounded-card bg-warning-soft px-4 py-3 text-[13px] text-text">{t('post.waitingSince', { date: fmt(post.data.approval.requested_at, uiLang) })}</p>}

      {quick ? (
        <div className="flex max-w-xl flex-col gap-4">
          <TypeChips types={QUICK_TYPES} value={form.type} onChange={(type) => set({ type })} />
          <div className="self-start"><LangSwitch lang={lang} onChange={setLang} /></div>
          {textFields}
          {eventFields}
          <Toggle label={t('post.markNew')} description={t('post.markNewHint')} checked={form.mark_new} onChange={(v) => set({ mark_new: v })} />
          <p className="text-[12px] text-muted">{t('post.sendLater')} {audience.data && t('post.audience', { whatsapp: audience.data.whatsapp ?? 0, email: audience.data.email ?? 0 })}</p>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TypeChips types={POST_TYPES} value={form.type} onChange={(type) => set({ type })} />
              <LangSwitch lang={lang} onChange={setLang} />
            </div>
            {missing.length > 0 && (
              <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-[12px] text-text">
                <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                {t('post.missingTn', { fields: missing.map((k) => t(k === 'excerpt' ? 'post.summary' : k === 'body' ? 'post.body' : 'post.title')).join(', ') })}
              </p>
            )}
            {textFields}
            <PostCover cover={cover} altText={form.title.en} onChange={(asset) => { setCover(asset); set({ cover_id: asset?.id ?? null }) }} />
            {eventFields}
            {form.type === 'newsletter' && (
              <Input type="number" inputMode="numeric" min={1} label={t('post.issue')} value={form.newsletter_issue} onChange={(e) => set({ newsletter_issue: e.target.value })} required error={err('newsletter_issue')} className="max-w-40" />
            )}
            <Textarea label={t('post.body')} hint={englishHint('body') ?? t('post.bodyHint')} value={form.body[lang]} onChange={(e) => setText('body', e.target.value)} rows={12} error={err('body')} />
          </div>

          <aside className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4" aria-labelledby="post-publishing">
            <h2 id="post-publishing" className="font-heading text-[17px] font-bold text-text">{t('post.publishing')}</h2>
            {status && <p className="flex items-center gap-2 text-[13px] text-muted">{t('post.status')}: <StatusPill status={status} /></p>}
            <Toggle label={t('post.showFlash')} description={t('post.showFlashHint')} checked={form.show_in_news_flash} onChange={(v) => set({ show_in_news_flash: v })} />
            <Toggle label={t('post.showBulletin')} checked={form.show_on_bulletin} onChange={(v) => set({ show_on_bulletin: v })} />
            <Toggle label={t('post.pin')} description={form.pinned_until ? t('post.pinUntil', { date: fmt(form.pinned_until, uiLang) }) : undefined}
              checked={!!form.pinned_until} onChange={(v) => {
                const week = new Date(Date.now() + 7 * 864e5)
                const pad = (n) => String(n).padStart(2, '0')
                set({ pinned_until: v ? `${week.getFullYear()}-${pad(week.getMonth() + 1)}-${pad(week.getDate())}T08:00` : '' })
              }} />
            {form.pinned_until && <Input type="datetime-local" label={t('post.pinWhen')} value={form.pinned_until} onChange={(e) => set({ pinned_until: e.target.value })} error={err('pinned_until')} />}
            <Toggle label={t('post.markNew')} description={t('post.markNewHint')} checked={form.mark_new} onChange={(v) => set({ mark_new: v })} />
            <div className="flex flex-col gap-1 rounded-control bg-surface2 px-3 py-2.5">
              <p className="text-[13px] font-bold text-text">{t('post.subscribers')}</p>
              <p className="text-[12px] text-muted">{audience.data ? t('post.audience', { whatsapp: audience.data.whatsapp ?? 0, email: audience.data.email ?? 0 }) : ' '}</p>
              {/* TODO(R-29): a "send when it goes live" switch once the API can remember it. */}
              {status === 'published'
                ? <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={sendNow}>{t('post.sendNow')}</Button>
                : <p className="text-[12px] text-muted">{t('post.sendLater')}</p>}
            </div>
            <MultiSelect label={t('post.tags')} hint={t('post.tagsHint')} options={sectorOptions} value={form.tags} onChange={(v) => set({ tags: v })} />
            <Input type="datetime-local" label={t('post.publishOn')} hint={t('post.publishOnHint')} value={form.publish_at} onChange={(e) => set({ publish_at: e.target.value })} error={err('publish_at')} />
            <Input type="datetime-local" label={t('post.takeDown')} hint={t('post.takeDownHint')} value={form.unpublish_at} onChange={(e) => set({ unpublish_at: e.target.value })} error={err('unpublish_at')} optional />
            <div className="rounded-control bg-surface2 px-3 py-2.5">
              <p className="text-[12px] text-muted">{t('post.approval')}</p>
              <p className="text-[13px] font-semibold text-text">{t('post.approvalNote')}</p>
            </div>
          </aside>
        </div>
      )}

      <Modal open={previewing} onClose={() => setPreviewing(false)} triggerRef={previewTrigger} title={t('post.previewTitle')} description={t('post.previewNote')} size="lg">
        <PreviewBody form={form} cover={cover} lang={lang} />
      </Modal>
    </div>
  )
}

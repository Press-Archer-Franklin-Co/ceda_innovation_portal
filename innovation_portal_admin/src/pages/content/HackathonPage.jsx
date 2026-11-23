import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Sparkles, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input, { InputControl } from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import { SelectControl } from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { Toggle } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/forms/format'
import { useActiveHackathon } from '../../lib/queries/hackathon'
import { usePartners } from '../../lib/queries/websiteContent'
import { useProgram } from '../../lib/queries/programs'
import { currentRow, incompleteRows, scheduleItems, scheduleRows } from '../../lib/content/hackathonSchedule'

// 3.36 Hackathon page editor (Figma 141:1859 website, 141:2141 phone). In the menu only while a hackathon is on.
// ① Sections like the home page editor: switch on, reorder. ② Schedule with times; the public page highlights what is
// happening now. ③ Prizes and sponsors from Partners (3.13). ④ Live updates post as short notices with an optional
// photo. Changes go through approvals.
// The schedule is the live page's schedule_items: a change goes to approvals and visitors see it once approved.
// Prizes, FAQs and banner text still save directly, and the page says so.
// Phone: post live updates from the venue (the updates card comes first).

const SECTIONS = ['banner', 'schedule', 'venue', 'prizes', 'teams', 'updates', 'faqs']
const PLACES = ['1st', '2nd', '3rd']
const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function toDraft(p, doc) {
  return {
    theme: p?.theme ?? '',
    description: p?.description ?? '',
    is_published: !!p?.is_published,
    sections: SECTIONS.map((key, i) => {
      const s = (p?.sections ?? []).find((x) => x.key === key)
      return { key, enabled: s ? !!s.enabled : true, order: s?.order ?? i }
    }).sort((a, b) => a.order - b.order),
    schedule: scheduleRows(doc?.draft?.schedule_items, p?.schedule),
    prizes: (p?.prizes ?? []).map((x) => ({ position: x.position ?? '', label: x.label ?? '', amount: x.amount ?? '', description: x.description ?? '', sponsor_partner_id: x.sponsor_partner_id ?? '', sponsor: x.sponsor ?? '' })),
    faq: (p?.faq ?? []).map((x) => ({ question: x.question ?? '', answer: x.answer ?? '' })),
  }
}

function Panel({ id, title, action, children, className }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('scroll-mt-4 rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="text-[16px] font-bold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function LiveUpdates({ pageId }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const triggerRef = useRef(null)
  const fileRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState({ en: '', tn: '' })
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const updates = useQuery({
    queryKey: ['content', 'hackathons', pageId, 'updates'],
    enabled: !!pageId,
    queryFn: async () => {
      try {
        return { rows: asList(await client.get(`/api/content/hackathons/${pageId}/updates/`)) }
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true, rows: [] }
        throw err
      }
    },
  })
  const unavailable = updates.data?.unavailable

  async function post() {
    if (!body.en.trim()) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('body', JSON.stringify({ en: body.en.trim(), tn: body.tn.trim() }))
      if (photo) form.append('photo', photo)
      await client.post(`/api/content/hackathons/${pageId}/updates/`, form)
      qc.invalidateQueries({ queryKey: ['content', 'hackathons', pageId, 'updates'] })
      toast.show({ tone: 'success', title: t('hk.posted') })
      setOpen(false); setBody({ en: '', tn: '' }); setPhoto(null)
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      id="hk-updates"
      title={t('hk.section.updates')}
      className="order-first lg:order-none"
      action={!unavailable && <Button ref={triggerRef} variant="link" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setOpen(true)}>{t('hk.postUpdate')}</Button>}
    >
      {updates.isLoading ? <Skeleton className="h-12" /> : unavailable ? (
        <p className="text-[13px] text-muted">{t('hk.updatesSoon')}</p>
      ) : updates.data.rows.length === 0 ? (
        <p className="text-[13px] text-muted">{t('hk.noUpdates')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {updates.data.rows.map((u) => (
            <li key={u.id} className="text-[14px] text-text"><span className="text-muted">{relativeTime(u.created_at, t)} · </span>{u.body?.en ?? u.body}</li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} title={t('hk.postUpdate')} description={t('hk.postHint')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button onClick={post} loading={busy} disabled={!body.en.trim()}>{t('hk.post')}</Button></>}>
        <div className="flex flex-col gap-3">
          <Textarea label={t('hk.updateEn')} required rows={3} maxChars={280} value={body.en} onChange={(e) => setBody((b) => ({ ...b, en: e.target.value }))} />
          <Textarea label={t('hk.updateTn')} optional rows={3} maxChars={280} value={body.tn} onChange={(e) => setBody((b) => ({ ...b, tn: e.target.value }))} />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" size="sm" className="self-start" icon={<ImagePlus size={14} aria-hidden />} onClick={() => fileRef.current?.click()}>{photo ? photo.name : t('hk.addPhoto')}</Button>
        </div>
      </Modal>
    </Panel>
  )
}

export default function HackathonPage() {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const { id: routeId } = useParams()
  const active = useActiveHackathon(!routeId)
  const id = routeId ?? active.data?.id
  const page = useQuery({ queryKey: ['content', 'hackathons', id], enabled: !!id, queryFn: () => client.get(`/api/content/hackathons/${id}/`) })
  const pageDoc = useQuery({ queryKey: ['content', 'hackathons', id, 'page'], enabled: !!id, queryFn: () => client.get(`/api/content/hackathons/${id}/page/`) })
  const partners = usePartners()
  const program = useProgram(page.data?.program)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState('schedule')
  const [scheduleError, setScheduleError] = useState(false)

  useEffect(() => { if (page.data && pageDoc.data) setDraft(toDraft(page.data, pageDoc.data)) }, [page.data, pageDoc.data])
  useEffect(() => { document.title = `${t('hk.title')} · CEDA Innovation` }, [t])
  const base = useMemo(() => (page.data && pageDoc.data ? JSON.stringify(toDraft(page.data, pageDoc.data)) : ''), [page.data, pageDoc.data])

  const header = (actions) => (
    <PageHeader back={<span className="text-[12px] text-muted">{t('hk.crumb')}</span>} title={t('hk.title')} subtitle={page.data?.program_title ? t('hk.subtitleFor', { name: page.data.program_title }) : t('hk.subtitle')} actions={actions} />
  )

  if (!routeId && active.isLoading) return <div className="flex flex-col gap-3">{header()}<Skeleton className="h-[480px] rounded-card" /></div>
  if (!id) return <div className="flex flex-col gap-3">{header()}<EmptyState framed icon={Sparkles} title={t('hk.none')} message={t('hk.noneBody')} action={<Link to="/programs" className="text-[14px] font-bold text-primary hover:underline">{t('hk.toChallenges')}</Link>} /></div>
  if (page.isError || pageDoc.isError) return <div className="flex flex-col gap-3">{header()}<ErrorState framed title={t('hk.loadError')} message={(page.error ?? pageDoc.error)?.message} onRetry={() => { page.refetch(); pageDoc.refetch() }} /></div>
  if (page.isLoading || pageDoc.isLoading || !draft) return <div className="flex flex-col gap-3">{header()}<Skeleton className="h-[480px] rounded-card" /></div>

  const changed = JSON.stringify(draft) !== base
  const hasSections = Array.isArray(page.data.sections)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setItem = (key, i, patch) => set({ [key]: draft[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const removeItem = (key, i) => set({ [key]: draft[key].filter((_, j) => j !== i) })
  const moveSection = (i, by) => { const next = [...draft.sections]; const [it] = next.splice(i, 1); next.splice(i + by, 0, it); set({ sections: next.map((s, j) => ({ ...s, order: j })) }) }
  const partnerOptions = [{ value: '', label: t('hk.noSponsor') }, ...(partners.data ?? []).map((p) => ({ value: String(p.id), label: p.name }))]
  const live = currentRow(draft.schedule)
  const savedSchedule = JSON.stringify(JSON.parse(base).schedule)
  const missing = scheduleError ? incompleteRows(draft.schedule) : []
  // The public hackathon page is the challenge's own page now (1.8).
  const publicUrl = program.data?.slug ? `${window.location.origin}/challenges/${program.data.slug}` : null

  async function save() {
    const scheduleChanged = JSON.stringify(draft.schedule) !== savedSchedule
    if (scheduleChanged && incompleteRows(draft.schedule).length) {
      setScheduleError(true)
      go('schedule')
      return
    }
    setScheduleError(false)
    setBusy(true)
    try {
      const form = new FormData()
      form.append('program', page.data.program)
      form.append('theme', draft.theme)
      form.append('description', draft.description)
      form.append('is_published', draft.is_published ? 'true' : 'false')
      form.append('prizes', JSON.stringify(draft.prizes.map((p) => ({ ...p, sponsor: partners.data?.find((x) => String(x.id) === p.sponsor_partner_id)?.name ?? '' }))))
      form.append('faq', JSON.stringify(draft.faq))
      if (hasSections) form.append('sections', JSON.stringify(draft.sections))
      await client.patch(`/api/content/hackathons/${id}/`, form)
      if (scheduleChanged) {
        await client.put(`/api/content/hackathons/${id}/page/`, { schedule_items: scheduleItems(draft.schedule) })
        await client.post(`/api/content/hackathons/${id}/page/submit/`)
      }
      qc.invalidateQueries({ queryKey: ['content', 'hackathons'] })
      toast.show({ tone: 'success', title: t(scheduleChanged ? 'hk.sentForApproval' : 'hk.saved') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    } finally {
      setBusy(false)
    }
  }

  const go = (key) => {
    setCurrent(key)
    document.getElementById(`hk-${key}`)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      {header(
        <div className="flex flex-wrap items-center gap-3">
          {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[14px] font-bold text-primary hover:underline">{t('hk.preview')}</a>}
          <Button onClick={save} loading={busy} disabled={!changed}>{t('hk.save')}</Button>
        </div>,
      )}
      <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">
        {t('hk.directNote')}
        {pageDoc.data?.pending_approval_id && <> <Link to="/content/approvals" className="font-bold text-primary hover:underline">{t('hk.pendingApproval')}</Link></>}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label={t('hk.sections')} className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[16px] font-bold text-text">{t('hk.sections')}</h2>
          <ol className="flex flex-col gap-2">
            {draft.sections.map((s, i) => (
              <li key={s.key} className={cn('flex items-center gap-2 rounded-control border bg-surface px-2 py-1.5', current === s.key ? 'border-primary' : 'border-border')}>
                <span className="flex flex-col">
                  <button type="button" className="btn-icon h-4 w-6" disabled={i === 0 || !hasSections} aria-label={t('hk.moveUp', { name: t(`hk.section.${s.key}`) })} onClick={() => moveSection(i, -1)}><ArrowUp size={12} aria-hidden /></button>
                  <button type="button" className="btn-icon h-4 w-6" disabled={i === draft.sections.length - 1 || !hasSections} aria-label={t('hk.moveDown', { name: t(`hk.section.${s.key}`) })} onClick={() => moveSection(i, 1)}><ArrowDown size={12} aria-hidden /></button>
                </span>
                <button type="button" onClick={() => go(s.key)} className="min-w-0 flex-1 text-left text-[14px] font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t(`hk.section.${s.key}`)}</button>
                <Toggle label={<span className="sr-only">{t('hk.showSection', { name: t(`hk.section.${s.key}`) })}</span>} checked={s.enabled} disabled={!hasSections} onChange={(v) => set({ sections: draft.sections.map((x) => (x.key === s.key ? { ...x, enabled: v } : x)) })} />
              </li>
            ))}
          </ol>
          {!hasSections && <p className="text-[12px] text-muted">{t('hk.sectionsSoon')}</p>}
          <Toggle label={t('hk.onWebsite')} description={t('hk.onWebsiteHint')} checked={draft.is_published} onChange={(v) => set({ is_published: v })} />
        </nav>

        <div className="flex min-w-0 flex-col gap-[14px]">
          <LiveUpdates pageId={id} />

          <Panel id="hk-banner" title={t('hk.section.banner')}>
            <div className="flex flex-col gap-3">
              <Input label={t('hk.theme')} value={draft.theme} onChange={(e) => set({ theme: e.target.value })} maxLength={255} />
              <Textarea label={t('hk.description')} rows={4} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
              {page.data.program_info?.closes_at && <p className="text-[12px] text-muted">{t('hk.countdown', { date: new Date(page.data.program_info.closes_at).toLocaleString('en-BW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>}
            </div>
          </Panel>

          <Panel id="hk-schedule" title={t('hk.section.schedule')} action={<Button variant="link" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => set({ schedule: [...draft.schedule, { id: '', date: draft.schedule.at(-1)?.date ?? '', time: '', label: '', label_tn: '' }] })}>{t('hk.addItem')}</Button>}>
            {draft.schedule.length === 0 ? <p className="text-[13px] text-muted">{t('hk.noSchedule')}</p> : (
              <ul className="flex flex-col gap-2">
                {draft.schedule.map((s, i) => (
                  <li key={i} className={cn('grid grid-cols-[1fr_96px_auto] items-center gap-2 rounded-control p-2 md:grid-cols-[150px_96px_minmax(0,1fr)_auto]', i === live ? 'bg-accent-soft' : '')}>
                    <InputControl type="date" aria-label={t('hk.date')} invalid={missing.includes(i) && !s.date} value={s.date} onChange={(e) => setItem('schedule', i, { date: e.target.value })} />
                    <InputControl type="time" aria-label={t('hk.time')} invalid={missing.includes(i) && !s.time} value={s.time} onChange={(e) => setItem('schedule', i, { time: e.target.value })} />
                    <span className="flex min-w-0 items-center gap-2 max-md:col-span-3 max-md:row-start-2 max-md:flex-col max-md:items-stretch">
                      <span className="min-w-0 flex-1"><InputControl aria-label={t('hk.what')} placeholder={t('hk.what')} maxLength={200} invalid={missing.includes(i) && !s.label.trim()} value={s.label} onChange={(e) => setItem('schedule', i, { label: e.target.value })} /></span>
                      <span className="min-w-0 flex-1"><InputControl aria-label={t('hk.whatTn')} placeholder={t('hk.whatTn')} maxLength={200} value={s.label_tn} onChange={(e) => setItem('schedule', i, { label_tn: e.target.value })} /></span>
                      {i === live && <span className="shrink-0 text-[12px] font-bold text-accent">{t('hk.now')}</span>}
                    </span>
                    <button type="button" className="btn-icon" aria-label={t('hk.removeItem')} onClick={() => removeItem('schedule', i)}><Trash2 size={14} aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
            {missing.length > 0 && <p role="alert" className="mt-2 text-[13px] font-bold text-danger">{t('hk.scheduleIncomplete')}</p>}
          </Panel>

          <Panel id="hk-venue" title={t('hk.section.venue')}>
            <p className="text-[13px] text-muted">{t('hk.venueSoon')}</p>
          </Panel>

          <Panel id="hk-prizes" title={t('hk.section.prizes')} action={<Button variant="link" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => set({ prizes: [...draft.prizes, { position: PLACES[draft.prizes.length] ?? '', label: '', amount: '', description: '', sponsor_partner_id: '', sponsor: '' }] })}>{t('hk.addPrize')}</Button>}>
            {draft.prizes.length === 0 ? <p className="text-[13px] text-muted">{t('hk.noPrizes')}</p> : (
              <ul className="grid gap-3 md:grid-cols-3">
                {draft.prizes.map((p, i) => (
                  <li key={i} className="flex flex-col gap-2 rounded-card bg-surface2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <InputControl aria-label={t('hk.place')} value={p.position} onChange={(e) => setItem('prizes', i, { position: e.target.value })} className="w-24" />
                      <button type="button" className="btn-icon" aria-label={t('hk.removePrize')} onClick={() => removeItem('prizes', i)}><Trash2 size={14} aria-hidden /></button>
                    </div>
                    <InputControl aria-label={t('hk.prize')} placeholder={t('hk.prizePlaceholder')} value={p.amount} onChange={(e) => setItem('prizes', i, { amount: e.target.value })} />
                    <SelectControl aria-label={t('hk.sponsor')} options={partnerOptions} value={p.sponsor_partner_id ? String(p.sponsor_partner_id) : ''} onChange={(v) => setItem('prizes', i, { sponsor_partner_id: v })} />
                  </li>
                ))}
              </ul>
            )}
            <Link to="/content/partners" className="mt-3 inline-block text-[13px] font-bold text-primary hover:underline">{t('hk.managePartners')}</Link>
          </Panel>

          <Panel id="hk-teams" title={t('hk.section.teams')}>
            <p className="text-[13px] text-muted">{t('hk.teamsNote')}</p>
          </Panel>

          <Panel id="hk-faqs" title={t('hk.section.faqs')} action={<Button variant="link" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => set({ faq: [...draft.faq, { question: '', answer: '' }] })}>{t('hk.addFaq')}</Button>}>
            {draft.faq.length === 0 ? <p className="text-[13px] text-muted">{t('hk.noFaqs')}</p> : (
              <ul className="flex flex-col gap-3">
                {draft.faq.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2">
                      <InputControl aria-label={t('hk.question')} placeholder={t('hk.question')} value={f.question} onChange={(e) => setItem('faq', i, { question: e.target.value })} />
                      <Textarea label={t('hk.answer')} hideLabel rows={2} value={f.answer} onChange={(e) => setItem('faq', i, { answer: e.target.value })} />
                    </div>
                    <button type="button" className="btn-icon mt-1" aria-label={t('hk.removeFaq')} onClick={() => removeItem('faq', i)}><Trash2 size={14} aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

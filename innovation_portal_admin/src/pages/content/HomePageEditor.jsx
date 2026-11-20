import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, Clock, Eye, Globe, Monitor, Smartphone } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { Radio } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import SectionList from '../../components/content/home/SectionList'
import { useSectionName } from '../../components/content/home/useSectionName'
import SectionSettings from '../../components/content/home/SectionSettings'
import HomePreview from '../../components/content/home/HomePreview'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import {
  addSection, adoptIds, errorsBySection, fromDraft, isFixed, lastPublished, localize, moveSection, removeSection, setSetting, toPayload, toggleSection,
} from '../../lib/content/home'
import {
  useApprovals, useDecideApproval, useHomeDraft, useHomePreview, useSaveHomeDraft, useSectionTypes, useSubmitHome,
} from '../../lib/queries/websiteContent'

const AUTOSAVE_MS = 1000
const fingerprint = (sections) => JSON.stringify(sections.map((s) => [s._key, s.type, s.enabled, s.settings]))

function formatDate(value, lang, withTime = false) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

function apiErrors(err) {
  const data = err?.data ?? {}
  const list = data.errors?.errors ?? data.errors ?? data.data?.errors ?? []
  return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object') : []
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

function DeviceSwitch({ device, onChange }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('home.livePreview')} className="flex items-center gap-1 rounded-control bg-surface2 p-1">
      {[['desktop', Monitor], ['phone', Smartphone]].map(([d, Icon]) => (
        <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={t(`home.${d}`)} title={t(`home.${d}`)} onClick={() => onChange(d)}
          className={cn('flex h-7 w-8 items-center justify-center rounded', device === d ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}>
          <Icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  )
}

/** "Go live: when approved / at a time" (Figma 3.8). value: { at: '' | 'YYYY-MM-DDTHH:mm' } */
function GoLive({ value, onChange }) {
  const t = useT()
  const { lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(value.at ? 'at' : 'approved')
  const [at, setAt] = useState(value.at)
  const trigger = useRef(null)
  const past = mode === 'at' && at && new Date(at) <= new Date()
  const done = () => {
    if (mode === 'at' && (!at || past)) return
    onChange({ at: mode === 'at' ? at : '' })
    setOpen(false)
  }
  return (
    <>
      <div className="flex items-center gap-2 rounded-card bg-surface2 px-3 py-2.5">
        <CalendarClock size={16} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-text">
          {t('home.goLive')}: {value.at ? t('home.atTime', { date: formatDate(value.at, lang, true) }) : t('home.whenApproved')}
        </span>
        <button ref={trigger} type="button" onClick={() => { setMode(value.at ? 'at' : 'approved'); setAt(value.at); setOpen(true) }} className="text-[13px] font-semibold text-primary hover:underline">
          {t('home.change')}
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} triggerRef={trigger} title={t('home.goLiveTitle')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button onClick={done} disabled={mode === 'at' && (!at || past)}>{t('home.done')}</Button></>}>
        <div className="flex flex-col gap-3">
          <Radio name="golive" label={t('home.goLiveApproved')} checked={mode === 'approved'} onChange={() => setMode('approved')} />
          <Radio name="golive" label={t('home.goLiveAt')} checked={mode === 'at'} onChange={() => setMode('at')} />
          {mode === 'at' && (
            <Input type="datetime-local" label={t('home.goLiveWhen')} value={at} onChange={(e) => setAt(e.target.value)} error={past ? t('home.goLivePast') : undefined} />
          )}
        </div>
      </Modal>
    </>
  )
}

/** The waiting change, with Approve and Send back for people the API says can decide. */
function Waiting({ approval }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const decide = useDecideApproval()
  const [sendingBack, setSendingBack] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const trigger = useRef(null)
  if (!approval) return null
  const when = approval.publish_at ? t('home.sendWhen', { date: formatDate(approval.publish_at, lang, true) }) : ''
  const run = async (approve) => {
    if (!approve && !reason.trim()) {
      setReasonError(t('home.sendBackNeedReason'))
      return
    }
    try {
      await decide.mutateAsync({ id: approval.id, approve, comment: approve ? '' : reason.trim() })
      toast.show({ tone: 'success', title: approve ? t('home.approved') : t('home.sentBack', { name: approval.requested_by ?? '' }) })
      setSendingBack(false)
      setReason('')
    } catch (err) {
      toast.show({ tone: 'danger', title: err?.message ?? '' })
    }
  }
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
      <Clock size={16} aria-hidden className="hidden shrink-0 text-warning sm:block" />
      <div className="min-w-0 flex-1 text-[13px] text-text">
        <p className="font-bold">{t('home.waiting')}</p>
        <p className="text-muted">{t('home.waitingBy', { name: approval.requested_by ?? '', date: formatDate(approval.requested_at, lang, true), when })} {t('home.waitingNote')}</p>
      </div>
      {approval.can_decide && (
        <div className="flex shrink-0 gap-2">
          <Button ref={trigger} variant="secondary" size="sm" onClick={() => setSendingBack(true)}>{t('home.sendBack')}</Button>
          <Button size="sm" icon={<Check size={14} aria-hidden />} loading={decide.isPending && !sendingBack} onClick={() => run(true)}>{t('home.approve')}</Button>
        </div>
      )}
      <Modal open={sendingBack} onClose={() => setSendingBack(false)} triggerRef={trigger} title={t('home.sendBackTitle')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setSendingBack(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={decide.isPending} onClick={() => run(false)}>{t('home.sendBack')}</Button></>}>
        <Textarea label={t('home.sendBackReason')} hint={t('home.sendBackReasonHint')} value={reason} rows={4} error={reasonError || undefined}
          onChange={(e) => { setReason(e.target.value); setReasonError('') }} required />
      </Modal>
    </div>
  )
}

/** 3.8 Home page editor (Figma 19:480 website, 19:1339 phone). */
export default function HomePageEditor() {
  const t = useT()
  const { lang: uiLang } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const sectionName = useSectionName()
  const types = useSectionTypes()
  const draft = useHomeDraft()
  const save = useSaveHomeDraft()
  const submit = useSubmitHome()
  const pending = useApprovals('pending')
  const approved = useApprovals('approved')
  const rejected = useApprovals('rejected')

  const [sections, setSections] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [lang, setLang] = useState('en')
  const [device, setDevice] = useState('desktop')
  const [saveState, setSaveState] = useState('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [goLive, setGoLive] = useState({ at: '' })
  const [adding, setAdding] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const lastSaved = useRef(null)
  const latest = useRef(null)
  const addTrigger = useRef(null)
  const previewTrigger = useRef(null)
  const preview = useHomePreview(lang, draft.isSuccess)
  const typeList = useMemo(() => types.data ?? [], [types.data])

  // Start from the server's draft once.
  useEffect(() => {
    if (draft.data && !sections) {
      const list = fromDraft(draft.data.sections ?? [])
      setSections(list)
      setSelectedKey(list[0]?._key ?? null)
      lastSaved.current = fingerprint(list)
    }
  }, [draft.data, sections])
  latest.current = sections

  const dirty = !!sections && fingerprint(sections) !== lastSaved.current

  const runSave = useCallback(async (list) => {
    const print = fingerprint(list)
    setSaveState('saving')
    try {
      const saved = await save.mutateAsync(toPayload(list))
      lastSaved.current = print
      setSections((now) => (now ? adoptIds(now, list.map((s) => s._key), saved?.sections) : now))
      setErrors({})
      setSaveState('saved')
      setSaveMessage('')
      return true
    } catch (err) {
      const found = apiErrors(err)
      if (err?.status === 400 && found.length) {
        const byIndex = errorsBySection(found)
        // Errors come by position in what was sent; keep them on those sections even if they move.
        setErrors(Object.fromEntries(Object.entries(byIndex).map(([k, v]) => [k === 'page' ? 'page' : list[Number(k)]?._key ?? 'page', v])))
        setSaveState('rejected')
        setSaveMessage(found[0]?.message ?? err.message)
        lastSaved.current = print // do not resend the same thing until it changes
      } else {
        setSaveState('failed')
      }
      return false
    }
  }, [save])

  // Autosave a moment after the last change.
  useEffect(() => {
    if (!sections || !dirty) return
    const timer = setTimeout(() => runSave(sections), saveState === 'failed' ? 5000 : AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [sections, dirty, runSave, saveState])

  // Warn before closing the tab with unsaved changes, and save on the way out of the page.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (latest.current && fingerprint(latest.current) !== lastSaved.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => {
    const list = latest.current
    if (list && fingerprint(list) !== lastSaved.current) saveRef.current.mutate(toPayload(list))
  }, [])

  const update = (fn) => setSections((prev) => (prev ? fn(prev) : prev))
  const selected = sections?.find((s) => s._key === selectedKey) ?? null

  // What the preview shows: the local draft in one language, with each section's data from the last save.
  const dataById = useMemo(() => Object.fromEntries((preview.data?.sections ?? []).filter((s) => s.id).map((s) => [String(s.id), s.data])), [preview.data])
  const previewSections = useMemo(
    () => (sections ?? []).filter((s) => s.enabled).map((s) => ({ id: s.id ?? s._key, type: s.type, settings: localize(s.settings ?? {}, lang), data: (s.id && dataById[s.id]) ?? null })),
    [sections, lang, dataById],
  )

  const waiting = (pending.data ?? []).find((a) => a.target_type === 'page' && a.status === 'pending') ?? null
  const published = lastPublished(approved.data ?? [])
  const sentBack = useMemo(() => {
    const last = (rejected.data ?? []).filter((a) => a.target_type === 'page').sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1))[0]
    return last && (!published || last.decided_at > published.decided_at) && (!waiting || last.decided_at > waiting.requested_at) ? last : null
  }, [rejected.data, published, waiting])

  async function onRemove() {
    if (!selected) return
    const ok = await confirm({ title: t('home.removeTitle', { name: sectionName(typeList, selected.type) }), body: t('home.removeBody'), confirmLabel: t('home.remove') })
    if (!ok) return
    const index = sections.findIndex((s) => s._key === selected._key)
    update((s) => removeSection(s, typeList, selected._key))
    setSelectedKey(sections[index - 1]?._key ?? sections[0]?._key ?? null)
  }

  async function onSend() {
    if (Object.keys(errors).length) {
      toast.show({ tone: 'danger', title: t('home.fixFirst') })
      return
    }
    if (dirty && !(await runSave(sections))) {
      toast.show({ tone: 'danger', title: t('home.fixFirst') })
      return
    }
    const when = goLive.at ? t('home.sendWhen', { date: formatDate(goLive.at, uiLang, true) }) : ''
    const ok = await confirm({ title: t('home.sendTitle'), body: t('home.sendBody', { when }), confirmLabel: t('home.send'), tone: 'primary' })
    if (!ok) return
    try {
      await submit.mutateAsync(goLive.at ? new Date(goLive.at).toISOString() : null)
      toast.show({ tone: 'success', title: t('home.sent') })
      setGoLive({ at: '' })
    } catch (err) {
      const found = apiErrors(err)
      if (found.length) setErrors(Object.fromEntries(Object.entries(errorsBySection(found)).map(([k, v]) => [k === 'page' ? 'page' : sections[Number(k)]?._key ?? 'page', v])))
      toast.show({ tone: 'danger', title: t('home.sendFailed', { message: found[0]?.message ?? err?.message ?? '' }) })
    }
  }

  const statusText =
    saveState === 'saving' ? t('home.saving')
    : saveState === 'saved' && !dirty ? t('home.saved')
    : saveState === 'failed' ? t('home.saveFailed')
    : saveState === 'rejected' ? t('home.saveRejected', { message: saveMessage })
    : ''

  if (draft.isError || types.isError) {
    return <ErrorState title={t('home.loadError')} onRetry={() => { draft.refetch(); types.refetch() }} />
  }

  const subtitle = published
    ? t('home.lastPublished', { date: formatDate(published.publish_at ?? published.decided_at, uiLang), name: published.decided_by ?? '' })
    : approved.isSuccess ? t('home.neverPublished') : ' '

  const invalidKeys = new Set(Object.keys(errors).filter((k) => k !== 'page'))
  const addable = typeList.filter((x) => !x.fixed_first)

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted">
        <Link to="/content" className="hover:underline">{t('home.crumb')}</Link> / {t('home.title')}
      </p>
      <PageHeader
        title={t('home.title')}
        subtitle={subtitle}
        actions={
          // TODO(R-24): PageHeader keeps actions on one line; cap them so they wrap on a phone.
          <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2">
            {statusText && (
              <span role="status" className={cn('inline-flex items-center gap-1 text-[12px]', saveState === 'failed' || saveState === 'rejected' ? 'text-danger' : 'text-muted')}>
                {saveState === 'saved' && !dirty && <Check size={14} aria-hidden className="text-success" />}
                {statusText}
              </span>
            )}
            <LangSwitch lang={lang} onChange={setLang} />
            <Button ref={previewTrigger} variant="secondary" icon={<Eye size={15} aria-hidden />} onClick={() => setPreviewOpen(true)} className="xl:hidden">{t('home.preview')}</Button>
            <Button onClick={onSend} loading={submit.isPending} disabled={!sections}>{t('home.send')}</Button>
          </div>
        }
      />

      <Waiting approval={waiting} />
      {sentBack && !waiting && (
        <p className="mb-4 rounded-card bg-danger-soft px-4 py-3 text-[13px] text-danger">{t('home.lastSentBack', { name: sentBack.decided_by ?? '', comment: sentBack.comment ?? '' })}</p>
      )}
      {errors.page?.map((e, i) => <p key={i} role="alert" className="mb-3 rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">{e.message}</p>)}

      {!sections || !types.data ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-card" />)}</div>
          <Skeleton className="h-[520px] rounded-card" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,380px)_minmax(0,1fr)]">
          <section aria-labelledby="home-sections">
            <h2 id="home-sections" className="mb-2 font-heading text-[15px] font-bold text-text">{t('home.sections')}</h2>
            <SectionList
              sections={sections}
              types={typeList}
              selectedKey={selectedKey}
              invalidKeys={invalidKeys}
              onSelect={setSelectedKey}
              onToggle={(key, on) => update((s) => toggleSection(s, typeList, key, on))}
              onMove={(from, to) => update((s) => moveSection(s, typeList, from, to))}
              onAdd={() => setAdding(true)}
            />
          </section>

          <section aria-label={t('home.sections')} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4">
            {selected ? (
              <SectionSettings
                key={selected._key}
                section={selected}
                types={typeList}
                lang={lang}
                errors={errors[selected._key] ?? []}
                removable={!isFixed(typeList, selected)}
                onRemove={onRemove}
                onChange={(name, value) => update((s) => setSetting(s, selected._key, name, value))}
              />
            ) : (
              <p className="text-[13px] text-muted">{t('home.pickSection')}</p>
            )}
            <GoLive value={goLive} onChange={setGoLive} />
          </section>

          <section aria-labelledby="home-preview" className="hidden xl:sticky xl:top-4 xl:block">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="home-preview" className="font-heading text-[15px] font-bold text-text">{t('home.livePreview')}</h2>
              <DeviceSwitch device={device} onChange={setDevice} />
            </div>
            <HomePreview sections={previewSections} lang={lang} device={device} height={720} />
            <p className="mt-2 text-[12px] text-muted">{t('home.previewNote')}</p>
          </section>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} triggerRef={addTrigger} title={t('home.addTitle')} description={t('home.addBody')} size="sm">
        <ul className="flex flex-col gap-2">
          {addable.map((x) => (
            <li key={x.type}>
              <button type="button" onClick={() => {
                const [next, key] = addSection(sections ?? [], typeList, x.type)
                setSections(next)
                if (key) setSelectedKey(key)
                setAdding(false)
              }} className="flex w-full items-center justify-between rounded-card border border-border px-3 py-2.5 text-left text-[14px] font-semibold text-text hover:border-primary hover:bg-primary-soft">
                {sectionName(typeList, x.type)}
                <span className="text-[12px] font-normal text-primary">{t('home.add')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} triggerRef={previewTrigger} title={t('home.livePreview')} size="xl"
        footer={<DeviceSwitch device={device} onChange={setDevice} />}>
        {previewOpen && <HomePreview sections={previewSections} lang={lang} device={device} height="auto" className="max-h-[70vh] overflow-y-auto" />}
      </Modal>
    </div>
  )
}

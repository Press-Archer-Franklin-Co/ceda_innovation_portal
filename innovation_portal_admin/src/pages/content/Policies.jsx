import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input, { InputControl } from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import StatusPill from '../../components/ui/StatusPill'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import {
  useCreateTermsAndConditions, useDeleteTermsAndConditions, useTermsAndConditionsList, useUpdateTermsAndConditions,
} from '../../lib/queries/programs'

// 3.35 Terms and policies (Figma 141:1414 website, 141:1799 phone). ① One list of policy pages with their live version.
// ② Editor in English and Setswana, or side by side. ③ A new version goes through approvals (3.25); the old one stays
// live until approved. ④ Version history. Policy text comes from the U11C API (/api/content/policies/): a title, an
// intro and sections, each a heading and a plain-text body (a blank line starts a paragraph, "• " starts a bullet).
// Full history, compare, restore and the "accept at next sign-in" switch wait for R-60 (main).
// The challenges' own terms (the old Terms manager) are a second group in the same list.
// Phone: the list first, then the chosen page; small text fixes only.

const PUBLIC_PATH = { about: '/about', guidelines: '/guidelines', privacy: '/privacy-policy', terms_of_use: '/terms-of-use', terms_of_agreement: '/terms-of-agreement' }
const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const day = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const text = (v) => ({ en: v?.en ?? '', tn: v?.tn ?? '' })
const toDraft = (c) => ({
  title: text(c?.title),
  intro: text(c?.intro),
  sections: (c?.sections ?? []).map((s) => ({ heading: text(s.heading), body: text(s.body) })),
})

function Segment({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-control bg-surface2 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn('rounded-[6px] px-3 py-1.5 text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function usePolicies() {
  return useQuery({
    queryKey: ['content', 'policies'],
    queryFn: async () => {
      try {
        return { rows: asList(await client.get('/api/content/policies/')) }
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true, rows: [] }
        throw err
      }
    },
  })
}

/** One text in the chosen language or both. */
function Bilingual({ label, value, onChange, view, multiline, rows = 3, required }) {
  const t = useT()
  const langs = view === 'both' ? ['en', 'tn'] : [view]
  const Field = multiline ? Textarea : Input
  return (
    <div className={cn('grid gap-3', view === 'both' && 'md:grid-cols-2')}>
      {langs.map((l) => (
        <Field
          key={l}
          label={view === 'both' ? `${label} (${l === 'en' ? 'English' : 'Setswana'})` : label}
          lang={l}
          rows={multiline ? rows : undefined}
          required={required && l === 'en'}
          optional={l === 'tn'}
          value={value[l]}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
        />
      ))}
      {view === 'tn' && value.en && <p className="text-[12px] text-muted md:col-span-2">{t('pol.english')}: {value.en.slice(0, 160)}</p>}
    </div>
  )
}

function PolicyEditor({ policyKey, onChanged, onActions }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [view, setView] = useState('en')
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState([])
  const doc = useQuery({ queryKey: ['content', 'policies', policyKey], queryFn: () => client.get(`/api/content/policies/${policyKey}/`) })
  const [draft, setDraft] = useState(null)
  useEffect(() => { if (doc.data) setDraft(toDraft(doc.data.draft ?? doc.data.live)) }, [doc.data])

  const base = useMemo(() => (doc.data ? JSON.stringify(toDraft(doc.data.draft ?? doc.data.live)) : ''), [doc.data])
  const runRef = useRef(null)
  const canSend = !!doc.data && !!draft && (doc.data.draft != null || JSON.stringify(draft) !== base) && !doc.data.pending_approval && !busy
  // Preview and Send for approval sit in the page header (Figma pin 3); the page shows them from this.
  useEffect(() => { onActions?.({ onSend: () => runRef.current?.('submit'), sending: busy === 'submit', canSend }) }, [onActions, busy, canSend])
  if (doc.isLoading || (doc.data && !draft)) return <Skeleton className="h-[520px] rounded-card" />
  if (doc.isError) return <ErrorState framed title={t('pol.loadError')} message={doc.error?.message} onRetry={doc.refetch} />
  const d = doc.data
  const changed = JSON.stringify(draft) !== base
  const pending = d.pending_approval
  const hasDraft = d.draft != null || changed
  const set = (patch) => setDraft((x) => ({ ...x, ...patch }))
  const setSection = (i, patch) => set({ sections: draft.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const move = (i, by) => { const next = [...draft.sections]; const [it] = next.splice(i, 1); next.splice(i + by, 0, it); set({ sections: next }) }
  const refresh = () => { qc.invalidateQueries({ queryKey: ['content', 'policies'] }); onChanged?.() }

  async function run(kind) {
    setErrors([])
    setBusy(kind)
    try {
      if (kind === 'save' || (kind === 'submit' && changed)) await client.put(`/api/content/policies/${policyKey}/draft/`, draft)
      if (kind === 'submit') await client.post(`/api/content/policies/${policyKey}/submit/`)
      if (kind === 'discard') await client.delete(`/api/content/policies/${policyKey}/draft/`)
      refresh()
      toast.show({ tone: 'success', title: t(`pol.done.${kind}`) })
    } catch (err) {
      const list = err?.data?.errors?.errors ?? err?.data?.errors ?? []
      setErrors(Array.isArray(list) ? list : [])
      toast.show({ tone: 'error', title: t('pol.saveError'), body: Array.isArray(list) && list[0]?.message ? list[0].message : err?.message })
    } finally {
      setBusy('')
    }
  }

  runRef.current = run

  async function discard() {
    if (!(await confirm({ title: t('pol.discardTitle'), body: t('pol.discardBody'), confirmLabel: t('pol.discard') }))) return
    run('discard')
  }

  const version = hasDraft ? d.version + 1 : d.version
  return (
    <div className="flex min-w-0 flex-col gap-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-[18px] font-bold text-text">
          {t('pol.heading', { name: d.name, n: version })} <span className="text-muted">({hasDraft ? t('pol.draft') : t('pol.live')})</span>
        </h2>
        <Segment label={t('pol.view')} options={[{ value: 'en', label: 'English' }, { value: 'tn', label: 'Setswana' }, { value: 'both', label: t('pol.sideBySide') }]} value={view} onChange={setView} />
      </div>
      {pending && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-control bg-warning-soft px-3 py-2 text-[13px] text-warning">
          {t('pol.pending')} <Link to="/content/approvals" className="font-bold underline">{t('pol.openApprovals')}</Link>
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {errors.slice(0, 5).map((e, i) => <li key={i}>{e.message}</li>)}
        </ul>
      )}

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
        <Bilingual label={t('pol.title')} value={draft.title} onChange={(v) => set({ title: v })} view={view} required />
        <Bilingual label={t('pol.intro')} value={draft.intro} onChange={(v) => set({ intro: v })} view={view} multiline rows={2} />
        <p className="text-[12px] text-muted">{t('pol.bodyHint')}</p>
        <ol className="flex flex-col gap-4">
          {draft.sections.map((s, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-control border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-muted">{t('pol.section', { n: i + 1 })}</span>
                <span className="flex gap-1">
                  <button type="button" className="btn-icon" disabled={i === 0} aria-label={t('pol.moveUp')} onClick={() => move(i, -1)}><ArrowUp size={14} aria-hidden /></button>
                  <button type="button" className="btn-icon" disabled={i === draft.sections.length - 1} aria-label={t('pol.moveDown')} onClick={() => move(i, 1)}><ArrowDown size={14} aria-hidden /></button>
                  <button type="button" className="btn-icon text-danger" aria-label={t('pol.removeSection')} onClick={() => set({ sections: draft.sections.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden /></button>
                </span>
              </div>
              <Bilingual label={t('pol.sectionHeading')} value={s.heading} onChange={(v) => setSection(i, { heading: v })} view={view} />
              <Bilingual label={t('pol.sectionBody')} value={s.body} onChange={(v) => setSection(i, { body: v })} view={view} multiline rows={6} required />
            </li>
          ))}
        </ol>
        <Button variant="link" size="sm" className="self-start" icon={<Plus size={14} aria-hidden />} onClick={() => set({ sections: [...draft.sections, { heading: { en: '', tn: '' }, body: { en: '', tn: '' } }] })}>{t('pol.addSection')}</Button>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => run('save')} loading={busy === 'save'} disabled={!changed || !!busy}>{t('pol.saveDraft')}</Button>
          {d.draft != null && <Button variant="ghost" onClick={discard} loading={busy === 'discard'} disabled={!!busy}>{t('pol.discard')}</Button>}
        </div>
      </section>

      {/* TODO(R-60): the switch "Ask people to accept this version at their next sign-in". */}

      <section aria-labelledby="pol-history" className="rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
        <h3 id="pol-history" className="mb-3 text-[16px] font-bold text-text">{t('pol.history')}</h3>
        <ul className="flex flex-col divide-y divide-border text-[14px]">
          {hasDraft && (
            <li className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-8 font-bold text-text">v{d.version + 1}</span>
              <span className="min-w-0 flex-1 text-muted">{[t('pol.draft'), d.draft_updated_by, day(d.draft_updated_at)].filter(Boolean).join(' · ')}</span>
              <StatusPill status={pending ? 'pending_approval' : 'draft'} />
            </li>
          )}
          <li className="flex flex-wrap items-center gap-3 py-2">
            <span className="w-8 font-bold text-text">v{d.version}</span>
            <span className="min-w-0 flex-1 text-muted">{d.published_at ? t('pol.publishedOn', { date: day(d.published_at), name: d.published_by || '' }).replace(/ · $/, '') : t('pol.notPublished')}</span>
            <StatusPill status="published" />
          </li>
        </ul>
        {/* TODO(R-60): older versions, compare and restore. */}
        <p className="mt-2 text-[12px] text-muted">{t('pol.historySoon')}</p>
      </section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap justify-end gap-2 bg-bg/95 px-1 py-2 md:hidden">
        <Button onClick={() => run('submit')} loading={busy === 'submit'} disabled={!hasDraft || !!pending || !!busy}>{t('pol.send')}</Button>
      </div>
    </div>
  )
}

const TERMS_EMPTY = { title: '', content: '', document_url: '', active: true }

/** The challenges' own terms: title, text and a link or PDF. Challenges pick one in their Eligibility section. */
function ChallengeTermsEditor({ terms, onDone }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const create = useCreateTermsAndConditions()
  const update = useUpdateTermsAndConditions()
  const remove = useDeleteTermsAndConditions()
  const fileRef = useRef(null)
  const [form, setForm] = useState(() => ({ ...TERMS_EMPTY, ...(terms ?? {}) }))
  const [file, setFile] = useState(null)
  useEffect(() => { setForm({ ...TERMS_EMPTY, ...(terms ?? {}) }); setFile(null) }, [terms])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const busy = create.isPending || update.isPending || remove.isPending

  async function save() {
    const body = new FormData()
    body.append('title', form.title.trim())
    body.append('content', (form.content ?? '').trim())
    body.append('active', form.active ? 'true' : 'false')
    if (file) { body.append('pdf_file', file); body.append('document_url', '') } else body.append('document_url', (form.document_url ?? '').trim())
    try {
      const res = terms?.id ? await update.mutateAsync({ id: terms.id, body }) : await create.mutateAsync(body)
      toast.show({ tone: 'success', title: t('pol.termsSaved') })
      onDone?.(res?.id ?? terms?.id)
    } catch (err) {
      toast.show({ tone: 'error', title: t('pol.saveError'), body: err?.message })
    }
  }

  async function del() {
    if (!(await confirm({ title: t('pol.termsDeleteTitle', { name: terms.title }), body: t('pol.termsDeleteBody'), confirmLabel: t('pol.delete'), tone: 'danger' }))) return
    try {
      await remove.mutateAsync(terms.id)
      toast.show({ tone: 'success', title: t('pol.termsDeleted') })
      onDone?.(null)
    } catch (err) {
      toast.show({ tone: 'error', title: t('pol.saveError'), body: err?.message })
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-[14px] 2xl:p-[22px]">
      <h2 className="font-heading text-[18px] font-bold text-text">{terms?.id ? terms.title : t('pol.newTerms')}</h2>
      <p className="text-[13px] text-muted">{t('pol.termsHint')}</p>
      <Input label={t('pol.title')} required value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={255} />
      <Textarea label={t('pol.termsText')} optional rows={8} value={form.content ?? ''} onChange={(e) => set({ content: e.target.value })} />
      <Input label={t('pol.termsLink')} optional type="url" placeholder="https://" value={form.document_url ?? ''} onChange={(e) => set({ document_url: e.target.value })} disabled={!!file} />
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button variant="secondary" size="sm" icon={<FileText size={14} aria-hidden />} onClick={() => fileRef.current?.click()}>{t('pol.termsPdf')}</Button>
        <span className="text-[13px] text-muted">{file ? file.name : terms?.document_link ? <a href={terms.document_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('pol.termsCurrent')}</a> : t('pol.termsNoFile')}</span>
      </div>
      <Toggle label={t('pol.termsActive')} description={t('pol.termsActiveHint')} checked={!!form.active} onChange={(v) => set({ active: v })} />
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button onClick={save} loading={create.isPending || update.isPending} disabled={!form.title.trim() || busy}>{t('common.save')}</Button>
        {terms?.id && <Button variant="ghost" className="text-danger" onClick={del} loading={remove.isPending} disabled={busy}>{t('pol.delete')}</Button>}
      </div>
    </section>
  )
}

export default function Policies() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const policies = usePolicies()
  const terms = useTermsAndConditionsList()
  const termsList = asList(terms.data)
  const rows = policies.data?.rows ?? []
  const page = params.get('page')
  const termsId = params.get('terms')
  const selected = termsId ? null : page ?? rows[0]?.key ?? null
  const [actions, setActions] = useState(null)

  useEffect(() => { document.title = `${t('pol.title2')} · CEDA Innovation` }, [t])
  useEffect(() => { if (!selected) setActions(null) }, [selected])

  const choose = (patch) => setParams(patch, { replace: true })
  const publicUrl = selected && PUBLIC_PATH[selected] ? `${window.location.origin}${PUBLIC_PATH[selected]}` : null
  const item = (key, active, title, sub, onClick) => (
    <li key={key}>
      <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick}
        className={cn('flex w-full flex-col items-start gap-0.5 rounded-control border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', active ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface2')}>
        <span className={cn('text-[14px] font-bold', active ? 'text-primary' : 'text-text')}>{title}</span>
        <span className="text-[12px] text-muted">{sub}</span>
      </button>
    </li>
  )

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('pol.crumb')}</span>}
        title={t('pol.title2')}
        subtitle={t('pol.subtitle')}
        actions={selected && actions ? (
          <div className="hidden flex-wrap items-center gap-3 md:flex">
            {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[14px] font-bold text-primary hover:underline">{t('pol.preview')}</a>}
            <Button onClick={actions.onSend} loading={actions.sending} disabled={!actions.canSend}>{t('pol.send')}</Button>
          </div>
        ) : null}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label={t('pol.list')} className="flex min-w-0 flex-col gap-4">
          {policies.isLoading ? <Skeleton className="h-64 rounded-card" /> : policies.isError ? (
            <ErrorState compact title={t('pol.loadError')} onRetry={policies.refetch} />
          ) : policies.data.unavailable ? (
            <p className="rounded-control bg-surface2 px-3 py-2 text-[13px] text-muted">{t('pol.notYet')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((r) => item(r.key, r.key === selected, r.name,
                [t('pol.liveN', { date: day(r.published_at) || '' }).replace(/ · $/, ''), r.has_draft && t('pol.hasDraft'), r.pending_approval && t('pol.waiting'), r.missing_setswana && t('pol.noTn')].filter(Boolean).join(' · '),
                () => choose({ page: r.key })))}
            </ul>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="px-3 text-[12px] font-bold uppercase tracking-wide text-muted">{t('pol.challengeTerms')}</h2>
            {terms.isLoading ? <Skeleton className="h-20" /> : (
              <ul className="flex flex-col gap-1">
                {termsList.map((x) => item(`t-${x.id}`, termsId === String(x.id), x.title, x.active ? t('pol.inUse') : t('pol.notInUse'), () => choose({ terms: String(x.id) })))}
              </ul>
            )}
            <Button variant="link" size="sm" className="self-start px-3" icon={<Plus size={14} aria-hidden />} onClick={() => choose({ terms: 'new' })}>{t('pol.addTerms')}</Button>
          </div>
        </nav>

        {termsId ? (
          <ChallengeTermsEditor terms={termsId === 'new' ? null : termsList.find((x) => String(x.id) === termsId)} onDone={(id) => choose(id ? { terms: String(id) } : {})} />
        ) : selected ? (
          <PolicyEditor key={selected} policyKey={selected} onActions={setActions} />
        ) : (
          !policies.isLoading && <EmptyState framed icon={FileText} title={t('pol.pick')} />
        )}
      </div>
    </div>
  )
}

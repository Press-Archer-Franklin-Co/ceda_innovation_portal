import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ImagePlus, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { useTrigger } from '../../components/ui/useTrigger'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import MultiSelect from '../../components/ui/MultiSelect'
import Modal from '../../components/ui/Modal'
import Tag from '../../components/ui/Tag'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { programs as programsApi } from '../../lib/api/endpoints'
import { uploadLogo } from '../../lib/api/websiteContent'
import { TIERS, TIER_TONE, fromPartner, logoProblem, onHomeNow, partnerProblems, sortPartners, toPartnerPayload } from '../../lib/content/partners'
import { usePartnerAction, usePartners } from '../../lib/queries/websiteContent'

const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}
const day = (iso, lang) => (iso ? new Date(iso).toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Logo({ logo, name, mono = true, className }) {
  const src = (mono && logo?.monochrome_url) || logo?.url
  return (
    <div className={cn('flex items-center justify-center overflow-hidden rounded-control bg-surface2', className)}>
      {src ? <img src={src} alt={name} className="max-h-full max-w-full object-contain p-2" /> : <Building2 size={22} aria-hidden className="text-muted" />}
    </div>
  )
}

function PartnerPanel({ partner, open, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const act = usePartnerAction()
  const fileInput = useRef(null)
  const [form, setForm] = useState(() => fromPartner(partner))
  const [logo, setLogo] = useState(partner?.logo ?? null)
  const [uploading, setUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [show, setShow] = useState(false)
  const [apiErrors, setApiErrors] = useState({})
  const programs = useQuery({ queryKey: ['programs', 'for-partners'], queryFn: () => programsApi.list({ page_size: 100 }), staleTime: 5 * 60 * 1000, enabled: open })
  const programOptions = (Array.isArray(programs.data) ? programs.data : programs.data?.results ?? []).filter((p) => !p.is_general_intake).map((p) => ({ value: String(p.id), label: p.title }))
  const problems = partnerProblems(form)
  const err = (k) => apiErrors[k] || (show && problems[k] ? t(problems[k]) : undefined)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function onLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const problem = logoProblem(file)
    if (problem) return setLogoError(t(problem))
    setLogoError('')
    setUploading(true)
    try {
      const asset = await uploadLogo(file, form.name)
      setLogo(asset)
      set({ logo_id: asset.id })
    } catch (e) {
      setLogoError(apiMessage(e) || t('partners.logoFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setShow(true)
    if (Object.keys(problems).length) return
    try {
      const body = toPartnerPayload(form)
      if (partner?.id) await act.mutateAsync({ action: 'update', id: partner.id, value: body })
      else await act.mutateAsync({ action: 'create', value: body })
      toast.show({ tone: 'success', title: t('partners.saved') })
      onClose()
    } catch (e) {
      const data = e?.data?.errors ?? e?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) setApiErrors(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)])))
      toast.show({ tone: 'error', title: t('partners.failed', { message: apiMessage(e) }) })
    }
  }

  async function remove() {
    const ok = await confirm({ title: t('partners.deleteTitle', { name: partner.name }), body: t('partners.deleteBody'), confirmLabel: t('partners.delete') })
    if (!ok) return
    try {
      await act.mutateAsync({ action: 'remove', id: partner.id })
      toast.show({ tone: 'success', title: t('partners.deleted') })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: t('partners.failed', { message: apiMessage(e) }) })
    }
  }

  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} title={partner?.id ? t('partners.edit') : t('partners.add')} size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {partner?.id ? <Button variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={remove}>{t('partners.delete')}</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={save} loading={act.isPending} disabled={uploading}>{t('partners.save')}</Button>
          </div>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold text-text">{t('partners.logo')}</p>
          {logo?.url ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <figure className="flex flex-col gap-1"><Logo logo={logo} name={form.name} mono={false} className="h-24 border border-border" /><figcaption className="text-[12px] text-muted">{t('partners.logoColour')}</figcaption></figure>
              <figure className="flex flex-col gap-1">
                {logo.monochrome_url ? <Logo logo={logo} name={form.name} className="h-24 border border-border" /> : <div className="flex h-24 items-center justify-center rounded-control border border-dashed border-border px-3 text-center text-[12px] text-muted">{t('partners.logoNoMono')}</div>}
                <figcaption className="text-[12px] text-muted">{t('partners.logoOneColour')}</figcaption>
              </figure>
            </div>
          ) : null}
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
            className={cn('flex items-center gap-3 rounded-card border border-dashed border-border bg-surface2 p-3 text-left hover:border-primary disabled:opacity-60', logo?.url && 'self-start py-2')}>
            <ImagePlus size={18} aria-hidden className="text-muted" />
            <span className="flex flex-col">
              <span className="text-[13px] font-bold text-text">{uploading ? t('post.saving') : logo?.url ? t('partners.logoChange') : t('partners.logoDrop')}</span>
              {!logo?.url && <span className="text-[12px] text-muted">{t('partners.logoHint')}</span>}
            </span>
          </button>
          {logoError && <p role="alert" className="text-[12px] text-danger">{logoError}</p>}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={onLogo} aria-label={t('partners.logoDrop')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('partners.name')} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={255} required error={err('name')} />
          <Input label={t('partners.shortLabel')} hint={t('partners.shortLabelHint')} value={form.short_label} onChange={(e) => set({ short_label: e.target.value })} maxLength={60} optional error={err('short_label')} />
        </div>
        <Input type="url" label={t('partners.link')} placeholder="https://" value={form.url} onChange={(e) => set({ url: e.target.value })} optional error={err('url')} />
        <Select label={t('partners.tier')} hint={t('partners.tierHint')} options={TIERS.map((x) => ({ value: x, label: t(`partners.tier.${x}`) }))} value={form.tier} onChange={(v) => set({ tier: v ?? 'partner' })} required />
        <MultiSelect label={t('partners.supports')} hint={t('partners.supportsHint')} options={programOptions} value={form.program_ids} onChange={(v) => set({ program_ids: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="date" label={t('partners.showFrom')} value={form.show_from} onChange={(e) => set({ show_from: e.target.value })} optional error={err('show_from')} />
          <Input type="date" label={t('partners.showUntil')} value={form.show_until} onChange={(e) => set({ show_until: e.target.value })} optional error={err('show_until')} />
        </div>
        <Toggle label={t('partners.showOnHome')} checked={form.show_on_home} onChange={(v) => set({ show_on_home: v })} />
        <Toggle label={t('partners.active')} checked={form.is_active} onChange={(v) => set({ is_active: v })} />
      </div>
    </Modal>
  )
}

/** 3.13 Partners & sponsors (Figma 32:506). */
export default function Partners() {
  const t = useT()
  const { lang } = useI18n()
  const list = usePartners()
  const [editing, setEditing] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false) // kept apart from editing so the panel can close into its button
  const [session, setSession] = useState(0) // each opening starts from the saved partner
  const trigger = useTrigger()
  const edit = (e, item) => { trigger.from(e); setEditing(item); setSession((n) => n + 1); setPanelOpen(true) } // partner, 'new' or null
  const partners = useMemo(() => sortPartners(list.data ?? []), [list.data])

  if (list.isError) return <ErrorState title={t('partners.loadError')} onRetry={() => list.refetch()} />

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted"><Link to="/content/home" className="hover:underline">{t('news.crumb')}</Link> / {t('partners.title')}</p>
      <PageHeader title={t('partners.title')} subtitle={t('partners.subtitle')}
        actions={<Button icon={<Plus size={15} aria-hidden />} onClick={(e) => edit(e, 'new')}>{t('partners.add')}</Button>} />

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-card" />)}</div>
      ) : partners.length === 0 ? (
        <EmptyState title={t('partners.empty')} message={t('partners.emptyBody')} framed action={<Button onClick={(e) => edit(e, 'new')}>{t('partners.add')}</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {partners.map((p) => {
            const home = onHomeNow(p)
            const dates = p.show_from && p.show_until ? t('partners.dates', { from: day(p.show_from, lang), until: day(p.show_until, lang) })
              : p.show_from ? t('partners.from', { date: day(p.show_from, lang) }) : p.show_until ? t('partners.until', { date: day(p.show_until, lang) }) : ''
            return (
              <li key={p.id}>
                <button type="button" onClick={(e) => edit(e, p)} className="flex h-full w-full flex-col gap-3 rounded-card border border-border bg-surface p-4 text-left hover:border-primary">
                  <Logo logo={p.logo} name={p.name} className="h-20 w-full" />
                  <span className="text-[15px] font-bold text-text">{p.name}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <Tag tone={TIER_TONE[p.tier] ?? 'neutral'}>{t(`partners.tier.${p.tier}`)}</Tag>
                    {!p.is_active ? <Tag tone="neutral">{t('partners.off')}</Tag> : home ? <Tag tone="green" dot>{t('partners.onHome')}</Tag> : <Tag tone="neutral">{t('partners.notOnHome')}</Tag>}
                  </span>
                  <span className="text-[12px] text-muted">
                    {[dates, p.program_ids?.length ? t('partners.challenges', { count: p.program_ids.length }) : ''].filter(Boolean).join(' · ') || ' '}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <PartnerPanel key={`${editing === 'new' ? 'new' : editing.id}-${session}`} partner={editing === 'new' ? null : editing} open={panelOpen} triggerRef={trigger.ref} onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

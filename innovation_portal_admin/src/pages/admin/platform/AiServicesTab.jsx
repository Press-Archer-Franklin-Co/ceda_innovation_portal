import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import SectionCard from '../../../components/ui/SectionCard'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import Tag from '../../../components/ui/Tag'
import Skeleton from '../../../components/ui/Skeleton'
import EmptyState from '../../../components/ui/EmptyState'
import ErrorState from '../../../components/ui/ErrorState'
import { Toggle } from '../../../components/ui/Choice'
import { useToast } from '../../../components/ui/toast'
import { useAuth } from '../../../lib/auth/AuthContext'
import { useI18n } from '../../../i18n/context'
import { cn } from '../../../lib/cn'
import { useIntegrations, useProviders } from '../../../lib/queries/platform'
import { aiServices } from '../../../lib/api/aiServices'
import { SetUpPanel } from './Integrations'

// AI services tab (Figma 3.27 Integrations 123:1073 / 123:1471 and the first two cards of 3.34b 170:1712 / 176:1846,
// placed on a Platform settings tab: a small adjustment). ① Any AI service: pick one, paste its address and key,
// test it and activate it. Keys are write-only. Test and live keys sit side by side. ② AI settings: which keys are
// in use, which connection and model each feature uses, the monthly limit and whether names are sent.

const rowsOf = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const overviewKey = (lang) => ['assistant', 'admin', 'overview', lang]

function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-grid grid-cols-2 gap-1 rounded-control bg-surface2 p-1">
      {options.map((o) => (
        <label key={o.value} className={cn(
          'flex min-h-[34px] cursor-pointer items-center justify-center rounded-control px-3 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-primary',
          value === o.value ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
          disabled && 'cursor-not-allowed opacity-60',
        )}>
          <input type="radio" className="sr-only" name={label} value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

function ConnectionRow({ connection, providerLabel, onManage }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const environment = connection.config?.environment === 'live' ? 'live' : 'test'
  const state = connection.is_active ? 'active' : 'testing'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <p className="truncate text-[14px] font-semibold text-text">{connection.name}</p>
        <p className="truncate text-[12px] text-muted">{[providerLabel, connection.config?.model].filter(Boolean).join(' · ')}</p>
      </div>
      <Tag tone={environment === 'live' ? 'blue' : 'neutral'}>{t(`aiSvc.env.${environment}`)}</Tag>
      <Tag tone={state === 'active' ? 'green' : 'amber'}>{t(`integ.state.${state}`)}</Tag>
      <button ref={ref} type="button" onClick={() => onManage(connection, ref)} className="text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t('integ.manage')}
      </button>
    </li>
  )
}

function AiSettingsCard() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: overviewKey(lang), queryFn: () => aiServices.overview(lang), retry: false })
  const save = useMutation({
    mutationFn: (body) => aiServices.saveSettings(body),
    onSuccess: (data) => { qc.setQueryData(overviewKey(lang), data); toast.show({ tone: 'success', title: t('aiSvc.saved') }) },
    onError: (e) => toast.show({ tone: 'error', title: t('integ.failed', { message: e?.message ?? '' }) }),
  })
  const [form, setForm] = useState(null)
  useEffect(() => {
    const d = overview.data
    if (!d) return
    setForm({
      keys_in_use: d.keys_in_use ?? 'test',
      monthly_limit_usd: d.monthly_limit_usd ?? '',
      send_names: Boolean(d.send_names),
      routes: Object.fromEntries((d.features ?? []).map((f) => [f.key, { connection: f.chosen?.connection ?? '', model: f.chosen?.model ?? '' }])),
    })
  }, [overview.data])

  if (overview.isLoading) return <Skeleton className="h-72 rounded-card" />
  if (overview.isError) return <ErrorState title={t('aiSvc.settingsError')} onRetry={() => overview.refetch()} />
  if (!form) return null
  const d = overview.data
  const activeNow = (d.services ?? []).filter((s) => s.is_active && s.environment === form.keys_in_use)
  const connectionOptions = [{ value: '', label: t('aiSvc.firstActive') }, ...activeNow.map((s) => ({ value: s.id, label: `${s.name}${s.model ? ` (${s.model})` : ''}` }))]
  const setRoute = (feature, patch) => setForm((f) => ({ ...f, routes: { ...f.routes, [feature]: { ...f.routes[feature], ...patch } } }))
  const submit = (e) => {
    e.preventDefault()
    const routes = Object.fromEntries(Object.entries(form.routes).map(([key, r]) => [key, r.connection || r.model ? { ...(r.connection ? { connection: r.connection } : {}), ...(r.model ? { model: r.model.trim() } : {}) } : null]))
    save.mutate({ keys_in_use: form.keys_in_use, monthly_limit_usd: String(form.monthly_limit_usd || 0), send_names: form.send_names, routes })
  }
  const knownState = ['needs_setup', 'no_active_key', 'switched_off', 'limit_reached', 'ready'].includes(d.state) ? d.state : 'needs_setup'

  return (
    <form onSubmit={submit}>
      <SectionCard title={t('aiSvc.settings')} subtitle={t(`aiSvc.state.${knownState}`)}
        footer={<div className="flex justify-end"><Button type="submit" data-guide="integrations.ai.saveSettings" loading={save.isPending}>{t('aiSvc.save')}</Button></div>}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-text">{t('aiSvc.keysInUse')}</span>
            <Segmented label={t('aiSvc.keysInUse')} value={form.keys_in_use} disabled={save.isPending} onChange={(v) => setForm((f) => ({ ...f, keys_in_use: v }))}
              options={[{ value: 'test', label: t('aiSvc.testKeys') }, { value: 'live', label: t('aiSvc.liveKeys') }]} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text">{t('aiSvc.perFeature')}</p>
            <p className="text-[12px] text-muted">{t('aiSvc.perFeatureHint')}</p>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {(d.features ?? []).map((f) => (
                <li key={f.key} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_220px_180px] sm:items-end">
                  <span className="text-[13px] text-text sm:pb-2">{f.label}</span>
                  <Select label={t('aiSvc.connection')} hideLabel value={form.routes[f.key]?.connection ?? ''} onChange={(v) => setRoute(f.key, { connection: v ?? '' })} options={connectionOptions} />
                  <Input label={t('aiSvc.model')} hideLabel placeholder={t('aiSvc.modelPlaceholder')} value={form.routes[f.key]?.model ?? ''} onChange={(e) => setRoute(f.key, { model: e.target.value })} maxLength={80} />
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('aiSvc.limit')} type="number" min="0" step="1" value={form.monthly_limit_usd} onChange={(e) => setForm((f) => ({ ...f, monthly_limit_usd: e.target.value }))} hint={t('aiSvc.pricesNote')} />
            <Toggle className="self-center" label={t('aiSvc.sendNames')} description={t('aiSvc.sendNamesHint')} checked={form.send_names} onChange={(v) => setForm((f) => ({ ...f, send_names: v }))} />
          </div>
        </div>
      </SectionCard>
    </form>
  )
}

export default function AiServicesTab() {
  const { t } = useI18n()
  const { can } = useAuth()
  const connections = useIntegrations('ai')
  const providers = useProviders('ai')
  const [panel, setPanel] = useState(null)
  const addRef = useRef(null)
  const list = rowsOf(connections.data)
  const providerLabels = useMemo(() => Object.fromEntries(rowsOf(providers.data).map((p) => [p.key, p.label])), [providers.data])

  let body
  if (connections.isError || providers.isError) body = <ErrorState title={t('integ.loadError')} onRetry={() => { connections.refetch(); providers.refetch() }} />
  else if (connections.isLoading || providers.isLoading) body = <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
  else if (!list.length) body = <EmptyState compact title={t('aiSvc.emptyTitle')} message={t('aiSvc.empty')} />
  else body = (
    <ul className="flex flex-col divide-y divide-border">
      {list.map((c) => <ConnectionRow key={c.id} connection={c} providerLabel={providerLabels[c.provider]} onManage={(connection, ref) => setPanel({ connection, ref })} />)}
    </ul>
  )

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <SectionCard title={t('aiSvc.title')} subtitle={t('aiSvc.body')}
        actions={<Button ref={addRef} size="sm" data-guide="integrations.ai.add" icon={<Plus size={14} aria-hidden />} disabled={providers.isLoading || providers.isError} onClick={() => setPanel({ connection: null, ref: addRef })}>{t('aiSvc.add')}</Button>}>
        {body}
        <p className="mt-3 text-[12px] text-muted">{t('aiSvc.keysNote')}</p>
      </SectionCard>
      {can('assistant.manage') && <AiSettingsCard />}
      {panel && <SetUpPanel key={panel.connection?.id ?? 'new'} kind="ai" connection={panel.connection} triggerRef={panel.ref} onClose={() => setPanel(null)} />}
    </div>
  )
}

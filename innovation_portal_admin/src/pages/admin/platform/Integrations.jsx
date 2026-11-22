import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, KeyRound, Megaphone, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Select from '../../../components/ui/Select'
import Tag from '../../../components/ui/Tag'
import Skeleton from '../../../components/ui/Skeleton'
import ErrorState from '../../../components/ui/ErrorState'
import ForbiddenState from '../../../components/ui/ForbiddenState'
import StepProgress from '../../../components/ui/StepProgress'
import ProviderFields from '../../../components/channels/ProviderFields'
import { TestResult } from '../../../components/channels/ConnectionCard'
import { useConfirm } from '../../../components/ui/confirm'
import { useToast } from '../../../components/ui/toast'
import { useT } from '../../../i18n/context'
import {
  useActivateIntegration, useDeactivateIntegration, useFeatureFlags, useIntegrations, useProviders, useSaveIntegration, useStartSsoTrial, useTestIntegration,
} from '../../../lib/queries/platform'

// 3.27 Integrations (Figma 123:1073 website, 123:1471 phone). ① One card per service with its state: Not set up,
// Testing, Active. ② Set up: provider, key, test, then Activate. Keys are write-only: the API sends back only
// "saved, ends in 1234". ③ Turning a service off asks first and names the features that will hide.
// WhatsApp and USSD keys live in Channels (one place per key) until Nshathisi decides otherwise.
// TODO(R-37): the set-up opens in the shared Modal until the shared side panel (Sheet) exists.

const SERVICES = [
  { kind: 'sms', icon: MessageCircle },
  { kind: 'email', icon: Megaphone },
  { kind: 'whatsapp', icon: MessageCircle, elsewhere: '/channels/connections/whatsapp' },
  { kind: 'ussd', icon: Smartphone, elsewhere: '/channels/connections/ussd' },
  { kind: 'ai', icon: Bot },
  { kind: 'sso', icon: ShieldCheck },
]
// Until the U9 API sends `needs` on each feature switch (R-65), these are the switches each service unlocks.
const FALLBACK_FEATURES = { sms: ['sms_messages', 'code_sign_in'], email: [], whatsapp: ['whatsapp_messages'], ussd: ['ussd'], ai: [], sso: ['staff_sso'] }
const GUIDE = { sms: 'integrations.sms', sso: 'integrations.sso' }
const STATE_TONE = { not_set_up: 'neutral', testing: 'amber', active: 'green' }
const STEP_KEYS = ['provider', 'key', 'test', 'activate']
const rowsOf = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const when = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

function serviceState(connections) {
  if (connections.some((c) => c.is_active || c.status === 'active')) return 'active'
  return connections.length ? 'testing' : 'not_set_up'
}

function errorText(err) {
  const errors = err?.data?.errors
  if (errors && typeof errors === 'object') {
    return Object.entries(errors).map(([k, v]) => (k === 'code' ? '' : k === 'detail' ? String(v) : `${k}: ${[].concat(v).join(' ')}`)).filter(Boolean).join(' ')
  }
  return err?.message ?? ''
}

function featuresFor(kind, flags) {
  const list = flags ?? []
  const fromApi = list.filter((f) => Array.isArray(f.needs) && f.needs.includes(kind))
  const picked = fromApi.length || list.some((f) => Array.isArray(f.needs)) ? fromApi : list.filter((f) => FALLBACK_FEATURES[kind]?.includes(f.key))
  return picked.map((f) => f.label)
}

function SetUpPanel({ kind, connection, onClose, triggerRef }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const providers = useProviders(kind)
  const flags = useFeatureFlags()
  const save = useSaveIntegration()
  const test = useTestIntegration()
  const activate = useActivateIntegration()
  const deactivate = useDeactivateIntegration()
  const trial = useStartSsoTrial()
  const providerList = rowsOf(providers.data)
  const [id, setId] = useState(connection?.id ?? null)
  const [current, setCurrent] = useState(connection ?? null)
  const [provider, setProvider] = useState(connection?.provider ?? '')
  const [name, setName] = useState(connection?.name ?? '')
  const [config, setConfig] = useState(connection?.config ?? {})
  const [secretEdits, setSecretEdits] = useState({})
  const [invalid, setInvalid] = useState({})
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(connection?.last_test_result ?? null)
  const serviceName = t(`integ.svc.${kind}`)
  const chosen = providerList.find((p) => p.key === (provider || providerList[0]?.key))
  const dirty = !id || provider !== (current?.provider ?? '') || name !== (current?.name ?? '') || JSON.stringify(config) !== JSON.stringify(current?.config ?? {}) || Object.keys(secretEdits).length > 0
  const step = current?.is_active ? 3 : current?.status === 'tested' || result?.ok ? 3 : id && !dirty ? 2 : chosen ? 1 : 0
  const failed = (e) => toast.show({ tone: 'error', title: t('integ.failed', { message: errorText(e) }) })

  async function persist() {
    const secrets = Object.fromEntries(Object.entries(secretEdits).filter(([, v]) => v !== undefined))
    const body = id
      ? { name: name.trim() || serviceName, config, ...(Object.keys(secrets).length ? { secrets } : {}) }
      : { kind, provider: chosen.key, name: name.trim() || `${serviceName} (${chosen.label})`, config, secrets }
    const saved = await save.mutateAsync({ id, body })
    setId(saved.id)
    setCurrent(saved)
    setProvider(saved.provider)
    setName(saved.name)
    setSecretEdits({})
    return saved
  }
  async function saveDraft() {
    if (Object.values(invalid).some(Boolean)) return
    try { await persist(); toast.show({ tone: 'success', title: t('integ.draftSaved') }) } catch (e) { failed(e) }
  }
  async function runTest() {
    try {
      const saved = dirty ? await persist() : current
      if (kind === 'sso') {
        const answer = await trial.mutateAsync(saved.id)
        if (answer?.authorization_url) window.open(answer.authorization_url, 'ceda-sso-trial', 'width=520,height=700')
      }
      const answer = await test.mutateAsync({ id: saved.id, body: kind === 'sms' && phone.trim() ? { phone: phone.trim() } : {} })
      setResult(answer?.result ?? null)
      if (answer?.connection) setCurrent(answer.connection)
      toast.show({ tone: answer?.result?.ok ? 'success' : 'error', title: answer?.result?.ok ? t('integ.testOk') : t('integ.testFailed') })
    } catch (e) { failed(e) }
  }
  async function turnOn() {
    try {
      const saved = dirty ? await persist() : current
      const answer = await activate.mutateAsync(saved.id)
      if (answer?.id) setCurrent(answer)
      toast.show({ tone: 'success', title: t('integ.activated', { name: serviceName }) })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: current?.activation_blocker ? t('integ.blocked', { reason: current.activation_blocker }) : t('integ.failed', { message: errorText(e) }) })
    }
  }
  async function turnOff() {
    const features = featuresFor(kind, flags.data)
    const ok = await confirm({
      title: t('integ.turnOffTitle', { name: serviceName }),
      body: features.length ? t('integ.turnOffBody', { features: features.join(', ') }) : t('integ.turnOffBodyNone'),
      confirmLabel: t('integ.turnOff'),
    })
    if (!ok) return
    try { await deactivate.mutateAsync(current.id); toast.show({ tone: 'success', title: t('integ.turnedOff', { name: serviceName }) }); onClose() } catch (e) { failed(e) }
  }

  const busy = save.isPending || test.isPending || activate.isPending || trial.isPending
  return (
    <Modal open onClose={onClose} title={t('integ.panel.title', { name: serviceName })} size="lg" triggerRef={triggerRef}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span>{current?.is_active && <Button variant="ghost" onClick={turnOff} loading={deactivate.isPending}>{t('integ.turnOff')}</Button>}</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={saveDraft} disabled={!chosen || !dirty || busy} loading={save.isPending && !test.isPending}>{t('integ.saveDraft')}</Button>
            <Button onClick={turnOn} disabled={!chosen || busy || (current?.is_active && !dirty)} loading={activate.isPending}>{t('integ.activate')}</Button>
          </span>
        </div>
      )}>
      {providers.isLoading ? <Skeleton className="h-64 rounded-card" /> : providers.isError ? (
        <ErrorState title={t('integ.loadError')} onRetry={() => providers.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <StepProgress steps={STEP_KEYS.map((k) => t(`integ.step.${k}`))} current={step} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t('integ.provider')} required disabled={!!id} value={chosen?.key ?? ''} onChange={(v) => { setProvider(v ?? ''); setConfig({}); setSecretEdits({}) }}
              options={providerList.map((p) => ({ value: p.key, label: p.label }))} />
            <Input label={t('integ.name')} optional value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          {chosen?.description && <p className="-mt-2 text-[12px] text-muted">{chosen.description}</p>}
          {chosen && (
            <ProviderFields provider={chosen} config={config} onConfig={(k, v) => setConfig((c) => ({ ...c, [k]: v }))}
              secretState={current?.secrets} secretEdits={secretEdits} onSecret={(k, v) => setSecretEdits((s) => ({ ...s, [k]: v }))}
              onInvalid={(k, bad) => setInvalid((s) => ({ ...s, [k]: bad }))} />
          )}
          <div className="flex flex-col gap-3 rounded-card bg-surface2 p-4">
            <p className="text-[13px] font-bold text-text">{kind === 'sso' ? t('integ.tryTrial') : t('integ.sendTest')}</p>
            {kind === 'sso' && <p className="text-[12px] text-muted">{t('integ.trialHint')}</p>}
            <div className="flex flex-wrap items-end gap-2">
              {kind === 'sms' && (
                <Input fieldClassName="min-w-0 flex-1" label={t('integ.testPhone')} type="tel" placeholder="+267 71 234 567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              )}
              <Button variant="secondary" onClick={runTest} disabled={!chosen || busy} loading={test.isPending || trial.isPending}>
                {kind === 'sms' ? t('integ.sendTestBtn') : kind === 'sso' ? t('integ.tryTrial') : t('integ.runTest')}
              </Button>
            </div>
            {current?.last_tested_at && <p className="text-[12px] text-muted">{t('integ.lastTest', { when: when(current.last_tested_at) })}</p>}
            <TestResult result={result} />
          </div>
          {current?.activation_blocker && !current?.is_active && (
            <p className="rounded-control bg-warning-soft px-3 py-2 text-[12px] text-text" role="note">{t('integ.blocked', { reason: current.activation_blocker })}</p>
          )}
        </div>
      )}
    </Modal>
  )
}

function ServiceCard({ service, connections, hasProviders, onOpen }) {
  const t = useT()
  const ref = useRef(null)
  const state = serviceState(connections)
  const Icon = service.icon
  const name = t(`integ.svc.${service.kind}`)
  const active = connections.find((c) => c.is_active)
  const label = state === 'not_set_up' ? t('integ.setUp') : t('integ.manage')
  let action
  if (service.elsewhere) action = <Link to={service.elsewhere} className="text-[13px] font-bold text-primary hover:underline">{label}</Link>
  else if (hasProviders) action = <button ref={ref} type="button" data-guide={GUIDE[service.kind]} onClick={() => onOpen(service.kind, active ?? connections[0] ?? null, ref)} className="text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</button>
  else action = <span className="text-[12px] text-muted">{t('integ.notHere')}</span>
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface2 text-text"><Icon size={16} /></span>
          <h2 className="truncate text-[15px] font-bold text-text">{name}</h2>
        </span>
        <Tag tone={STATE_TONE[state]}>{t(`integ.state.${state}`)}</Tag>
      </div>
      <p className="text-[12px] text-muted">{t(`integ.svc.${service.kind}.body`)}</p>
      {service.elsewhere && <p className="text-[12px] text-muted">{t('integ.inChannels')}</p>}
      {active?.activated_at && <p className="text-[12px] text-muted">{t('integ.active', { when: when(active.activated_at) })}</p>}
      <div className="mt-auto pt-1">{action}</div>
    </li>
  )
}

export default function Integrations() {
  const t = useT()
  const all = useIntegrations()
  const providers = useProviders()
  const [panel, setPanel] = useState(null)
  const byKind = useMemo(() => {
    const out = {}
    for (const c of rowsOf(all.data)) (out[c.kind] ??= []).push(c)
    return out
  }, [all.data])
  const providerKinds = useMemo(() => new Set(rowsOf(providers.data).map((p) => p.kind)), [providers.data])

  let body
  if (all.error?.status === 403) body = <ForbiddenState title={t('ps.forbidden')} />
  else if (all.isError) body = <ErrorState title={t('integ.loadError')} onRetry={() => all.refetch()} />
  else if (all.isLoading || providers.isLoading) {
    body = <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{SERVICES.map((s) => <Skeleton key={s.kind} className="h-32 rounded-card" />)}</div>
  } else {
    body = (
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
        {SERVICES.map((s) => (
          <ServiceCard key={s.kind} service={s} connections={byKind[s.kind] ?? []} hasProviders={providerKinds.has(s.kind)}
            onOpen={(kind, connection, ref) => setPanel({ kind, connection, ref })} />
        ))}
      </ul>
    )
  }
  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / <Link to="/admin/platform" className="hover:underline">{t('ps.crumb')}</Link> / {t('integ.crumb')}</span>}
        title={t('integ.title')}
        subtitle={<span className="inline-flex items-center gap-1.5"><KeyRound size={13} aria-hidden className="shrink-0" />{t('integ.subtitle')}</span>}
      />
      {body}
      {panel && <SetUpPanel key={`${panel.kind}-${panel.connection?.id ?? 'new'}`} kind={panel.kind} connection={panel.connection} triggerRef={panel.ref} onClose={() => setPanel(null)} />}
    </div>
  )
}


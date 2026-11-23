import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Power } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import StepProgress from '../ui/StepProgress'
import Skeleton from '../ui/Skeleton'
import { RadioGroup } from '../ui/Choice'
import { useToast } from '../ui/toast'
import ProviderFields from './ProviderFields'
import { CopyValue, TestResult } from './ConnectionCard'
import { ConnectionStatusTag } from './tags'
import {
  useActivateConnection, useChannelConnections, useChannelProviders, useCreateConnection, useJourneys, useTestConnection, useUpdateConnection,
} from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'

// Set up or change a USSD or WhatsApp connection in four steps, like the provider set-up in 3.27:
// 1 Provider, 2 Keys, 3 Test, 4 Activate. Changing keys later keeps the webhook address and the journey;
// the connection is then tested and activated again.

const STEPS = ['provider', 'keys', 'test', 'activate']

function errorText(err) {
  const errors = err?.data?.errors
  if (errors && typeof errors === 'object') {
    return Object.entries(errors).map(([k, v]) => (k === 'detail' || k === 'code' ? (k === 'detail' ? v : '') : `${k}: ${[].concat(v).join(' ')}`)).filter(Boolean).join(' ')
  }
  return err?.message ?? ''
}

export default function ConnectionSetup({ kind, connectionId, startStep = 0, open, onClose, triggerRef }) {
  const { t } = useI18n()
  const toast = useToast()
  const providers = useChannelProviders()
  const journeys = useJourneys({ channel: kind })
  const connections = useChannelConnections()
  const create = useCreateConnection()
  const update = useUpdateConnection()
  const test = useTestConnection()
  const activate = useActivateConnection()

  const [step, setStep] = useState(startStep)
  const [id, setId] = useState(connectionId ?? null)
  const [provider, setProvider] = useState(kind === 'ussd' ? 'ussd_log_only' : 'whatsapp_twilio')
  const [preset, setPreset] = useState('africas_talking')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [journey, setJourney] = useState('')
  const [config, setConfig] = useState({})
  const [secretEdits, setSecretEdits] = useState({})
  const [invalid, setInvalid] = useState({})
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const connection = (connections.data ?? []).find((c) => c.id === id) ?? null
  const providerList = providers.data?.[kind] ?? []
  const providerDef = providerList.find((p) => p.key === (connection?.provider ?? provider))
  const journeyOptions = useMemo(() => [
    { value: '', label: t('ch.conn.chooseLater') },
    ...(journeys.data ?? []).filter((j) => j.channel === kind || j.channel === 'both').map((j) => ({ value: j.id, label: j.version ? j.name : `${j.name} (${t('ch.status.draft')})` })),
  ], [journeys.data, kind, t])

  // Fill the form from the saved connection when the dialog opens.
  useEffect(() => {
    if (!open) return
    setStep(startStep)
    setId(connectionId ?? null)
    setSecretEdits({})
    setResult(null)
    setError('')
    setPhone('')
    if (!connectionId) {
      setName('')
      setAddress('')
      setJourney(journeyOptions.find((o) => o.value)?.value ?? '')
      setConfig({})
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId])

  useEffect(() => {
    if (!open || !connection) return
    setName(connection.name)
    setAddress(connection.address ?? '')
    setJourney(connection.journey?.id ?? '')
    setConfig(connection.config ?? {})
    // Load once per connection; later edits stay in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection?.id])

  const busy = create.isPending || update.isPending || test.isPending || activate.isPending

  const saveStep1 = async () => {
    if (!name.trim()) return setError(t('ch.conn.nameRequired'))
    try {
      if (!id) {
        const body = { kind, provider, name: name.trim(), address, journey: journey || null }
        if (kind === 'ussd' && provider === 'ussd_generic') body.preset = preset
        if (kind === 'ussd' && provider === 'ussd_log_only') body.preset = 'africas_talking'
        const created = await create.mutateAsync(body)
        setId(created.id)
        setConfig(created.config ?? {})
        toast.show({ title: t('ch.conn.added', { name: created.name }), tone: 'success' })
      } else {
        await update.mutateAsync({ id, body: { name: name.trim(), address, journey: journey || null } })
      }
      setError('')
      setStep(1)
    } catch (err) {
      setError(errorText(err))
    }
  }

  const saveKeys = async () => {
    if (Object.values(invalid).some(Boolean)) return setError(t('ch.keys.badJson'))
    const original = connection?.config ?? {}
    const changed = Object.fromEntries(Object.entries(config).filter(([k, v]) => JSON.stringify(original[k]) !== JSON.stringify(v)))
    const body = {}
    if (Object.keys(changed).length) body.config = changed
    if (Object.keys(secretEdits).length) body.secrets = secretEdits
    try {
      if (Object.keys(body).length) {
        const saved = await update.mutateAsync({ id, body })
        if (saved.warnings?.length) toast.show({ title: t('ch.conn.saved'), body: saved.warnings.join(' '), tone: 'warning' })
      }
      setSecretEdits({})
      setError('')
      setStep(2)
    } catch (err) {
      setError(errorText(err))
    }
  }

  const runTest = async () => {
    try {
      const answer = await test.mutateAsync({ id, body: kind === 'whatsapp' && phone ? { phone } : {} })
      setResult(answer.result)
      setError('')
    } catch (err) {
      setError(errorText(err))
    }
  }

  const doActivate = async () => {
    try {
      await activate.mutateAsync(id)
      toast.show({ title: t('ch.conn.activated', { name }), tone: 'success' })
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }

  const tested = (result ?? connection?.last_test_result)?.ok && ['tested', 'off', 'active'].includes(connection?.status)
  const footer = (
    <>
      {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>{t('ch.keys.back')}</Button>}
      <Button variant="ghost" onClick={onClose}>{id ? t('ch.keys.saveDraft') : t('common.cancel')}</Button>
      {step === 0 && <Button loading={busy} onClick={saveStep1}>{t('ch.keys.next')}</Button>}
      {step === 1 && <Button loading={busy} onClick={saveKeys}>{t('ch.keys.saveNext')}</Button>}
      {step === 2 && <Button disabled={!tested} onClick={() => setStep(3)}>{t('ch.keys.next')}</Button>}
      {step === 3 && !connection?.is_active && <Button icon={<Power size={16} />} loading={busy} disabled={!tested} onClick={doActivate}>{t('ch.conn.activate')}</Button>}
      {step === 3 && connection?.is_active && <Button onClick={onClose}>{t('ch.keys.done')}</Button>}
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      size="lg"
      title={id ? t('ch.keys.changeTitle', { name: connection?.name ?? name }) : t(kind === 'ussd' ? 'ch.keys.newUssd' : 'ch.keys.newWhatsapp')}
      footer={footer}
    >
      <div className="space-y-4">
        <StepProgress steps={STEPS.map((s) => t(`ch.keys.step.${s}`))} current={step} onStepClick={(i) => (id && i < step ? setStep(i) : null)} />
        {providers.isLoading ? <Skeleton className="h-40 w-full" /> : null}

        {step === 0 && !providers.isLoading && (
          <div className="space-y-4">
            {!id && (
              <RadioGroup name="provider" legend={t('ch.conn.provider')} variant="cards" value={provider} onChange={setProvider}
                options={providerList.map((p) => ({ value: p.key, label: p.label, description: p.description }))} />
            )}
            {!id && kind === 'ussd' && provider === 'ussd_generic' && (
              <RadioGroup name="preset" legend={t('ch.conn.preset')} value={preset} onChange={setPreset}
                options={(providers.data?.ussd_presets ?? []).map((p) => ({ value: p.key, label: t(`ch.preset.${p.key}`), description: t(`ch.presetHint.${p.key}`) }))} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('ch.conn.name')} required placeholder={kind === 'ussd' ? 'Mascom *123#' : 'Twilio Sandbox'} value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
              <Input label={t(kind === 'ussd' ? 'ch.conn.shortCode' : 'ch.conn.number')} optional placeholder={kind === 'ussd' ? '*123#' : '+14155238886'} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <Select label={t('ch.conn.journey')} options={journeyOptions} value={journey} onChange={setJourney} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {connection && <CopyValue label={t('ch.conn.webhook')} value={connection.webhook_url} />}
            {providerDef?.setup_steps?.length > 0 && (
              <ol className="list-decimal pl-5 space-y-0.5 text-sm text-muted">{providerDef.setup_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            )}
            {providerDef ? (
              <ProviderFields provider={providerDef} config={config} onConfig={(f, v) => setConfig((c) => ({ ...c, [f]: v }))}
                secretState={connection?.secrets} secretEdits={secretEdits} onSecret={(f, v) => setSecretEdits((s) => ({ ...s, [f]: v }))}
                onInvalid={(f, bad) => setInvalid((x) => ({ ...x, [f]: bad }))} />
            ) : (
              <p className="text-sm text-danger">{t('ch.conn.providerGone')}</p>
            )}
            {connection?.is_active && <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">{t('ch.conn.editActiveHint')}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t(kind === 'ussd' ? 'ch.keys.testUssd' : 'ch.keys.testWhatsapp')}</p>
            {kind === 'whatsapp' && (
              <Input label={t('ch.conn.testPhone')} hint={t('ch.conn.testPhoneHint')} optional type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+267 71 234 567" />
            )}
            <Button variant="secondary" loading={test.isPending} onClick={runTest}>{t('ch.conn.runTest')}</Button>
            <TestResult result={result ?? connection?.last_test_result} />
          </div>
        )}

        {step === 3 && connection && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-text"><CheckCircle2 size={16} className="text-success" aria-hidden />{t('ch.keys.readyBody')}</p>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">{t('ch.conn.name')}</dt><dd className="text-text">{connection.name}</dd>
              <dt className="text-muted">{t('ch.conn.provider')}</dt><dd className="text-text">{connection.provider_label}</dd>
              <dt className="text-muted">{t('ch.conn.runs')}</dt><dd className="text-text">{connection.journey?.name ?? t('ch.conn.noJourney')}</dd>
              <dt className="text-muted">{t('ch.conn.status')}</dt><dd><ConnectionStatusTag status={connection.status} /></dd>
            </dl>
            <CopyValue label={t('ch.conn.webhook')} value={connection.webhook_url} />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

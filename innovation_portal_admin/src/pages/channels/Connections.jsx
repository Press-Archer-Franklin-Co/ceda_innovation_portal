import { useEffect, useMemo, useState } from 'react'
import { Plus, RadioTower, MessageCircle } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'
import { RadioGroup, Toggle } from '../../components/ui/Choice'
import { useToast } from '../../components/ui/toast'
import ConnectionCard from '../../components/channels/ConnectionCard'
import ChannelStatusBanner from '../../components/channels/ChannelStatusBanner'
import ConnectionFields from '../admin/platform/ConnectionFields'
import { useChannelConnections, useChannelProviders, useCreateConnection, useJourneys, useUpdateConnection } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'

function useJourneyOptions(kind) {
  const t = useT()
  const { data } = useJourneys()
  return useMemo(
    () => [
      { value: '', label: t('ch.conn.chooseLater') },
      ...(data ?? [])
        .filter((j) => j.channel === kind || j.channel === 'both')
        .map((j) => ({ value: j.id, label: j.version ? j.name : `${j.name} (${t('ch.status.draft')})` })),
    ],
    [data, kind, t],
  )
}

function AddConnectionDialog({ kind, open, onClose, onCreated }) {
  const t = useT()
  const toast = useToast()
  const create = useCreateConnection()
  const providers = useChannelProviders()
  const journeyOptions = useJourneyOptions(kind)
  const presets = providers.data?.ussd_presets ?? []
  const whatsappProviders = providers.data?.whatsapp ?? []
  const [preset, setPreset] = useState('africas_talking')
  const [testOnly, setTestOnly] = useState(true)
  const [provider, setProvider] = useState('whatsapp_cloud')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [journey, setJourney] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setAddress('')
      setError('')
      setJourney(journeyOptions.find((o) => o.value)?.value ?? '')
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('ch.conn.nameRequired'))
      return
    }
    const body =
      kind === 'ussd'
        ? { kind, provider: testOnly ? 'ussd_log_only' : 'ussd_generic', preset, name: name.trim(), address, journey: journey || null }
        : { kind, provider, name: name.trim(), address, journey: journey || null }
    try {
      const connection = await create.mutateAsync(body)
      toast.show({ title: t('ch.conn.added', { name: connection.name }), body: t(connection.status === 'waiting' ? 'ch.conn.addedWaiting' : 'ch.conn.addedReady'), tone: 'success' })
      onClose()
      onCreated?.(connection)
    } catch (err) {
      setError(err.data?.errors ? Object.values(err.data.errors).flat().join(' ') : err.message)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t(kind === 'ussd' ? 'ch.conn.addOperator' : 'ch.conn.addNumber')}
      description={t(kind === 'ussd' ? 'ch.conn.addOperatorBody' : 'ch.conn.addNumberBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="add-connection" loading={create.isPending}>{t('ch.conn.add')}</Button>
        </>
      }
    >
      <form id="add-connection" className="space-y-4" onSubmit={submit}>
        {kind === 'ussd' ? (
          <>
            <RadioGroup
              name="preset"
              legend={t('ch.conn.preset')}
              variant="cards"
              value={preset}
              onChange={setPreset}
              options={presets.map((p) => ({ value: p.key, label: t(`ch.preset.${p.key}`), description: t(`ch.presetHint.${p.key}`) }))}
            />
            <Toggle label={t('ch.conn.testOnly')} description={t('ch.conn.testOnlyHint')} checked={testOnly} onChange={setTestOnly} />
          </>
        ) : (
          <Select label={t('ch.conn.provider')} options={whatsappProviders.map((p) => ({ value: p.key, label: p.label }))} value={provider} onChange={setProvider} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('ch.conn.name')} placeholder={kind === 'ussd' ? 'Mascom *123#' : 'CEDA WhatsApp'} value={name} onChange={(e) => { setName(e.target.value); setError('') }} required />
          <Input label={t(kind === 'ussd' ? 'ch.conn.shortCode' : 'ch.conn.number')} placeholder={kind === 'ussd' ? '*123#' : '+267 7x xxx xxx'} optional value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <Select label={t('ch.conn.journey')} options={journeyOptions} value={journey} onChange={setJourney} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

function EditConnectionDialog({ connection, onClose }) {
  const t = useT()
  const toast = useToast()
  const update = useUpdateConnection()
  const providers = useChannelProviders()
  const journeyOptions = useJourneyOptions(connection?.kind)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [journey, setJourney] = useState('')
  const [config, setConfig] = useState({})
  const [secretEdits, setSecretEdits] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!connection) return
    setName(connection.name)
    setAddress(connection.address ?? '')
    setJourney(connection.journey?.id ?? '')
    setConfig(connection.config ?? {})
    setSecretEdits({})
    setError('')
  }, [connection])

  if (!connection) return null
  const providerDef = (providers.data?.[connection.kind] ?? []).find((p) => p.key === connection.provider)

  const save = async (e) => {
    e.preventDefault()
    const original = connection.config ?? {}
    const changedConfig = Object.fromEntries(Object.entries(config).filter(([k, v]) => JSON.stringify(original[k]) !== JSON.stringify(v)))
    const body = { name, address, journey: journey || null }
    if (Object.keys(changedConfig).length) body.config = changedConfig
    if (Object.keys(secretEdits).length) body.secrets = secretEdits
    try {
      const saved = await update.mutateAsync({ id: connection.id, body })
      toast.show({ title: t('ch.conn.saved'), body: saved.warnings?.length ? saved.warnings.join(' ') : body.config || body.secrets ? t('ch.conn.savedRetest') : undefined, tone: saved.warnings?.length ? 'warning' : 'success' })
      onClose()
    } catch (err) {
      setError(err.data?.errors ? Object.entries(err.data.errors).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join(' ') : err.message)
    }
  }

  return (
    <Modal
      open={!!connection}
      onClose={onClose}
      size="lg"
      title={t('ch.conn.editTitle', { name: connection.name })}
      description={connection.is_active ? t('ch.conn.editActiveHint') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="edit-connection" loading={update.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form id="edit-connection" className="space-y-4" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('ch.conn.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={t(connection.kind === 'ussd' ? 'ch.conn.shortCode' : 'ch.conn.number')} optional value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <Select label={t('ch.conn.journey')} options={journeyOptions} value={journey} onChange={setJourney} />
        {providerDef?.setup_steps?.length > 0 && (
          <ol className="list-decimal pl-5 space-y-0.5 text-xs text-muted">{providerDef.setup_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        )}
        {providerDef ? (
          <ConnectionFields
            fields={providerDef.fields}
            config={config}
            onConfigChange={(field, value) => setConfig((c) => ({ ...c, [field]: value }))}
            secretState={connection.secrets}
            secretEdits={secretEdits}
            onSecretChange={(field, value) => setSecretEdits((s) => ({ ...s, [field]: value }))}
          />
        ) : providers.isLoading ? (
          <SkeletonCards count={1} />
        ) : (
          <p className="text-sm text-danger">{t('ch.conn.providerGone')}</p>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

function KindSection({ kind, connections, onAdd, onEdit }) {
  const t = useT()
  const Icon = kind === 'ussd' ? RadioTower : MessageCircle
  return (
    <section aria-labelledby={`conn-${kind}`} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`conn-${kind}`} className="flex items-center gap-2 text-base font-bold text-text"><Icon size={16} aria-hidden />{t(`ch.channel.${kind}`)}</h2>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAdd}>{t(kind === 'ussd' ? 'ch.conn.addOperator' : 'ch.conn.addNumber')}</Button>
      </div>
      {connections.length === 0 ? (
        <EmptyState compact framed icon={Icon} title={t(`ch.conn.empty.${kind}`)} message={t(`ch.conn.emptyBody.${kind}`)} action={<Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>{t(kind === 'ussd' ? 'ch.conn.addOperator' : 'ch.conn.addNumber')}</Button>} />
      ) : (
        <div className="grid gap-3.5 xl:grid-cols-2">
          {connections.map((c) => <ConnectionCard key={c.id} connection={c} onEdit={onEdit} />)}
        </div>
      )}
    </section>
  )
}

export default function Connections() {
  const t = useT()
  const { data, isLoading, isError, error, refetch, isFetching } = useChannelConnections()
  const [adding, setAdding] = useState(null)
  const [editing, setEditing] = useState(null)
  const list = data ?? []
  // Keep the dialog in step with the list after a save or test.
  const editingNow = editing ? list.find((c) => c.id === editing.id) ?? editing : null

  return (
    <div>
      <PageHeader title={t('ch.conn.title')} subtitle={t('ch.conn.subtitle')} />
      <ChannelStatusBanner className="mb-3.5" />
      {isLoading ? (
        <SkeletonCards count={2} />
      ) : isError ? (
        <ErrorState title={t('ch.conn.loadFailed')} message={error?.message} onRetry={refetch} retrying={isFetching} framed />
      ) : (
        <div className="space-y-6">
          {['ussd', 'whatsapp'].map((kind) => (
            <KindSection key={kind} kind={kind} connections={list.filter((c) => c.kind === kind)} onAdd={() => setAdding(kind)} onEdit={setEditing} />
          ))}
        </div>
      )}
      <AddConnectionDialog kind={adding ?? 'ussd'} open={!!adding} onClose={() => setAdding(null)} onCreated={(c) => (c.status === 'waiting' ? setEditing(c) : null)} />
      <EditConnectionDialog connection={editingNow} onClose={() => setEditing(null)} />
    </div>
  )
}

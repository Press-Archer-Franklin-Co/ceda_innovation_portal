import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, LogIn, MinusCircle, Play, Plus, Power, PowerOff, Save, Trash2, XCircle } from 'lucide-react'
import SectionCard from '../../../components/ui/SectionCard'
import Modal from '../../../components/ui/Modal'
import EmptyState from '../../../components/ui/EmptyState'
import ErrorState from '../../../components/ui/ErrorState'
import { SkeletonCards } from '../../../components/ui/LoadingSkeleton'
import { cn } from '../../../lib/cn'
import {
  useActivateIntegration,
  useDeactivateIntegration,
  useDeleteIntegration,
  useIntegration,
  useIntegrationHistory,
  useIntegrations,
  useProviders,
  useRuntimeStatus,
  useSaveIntegration,
  useStartSsoTrial,
  useTestIntegration,
} from '../../../lib/queries/platform'
import ConnectionFields from './ConnectionFields'
import { ConnectionStatusBadge, CopyField, ErrorBanner, SourceBadge, WarningList } from './shared'
import { formatWhen } from './utils'
import { useConfirm } from '../../../components/ui/confirm'

const COPY = {
  sso: {
    noun: 'single sign-on',
    empty: 'No single sign-on connection yet. Add one to let staff sign in with their CEDA account.',
  },
  sms: {
    noun: 'SMS',
    empty: 'No SMS connection yet. Add one to send sign-in codes and messages by SMS.',
  },
}

const HISTORY_LABELS = {
  integration_created: 'Created',
  integration_updated: 'Changed',
  integration_tested: 'Tested',
  integration_activated: 'Activated',
  integration_deactivated: 'Switched off',
  integration_deleted: 'Deleted',
  integration_sso_trial_started: 'Started a trial sign-in',
  integration_sso_trial_completed: 'Finished a trial sign-in',
}

// --------------------------------------------------------------------------------------

function RuntimeCard({ kind }) {
  const { data } = useRuntimeStatus()
  const status = data?.[kind]
  const connection = status?.connection
  return (
    <SectionCard title={kind === 'sms' ? 'SMS in use now' : 'Single sign-on in use now'}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div>
          <p className="text-xs text-ceda-muted">Source</p>
          <SourceBadge source={status?.source ?? 'none'} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-ceda-muted">Active connection</p>
          <p className="font-medium text-ceda-dark truncate">
            {connection ? `${connection.name} (${connection.provider_label})` : 'None'}
          </p>
        </div>
        {connection && (
          <>
            <div>
              <p className="text-xs text-ceda-muted">Last tested</p>
              <p className="text-ceda-dark">{formatWhen(connection.last_tested_at)}</p>
            </div>
            <div>
              <p className="text-xs text-ceda-muted">Status</p>
              <ConnectionStatusBadge status={connection.status} />
            </div>
          </>
        )}
      </div>
      {status?.source === 'environment' && (
        <p className="text-xs text-ceda-muted mt-3">
          The server is using settings from its environment variables. Activate a connection here to take over.
        </p>
      )}
    </SectionCard>
  )
}

// --------------------------------------------------------------------------------------

function StepList({ result }) {
  if (!result?.steps?.length) return null
  return (
    <ul className="space-y-2">
      {result.steps.map((step, index) => {
        const Icon = step.skipped ? MinusCircle : step.ok ? CheckCircle2 : XCircle
        return (
          <li key={`${step.step}-${index}`} className="flex gap-3">
            <Icon
              size={18}
              className={cn('flex-shrink-0 mt-0.5', step.skipped ? 'text-ceda-muted' : step.ok ? 'text-green-600' : 'text-red-600')}
              aria-label={step.skipped ? 'Skipped' : step.ok ? 'Passed' : 'Failed'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ceda-dark">{step.step}</p>
                {step.ms > 0 && <span className="text-[11px] text-ceda-muted flex-shrink-0">{step.ms} ms</span>}
              </div>
              {step.detail && <p className="text-xs text-ceda-muted break-words">{step.detail}</p>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function TrialSummary({ trial }) {
  if (!trial) return null
  return (
    <div className="rounded-lg border border-ceda-border bg-ceda-surface px-4 py-3 text-sm space-y-1">
      <p><span className="text-ceda-muted">Email:</span> {trial.email || 'not received'}</p>
      <p><span className="text-ceda-muted">Name:</span> {trial.name || 'not received'}</p>
      <p className="break-words"><span className="text-ceda-muted">Groups:</span> {trial.groups?.length ? trial.groups.join(', ') : 'none'}</p>
      <p className={trial.allowed ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
        {trial.allowed
          ? `Allowed (by ${trial.allowed_by}). A new user would get: ${trial.role}.`
          : `Would be refused: ${trial.reason}`}
      </p>
    </div>
  )
}

function TestPanel({ open, onClose, connection }) {
  const testMutation = useTestIntegration()
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (open) { setResult(null); testMutation.reset() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const run = () => {
    const body = connection.kind === 'sms' && phone.trim() ? { phone: phone.trim() } : {}
    testMutation.mutate({ id: connection.id, body }, { onSuccess: (data) => setResult(data.result) })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Test ${connection.name}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={run} disabled={testMutation.isPending}>
            <Play size={14} /> {testMutation.isPending ? 'Testing…' : 'Run test'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {connection.kind === 'sms' && (
          <div>
            <label className="label" htmlFor="test-phone">Send a test message to (optional)</label>
            <input
              id="test-phone"
              className="input"
              inputMode="tel"
              placeholder="+267 71 234 567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-ceda-muted mt-1">The number is used once and not saved. Leave empty to only check the credentials.</p>
          </div>
        )}
        <ErrorBanner error={testMutation.error} />
        {result && (
          <div className="space-y-3">
            <p className={cn('text-sm font-semibold', result.ok ? 'text-green-700' : 'text-red-700')}>
              {result.ok ? 'Test passed. You can activate this connection.' : 'Test failed. Fix the settings and test again.'}
            </p>
            <StepList result={result} />
          </div>
        )}
      </div>
    </Modal>
  )
}

// --------------------------------------------------------------------------------------

function History({ id }) {
  const { data } = useIntegrationHistory(id)
  if (!data?.length) return <p className="text-sm text-ceda-muted">No changes yet.</p>
  return (
    <ul className="divide-y divide-ceda-border/60">
      {data.map((item, index) => (
        <li key={index} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-ceda-dark">
            {HISTORY_LABELS[item.action_type] ?? item.action_type}
            {item.action_type === 'integration_tested' && (item.metadata?.ok ? ' (passed)' : ' (failed)')}
            {item.actor ? ` by ${item.actor.name}` : ''}
          </span>
          <span className="text-xs text-ceda-muted">{formatWhen(item.created_at)}</span>
        </li>
      ))}
    </ul>
  )
}

// --------------------------------------------------------------------------------------

function parseSecretEdits(edits, fields) {
  const secrets = {}
  for (const [name, value] of Object.entries(edits)) {
    if (value === undefined || value === '') continue
    if (value === null) { secrets[name] = null; continue }
    const field = fields.find((f) => f.name === name)
    if (field?.type === 'json') {
      try {
        secrets[name] = JSON.parse(value)
      } catch {
        throw new Error(`${field.label}: enter valid JSON, for example {"Authorization": "Bearer ..."}.`)
      }
    } else {
      secrets[name] = value
    }
  }
  return secrets
}

function defaultsFor(provider) {
  const config = {}
  for (const field of provider?.fields ?? []) {
    if (!field.secret && field.default !== null && field.default !== undefined) config[field.name] = field.default
  }
  return config
}

function ConnectionEditor({ kind, connection, providers, onSaved, onDeleted }) {
  const confirm = useConfirm()
  const isNew = !connection
  const [providerKey, setProviderKey] = useState(connection?.provider ?? providers[0]?.key ?? '')
  const provider = providers.find((p) => p.key === providerKey)
  const [name, setName] = useState(connection?.name ?? '')
  const [config, setConfig] = useState(() => connection?.config ?? defaultsFor(provider))
  const [secretEdits, setSecretEdits] = useState({})
  const [localError, setLocalError] = useState(null)
  const [testOpen, setTestOpen] = useState(false)
  const [trialStartedAt, setTrialStartedAt] = useState(null)

  const save = useSaveIntegration()
  const remove = useDeleteIntegration()
  const activate = useActivateIntegration()
  const deactivate = useDeactivateIntegration()
  const startTrial = useStartSsoTrial()

  // While a trial sign-in popup is open, poll until the result arrives (up to 5 minutes).
  const polling = !!trialStartedAt && Date.now() - trialStartedAt < 5 * 60 * 1000
  const live = useIntegration(connection?.id, { refetchInterval: polling ? 2000 : false })
  const current = live.data ?? connection
  const lastResult = current?.last_test_result
  const trialDone =
    trialStartedAt && lastResult?.kind === 'sso_trial' && new Date(lastResult.tested_at).getTime() >= trialStartedAt - 5000
  useEffect(() => { if (trialDone) setTrialStartedAt(null) }, [trialDone])

  useEffect(() => {
    if (isNew) setConfig(defaultsFor(provider))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerKey])

  const setSecret = (fieldName, value) =>
    setSecretEdits((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[fieldName]
      else next[fieldName] = value
      return next
    })

  const dirty = isNew || name !== connection.name || JSON.stringify(config) !== JSON.stringify(connection.config) ||
    Object.values(secretEdits).some((v) => v !== '' && v !== undefined)

  const onSave = async () => {
    setLocalError(null)
    let secrets
    try {
      secrets = parseSecretEdits(secretEdits, provider?.fields ?? [])
    } catch (err) {
      setLocalError(err)
      return
    }
    if (!isNew && current.is_active && (JSON.stringify(config) !== JSON.stringify(connection.config) || Object.keys(secrets).length)) {
      const ok = await confirm({ title: 'Save and switch this connection off?', body: 'Changing settings switches it off until it is tested and activated again.', confirmLabel: 'Save changes', tone: 'primary' })
      if (!ok) return
    }
    const body = isNew
      ? { kind, provider: providerKey, name: name || provider?.label, config, secrets }
      : { name, config, secrets }
    save.mutate(
      { id: connection?.id, body },
      {
        onSuccess: (data) => {
          setSecretEdits({})
          onSaved?.(data)
        },
      },
    )
  }

  const onTrial = () => {
    startTrial.mutate(connection.id, {
      onSuccess: (data) => {
        setTrialStartedAt(Date.now())
        window.open(data.authorization_url, 'ceda-sso-trial', 'width=520,height=700')
      },
    })
  }

  const onDeactivate = async () => {
    const ok = await confirm({ title: `Switch off "${current.name}"?`, body: "The portal falls back to the server's environment settings, if any.", confirmLabel: 'Switch off' })
    if (!ok) return
    deactivate.mutate(current.id)
  }

  const onDelete = async () => {
    const ok = await confirm({ title: `Delete the connection "${current.name}"?`, note: 'This cannot be undone.', confirmLabel: 'Delete connection' })
    if (!ok) return
    remove.mutate(current.id, { onSuccess: () => onDeleted?.() })
  }

  const mutationError = localError || save.error || remove.error || activate.error || deactivate.error || startTrial.error

  return (
    <div className="space-y-4">
      <SectionCard
        title={isNew ? `New ${COPY[kind].noun} connection` : current.name}
        subtitle={isNew ? 'Saved as a draft. Test it, then activate it.' : `${current.provider_label} · last tested ${formatWhen(current.last_tested_at)}`}
        actions={!isNew && <ConnectionStatusBadge status={current.status} />}
      >
        <div className="space-y-5">
          <ErrorBanner error={mutationError} />
          <WarningList warnings={current?.warnings} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="connection-provider">Provider</label>
              <select
                id="connection-provider"
                className="select"
                value={providerKey}
                disabled={!isNew}
                onChange={(e) => setProviderKey(e.target.value)}
              >
                {providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              {provider?.description && <p className="text-xs text-ceda-muted mt-1">{provider.description}</p>}
            </div>
            <div>
              <label className="label" htmlFor="connection-name">Name</label>
              <input id="connection-name" className="input" value={name} placeholder={provider?.label} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          {kind === 'sso' && current?.redirect_uri && (
            <CopyField label="Redirect URI" value={current.redirect_uri} hint="Register this exact address with your provider." />
          )}
          {kind === 'sms' && current?.delivery_receipt_url && (
            <CopyField
              label="Delivery receipt URL"
              value={current.delivery_receipt_url}
              hint="Twilio and Infobip are told this address automatically. For others, add it in your provider's dashboard."
            />
          )}

          {provider?.setup_steps?.length > 0 && (
            <details className="rounded-lg border border-ceda-border px-4 py-3">
              <summary className="text-sm font-medium text-ceda-dark cursor-pointer">Setup steps for {provider.label}</summary>
              <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm text-ceda-muted">
                {provider.setup_steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </details>
          )}

          {provider && (
            <ConnectionFields
              fields={provider.fields}
              config={config}
              onConfigChange={(fieldName, value) => setConfig((prev) => ({ ...prev, [fieldName]: value }))}
              secretState={current?.secrets}
              secretEdits={secretEdits}
              onSecretChange={setSecret}
            />
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-ceda-border">
            <button className="btn-primary" onClick={onSave} disabled={save.isPending || !dirty}>
              <Save size={14} /> {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {!isNew && (
              <>
                <button className="btn-secondary" onClick={() => setTestOpen(true)} disabled={dirty}>
                  <Play size={14} /> Test connection
                </button>
                {kind === 'sso' && (
                  <button className="btn-secondary" onClick={onTrial} disabled={dirty || startTrial.isPending}>
                    <LogIn size={14} /> Try sign-in
                  </button>
                )}
                {current.is_active ? (
                  <button className="btn-secondary" onClick={onDeactivate} disabled={deactivate.isPending}>
                    <PowerOff size={14} /> Switch off
                  </button>
                ) : (
                  <button
                    className="btn-accent"
                    onClick={() => activate.mutate(current.id)}
                    disabled={!!current.activation_blocker || activate.isPending || dirty}
                    title={current.activation_blocker || 'Use this connection from now on'}
                  >
                    <Power size={14} /> Activate
                  </button>
                )}
                <button className="btn-ghost ml-auto text-ceda-red" onClick={onDelete} disabled={remove.isPending}>
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </div>
          {!isNew && dirty && <p className="text-xs text-ceda-muted">Save your changes before testing or activating.</p>}
          {!isNew && !dirty && !current.is_active && current.activation_blocker && (
            <p className="text-xs text-ceda-muted">Activate is not available yet: {current.activation_blocker}</p>
          )}
        </div>
      </SectionCard>

      {!isNew && (
        <>
          {(polling || lastResult?.steps) && (
            <SectionCard title={lastResult?.kind === 'sso_trial' ? 'Last trial sign-in' : 'Last test'} subtitle={formatWhen(current.last_tested_at)}>
              {polling ? (
                <p className="text-sm text-ceda-muted">Waiting for the sign-in window to finish…</p>
              ) : (
                <div className="space-y-3">
                  <StepList result={lastResult} />
                  <TrialSummary trial={lastResult?.trial} />
                </div>
              )}
            </SectionCard>
          )}
          <SectionCard title="History">
            <History id={current.id} />
          </SectionCard>
          <TestPanel open={testOpen} onClose={() => setTestOpen(false)} connection={current} />
        </>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------------------

export default function IntegrationTab({ kind }) {
  const providersQuery = useProviders(kind)
  const listQuery = useIntegrations(kind)
  const [selected, setSelected] = useState(null) // connection id, 'new' or null
  const connections = useMemo(() => listQuery.data ?? [], [listQuery.data])

  useEffect(() => {
    if (selected === null && connections.length) {
      setSelected((connections.find((c) => c.is_active) ?? connections[0]).id)
    }
  }, [connections, selected])

  if (providersQuery.isLoading || listQuery.isLoading) return <SkeletonCards count={2} />
  if (providersQuery.error || listQuery.error) {
    return <ErrorState message={(providersQuery.error || listQuery.error).message} onRetry={() => { providersQuery.refetch(); listQuery.refetch() }} />
  }

  const providers = providersQuery.data ?? []
  const selectedConnection = connections.find((c) => c.id === selected)

  return (
    <div className="space-y-4">
      <RuntimeCard kind={kind} />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <SectionCard
          title="Connections"
          padding={false}
          actions={
            <button className="btn-secondary btn-sm" onClick={() => setSelected('new')}>
              <Plus size={14} /> Add
            </button>
          }
        >
          {connections.length === 0 ? (
            <p className="text-sm text-ceda-muted p-4">None yet.</p>
          ) : (
            <ul className="divide-y divide-ceda-border/60">
              {connections.map((c) => (
                <li key={c.id}>
                  <button
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-ceda-surface transition-colors',
                      selected === c.id && 'bg-ceda-surface',
                    )}
                    onClick={() => setSelected(c.id)}
                  >
                    <p className="text-sm font-medium text-ceda-dark truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-ceda-muted truncate">{c.provider_label}</span>
                      <ConnectionStatusBadge status={c.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="min-w-0">
          {selected === 'new' ? (
            <ConnectionEditor
              key="new"
              kind={kind}
              providers={providers}
              onSaved={(data) => setSelected(data.id)}
            />
          ) : selectedConnection ? (
            <ConnectionEditor
              key={selectedConnection.id}
              kind={kind}
              connection={selectedConnection}
              providers={providers}
              onDeleted={() => setSelected(null)}
            />
          ) : (
            <EmptyState
              title={`No ${COPY[kind].noun} connection`}
              message={COPY[kind].empty}
              action={<button className="btn-primary" onClick={() => setSelected('new')}><Plus size={14} /> Add connection</button>}
            />
          )}
        </div>
      </div>
    </div>
  )
}

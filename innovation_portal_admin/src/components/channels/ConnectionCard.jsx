import { useState } from 'react'
import { CheckCircle2, Copy, Check, MinusCircle, Pencil, Play, Power, PowerOff, RefreshCw, Trash2, XCircle } from 'lucide-react'
import SectionCard from '../ui/SectionCard'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import DropdownMenu from '../ui/DropdownMenu'
import { useToast } from '../ui/toast'
import { useConfirm } from '../ui/confirm'
import { ConnectionStatusTag } from './tags'
import { useActivateConnection, useDeactivateConnection, useDeleteConnection, useRotateWebhook, useTestConnection } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'

export function CopyValue({ label, value, mono = true }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      <p className="text-d-cap text-muted mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className={cn('flex-1 min-w-0 truncate rounded-control bg-surface2 px-2 py-1.5 text-xs text-text', !mono && 'font-body')} title={value}>{value}</code>
        <Button size="sm" variant="secondary" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy} aria-label={t('ch.conn.copyLabel', { label })}>
          {copied ? t('ch.conn.copied') : t('ch.conn.copy')}
        </Button>
      </div>
    </div>
  )
}

function TestResult({ result }) {
  const t = useT()
  if (!result?.steps) return null
  return (
    <div className="space-y-1.5">
      <p className="text-d-cap text-muted">{t('ch.conn.lastTest')}</p>
      <ul className="space-y-1">
        {result.steps.map((step, i) => {
          const Icon = step.skipped ? MinusCircle : step.ok ? CheckCircle2 : XCircle
          return (
            <li key={i} className="flex gap-2 text-xs">
              <Icon size={14} aria-hidden className={cn('shrink-0 mt-px', step.skipped ? 'text-muted' : step.ok ? 'text-success' : 'text-danger')} />
              <div className="min-w-0">
                <span className="font-bold text-text">{step.step}</span>
                {step.detail && !step.detail.includes('\n') && <span className="text-muted">: {step.detail}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      {result.reply?.body && (
        <div>
          <p className="text-d-cap text-muted mb-0.5">{t('ch.conn.exactReply', { type: result.reply.content_type })}</p>
          <pre className="whitespace-pre-wrap break-words rounded-control bg-surface2 p-2 text-xs text-text">{result.reply.body}</pre>
        </div>
      )}
    </div>
  )
}

function WhatsAppTestDialog({ open, onClose, onRun, running }) {
  const t = useT()
  const [phone, setPhone] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ch.conn.testTitle')}
      description={t('ch.conn.testBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={running} onClick={() => onRun(phone)}>{t('ch.conn.runTest')}</Button>
        </>
      }
    >
      <Input label={t('ch.conn.testPhone')} hint={t('ch.conn.testPhoneHint')} optional type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+267 71 234 567" />
    </Modal>
  )
}

export default function ConnectionCard({ connection, onEdit }) {
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const test = useTestConnection()
  const activate = useActivateConnection()
  const deactivate = useDeactivateConnection()
  const remove = useDeleteConnection()
  const rotate = useRotateWebhook()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)
  const instructions = connection.provider_instructions ?? {}
  const shown = result ?? connection.last_test_result

  const runTest = async (phone) => {
    try {
      const answer = await test.mutateAsync({ id: connection.id, body: phone ? { phone } : {} })
      setResult(answer.result)
      setTesting(false)
      toast.show({ title: answer.result.ok ? t('ch.conn.testPassed') : t('ch.conn.testFailed'), tone: answer.result.ok ? 'success' : 'error' })
    } catch (error) {
      toast.show({ title: t('ch.conn.testFailed'), body: error.message, tone: 'error' })
    }
  }

  const doActivate = async () => {
    try {
      await activate.mutateAsync(connection.id)
      toast.show({ title: t('ch.conn.activated', { name: connection.name }), tone: 'success' })
    } catch (error) {
      toast.show({ title: t('ch.conn.activateFailed'), body: error.data?.errors?.detail || error.message, tone: 'error' })
    }
  }

  const doDeactivate = async () => {
    const ok = await confirm({ title: t('ch.conn.offTitle', { name: connection.name }), body: t('ch.conn.offBody'), confirmLabel: t('ch.conn.turnOff') })
    if (!ok) return
    try {
      await deactivate.mutateAsync(connection.id)
      toast.show({ title: t('ch.conn.turnedOff', { name: connection.name }), tone: 'info' })
    } catch (error) {
      toast.show({ title: t('ch.conn.actionFailed'), body: error.message, tone: 'error' })
    }
  }

  const doRotate = async () => {
    const ok = await confirm({ title: t('ch.conn.rotateTitle'), body: t('ch.conn.rotateBody'), confirmLabel: t('ch.conn.rotate'), tone: 'primary' })
    if (!ok) return
    try {
      await rotate.mutateAsync(connection.id)
      toast.show({ title: t('ch.conn.rotated'), tone: 'success' })
    } catch (error) {
      toast.show({ title: t('ch.conn.actionFailed'), body: error.message, tone: 'error' })
    }
  }

  const doDelete = async () => {
    const ok = await confirm({ title: t('ch.conn.deleteTitle', { name: connection.name }), body: t('ch.conn.deleteBody'), confirmLabel: t('ch.conn.delete') })
    if (!ok) return
    try {
      await remove.mutateAsync(connection.id)
      toast.show({ title: t('ch.conn.deleted', { name: connection.name }), tone: 'info' })
    } catch (error) {
      toast.show({ title: t('ch.conn.actionFailed'), body: error.message, tone: 'error' })
    }
  }

  const startTest = () => (connection.kind === 'whatsapp' ? setTesting(true) : runTest(''))

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate">{connection.name}</span>
          <ConnectionStatusTag status={connection.status} />
        </span>
      }
      subtitle={[connection.address, connection.provider_label].filter(Boolean).join(' · ')}
      actions={
        <DropdownMenu
          label={t('ch.conn.more', { name: connection.name })}
          items={[
            { key: 'edit', label: t('ch.conn.edit'), icon: Pencil, onSelect: () => onEdit(connection) },
            { key: 'rotate', label: t('ch.conn.rotate'), icon: RefreshCw, onSelect: doRotate },
            { key: 'delete', label: t('ch.conn.delete'), icon: Trash2, danger: true, onSelect: doDelete },
          ]}
        />
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text">
          <span className="text-muted">{t('ch.conn.runs')}: </span>
          {connection.journey ? `${connection.journey.name}${connection.journey.version ? ` (${t('ch.status.published', { version: connection.journey.version })})` : ` (${t('ch.status.draft')})`}` : <span className="text-warning">{t('ch.conn.noJourney')}</span>}
        </p>
        {connection.status === 'waiting' && <p className="rounded-control bg-warning-soft px-2.5 py-1.5 text-xs text-warning">{t('ch.conn.waitingHint')}</p>}

        <CopyValue label={t('ch.conn.webhook')} value={connection.webhook_url} />
        {connection.provider === 'whatsapp_cloud' && connection.config?.verify_token && <CopyValue label={t('ch.conn.verifyToken')} value={connection.config.verify_token} />}

        <details className="rounded-control border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-bold text-text">{t('ch.conn.whatToSend')}</summary>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">{t('ch.conn.method')}</dt><dd className="text-text">{instructions.method}</dd>
            <dt className="text-muted">{t('ch.conn.format')}</dt><dd className="text-text">{instructions.format}</dd>
          </dl>
          <ul className="mt-2 list-disc pl-4 space-y-0.5 text-text">{(instructions.lines ?? []).map((line, i) => <li key={i}>{line}</li>)}</ul>
        </details>

        {connection.kind === 'whatsapp' && connection.templates_missing?.length > 0 && (
          <p className="text-xs text-muted">{t('ch.conn.templatesMissing', { list: connection.templates_missing.map((k) => t(`ch.template.${k}`)).join(', ') })}</p>
        )}

        <TestResult result={shown} />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" icon={<Play size={14} />} loading={test.isPending} onClick={startTest}>{t('ch.conn.test')}</Button>
          {connection.status === 'tested' && <Button size="sm" icon={<Power size={14} />} loading={activate.isPending} onClick={doActivate}>{t('ch.conn.activate')}</Button>}
          {connection.status === 'off' && shown?.ok && <Button size="sm" icon={<Power size={14} />} loading={activate.isPending} onClick={doActivate}>{t('ch.conn.activate')}</Button>}
          {connection.is_active && <Button size="sm" variant="ghost" icon={<PowerOff size={14} />} loading={deactivate.isPending} onClick={doDeactivate}>{t('ch.conn.turnOff')}</Button>}
          {connection.status === 'waiting' && <Button size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(connection)}>{t('ch.conn.enterDetails')}</Button>}
        </div>
      </div>
      <WhatsAppTestDialog open={testing} onClose={() => setTesting(false)} onRun={runTest} running={test.isPending} />
    </SectionCard>
  )
}

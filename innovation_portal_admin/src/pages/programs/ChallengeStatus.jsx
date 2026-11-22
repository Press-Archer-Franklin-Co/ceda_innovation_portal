import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import Tag from '../../components/ui/Tag'
import StatusPill from '../../components/ui/StatusPill'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import { useToast } from '../../components/ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { programs as programsApi } from '../../lib/api/endpoints'
import { useProgram } from '../../lib/queries/programs'
import { EMPTY_CELL } from '../../lib/format'

// 3.6 Challenge status (Figma 20:840, phone; the website uses the same layout). Live numbers for a running call
// and the two quick actions: post an update to everyone who started an entry, and extend the deadline.
// Numbers come from GET /api/programs/{id}/status-numbers/ (R-53). Until it lands: "started" from the public
// challenge, "submitted" from the staff list, and a dash for the rest (never a guess).

function toInput(value) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function statusNumbers(program) {
  try {
    return await client.get(`/api/programs/${program.id}/status-numbers/`)
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err
    // TODO(R-53): drop this once status-numbers is on main.
    const [publicDetail, list] = await Promise.all([
      program.slug ? client.get(`/api/programs/public/${program.slug}/`).catch(() => null) : null,
      client.get('/api/submissions/staff-list/', { program: program.id, page_size: 1 }).catch(() => null),
    ])
    return { started: publicDetail?.started_count ?? null, submitted: list?.count ?? null, reviewed: null, to_panel: null }
  }
}

function Stat({ value, label }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <span className="font-heading text-[28px] font-extrabold leading-none text-text">{value ?? EMPTY_CELL}</span>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  )
}

export default function ChallengeStatus() {
  const { id } = useParams()
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const program = useProgram(id)
  const p = program.data
  const numbers = useQuery({ queryKey: ['programs', id, 'status-numbers'], queryFn: () => statusNumbers(p), enabled: !!p })
  const updateRef = useRef(null)
  const extendRef = useRef(null)
  const [dialog, setDialog] = useState(null)
  const [message, setMessage] = useState({ en: '', tn: '' })
  const [closes, setCloses] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (p?.title) document.title = `${p.title} · CEDA Innovation`
  }, [p?.title])

  useEffect(() => {
    if (dialog === 'extend') setCloses(toInput(p?.closing_date))
    if (dialog === 'update') setMessage({ en: '', tn: '' })
    setError('')
  }, [dialog, p?.closing_date])

  if (program.isLoading) return <div aria-hidden className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-48 rounded-card" /></div>
  if (program.isError) return <ErrorState framed title={t('cst.loadError')} message={program.error?.message} onRetry={program.refetch} />

  const closesAt = p.closing_date ? new Date(p.closing_date) : null
  const daysLeft = closesAt ? Math.ceil((closesAt.getTime() - Date.now()) / 864e5) : null
  const n = numbers.data ?? {}

  async function sendUpdate() {
    if (!message.en.trim()) { setError(t('cst.updateNeeded')); return }
    setBusy(true)
    try {
      const res = await client.post(`/api/programs/${id}/updates/`, { body: message.en.trim(), ...(message.tn.trim() ? { body_tn: message.tn.trim() } : {}) })
      toast.show({ tone: 'success', title: t('cst.updateSent', { n: res?.recipients ?? 0 }) })
      setDialog(null)
    } catch (err) {
      setError(err?.status === 404 || err?.status === 405 ? t('cst.updateNotYet') : err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  async function extend() {
    if (!closes || (closesAt && new Date(closes) <= closesAt)) { setError(t('cst.extendLater')); return }
    setBusy(true)
    try {
      await programsApi.update(id, { closing_date: new Date(closes).toISOString() })
      qc.invalidateQueries({ queryKey: ['programs', id] })
      toast.show({ tone: 'success', title: t('cst.extended') })
      setDialog(null)
    } catch (err) {
      setError(err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted"><Link to="/programs" className="hover:text-text hover:underline">{t('cbs.crumb')}</Link> / {p.title}</span>}
        title={p.title}
        actions={<Link to={`/programs/${id}/edit`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('cst.edit')}</Link>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={p.status} />
        {daysLeft != null && p.status === 'published' && (
          <Tag tone={daysLeft <= 3 ? 'red' : 'amber'}>{daysLeft > 0 ? t('cst.daysLeft', { n: daysLeft }) : t('cst.closesToday')}</Tag>
        )}
      </div>

      {numbers.isError ? (
        <ErrorState compact title={t('cst.numbersError')} onRetry={numbers.refetch} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={numbers.isLoading || undefined}>
          <Stat value={numbers.isLoading ? '…' : n.started} label={t('cst.started')} />
          <Stat value={numbers.isLoading ? '…' : n.submitted} label={t('cst.submitted')} />
          <Stat value={numbers.isLoading ? '…' : n.reviewed} label={t('cst.reviewed')} />
          <Stat value={numbers.isLoading ? '…' : n.to_panel} label={t('cst.toPanel')} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button ref={updateRef} onClick={() => setDialog('update')} className="sm:flex-1">{t('cst.postUpdate')}</Button>
        <Button ref={extendRef} variant="secondary" onClick={() => setDialog('extend')} className="sm:flex-1">{t('cst.extend')}</Button>
      </div>
      <Link to={`/submissions?program=${id}`} className="self-start text-[13px] font-bold text-primary hover:underline">{t('cst.seeIdeas')}</Link>

      <Modal
        open={dialog === 'update'}
        onClose={() => setDialog(null)}
        triggerRef={updateRef}
        title={t('cst.postUpdate')}
        description={t('cst.updateHint')}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={sendUpdate} loading={busy}>{t('cst.send')}</Button></>}
      >
        <div className="flex flex-col gap-3">
          <Textarea label={t('cst.message')} required rows={4} maxChars={600} value={message.en} onChange={(e) => setMessage((m) => ({ ...m, en: e.target.value }))} />
          <Textarea label={t('cst.messageTn')} optional rows={4} maxChars={600} value={message.tn} onChange={(e) => setMessage((m) => ({ ...m, tn: e.target.value }))} />
          {error && <p role="alert" className="text-[13px] font-bold text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={dialog === 'extend'}
        onClose={() => setDialog(null)}
        triggerRef={extendRef}
        size="sm"
        title={t('cst.extend')}
        description={closesAt ? t('cst.closesNow', { date: closesAt.toLocaleString('en-BW', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }) : undefined}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>{t('common.cancel')}</Button><Button onClick={extend} loading={busy}>{t('cst.extendSave')}</Button></>}
      >
        <Input type="datetime-local" label={t('cst.newClose')} value={closes} onChange={(e) => { setCloses(e.target.value); setError('') }} error={error || undefined} required />
      </Modal>
    </div>
  )
}

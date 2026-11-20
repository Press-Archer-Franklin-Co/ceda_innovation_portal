import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonClasses'
import Modal from '../../components/ui/Modal'
import Textarea from '../../components/ui/Textarea'
import Tag from '../../components/ui/Tag'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n, useT } from '../../i18n/context'
import { useApprovals, useDecideApproval } from '../../lib/queries/websiteContent'

const fmt = (value, lang) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const TARGET = { page: '/content/home', post: (id) => `/content/news/${id}`, quote: '/content/quotes' }
const linkFor = (a) => (typeof TARGET[a.target_type] === 'function' ? TARGET[a.target_type](a.target_id) : TARGET[a.target_type])

function Row({ approval, canEdit }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const decide = useDecideApproval()
  const [sendingBack, setSendingBack] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const trigger = useRef(null)
  // S2 (R-31) splits the decision; until then can_decide covers both.
  const canApprove = approval.can_approve ?? approval.can_decide
  const canSendBack = approval.can_send_back ?? approval.can_decide
  const steps = approval.steps ?? []

  const run = async (approve) => {
    if (!approve && !reason.trim()) return setReasonError(t('home.sendBackNeedReason'))
    try {
      await decide.mutateAsync({ id: approval.id, approve, comment: approve ? '' : reason.trim() })
      toast.show({ tone: 'success', title: approve ? t('approvals.approved') : t('home.sentBack', { name: approval.requested_by ?? '' }) })
      setSendingBack(false)
    } catch (err) {
      toast.show({ tone: 'error', title: t('news.failed', { message: err?.message ?? '' }) })
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral">{t(`approvals.type.${approval.target_type}`)}</Tag>
          {(approval.languages ?? []).map((l) => <Tag key={l} tone="blue">{t(`lang.${l}`)}</Tag>)}
        </p>
        <p className="mt-1 text-[14px] font-bold text-text">{approval.summary}</p>
        <p className="text-[12px] text-muted">
          {t('approvals.sentBy', { name: approval.requested_by ?? '', date: fmt(approval.requested_at, lang) })}
          {approval.publish_at ? ` · ${t('approvals.goesLive', { date: fmt(approval.publish_at, lang) })}` : ''}
        </p>
        {steps.length > 0 && (
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {steps.map((s) => (
              <li key={s.id}><Tag tone={s.done ? 'green' : 'amber'} dot>{s.name || t('approvals.step')}: {t('approvals.stepCount', { done: s.approvals ?? 0, needed: s.approvals_needed ?? 1 })}</Tag></li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {canEdit && linkFor(approval) && (
          <Link to={linkFor(approval)} className={buttonClasses({ variant: 'ghost', size: 'sm' })}><ExternalLink size={14} aria-hidden /> {t('approvals.open')}</Link>
        )}
        {canSendBack && <Button ref={trigger} variant="secondary" size="sm" onClick={() => setSendingBack(true)}>{t('home.sendBack')}</Button>}
        {canApprove && <Button size="sm" icon={<Check size={14} aria-hidden />} loading={decide.isPending && !sendingBack} onClick={() => run(true)}>{t('home.approve')}</Button>}
      </div>
      <Modal open={sendingBack} onClose={() => setSendingBack(false)} triggerRef={trigger} title={t('home.sendBackTitle')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setSendingBack(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={decide.isPending} onClick={() => run(false)}>{t('home.sendBack')}</Button></>}>
        <Textarea label={t('home.sendBackReason')} hint={t('home.sendBackReasonHint')} value={reason} rows={4} error={reasonError || undefined} required
          onChange={(e) => { setReason(e.target.value); setReasonError('') }} />
      </Modal>
    </li>
  )
}

/** Website content waiting for approval (U6). Opens for content.edit or content.approve; buttons follow the API. */
export default function Approvals() {
  const t = useT()
  const { can } = useAuth()
  const pending = useApprovals('pending')
  const items = (pending.data ?? []).filter((a) => a.status === 'pending')

  return (
    <div>
      <p className="mb-1 text-[12px] text-muted">{t('news.crumb')} / {t('approvals.title')}</p>
      <PageHeader title={t('approvals.title')} subtitle={t('approvals.subtitle')} />
      {pending.isError ? (
        <ErrorState title={t('approvals.loadError')} onRetry={() => pending.refetch()} />
      ) : pending.isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title={t('approvals.empty')} message={t('approvals.emptyBody')} framed />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => <Row key={a.id} approval={a} canEdit={can('content.edit')} />)}
        </ul>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import Textarea from '../../components/ui/Textarea'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useApproval, useApprovals, useDecideApproval } from '../../lib/queries/websiteContent'

// 3.25 Website approvals (Figma 122:1021 website, 122:1412 phone).
// ① Waiting and Done lists. ② Live now and Proposed side by side, changed fields tinted, English or Setswana.
// ③ Send back needs a comment; Approve and publish (or at the scheduled time). Whether people may approve their
// own change is the Approval steps switch (the API answers can_approve and own_change). The live version stays
// until the change is approved.

function when(value, lang, t) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const minutes = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutes < 60) return lang === 'tn' ? `metsotso e le ${Math.max(minutes, 1)} e e fetileng` : `${Math.max(minutes, 1)} min ago`
  if (minutes < 60 * 24) return lang === 'tn' ? `diura di le ${Math.round(minutes / 60)} tse di fetileng` : `${Math.round(minutes / 60)} h ago`
  if (minutes < 60 * 48) return t('audit.yesterday')
  return d.toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short' })
}

function dateTime(value, lang) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || ''
}

function kindTag(item, t) {
  if (item.change_type === 'edit') return <Tag tone="amber">{t('appr.kind.edit')}</Tag>
  return <Tag tone="blue">{item.target_type === 'post' ? t('appr.kind.newPost') : t('appr.kind.new')}</Tag>
}

/** A field value as text, in the language chosen with the English / Setswana switch. */
function show(value, lang, t) {
  if (value === null || value === undefined || value === '') return t('appr.empty')
  if (typeof value === 'boolean') return value ? t('appr.on') : t('appr.off')
  if (Array.isArray(value)) return value.length ? value.map((v) => show(v, lang, t)).join(', ') : t('appr.empty')
  if (typeof value === 'object') {
    if ('en' in value || 'tn' in value) return value[lang] || value.en || t('appr.empty')
    if (value.url || value.media_id || value.asset_id) return value.filename || value.name || String(value.url || t('appr.photo')).split('/').pop()
    return t('appr.items', { count: Object.keys(value).length })
  }
  return String(value)
}

function Side({ title, tone, rows, side, lang, t, newItem }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4" aria-label={title}>
      <Tag tone={tone} className="self-start">{title}</Tag>
      {side === 'live' && newItem ? (
        <p className="text-[13px] text-muted">{t('appr.nothingLive')}</p>
      ) : rows.map((row) => (
        <div key={row.key}>
          <p className="mb-1 text-[12px] text-muted">{row.label}</p>
          <p className={cn('break-words rounded-control px-2.5 py-2 text-[14px] text-text', row.changed && (side === 'live' ? 'bg-danger-soft' : 'bg-success-soft'))}>
            {show(row[side], lang, t)}
          </p>
        </div>
      ))}
    </section>
  )
}

function Detail({ id, onDone }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const query = useApproval(id)
  const decide = useDecideApproval()
  const [textLang, setTextLang] = useState(lang)
  const [comment, setComment] = useState('')
  const [needComment, setNeedComment] = useState(false)
  useEffect(() => { setComment(''); setNeedComment(false) }, [id])

  if (query.isLoading) return <div className="flex flex-col gap-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-48 w-full" /></div>
  if (query.isError) return <ErrorState title={t('appr.detailError')} message={query.error?.message} onRetry={query.refetch} />
  const item = query.data
  const compare = item.compare ?? { fields: [], changed_groups: [] }
  const groups = compare.changed_groups ?? []
  // Show the parts that changed (every field in them, so the change reads in context); a new item shows all.
  const rows = (compare.fields ?? []).filter((f) => compare.change_type === 'new' || !groups.length || groups.includes(f.group))
  const shown = rows.filter((f) => f.changed || compare.change_type !== 'new' || f.proposed !== null).slice(0, 40)
  const waiting = item.status === 'pending'
  const title = [t(`approvals.type.${item.target_type}`) === `approvals.type.${item.target_type}` ? item.target_type : t(`approvals.type.${item.target_type}`), groups[0]].filter(Boolean).join(' · ')

  const run = async (approve) => {
    if (!approve && !comment.trim()) { setNeedComment(true); return }
    try {
      await decide.mutateAsync({ id, approve, comment: comment.trim() })
      toast.show({ tone: 'success', title: approve ? t('appr.approved') : t('appr.sentBack') })
      onDone()
    } catch (err) {
      toast.show({ tone: 'error', title: t('appr.failed', { message: err?.message ?? '' }) })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-[20px] font-bold text-text">{title || item.summary}</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {t('appr.changedBy', { name: shortName(item.requested_by), when: when(item.requested_at, lang, t) })}
            {waiting && <> · {item.publish_at ? t('appr.goesLiveAt', { date: dateTime(item.publish_at, lang) }) : t('appr.goesLiveApproved')}</>}
          </p>
        </div>
        <Tabs variant="segment" label={t('appr.lang')} active={textLang} onChange={setTextLang}
          tabs={[{ key: 'en', label: 'English' }, { key: 'tn', label: 'Setswana' }]} />
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-muted">{t('appr.noChanges')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Side title={t('appr.liveNow')} tone="neutral" side="live" rows={shown} lang={textLang} t={t} newItem={compare.change_type === 'new'} />
          <Side title={t('appr.proposed')} tone="green" side="proposed" rows={shown} lang={textLang} t={t} />
        </div>
      )}

      {waiting ? (
        <div className="flex flex-col gap-3 rounded-card bg-surface2 p-4">
          <Textarea label={t('appr.comment')} placeholder={t('appr.commentPlaceholder')} value={comment} rows={2} maxLength={1000}
            onChange={(e) => { setComment(e.target.value); if (e.target.value.trim()) setNeedComment(false) }}
            error={needComment ? t('appr.needComment') : undefined} />
          {item.own_change && !item.can_approve && <p className="text-[12px] text-muted">{t('appr.ownChange')}</p>}
          {!item.can_approve && !item.can_send_back && !item.own_change && <p className="text-[12px] text-muted">{t('appr.cannot')}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.note?.[lang] && <p className="mr-auto text-[12px] text-muted">{item.note[lang]}</p>}
            <Button variant="ghost" onClick={() => run(false)} disabled={!item.can_send_back} loading={decide.isPending && decide.variables?.approve === false}>{t('appr.sendBack')}</Button>
            <Button onClick={() => run(true)} disabled={!item.can_approve} loading={decide.isPending && decide.variables?.approve === true}>
              {item.publish_at ? t('appr.approveAt', { date: dateTime(item.publish_at, lang) }) : t('appr.approve')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-card bg-surface2 p-4 text-[13px] text-text">
          {t('appr.decidedBy', { status: t(`appr.status.${item.status}`), name: shortName(item.decided_by) || '', when: when(item.decided_at, lang, t) })}
          {item.comment && <span className="mt-1 block text-muted">“{item.comment}”</span>}
        </p>
      )}
    </div>
  )
}

export default function Approvals() {
  const t = useT()
  const { lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'done' ? 'done' : 'waiting'
  const selectedId = params.get('id') || ''
  const waitingQuery = useApprovals('pending')
  const allQuery = useApprovals()
  const items = useMemo(() => {
    if (tab === 'waiting') return waitingQuery.data ?? []
    return (allQuery.data ?? []).filter((a) => a.status !== 'pending')
  }, [tab, waitingQuery.data, allQuery.data])
  const query = tab === 'waiting' ? waitingQuery : allQuery
  const setParam = (patch) => setParams((p) => {
    const next = new URLSearchParams(p)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    return next
  }, { replace: true })

  // Website: open the first waiting change. Phone: the list first, then the change on its own.
  useEffect(() => {
    if (!selectedId && items.length && window.matchMedia('(min-width: 1024px)').matches) setParam({ id: items[0].id })
  }, [items, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = waitingQuery.data?.length ?? 0
  return (
    <div className="flex flex-col gap-[14px] pb-16 2xl:gap-[18px]">
      <PageHeader back={<span className="text-[12px] text-muted">{t('appr.crumb')}</span>} title={t('appr.title')} subtitle={t('appr.subtitle')} />
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(300px,360px)_1fr]">
        <section className={cn('flex flex-col gap-3', selectedId && 'hidden lg:flex')} aria-label={t('appr.list')}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-[16px] font-bold text-text">{t('appr.waiting', { count })}</h2>
            <Tabs variant="segment" label={t('appr.list')} active={tab} onChange={(key) => setParam({ tab: key === 'done' ? 'done' : '', id: '' })}
              tabs={[{ key: 'waiting', label: t('appr.tab.waiting') }, { key: 'done', label: t('appr.tab.done') }]} />
          </div>
          {query.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-card" />)
          ) : query.isError ? (
            <ErrorState title={t('appr.loadError')} message={query.error?.message} onRetry={query.refetch} />
          ) : items.length === 0 ? (
            <EmptyState compact title={tab === 'waiting' ? t('appr.emptyWaiting') : t('appr.emptyDone')} message={tab === 'waiting' ? t('appr.emptyWaitingBody') : t('appr.emptyDoneBody')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const on = item.id === selectedId
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => setParam({ id: item.id })} aria-current={on || undefined}
                      className={cn('flex w-full flex-col gap-1 rounded-card border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        on ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:bg-surface2')}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-bold text-text">{item.summary}</span>
                        {tab === 'waiting' ? kindTag(item, t) : <Tag tone={item.status === 'approved' ? 'green' : 'neutral'}>{t(`appr.status.${item.status}`)}</Tag>}
                      </span>
                      <span className="text-[12px] text-muted">{shortName(item.requested_by)} · {when(item.requested_at, lang, t)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <section className={cn('min-w-0', !selectedId && 'hidden lg:block')}>
          {selectedId && (
            <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={() => setParam({ id: '' })}>{t('appr.back')}</Button>
          )}
          {selectedId ? <Detail id={selectedId} onDone={() => setParam({ id: '' })} /> : (
            <EmptyState compact title={t('appr.pick')} />
          )}
        </section>
      </div>
    </div>
  )
}

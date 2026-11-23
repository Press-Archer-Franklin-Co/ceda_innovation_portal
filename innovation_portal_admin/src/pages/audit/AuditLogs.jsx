import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import ServerTable from '../../components/ui/ServerTable'
import { SelectControl } from '../../components/ui/Select'
import { useToast } from '../../components/ui/toast'
import { useAuth } from '../../lib/auth/AuthContext'
import { useI18n, useT } from '../../i18n/context'
import { audit, users } from '../../lib/api/endpoints'

// 3.29 Audit log (Figma 123:1974 website, 123:2390 phone). ① Search, person, area and date filters.
// ② The shared server table: when, who, action, item. ③ A row opens to show Before and After, the area and where the
// change came from (masked address, device). ④ Export CSV of the filtered list. Entries are read-only in the API.
// History (the old /history pages) is the History tab on each item now; this is the workspace-wide log.

const AREAS = ['settings', 'integrations', 'roles', 'users', 'website', 'ideas', 'challenges', 'judging', 'other']
const DAYS = ['7', '30', '90', 'all']

function whenText(value, lang, t) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(lang === 'tn' ? 'en-BW' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t('audit.today', { time })
  if (d.toDateString() === yesterday.toDateString()) return t('audit.yesterday')
  return d.toLocaleDateString(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function shortName(row, t) {
  if (!row.actor) return t('audit.system')
  const parts = String(row.actor_name || '').trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || row.actor_email || ''
}

function BeforeAfter({ row, t }) {
  const changes = row.changes ?? []
  const where = [row.ip_address && t('audit.from', { address: row.ip_address }), row.device && t('audit.on', { device: row.device })].filter(Boolean).join(' · ')
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_minmax(180px,240px)]">
      {changes.length ? (
        <>
          <div className="rounded-control bg-danger-soft px-3 py-2.5">
            <p className="text-[12px] font-semibold text-text">{t('audit.before')}</p>
            {changes.map((c) => <p key={`b-${c.field}`} className="mt-1 break-words text-[14px] text-text"><span className="text-muted">{c.field}: </span>{c.before}</p>)}
          </div>
          <div className="rounded-control bg-success-soft px-3 py-2.5">
            <p className="text-[12px] font-semibold text-text">{t('audit.after')}</p>
            {changes.map((c) => <p key={`a-${c.field}`} className="mt-1 break-words text-[14px] text-text"><span className="text-muted">{c.field}: </span>{c.after}</p>)}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted md:col-span-2">{t('audit.noChanges')}</p>
      )}
      <div className="text-[12px] text-muted">
        <p>{row.area_label}</p>
        {where && <p className="mt-1">{where}</p>}
      </div>
    </div>
  )
}

export default function AuditLogs() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const { user, can } = useAuth()
  // People to filter by: staff when this person may see the staff list (users.manage), otherwise Everyone or Only me.
  const staff = useQuery({
    queryKey: ['users', 'audit-people'],
    queryFn: async () => { const data = await users.list({ active: 'true', page_size: 100 }); return Array.isArray(data) ? data : data?.results ?? [] },
    enabled: Boolean(can?.('users.manage')),
    staleTime: 5 * 60 * 1000,
  })
  const people = (staff.data ?? []).filter((u) => u.is_staff && String(u.id) !== String(user?.id))
    .map((u) => ({ value: String(u.id), label: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email }))
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(null)
  const [exporting, setExporting] = useState(false)
  const actor = params.get('actor') ?? ''
  const area = params.get('area') ?? ''
  const days = params.get('days') ?? '7'
  const filters = {
    ...(actor ? { actor } : {}),
    ...(area ? { area } : {}),
    ...(days !== 'all' ? { days } : {}),
  }
  const setFilter = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('page')
    return next
  }, { replace: true })

  const exportCsv = async () => {
    setExporting(true)
    try {
      const search = params.get('search')
      const blob = await audit.exportCsv({ ...filters, ...(search ? { search } : {}) })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.show({ tone: 'success', title: t('audit.exported') })
    } catch (err) {
      toast.show({ tone: 'error', title: t('audit.exportFailed', { message: err?.message ?? '' }) })
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    { key: 'created_at', label: t('audit.col.when'), width: 130, render: (v) => <span className="text-[13px] text-muted">{whenText(v, lang, t)}</span> },
    { key: 'actor_name', label: t('audit.col.who'), width: 160, render: (_, row) => <span className="font-bold text-text">{shortName(row, t)}</span> },
    { key: 'action_label', label: t('audit.col.action'), width: 170 },
    { key: 'summary', label: t('audit.col.item'), render: (v) => <span className="break-words">{v}</span> },
    {
      key: 'open', label: '', width: 44, align: 'right', hideOnPhone: true,
      render: (_, row) => (
        <span aria-label={open === row.id ? t('audit.close') : t('audit.open')} className="inline-flex text-muted">
          {open === row.id ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-[14px] pb-16 2xl:gap-[18px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('audit.crumb')}</span>}
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={<Button variant="secondary" onClick={exportCsv} loading={exporting} icon={<Download size={15} aria-hidden />}>{t('audit.export')}</Button>}
      />
      <div className="rounded-card border border-border bg-surface">
        <ServerTable
          queryKey={(request) => ['audit', 'logs', request]}
          fetcher={(request) => audit.logs(request)}
          filters={filters}
          searchLabel={t('audit.search')}
          toolbar={(
            <>
              <SelectControl aria-label={t('audit.col.who')} value={actor} onChange={(v) => setFilter('actor', v)} className="w-[150px]"
                options={[{ value: '', label: t('audit.everyone') }, ...(user?.id ? [{ value: String(user.id), label: t('audit.me') }] : []), ...people]} />
              <SelectControl aria-label={t('audit.allAreas')} value={area} onChange={(v) => setFilter('area', v)} className="w-[190px]"
                options={[{ value: '', label: t('audit.allAreas') }, ...AREAS.map((a) => ({ value: a, label: t(`audit.area.${a}`) }))]} />
              <SelectControl aria-label={t('audit.col.when')} value={days} onChange={(v) => setFilter('days', v === '7' ? '' : v)} className="w-[150px]"
                options={DAYS.map((d) => ({ value: d, label: t(`audit.days.${d}`) }))} />
            </>
          )}
          columns={columns}
          onRowClick={(row) => setOpen((current) => (current === row.id ? null : row.id))}
          expandedId={open}
          renderExpanded={(row) => <BeforeAfter row={row} t={t} />}
          emptyTitle={t('audit.emptyTitle')}
          emptyMessage={t('audit.emptyBody')}
        />
      </div>
    </div>
  )
}

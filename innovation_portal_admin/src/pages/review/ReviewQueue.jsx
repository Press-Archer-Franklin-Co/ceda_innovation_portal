import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, Download, Inbox, UserPlus, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import StatusPill from '../../components/ui/StatusPill'
import Tag from '../../components/ui/Tag'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import { useToast } from '../../components/ui/toast'
import { AssignIdeas } from '../../components/ideas/IdeaActionDialogs'
import { useT, useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/csv'
import { EMPTY_CELL } from '../../lib/format'
import { statusWord } from '../../lib/status'
import { reference } from '../../lib/api/endpoints'
import { usePrograms } from '../../lib/queries/programs'
import { reviewQueue, reviewViews } from '../../lib/api/review'
import ReviewPanel from './ReviewPanel'

// 3.3 Review queue and scoring an idea (Figma 18:372 website, 18:685 phone). The queue on the left, the selected
// idea on the right, so officers never lose their place. ① Filters (assigned to me, challenge, overdue, sector)
// live in the address and save as named views. J / K move through the queue. Phone: the queue, then one idea at
// a time with "Queue" to go back.

const dateOf = (v) => (v ? new Date(v).toLocaleDateString('en-BW', { day: 'numeric', month: 'short' }) : '')

export default function ReviewQueue() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState(null)
  const assignRef = useRef(null)
  const saveRef = useRef(null)

  const get = (k) => params.get(k) ?? ''
  // "Assigned to me" is on unless the address says otherwise.
  const filters = { mine: get('mine') !== 'false', program: get('program'), sector: get('sector'), overdue: get('overdue') === 'true' }
  const selectedId = get('id')
  const update = (patch) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null) n.delete(k)
        else n.set(k, String(v))
      }
      return n
    }, { replace: true })

  const queue = useQuery({ queryKey: ['review', 'queue', filters], queryFn: () => reviewQueue(filters) })
  const programs = usePrograms()
  const sectors = useQuery({ queryKey: ['reference', 'sectors', lang], queryFn: () => reference.sectors(lang), staleTime: 3600_000 })
  const saved = useQuery({ queryKey: ['review', 'saved-views'], queryFn: reviewViews.list })

  const rows = useMemo(() => queue.data ?? [], [queue.data])
  const programList = Array.isArray(programs.data) ? programs.data : programs.data?.results ?? []
  const sectorList = Array.isArray(sectors.data) ? sectors.data : sectors.data?.results ?? []
  const savedList = Array.isArray(saved.data) ? saved.data : saved.data?.results ?? []
  const programName = programList.find((p) => p.id === filters.program)?.title
  const sectorName = sectorList.find((s) => s.id === filters.sector)?.name

  // Open the first idea when none is chosen (website only; the phone starts on the queue).
  useEffect(() => {
    if (!selectedId && rows.length && window.matchMedia?.('(min-width: 1024px)').matches) update({ id: rows[0].id })
  }, [rows, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // J / K: next and previous idea, unless typing.
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (e.key !== 'j' && e.key !== 'k') return
      if (!rows.length) return
      const i = rows.findIndex((r) => r.id === selectedId)
      const next = e.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)
      if (rows[next] && rows[next].id !== selectedId) {
        e.preventDefault()
        update({ id: rows[next].id })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyView(v) {
    const f = v.filters ?? {}
    update({ mine: f.mine === false ? 'false' : '', program: f.program ?? '', sector: f.sector ?? '', overdue: f.overdue ? 'true' : '', id: '' })
  }

  async function removeView(v) {
    try {
      await reviewViews.remove(v.id)
      qc.invalidateQueries({ queryKey: ['review', 'saved-views'] })
    } catch (err) {
      toast.show({ tone: 'error', title: t('common.somethingWrong'), body: err?.message })
    }
  }

  function exportRows() {
    downloadCsv(`review-queue-${new Date().toISOString().slice(0, 10)}.csv`, [
      [t('ideas.col.reference'), t('ideas.col.idea'), t('review.col.stage'), t('review.col.due')],
      ...rows.map((r) => [r.reference_number ?? '', r.title, r.current_step || t(statusWord(r.current_status).labelKey), r.due_at ?? '']),
    ])
  }

  const link = (id) => {
    const n = new URLSearchParams(params)
    n.set('id', id)
    return `/review?${n.toString()}`
  }

  const columns = [
    {
      key: 'title',
      label: t('ideas.col.idea'),
      link: (r) => link(r.id),
      render: (_, r) => <span className={cn('block truncate text-text', r.id === selectedId ? 'font-bold' : 'font-semibold')}>{r.title}</span>,
    },
    { key: 'current_status', label: t('review.col.stage'), width: 130, render: (v, r) => <StatusPill status={v} label={r.current_step || undefined} /> },
    {
      key: 'due_at',
      label: t('review.col.due'),
      width: 100,
      // TODO(R-55): the queue rows do not carry a due date yet.
      render: (v) => {
        if (!v) return <span className="text-muted">{EMPTY_CELL}</span>
        const late = new Date(v) < new Date()
        return late ? <Tag tone="red">{t('review.overdue')}</Tag> : <span className="text-text">{dateOf(v)}</span>
      },
    },
  ]

  const chip = (on, label, onClick, extra) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        on ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text hover:bg-surface2',
      )}
    >
      {label}
      {extra}
    </button>
  )

  const menuChip = (label, on, items, clear) => (
    <DropdownMenu
      width={260}
      align="start"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:bg-surface2',
          )}
        >
          {label}
          {on ? <X size={14} aria-hidden onClick={(e) => { e.stopPropagation(); clear() }} /> : <ChevronDown size={14} aria-hidden />}
        </button>
      )}
      items={items}
    />
  )

  const filterRow = (
    <div data-guide="review.filters" className="flex flex-wrap items-center gap-2" role="group" aria-label={t('review.filters')}>
      {chip(filters.mine, queue.data && filters.mine ? t('review.mineCount', { n: rows.length }) : t('review.mine'), () => update({ mine: filters.mine ? 'false' : '', id: '' }))}
      {menuChip(programName ?? t('ideas.filter.allChallenges'), Boolean(filters.program),
        [{ key: '', label: t('ideas.filter.allChallenges'), onSelect: () => update({ program: '', id: '' }) }, ...programList.map((p) => ({ key: p.id, label: p.title, onSelect: () => update({ program: p.id, id: '' }) }))],
        () => update({ program: '', id: '' }))}
      {chip(filters.overdue, t('review.overdue'), () => update({ overdue: filters.overdue ? '' : 'true', id: '' }))}
      {menuChip(sectorName ?? t('review.allSectors'), Boolean(filters.sector),
        [{ key: '', label: t('review.allSectors'), onSelect: () => update({ sector: '', id: '' }) }, ...sectorList.map((s) => ({ key: s.id, label: s.name, onSelect: () => update({ sector: s.id, id: '' }) }))],
        () => update({ sector: '', id: '' }))}
      <DropdownMenu
        align="start"
        width={260}
        trigger={(props) => (
          <button type="button" {...props} ref={saveRef} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t('review.views')}<ChevronDown size={14} aria-hidden />
          </button>
        )}
        items={[
          ...savedList.map((v) => ({ key: v.id, label: v.name, onSelect: () => applyView(v) })),
          { key: 'save', label: t('ideas.saveView'), onSelect: () => setDialog('save') },
          ...savedList.map((v) => ({ key: `rm-${v.id}`, label: t('review.removeView', { name: v.name }), onSelect: () => removeView(v), tone: 'danger' })),
        ]}
      />
    </div>
  )

  const table = (
    <DataTable
      caption={t('staff.nav.reviewQueue')}
      columns={columns}
      data={rows}
      loading={queue.isLoading}
      error={queue.isError ? queue.error?.message || t('review.loadError') : undefined}
      onRetry={queue.refetch}
      retrying={queue.isFetching}
      onRowClick={(r) => update({ id: r.id })}
      rowGuide="review.open"
      selected={selectedId ? [selectedId] : []}
      emptyIcon={Inbox}
      emptyTitle={t('review.emptyTitle')}
      emptyMessage={filters.mine ? t('review.emptyMine') : t('review.emptyAll')}
      pageSize={25}
    />
  )

  return (
    <div className="flex flex-col gap-[14px] pb-24 lg:pb-0 2xl:gap-[22px]">
      <div className={cn(selectedId && 'hidden lg:block')}>
        <PageHeader
          back={<span className="text-[12px] text-muted"><Link to="/" className="hover:text-text hover:underline">{t('staff.group.overview')}</Link> / {t('staff.nav.reviewQueue')}</span>}
          title={t('staff.nav.reviewQueue')}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={exportRows} disabled={!rows.length}><Download size={16} aria-hidden />{t('ideas.export')}</Button>
              <Button ref={assignRef} variant="secondary" onClick={() => setDialog('assign')} disabled={!selectedId}><UserPlus size={16} aria-hidden />{t('ideas.assign')}</Button>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] 2xl:gap-[22px] items-start">
        <section aria-label={t('staff.nav.reviewQueue')} className={cn('flex min-w-0 flex-col gap-3', selectedId && 'hidden lg:flex')}>
          {filterRow}
          {table}
          <p className="hidden text-[12px] text-muted lg:block">{t('review.keys')}</p>
        </section>

        {selectedId ? (
          <div className="min-w-0">
            <button type="button" onClick={() => update({ id: '' })} className="mb-3 inline-flex items-center gap-1 text-[15px] font-bold text-text lg:hidden">
              <ChevronLeft size={18} aria-hidden />{t('review.backToQueue')}
            </button>
            <ReviewPanel key={selectedId} id={selectedId} onDone={() => {
              const i = rows.findIndex((r) => r.id === selectedId)
              const next = rows[i + 1] ?? rows[i - 1]
              qc.invalidateQueries({ queryKey: ['review', 'queue'] })
              update({ id: next?.id ?? '' })
            }} />
          </div>
        ) : (
          <div className="hidden min-h-[320px] items-center justify-center rounded-card border border-dashed border-border p-8 text-center text-[14px] text-muted lg:flex">
            {rows.length ? t('review.pickOne') : t('review.nothingOpen')}
          </div>
        )}
      </div>

      <AssignIdeas open={dialog === 'assign'} onClose={() => setDialog(null)} triggerRef={assignRef} ids={selectedId ? [selectedId] : []} onDone={() => qc.invalidateQueries({ queryKey: ['review'] })} />
      <SaveView open={dialog === 'save'} onClose={() => setDialog(null)} triggerRef={saveRef}
        filters={{ mine: filters.mine, ...(filters.program && { program: filters.program }), ...(filters.sector && { sector: filters.sector }), ...(filters.overdue && { overdue: true }) }}
        onSaved={() => qc.invalidateQueries({ queryKey: ['review', 'saved-views'] })} />
    </div>
  )
}

/** "Save view": a name for the current filters. */
function SaveView({ open, onClose, triggerRef, filters, onSaved }) {
  const t = useT()
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setName(''); setError('') } }, [open])

  async function save() {
    if (!name.trim()) { setError(t('ideas.viewNameNeeded')); return }
    setBusy(true)
    try {
      await reviewViews.create({ name: name.trim(), filters })
      toast.show({ tone: 'success', title: t('ideas.viewSaved', { name: name.trim() }) })
      onSaved()
      onClose()
    } catch (err) {
      const errs = err?.data?.errors ?? {}
      setError(errs.name?.[0] ?? errs.filters?.[0] ?? err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} triggerRef={triggerRef} size="sm" title={t('ideas.saveView')} description={t('ideas.saveViewHint')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={busy}>{t('common.save')}</Button></>}>
      <Input label={t('ideas.viewName')} value={name} onChange={(e) => { setName(e.target.value); setError('') }} error={error || undefined} required maxLength={120} />
    </Modal>
  )
}

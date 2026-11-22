import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Download, Plus, Search, UserPlus, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusPill from '../../components/ui/StatusPill'
import Avatar from '../../components/ui/Avatar'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Modal from '../../components/ui/Modal'
import Input, { InputControl } from '../../components/ui/Input'
import { SelectControl } from '../../components/ui/Select'
import { useToast } from '../../components/ui/toast'
import ChannelLabel from '../../components/ideas/ChannelLabel'
import { AssignIdeas, MoveIdeas } from '../../components/ideas/IdeaActionDialogs'
import { useT, useI18n } from '../../i18n/context'
import { reference } from '../../lib/api/endpoints'
import { VIEWS, savedViews, staffList } from '../../lib/api/ideas'
import { usePrograms } from '../../lib/queries/programs'
import { relativeTime } from '../../lib/forms/format'
import { downloadCsv } from '../../lib/csv'
import { EMPTY_CELL } from '../../lib/format'
import { statusWord } from '../../lib/status'

// 3.15 Submissions (Figma 102:803 website, 102:1245 phone). Every idea from every challenge and channel.
// ① Views at the top (built-in and saved); "Save view" keeps the current filters. ② One filter row.
// ③ The shared data table: sort by heading, tick rows, 20 per page; cards on a phone.
// ④ Ticked rows show the action bar: assign, move stage, export. Filters and paging live in the URL.

const PAGE_SIZE = 20
const FILTERS = ['view', 'program', 'stage', 'channel', 'district', 'since', 'from', 'search']
const STAGES = ['submitted', 'in_review', 'needs_input', 'shortlisted', 'approved', 'not_taken']
const CHANNELS = ['web', 'whatsapp', 'ussd', 'sms']
const SINCE = { '7': 7, '30': 30, '90': 90 }

function sinceDate(key) {
  const days = SINCE[key]
  if (!days) return undefined
  const d = new Date(Date.now() - days * 864e5)
  return d.toISOString().slice(0, 10)
}

export default function Submissions() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState([])
  const [dialog, setDialog] = useState(null)
  const assignRef = useRef(null)
  const moveRef = useRef(null)
  const saveRef = useRef(null)

  const get = (k) => params.get(k) ?? ''
  const view = get('view') || 'all'
  const page = Number(get('page')) || 1
  const ordering = get('ordering') || '-updated_at'
  const [searchDraft, setSearchDraft] = useState(get('search'))

  const update = (patch, { keepPage = false } = {}) => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null || (k === 'view' && v === 'all')) next.delete(k)
        else next.set(k, String(v))
      }
      if (!keepPage) next.delete('page')
      return next
    }, { replace: true })
    if (!keepPage) setSelected([])
  }

  useEffect(() => {
    document.title = `${t('ideas.list.title')} · CEDA Innovation`
  }, [t])

  useEffect(() => {
    if (searchDraft === get('search')) return
    const id = setTimeout(() => update({ search: searchDraft.trim() }), 300)
    return () => clearTimeout(id)
  }) // re-arms on every keystroke

  const request = {
    view,
    page,
    page_size: PAGE_SIZE,
    ordering,
    ...(get('program') ? { program: get('program') } : {}),
    ...(get('stage') ? { stage: get('stage') } : {}),
    ...(get('channel') ? { channel: get('channel') } : {}),
    ...(get('district') ? { district: get('district') } : {}),
    // "Last 30 days" in the filter row, or the exact date a saved view keeps.
    ...(get('since') ? { submitted_from: sinceDate(get('since')) } : get('from') ? { submitted_from: get('from') } : {}),
    ...(get('search') ? { search: get('search') } : {}),
  }
  const listQuery = useQuery({
    queryKey: ['ideas', 'staff-list', request],
    queryFn: () => staffList(request),
    placeholderData: keepPreviousData,
  })
  const programs = usePrograms()
  const districts = useQuery({ queryKey: ['reference', 'districts', lang], queryFn: () => reference.districts(lang), staleTime: 3600_000 })
  const saved = useQuery({ queryKey: ['ideas', 'saved-views'], queryFn: savedViews.list })

  const rows = listQuery.data?.results ?? []
  const counts = listQuery.data?.views ?? {}
  const total = listQuery.data?.count ?? 0

  const programOptions = useMemo(() => {
    const items = Array.isArray(programs.data) ? programs.data : programs.data?.results ?? []
    return [{ value: '', label: t('ideas.filter.allChallenges') }, ...items.map((p) => ({ value: p.id, label: p.title }))]
  }, [programs.data, t])
  const districtOptions = useMemo(() => {
    const items = Array.isArray(districts.data) ? districts.data : districts.data?.results ?? []
    return [{ value: '', label: t('ideas.filter.anyDistrict') }, ...items.map((d) => ({ value: d.id, label: d.name }))]
  }, [districts.data, t])

  const savedList = Array.isArray(saved.data) ? saved.data : []
  const activeSaved = savedList.find((v) => v.id === get('saved'))
  const tabs = [
    ...VIEWS.map((key) => ({ key, label: t(`ideas.view.${key}`), count: counts[key] })),
    ...savedList.map((v) => ({ key: `saved:${v.id}`, label: v.name })),
  ]
  const activeTab = activeSaved ? `saved:${activeSaved.id}` : view

  function chooseTab(key) {
    if (key.startsWith('saved:')) {
      const v = savedList.find((x) => `saved:${x.id}` === key)
      const f = v?.filters ?? {}
      update({ saved: v?.id, view: f.view ?? 'all', program: f.program, stage: f.stage, channel: f.channel, district: f.district, since: '', from: f.submitted_from, search: f.search })
      setSearchDraft(f.search ?? '')
    } else {
      update({ view: key, saved: '' })
    }
  }

  const sort = { key: ordering.replace(/^-/, ''), dir: ordering.startsWith('-') ? 'desc' : 'asc' }
  const columns = [
    {
      key: 'title',
      label: t('ideas.col.idea'),
      sortable: true,
      link: (r) => `/submissions/${r.id}`,
      render: (_, r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold text-text">{r.title}</span>
          <span className="text-[12px] text-muted">{r.reference}</span>
        </span>
      ),
    },
    {
      key: 'innovator',
      label: t('ideas.col.innovator'),
      render: (v) => (v?.name ? <span className="flex min-w-0 items-center gap-2"><Avatar name={v.name} size="xs" decorative /><span className="truncate">{v.name}</span></span> : EMPTY_CELL),
    },
    { key: 'program', label: t('ideas.col.challenge'), render: (v) => v?.title ?? EMPTY_CELL, hideOnPhone: true },
    { key: 'channel', label: t('ideas.col.channel'), render: (v) => <ChannelLabel channel={v} />, hideOnPhone: true },
    { key: 'status', label: t('ideas.col.stage'), render: (v) => <StatusPill status={v} /> },
    { key: 'score', label: t('ideas.col.score'), sortable: true, width: 80, render: (v) => (v == null ? EMPTY_CELL : <span className="font-bold tabular-nums">{Math.round(v)}</span>) },
    { key: 'updated_at', label: t('ideas.col.updated'), sortable: true, width: 110, render: (v) => <span className="text-muted">{relativeTime(v, t) || EMPTY_CELL}</span> },
    {
      key: 'menu',
      label: '',
      width: 48,
      render: (_, r) => (
        <DropdownMenu
          label={t('ideas.rowMenu', { title: r.title })}
          items={[
            { key: 'open', label: t('ideas.open'), onSelect: () => navigate(`/submissions/${r.id}`) },
            { key: 'assign', label: t('ideas.assign'), onSelect: () => { setSelected([r.id]); setDialog('assign') } },
            { key: 'move', label: t('ideas.moveOne'), onSelect: () => { setSelected([r.id]); setDialog('move') } },
          ]}
        />
      ),
    },
  ]

  async function exportRows(onlySelected) {
    try {
      let list = onlySelected ? rows.filter((r) => selected.includes(r.id)) : []
      if (!onlySelected) {
        const first = await staffList({ ...request, page: 1, page_size: 50 })
        list = first.results
        for (let p = 2; p <= Math.ceil((first.count ?? 0) / 50); p += 1) list = list.concat((await staffList({ ...request, page: p, page_size: 50 })).results)
      }
      downloadCsv(`submissions-${new Date().toISOString().slice(0, 10)}.csv`, [
        [t('ideas.col.reference'), t('ideas.col.idea'), t('ideas.col.innovator'), t('ideas.col.challenge'), t('ideas.col.channel'), t('ideas.col.stage'), t('ideas.col.score'), t('ideas.col.updated')],
        ...list.map((r) => [r.reference, r.title, r.innovator?.name ?? '', r.program?.title ?? '', r.channel ? t(`ideas.channel.${r.channel}`) : '', t(statusWord(r.status).labelKey), r.score ?? '', r.updated_at ?? '']),
      ])
    } catch (err) {
      toast.show({ tone: 'error', title: t('ideas.exportError'), body: err?.message })
    }
  }

  return (
    <div className="flex flex-col gap-[14px] 2xl:gap-[22px]">
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('ideas.crumb')}</span>}
        title={t('ideas.list.title')}
        subtitle={t('ideas.list.subtitle')}
        actions={<Button variant="secondary" onClick={() => exportRows(false)}><Download size={16} aria-hidden />{t('ideas.export')}</Button>}
      />

      <div className="flex flex-wrap items-end gap-x-2 gap-y-1 border-b border-border">
        <Tabs tabs={tabs} active={activeTab} onChange={chooseTab} label={t('ideas.views')} idPrefix="ideas" className="min-w-0 flex-1 border-b-0" />
        <Button ref={saveRef} variant="link" size="sm" onClick={() => setDialog('save')} className="mb-1.5">
          <Plus size={15} aria-hidden />{t('ideas.saveView')}
        </Button>
      </div>

      <div role="group" aria-label={t('ideas.filters')} className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[280px]">
          <InputControl
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t('ideas.searchPlaceholder')}
            aria-label={t('ideas.searchPlaceholder')}
            leading={<Search size={16} aria-hidden />}
          />
        </div>
        <SelectControl aria-label={t('ideas.col.challenge')} options={programOptions} value={get('program')} onChange={(v) => update({ program: v, saved: '' })} className="w-full sm:w-auto sm:min-w-[170px]" />
        <SelectControl
          aria-label={t('ideas.col.stage')}
          options={[{ value: '', label: t('ideas.filter.anyStage') }, ...STAGES.map((s) => ({ value: s, label: t(`status.${s}`) }))]}
          value={get('stage')}
          onChange={(v) => update({ stage: v, saved: '' })}
          className="w-[calc(50%-4px)] sm:w-auto sm:min-w-[140px]"
        />
        <SelectControl
          aria-label={t('ideas.col.channel')}
          options={[{ value: '', label: t('ideas.filter.anyChannel') }, ...CHANNELS.map((c) => ({ value: c, label: t(`ideas.channel.${c}`) }))]}
          value={get('channel')}
          onChange={(v) => update({ channel: v, saved: '' })}
          className="w-[calc(50%-4px)] sm:w-auto sm:min-w-[140px]"
        />
        <SelectControl aria-label={t('ideas.filter.district')} options={districtOptions} value={get('district')} onChange={(v) => update({ district: v, saved: '' })} className="w-[calc(50%-4px)] sm:w-auto sm:min-w-[140px]" />
        <SelectControl
          aria-label={t('ideas.filter.date')}
          options={[
            { value: '', label: t('ideas.filter.anyDate') },
            ...Object.keys(SINCE).map((k) => ({ value: k, label: t('ideas.filter.lastDays', { n: k }) })),
            ...(get('from') ? [{ value: 'from', label: t('ideas.filter.since', { date: get('from') }) }] : []),
          ]}
          value={get('since') || (get('from') ? 'from' : '')}
          onChange={(v) => v !== 'from' && update({ since: v, from: '', saved: '' })}
          className="w-[calc(50%-4px)] sm:w-auto sm:min-w-[130px]"
        />
      </div>

      {selected.length > 0 && (
        <div role="region" aria-label={t('ideas.selectedActions')} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-banner-deep px-4 py-3 text-on-banner">
          <p className="mr-auto text-[14px] font-bold" aria-live="polite">{t('ideas.selected', { n: selected.length })}</p>
          <Button ref={assignRef} variant="onDark" size="sm" onClick={() => setDialog('assign')}><UserPlus size={15} aria-hidden />{t('ideas.assign')}</Button>
          <Button ref={moveRef} variant="onDark" size="sm" onClick={() => setDialog('move')}><ArrowRight size={15} aria-hidden />{t('ideas.moveStage')}</Button>
          <Button variant="onDark" size="sm" onClick={() => exportRows(true)}><Download size={15} aria-hidden />{t('ideas.export')}</Button>
          <button type="button" onClick={() => setSelected([])} aria-label={t('ideas.clearSelection')} className="flex h-8 w-8 items-center justify-center rounded-control hover:bg-on-banner/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-banner">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <DataTable
        caption={t('ideas.list.title')}
        columns={columns}
        data={rows}
        loading={listQuery.isLoading}
        error={listQuery.isError ? listQuery.error : null}
        onRetry={() => listQuery.refetch()}
        retrying={listQuery.isFetching && listQuery.isError}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        onRowClick={(r) => navigate(`/submissions/${r.id}`)}
        sort={sort}
        onSortChange={(s) => update({ ordering: s.dir === 'desc' ? `-${s.key}` : s.key })}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={(p) => update({ page: p }, { keepPage: true })}
        emptyTitle={FILTERS.some((k) => get(k) && !(k === 'view' && get(k) === 'all')) ? t('ideas.emptyFiltered') : t('ideas.empty')}
        emptyMessage={t('ideas.emptyBody')}
      />

      <AssignIdeas open={dialog === 'assign'} onClose={() => setDialog(null)} triggerRef={assignRef} ids={selected} onDone={() => setSelected([])} />
      <MoveIdeas open={dialog === 'move'} onClose={() => setDialog(null)} triggerRef={moveRef} ids={selected} onDone={() => setSelected([])} />
      <SaveView
        open={dialog === 'save'}
        onClose={() => setDialog(null)}
        triggerRef={saveRef}
        filters={savedFilters(get, request)}
        onSaved={(v) => {
          qc.invalidateQueries({ queryKey: ['ideas', 'saved-views'] })
          update({ saved: v?.id }, { keepPage: true })
        }}
      />
    </div>
  )
}

/** A saved view keeps the API's filter names; a "last 30 days" preset is kept as the date it means today. */
function savedFilters(get, request) {
  const f = { view: get('view'), program: get('program'), stage: get('stage'), channel: get('channel'), district: get('district'), search: get('search'), submitted_from: request.submitted_from }
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v))
}

/** "Save view": a name for the current filters . */
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
      const view = await savedViews.create({ name: name.trim(), filters })
      toast.show({ tone: 'success', title: t('ideas.viewSaved', { name: name.trim() }) })
      onSaved(view)
      onClose()
    } catch (err) {
      const errs = err?.data?.errors ?? {}
      setError(errs.name?.[0] ?? errs.filters?.[0] ?? err?.message ?? t('common.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      size="sm"
      title={t('ideas.saveView')}
      description={t('ideas.saveViewHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('common.save')}</Button>
        </>
      }
    >
      <Input label={t('ideas.viewName')} value={name} onChange={(e) => { setName(e.target.value); setError('') }} error={error || undefined} required maxLength={120} />
    </Modal>
  )
}

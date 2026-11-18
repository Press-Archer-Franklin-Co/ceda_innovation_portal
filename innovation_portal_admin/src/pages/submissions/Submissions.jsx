import React, { useState, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ClipboardList, FlaskConical, Award, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import DataTable   from '../../components/ui/DataTable'
import StatusPill  from '../../components/ui/StatusPill'
import ErrorState  from '../../components/ui/ErrorState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { useSubmissions }          from '../../lib/queries/submissions'
import { usePrograms }             from '../../lib/queries/programs'
import { useAuth }                 from '../../lib/auth/AuthContext'
import { isPureJudge } from '../../lib/auth/permissions'


const TYPE_TABS = [
  { key: 'all',                    label: 'All',       icon: ClipboardList },
  { key: 'idea',                   label: 'Ideas',      icon: FlaskConical },
  { key: 'hackathon_application',  label: 'Hackathon',  icon: Award },
]

const STATUS_OPTIONS = [
  { value: '',                          label: 'All',             group: null       },
  { value: 'submitted',                 label: 'Submitted',       group: 'active'   },
  { value: 'screening',                 label: 'Screening',       group: 'active'   },
  { value: 'under_review',              label: 'Under Review',    group: 'active'   },
  { value: 'judging_review',            label: 'Judging Review',  group: 'active'   },
  { value: 'under_judging',             label: 'Under Judging',   group: 'active'   },
  { value: 'shortlisted',               label: 'Shortlisted',     group: 'positive' },
  { value: 'finalist',                  label: 'Finalist',        group: 'positive' },
  { value: 'approved',                  label: 'Approved',        group: 'positive' },
  { value: 'winner',                    label: 'Winner',          group: 'positive' },
  { value: 'rejected',                  label: 'Rejected',        group: 'closed'   },
  { value: 'returned',                  label: 'Returned',        group: 'closed'   },
  { value: 'screened_out',              label: 'Screened Out',    group: 'closed'   },
  { value: 'requires_more_information', label: 'More Info',       group: 'closed'   },
]

const STATUS_GROUP_COLORS = {
  active:   'bg-blue-50 text-blue-700 border-blue-200',
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:   'bg-red-50 text-red-600 border-red-200',
}

const SUBMISSION_COLUMNS = [
  {
    key: 'reference_number', label: 'Ref', width: 110, sortable: true,
    render: (v) => <span className="text-xs font-mono text-ceda-muted">{v ?? '—'}</span>,
  },
  {
    key: 'title', label: 'Title / Applicant', sortable: true,
    render: (v, row) => {
      const name = typeof row.innovator === 'object'
        ? [row.innovator?.first_name, row.innovator?.last_name].filter(Boolean).join(' ')
        : (row.innovator ?? row.submitted_by_name ?? '—')
      return (
        <div className="min-w-0">
          <p className="text-sm font-medium text-ceda-dark truncate">{v ?? '—'}</p>
          <p className="text-xs text-ceda-muted truncate">{name}</p>
        </div>
      )
    },
  },
  {
    key: 'program_detail', label: 'Program', width: 180,
    render: (v) => (
      <span className="text-xs text-ceda-muted truncate block">
        {typeof v === 'object' ? (v?.title ?? v?.name ?? '—') : (v ?? '—')}
      </span>
    ),
  },
  {
    key: 'current_status', label: 'Status', width: 160,
    render: (v) => <StatusPill status={v} />,
  },
  {
    key: 'submitted_at', label: 'Submitted', width: 100, sortable: true,
    render: (v) => v
      ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
      : '—',
  },
]


function TypeSegment({ value, onChange, counts }) {
  return (
    <div className="flex items-center gap-1 bg-ceda-surface border border-ceda-border rounded-lg p-0.5">
      {TYPE_TABS.map(t => {
        const Icon   = t.icon
        const count  = counts[t.key]
        const active = value === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              active ? 'bg-white shadow-sm text-ceda-dark' : 'text-ceda-muted hover:text-ceda-dark'
            )}
          >
            <Icon size={13} className="flex-shrink-0" />
            <span>{t.label}</span>
            <span className={cn('text-[10px] font-semibold min-w-[18px] text-center', active ? 'text-ceda-forest' : 'text-ceda-muted')}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StatusFilter({ value, onChange, counts }) {
  const visible = STATUS_OPTIONS.filter(opt => opt.value === '' || (counts[opt.value] ?? 0) > 0)

  return (
    <div className="px-4 py-3 border-b border-ceda-border bg-white">
      <div className="flex flex-wrap gap-1.5">
        {visible.map(opt => {
          const key    = opt.value || 'all'
          const count  = opt.value === '' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[opt.value] ?? 0)
          const active = value === opt.value
          const groupCls = active && opt.group ? STATUS_GROUP_COLORS[opt.group] ?? '' : ''
          return (
            <button
              key={key}
              onClick={() => onChange(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all',
                active
                  ? opt.group
                    ? groupCls
                    : 'bg-ceda-forest text-white border-ceda-forest'
                  : 'bg-white text-ceda-muted border-ceda-border hover:border-ceda-forest/40 hover:text-ceda-dark'
              )}
            >
              {opt.label}
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                active ? 'opacity-80' : 'text-ceda-muted'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilterBar({ search, onSearch, program, onProgram, programs, hasActiveFilters, onClear }) {
  const searchRef = useRef(null)
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ceda-border bg-ceda-surface/40">
      <div className="relative flex-1 max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ceda-muted pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          className="input h-8 pl-7 pr-3 text-sm w-full"
          placeholder="Search title, ref, applicant…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => { onSearch(''); searchRef.current?.focus() }} className="absolute right-2 top-1/2 -translate-y-1/2 text-ceda-muted hover:text-ceda-dark">
            <X size={12} />
          </button>
        )}
      </div>
      <select className="input h-8 py-0 text-sm w-44" value={program} onChange={e => onProgram(e.target.value)}>
        <option value="">All Programs</option>
        {programs.map(p => (
          <option key={p.id} value={p.id}>{p.title ?? p.name}</option>
        ))}
      </select>
      {hasActiveFilters && (
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-ceda-muted hover:text-ceda-dark transition-colors">
          <X size={12} /> Clear
        </button>
      )}
    </div>
  )
}


function SubmissionsTab() {
  const navigate = useNavigate()
  const [typeTab,   setTypeTab]   = useState('all')
  const [statusTab, setStatusTab] = useState('')
  const [search,    setSearch]    = useState('')
  const [program,   setProgram]   = useState('')

  const { data, isLoading, error, refetch } = useSubmissions()
  const { data: programsData } = usePrograms()

  const all      = Array.isArray(data) ? data : (data?.results ?? [])
  const programs = Array.isArray(programsData) ? programsData : (programsData?.results ?? [])
  const byType   = typeTab === 'all' ? all : all.filter(s => s.submission_type === typeTab)

  const typeCounts = {
    all:             all.length,
    idea_submission: all.filter(s => s.submission_type === 'idea_submission').length,
    hackathon:       all.filter(s => s.submission_type === 'hackathon').length,
  }

  const statusCounts = STATUS_OPTIONS.reduce((acc, opt) => {
    if (opt.value) {
      acc[opt.value] = byType.filter(s => s.current_status === opt.value).length
    }
    return acc
  }, {})

  const filtered = byType.filter(s => {
    if (statusTab && s.current_status !== statusTab) return false
    if (program && String(s.program) !== String(program) && String(s.program_detail?.id) !== String(program)) return false
    if (search) {
      const q    = search.toLowerCase()
      const name = typeof s.innovator === 'object'
        ? [s.innovator?.first_name, s.innovator?.last_name].filter(Boolean).join(' ')
        : (s.innovator ?? s.submitted_by_name ?? '')
      if (!([s.title, s.reference_number, name].some(v => (v ?? '').toLowerCase().includes(q)))) return false
    }
    return true
  })

  const hasActiveFilters = !!search || !!program || !!statusTab
  const clearFilters     = () => { setSearch(''); setProgram(''); setStatusTab('') }

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <p className="text-sm text-ceda-muted self-center">
          {isLoading ? 'Loading…' : `${all.length} total across all programs`}
        </p>
        {!isLoading && !error && (
          <TypeSegment value={typeTab} onChange={(v) => { setTypeTab(v); setStatusTab('') }} counts={typeCounts} />
        )}
      </div>

      <div className="card flex flex-col overflow-hidden" style={{ minHeight: 420 }}>
        {!isLoading && !error && (
          <StatusFilter value={statusTab} onChange={setStatusTab} counts={statusCounts} />
        )}
        {!isLoading && !error && (
          <FilterBar
            search={search} onSearch={setSearch}
            program={program} onProgram={setProgram}
            programs={programs} hasActiveFilters={hasActiveFilters} onClear={clearFilters}
          />
        )}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : error ? (
            <div className="p-6"><ErrorState message={error.message} onRetry={refetch} /></div>
          ) : (
            <DataTable
              columns={SUBMISSION_COLUMNS}
              data={filtered}
              onRowClick={row => navigate(`/submissions/${row.id}`)}
              emptyTitle={hasActiveFilters ? 'No matching submissions' : 'No submissions yet'}
              emptyMessage={hasActiveFilters ? 'Try adjusting or clearing your filters.' : 'Submissions will appear here once applicants submit to a program.'}
              emptyIcon={typeTab === 'hackathon' ? Award : typeTab === 'idea_submission' ? FlaskConical : ClipboardList}
              footer={
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-ceda-muted">
                    {filtered.length === all.length ? `${all.length} submissions` : `${filtered.length} of ${all.length} shown`}
                  </span>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-xs text-ceda-green hover:underline">Clear all filters</button>
                  )}
                </div>
              }
            />
          )}
        </div>
      </div>
    </>
  )
}


export default function Submissions() {
  const { user } = useAuth()
  const judgeOnly = isPureJudge(user)

  if (judgeOnly) return <Navigate to="/assignments" replace />

  return (
    <div className="animate-fade-in flex flex-col">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-ceda-dark">Submissions</h1>
        <p className="text-sm text-ceda-muted mt-0.5">Review and manage program submissions.</p>
      </div>

      <SubmissionsTab />
    </div>
  )
}

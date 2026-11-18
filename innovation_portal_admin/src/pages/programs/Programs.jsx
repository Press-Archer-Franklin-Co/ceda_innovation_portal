import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Layers, Users, Calendar } from 'lucide-react'
import PageHeader    from '../../components/ui/PageHeader'
import StatusPill    from '../../components/ui/StatusPill'
import Tabs          from '../../components/ui/Tabs'
import EmptyState    from '../../components/ui/EmptyState'
import ErrorState    from '../../components/ui/ErrorState'
import { SkeletonCards, SkeletonStatCards } from '../../components/ui/LoadingSkeleton'
import { usePrograms } from '../../lib/queries/programs'
import { cn } from '../../lib/cn'

const TYPE_LABEL = {
  idea:            'Idea',
  hackathon:       'Hackathon',
  challenge_call:  'Challenge Call',
}
const TYPE_COLOR = {
  idea:            'bg-ceda-indigo-pale text-ceda-indigo',
  hackathon:       'bg-ceda-gold-pale text-ceda-gold',
  challenge_call:  'bg-ceda-surface text-ceda-muted',
}

function ProgramCard({ program, onClick }) {
  const typeCode = program.program_type?.code ?? program.program_type ?? program.type
  const accent = typeCode === 'hackathon' ? '#9A5200' : typeCode === 'challenge_call' ? '#1D4ED8' : '#A01E0A'

  const openDate  = program.opening_date ?? program.opens_at ?? program.start_date
  const closeDate = program.closing_date ?? program.closes_at ?? program.end_date
  const status    = program.status

  return (
    <div
      onClick={onClick}
      className="card-hover cursor-pointer overflow-hidden flex flex-col"
    >
      <div className="h-1.5 flex-shrink-0" style={{ background: accent }} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={cn('badge text-[11px]', TYPE_COLOR[typeCode] ?? 'bg-ceda-surface text-ceda-muted')}>
            {TYPE_LABEL[typeCode] ?? program.program_type?.name ?? typeCode ?? 'Program'}
          </span>
          <StatusPill status={status} />
        </div>

        <h3 className="text-sm font-semibold text-ceda-dark mb-1 line-clamp-2 flex-1">
          {program.title}
        </h3>
        <p className="text-xs text-ceda-muted line-clamp-2 mb-4">
          {program.description ?? 'No description provided.'}
        </p>

        <div className="grid grid-cols-2 gap-2 pt-4 border-t border-ceda-border/60">
          <div className="text-center">
            <p className="text-base font-bold text-ceda-dark tabular-nums">
              {program.max_team_size ?? '—'}
            </p>
            <p className="text-[10px] text-ceda-muted">Max Team Size</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-ceda-dark capitalize">
              {program.availability?.is_submission_open ? 'Open' : status ?? '—'}
            </p>
            <p className="text-[10px] text-ceda-muted">Availability</p>
          </div>
        </div>

        {(openDate || closeDate) && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-ceda-muted">
            <Calendar size={11} />
            <span>
              {openDate ? new Date(openDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?'}
              {' – '}
              {closeDate ? new Date(closeDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Open'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'closed',    label: 'Closed' },
  { key: 'draft',     label: 'Draft' },
  { key: 'archived',  label: 'Archived' },
]

export default function Programs() {
  const [tab, setTab]       = useState('all')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = usePrograms()

  const programs = Array.isArray(data) ? data : data?.results ?? []

  const withCounts = TABS.map(t => ({
    ...t,
    count: t.key === 'all'
      ? programs.length
      : programs.filter(p => (p.status ?? '') === t.key).length,
  }))

  const filtered = programs.filter(p => {
    const pStatus = p.status ?? ''
    const matchTab    = tab === 'all' || pStatus === tab
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  const publishedCount = programs.filter(p => p.status === 'published').length
  const draftCount     = programs.filter(p => p.status === 'draft').length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Programs"
        subtitle="Manage innovation programs, challenges, and hackathons."
        actions={
          <button onClick={() => navigate('/programs/new')} className="btn-primary">
            <Plus size={16} /> New Program
          </button>
        }
      />

      {isLoading ? (
        <SkeletonStatCards count={3} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Programs', value: programs.length,  icon: Layers,   color: 'text-ceda-forest' },
            { label: 'Published',      value: publishedCount,   icon: Users,    color: 'text-ceda-green' },
            { label: 'Draft',          value: draftCount,       icon: Calendar, color: 'text-ceda-indigo' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className={s.color} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-lg font-bold text-ceda-dark leading-none">{s.value}</p>
                  <p className="text-xs text-ceda-muted mt-0.5">{s.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs tabs={withCounts} active={tab} onChange={setTab} className="flex-shrink-0" />
        <div className="flex-1 min-w-[180px] max-w-xs ml-auto">
          <input
            type="text"
            className="input h-9 py-0 text-sm"
            placeholder="Search programs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No programs found"
          message={tab !== 'all' ? `No ${tab} programs.` : 'No programs match your search.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => (
            <ProgramCard
              key={p.id}
              program={p}
              onClick={() => navigate(`/programs/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

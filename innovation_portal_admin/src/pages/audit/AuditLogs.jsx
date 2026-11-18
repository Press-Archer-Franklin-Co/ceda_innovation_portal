import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, Search, ChevronLeft, ChevronRight,
  User, FileText, ClipboardList, Star, Users, Layers, Bell,
  ChevronDown, ChevronUp, AlertTriangle, Info, CheckCircle2, XCircle,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonCards } from '../../components/ui/LoadingSkeleton'
import { audit as auditApi } from '../../lib/api/endpoints'

function formatAction(raw) {
  const MAP = {
    local_login_success:              { label: 'Login',                  color: 'bg-green-50 text-green-700',   icon: CheckCircle2 },
    local_login_failed:               { label: 'Login Failed',           color: 'bg-red-50 text-red-700',       icon: XCircle      },
    logout:                           { label: 'Logout',                 color: 'bg-gray-100 text-gray-600',    icon: null         },
    password_changed:                 { label: 'Password Changed',       color: 'bg-yellow-50 text-yellow-700', icon: null         },
    primary_auth_method_changed:      { label: 'Auth Method Changed',    color: 'bg-yellow-50 text-yellow-700', icon: null         },
    staff_security_requirement_failed:{ label: 'Security Check Failed',  color: 'bg-red-50 text-red-700',       icon: AlertTriangle},
    email_change_requested:           { label: 'Email Change',           color: 'bg-yellow-50 text-yellow-700', icon: null         },
    email_verified:                   { label: 'Email Verified',         color: 'bg-green-50 text-green-700',   icon: CheckCircle2 },
    admin_resend_verification:        { label: 'Verification Resent',    color: 'bg-amber-50 text-amber-700',   icon: null         },

    user_onboarding_ensured:          { label: 'User Onboarded',         color: 'bg-blue-50 text-blue-700',     icon: null },
    deployment_admin_bootstrap:       { label: 'Admin Bootstrap',        color: 'bg-purple-50 text-purple-700', icon: null },
    user_role_updated:                { label: 'Role Updated',           color: 'bg-purple-50 text-purple-700', icon: null },

    program_created:                  { label: 'Program Created',        color: 'bg-teal-50 text-teal-700',     icon: null },
    program_updated:                  { label: 'Program Updated',        color: 'bg-teal-50 text-teal-700',     icon: null },
    program_published:                { label: 'Program Published',      color: 'bg-green-50 text-green-700',   icon: null },
    program_unpublished:              { label: 'Program Unpublished',    color: 'bg-orange-50 text-orange-700', icon: null },
    program_closed:                   { label: 'Program Closed',         color: 'bg-gray-100 text-gray-600',    icon: null },
    program_shortlist_generated:      { label: 'Shortlist Generated',    color: 'bg-teal-50 text-teal-700',     icon: null },

    submission_created:               { label: 'Submission Created',     color: 'bg-blue-50 text-blue-700',     icon: null },
    submission_submitted:             { label: 'Submitted',              color: 'bg-green-50 text-green-700',   icon: null },
    submission_resubmitted:           { label: 'Resubmitted',            color: 'bg-yellow-50 text-yellow-700', icon: null },
    draft_saved:                      { label: 'Draft Saved',            color: 'bg-gray-100 text-gray-600',    icon: null },
    document_uploaded:                { label: 'Document Uploaded',      color: 'bg-blue-50 text-blue-700',     icon: null },
    submission_screened:              { label: 'Screened',               color: 'bg-teal-50 text-teal-700',     icon: null },

    assignment_created:               { label: 'Assignment Created',     color: 'bg-indigo-50 text-indigo-700', icon: null },
    assignment_accepted:              { label: 'Assignment Accepted',    color: 'bg-green-50 text-green-700',   icon: null },
    assignment_declined:              { label: 'Assignment Declined',    color: 'bg-red-50 text-red-700',       icon: null },
    assignment_completed:             { label: 'Assignment Completed',   color: 'bg-teal-50 text-teal-700',     icon: null },
    assignment_reassigned:            { label: 'Reassigned',             color: 'bg-yellow-50 text-yellow-700', icon: null },

    score_draft_saved:                { label: 'Score Draft Saved',      color: 'bg-indigo-50 text-indigo-700', icon: null },
    score_submitted:                  { label: 'Score Submitted',        color: 'bg-green-50 text-green-700',   icon: null },
    score_locked:                     { label: 'Score Locked',           color: 'bg-gray-100 text-gray-600',    icon: null },
    final_decision_recorded:          { label: 'Decision Recorded',      color: 'bg-purple-50 text-purple-700', icon: null },

    workflow_started:                 { label: 'Workflow Started',       color: 'bg-teal-50 text-teal-700',     icon: null },
    workflow_advanced:                { label: 'Workflow Advanced',      color: 'bg-teal-50 text-teal-700',     icon: null },
    workflow_completed:               { label: 'Workflow Completed',     color: 'bg-green-50 text-green-700',   icon: null },
    workflow_cancelled:               { label: 'Workflow Cancelled',     color: 'bg-red-50 text-red-700',       icon: null },

    form_field_created:               { label: 'Field Created',          color: 'bg-gray-100 text-gray-600',    icon: null },
    form_option_created:              { label: 'Option Created',         color: 'bg-gray-100 text-gray-600',    icon: null },
    form_rule_created:                { label: 'Form Rule Created',      color: 'bg-gray-100 text-gray-600',    icon: null },

    notification_delivery_sent:       { label: 'Notification Sent',      color: 'bg-blue-50 text-blue-700',     icon: null },
    notification_delivery_failed:     { label: 'Notification Failed',    color: 'bg-red-50 text-red-700',       icon: AlertTriangle },
    communication_sent:               { label: 'Communication Sent',     color: 'bg-blue-50 text-blue-700',     icon: null },
  }
  const entry = MAP[raw]
  if (entry) return entry
  const label = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { label, color: 'bg-gray-100 text-gray-600', icon: null }
}

function isErrorAction(actionType) {
  return (
    actionType?.includes('failed') ||
    actionType?.includes('error') ||
    actionType?.includes('rejected') ||
    actionType?.includes('declined') ||
    actionType?.includes('cancelled') ||
    actionType?.includes('denied')
  )
}

function formatTarget(model, targetId) {
  const short = targetId ? String(targetId).slice(0, 8) : null
  const MODEL_MAP = {
    User: 'User', Profile: 'Profile', Submission: 'Submission',
    Program: 'Program', Assignment: 'Assignment',
    NewsArticle: 'News Article', LeadershipCard: 'Leadership Card',
    FAQ: 'FAQ', HackathonPage: 'Hackathon Page', WinnerSpotlight: 'Winner',
    ApplicationDraft: 'Application Draft',
  }
  const label = MODEL_MAP[model] ?? model
  return short ? `${label} · ${short}…` : label
}

function prettyKey(k) {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function MetaValue({ value }) {
  if (value === null || value === undefined) return <span className="text-ceda-muted italic">—</span>
  if (typeof value === 'boolean') return (
    <span className={value ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
      {value ? 'true' : 'false'}
    </span>
  )
  if (typeof value === 'object') return (
    <pre className="text-[10px] font-mono text-ceda-muted whitespace-pre-wrap break-all leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
  return <span className="font-mono text-[11px] text-ceda-dark break-all">{String(value)}</span>
}

function DetailSection({ title, data, icon: Icon, accent }) {
  if (!data || typeof data !== 'object') return null
  const keys = Object.keys(data)
  if (!keys.length) return null
  return (
    <div className={`rounded-lg border ${accent ?? 'border-ceda-border bg-ceda-surface/60'} p-3 space-y-2`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ceda-muted flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {keys.map(k => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ceda-muted font-semibold">{prettyKey(k)}</span>
            <MetaValue value={data[k]} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ExpandedDetail({ entry }) {
  const { label } = formatAction(entry.action_type)
  const hasError = isErrorAction(entry.action_type)
  const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0
  const hasBefore = entry.before_state && Object.keys(entry.before_state).length > 0
  const hasAfter = entry.after_state && Object.keys(entry.after_state).length > 0

  const ERROR_KEYS = ['error', 'error_message', 'reason', 'detail', 'status_code', 'error_code', 'failure_reason']
  const errorMeta = {}
  const otherMeta = {}
  if (entry.metadata) {
    for (const [k, v] of Object.entries(entry.metadata)) {
      if (ERROR_KEYS.includes(k)) errorMeta[k] = v
      else otherMeta[k] = v
    }
  }
  const hasErrorMeta = Object.keys(errorMeta).length > 0

  return (
    <div className="px-5 pb-4 space-y-3 bg-white border-t border-ceda-border/60">
      <div className={`rounded-lg p-3 flex flex-col sm:flex-row sm:items-start gap-3 mt-3 ${hasError ? 'bg-red-50 border border-red-100' : 'bg-ceda-surface border border-ceda-border'}`}>
        <div className="flex-1 space-y-1">
          <p className="text-xs font-semibold text-ceda-dark">
            {hasError ? '⚠ ' : ''}{label} — what happened
          </p>
          <p className="text-xs text-ceda-muted">
            <span className="font-medium text-ceda-dark">{entry.actor_name ?? 'System'}</span>
            {entry.actor_email ? <span className="text-ceda-muted"> ({entry.actor_email})</span> : null}
            {' '}attempted <span className="font-mono font-medium text-ceda-dark">{entry.action_type}</span>
            {' '}on <span className="font-mono font-medium text-ceda-dark">{entry.target_model}</span>
          </p>
          <p className="text-[10px] text-ceda-muted">
            Target ID: <span className="font-mono">{entry.target_id ?? '—'}</span>
            &nbsp;·&nbsp;
            {new Date(entry.created_at).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            })}
          </p>
        </div>
        {hasError && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-[11px] font-semibold shrink-0">
            <XCircle size={12} /> Failed
          </span>
        )}
      </div>

      {hasErrorMeta && (
        <DetailSection
          title="Error / Response Details"
          data={errorMeta}
          icon={AlertTriangle}
          accent="border-red-200 bg-red-50"
        />
      )}

      {hasMeta && Object.keys(otherMeta).length > 0 && (
        <DetailSection
          title="Request Details"
          data={otherMeta}
          icon={Info}
        />
      )}

      {!hasMeta && (
        <p className="text-[11px] text-ceda-muted italic px-1">No additional metadata was recorded for this event.</p>
      )}

      {(hasBefore || hasAfter) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hasBefore && (
            <DetailSection
              title="Before"
              data={entry.before_state}
              accent="border-orange-100 bg-orange-50/50"
            />
          )}
          {hasAfter && (
            <DetailSection
              title="After"
              data={entry.after_state}
              accent="border-green-100 bg-green-50/50"
            />
          )}
        </div>
      )}
    </div>
  )
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const s    = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
}

const CATEGORIES = [
  { key: '',            label: 'All',          icon: ShieldCheck  },
  { key: 'submissions', label: 'Submissions',  icon: ClipboardList},
  { key: 'assignments', label: 'Assignments',  icon: FileText     },
  { key: 'evaluations', label: 'Evaluations',  icon: Star         },
  { key: 'programs',    label: 'Programs',     icon: Layers       },
  { key: 'users',       label: 'Users',        icon: Users        },
  { key: 'content',     label: 'Content',      icon: FileText     },
]

function Pagination({ page, totalPages, total, pageSize, onChange }) {
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)

  const pages = []
  const delta = 2
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i)
  }
  const withEllipsis = []
  let prev = 0
  for (const p of pages) {
    if (prev && p - prev > 1) withEllipsis.push('…')
    withEllipsis.push(p)
    prev = p
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-ceda-border bg-white rounded-b-xl">
      <p className="text-xs text-ceda-muted">{start}–{end} of {total.toLocaleString()} entries</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg text-ceda-muted hover:text-ceda-dark hover:bg-ceda-surface disabled:opacity-30 transition-colors">
          <ChevronLeft size={14} />
        </button>
        {withEllipsis.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-ceda-muted">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                p === page ? 'bg-ceda-dark text-white' : 'text-ceda-muted hover:bg-ceda-surface hover:text-ceda-dark'
              }`}>
              {p}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-ceda-muted hover:text-ceda-dark hover:bg-ceda-surface disabled:opacity-30 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE = 25

export default function AuditLogs() {
  const [page,            setPage]            = useState(1)
  const [search,          setSearch]          = useState('')
  const [userFilter,      setUserFilter]      = useState('')
  const [category,        setCategory]        = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedUser,   setDebouncedUser]   = useState('')
  const [expandedId,      setExpandedId]      = useState(null)

  const handleSearch = useCallback((val) => {
    setSearch(val)
    clearTimeout(handleSearch._timer)
    handleSearch._timer = setTimeout(() => { setDebouncedSearch(val); setPage(1) }, 350)
  }, [])

  const handleUserFilter = useCallback((val) => {
    setUserFilter(val)
    clearTimeout(handleUserFilter._timer)
    handleUserFilter._timer = setTimeout(() => { setDebouncedUser(val); setPage(1) }, 350)
  }, [])

  const handleCategory = (cat) => { setCategory(cat); setPage(1) }

  const effectiveSearch = [debouncedUser, debouncedSearch].filter(Boolean).join(' ')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs', page, effectiveSearch, category],
    queryFn:  () => auditApi.logs({
      page,
      page_size: PAGE_SIZE,
      search:    effectiveSearch || undefined,
      category:  category       || undefined,
    }),
    keepPreviousData: true,
  })

  const items      = data?.results ?? []
  const total      = data?.count ?? 0
  const totalPages = data?.total_pages ?? 1

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id)

  if (isError) {
    return (
      <div className="p-6">
        <PageHeader title="Audit Logs" icon={<ShieldCheck size={20} />} />
        <ErrorState message={error?.message ?? 'Failed to load audit logs'} onRetry={refetch} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Audit Logs"
        subtitle={`Complete activity trail — ${total.toLocaleString()} events recorded`}
        icon={<ShieldCheck size={20} />}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ceda-muted" />
            <input
              value={userFilter}
              onChange={e => handleUserFilter(e.target.value)}
              placeholder="Filter by user email…"
              className="input pl-8 w-full sm:w-56 text-sm h-9"
            />
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ceda-muted" />
            <input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by action, model…"
              className="input pl-8 w-full text-sm h-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => handleCategory(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                category === cat.key
                  ? 'bg-ceda-dark text-white'
                  : 'bg-white border border-ceda-border text-ceda-muted hover:text-ceda-dark hover:border-ceda-dark'
              }`}
            >
              <cat.icon size={12} />
              {cat.label}
            </button>
          ))}
        </div>
        {debouncedUser && (
          <div className="flex items-center gap-2 text-xs text-ceda-muted">
            <span>Showing events for:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ceda-green-pale text-ceda-forest px-3 py-1 font-semibold">
              <User size={11} /> {debouncedUser}
              <button onClick={() => { setUserFilter(''); setDebouncedUser(''); setPage(1) }}
                className="ml-1 hover:text-red-600">&times;</button>
            </span>
          </div>
        )}
      </div>

      <div className="bg-white border border-ceda-border rounded-xl overflow-hidden shadow-sm">
        <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1.2fr_0.8fr_2rem] gap-4 px-5 py-2.5 bg-ceda-surface border-b border-ceda-border text-[11px] font-semibold text-ceda-muted uppercase tracking-wide">
          <span>Action</span>
          <span>Actor</span>
          <span>Target</span>
          <span>When</span>
          <span />
        </div>

        {isLoading && <div className="p-5"><SkeletonCards count={8} /></div>}

        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title="No audit events found"
            message={(debouncedSearch || debouncedUser || category) ? 'Try adjusting your search or filter.' : 'No activity has been recorded yet.'}
          />
        )}

        {!isLoading && items.map((entry, idx) => {
          const { label, color } = formatAction(entry.action_type)
          const isExpanded = expandedId === entry.id
          const isLast     = idx === items.length - 1
          const isError    = isErrorAction(entry.action_type)
          const hasDetail  = (entry.metadata && Object.keys(entry.metadata).length > 0)
                          || (entry.before_state && Object.keys(entry.before_state).length > 0)
                          || (entry.after_state && Object.keys(entry.after_state).length > 0)

          return (
            <div key={entry.id} className={!isLast && !isExpanded ? 'border-b border-ceda-border/60' : ''}>
              <button
                type="button"
                onClick={() => toggleExpand(entry.id)}
                className={`w-full text-left grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_1.2fr_0.8fr_2rem] gap-2 sm:gap-4 px-5 py-3 transition-colors ${
                  isExpanded
                    ? 'bg-ceda-surface/80 border-b border-ceda-border/60'
                    : isError
                      ? 'hover:bg-red-50/40'
                      : 'hover:bg-ceda-surface/50'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold shrink-0 ${color}`}>
                    {label}
                  </span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-ceda-surface border border-ceda-border flex items-center justify-center flex-shrink-0">
                    <User size={11} className="text-ceda-muted" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ceda-dark truncate">{entry.actor_name ?? 'System'}</p>
                    {entry.actor_email && (
                      <p className="text-[10px] text-ceda-muted truncate">{entry.actor_email}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center">
                  <span className="text-xs text-ceda-muted font-mono">
                    {formatTarget(entry.target_model, entry.target_id)}
                  </span>
                </div>

                <div className="flex items-center">
                  <span className="text-xs text-ceda-muted" title={new Date(entry.created_at).toLocaleString('en-GB')}>
                    {relativeTime(entry.created_at)}
                  </span>
                </div>

                <div className="hidden sm:flex items-center justify-end">
                  {hasDetail
                    ? (isExpanded
                        ? <ChevronUp size={14} className="text-ceda-muted" />
                        : <ChevronDown size={14} className={isError ? 'text-red-400' : 'text-ceda-muted'} />
                      )
                    : null
                  }
                </div>
              </button>

              {isExpanded && <ExpandedDetail entry={entry} />}
            </div>
          )
        })}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>
    </div>
  )
}

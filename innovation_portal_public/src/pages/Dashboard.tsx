import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PlusCircle, Trophy, Clock, CheckCircle2, AlertCircle, RefreshCw,
  FileText, ArrowRight, Users, Bell, Trash2, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { submissionsService } from '../services/submissions.service'
import type { ApplicationDraft } from '../services/submissions.service'
import { programsService }    from '../services/programs.service'
import { parseApiError }      from '../utils/apiError'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import VerificationRequired from '../components/ui/VerificationRequired'
import type { Submission, Program } from '../types/api'


function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

type StatusMeta = { label: string; variant: 'open' | 'upcoming' | 'closed' | 'orange' | 'red' | 'default' }

const DRAFT_STATUSES = new Set(['draft'])
const COMPLETED_STATUSES = new Set([
  'accepted',
  'approved',
  'winner',
  'rejected',
  'screened_out',
  'withdrawn',
  'closed',
  'shortlisted',
  'finalist',
])

function statusMeta(s: string): StatusMeta {
  switch (s?.toLowerCase()) {
    case 'draft':          return { label: 'Draft',        variant: 'default'  }
    case 'submitted':      return { label: 'Submitted',    variant: 'upcoming' }
    case 'under_review':
    case 'in_review':
    case 'screening':      return { label: 'Under Review', variant: 'upcoming' }
    case 'judging_review': return { label: 'Judging',      variant: 'upcoming' }
    case 'shortlisted':    return { label: 'Shortlisted',  variant: 'open'     }
    case 'finalist':       return { label: 'Finalist',     variant: 'open'     }
    case 'winner':         return { label: 'Winner',       variant: 'open'     }
    case 'accepted':
    case 'approved':       return { label: 'Accepted',     variant: 'open'     }
    case 'returned':       return { label: 'Returned',     variant: 'orange'   }
    case 'rejected':
    case 'screened_out':   return { label: 'Not Selected', variant: 'red'      }
    case 'withdrawn':      return { label: 'Withdrawn',    variant: 'closed'   }
    default:               return { label: s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown', variant: 'default' }
  }
}

function submissionStatus(submission: Submission): string {
  return submission.current_status?.toLowerCase().trim() ?? ''
}

const isDraft = (submission: Submission) => DRAFT_STATUSES.has(submissionStatus(submission))
const isCompleted = (submission: Submission) => COMPLETED_STATUSES.has(submissionStatus(submission))
const isSubmitted = (submission: Submission) => {
  const status = submissionStatus(submission)
  return !!status && !DRAFT_STATUSES.has(status) && !COMPLETED_STATUSES.has(status)
}


function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function PlaceholderCard({
  icon, title, body, action, to,
}: { icon: React.ReactNode; title: string; body: string; action?: string; to?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5 flex flex-col h-full">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-gray-300">{icon}</span>
        <h3 className="font-bold text-sm text-gray-700">{title}</h3>
      </div>
      <p className="text-[13px] text-gray-400 leading-relaxed flex-1">{body}</p>
      {action && to && (
        <Link to={to} className="inline-flex items-center gap-1 text-[12px] font-semibold mt-4 hover:underline" style={{ color: '#A01E0A' }}>
          {action} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}


function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2.5 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#A01E0A' }}
        />
      </div>
      <span className="text-[11px] font-semibold text-gray-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}


function DeleteDraftButton({ draftId, onDeleted }: { draftId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={async () => {
            setDeleting(true)
            try { await submissionsService.deleteDraft(draftId); onDeleted() }
            catch { setDeleting(false); setConfirming(false) }
          }}
          disabled={deleting}
          className="text-[11px] font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 cursor-pointer"
        >
          {deleting ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
      title="Delete draft"
    >
      <Trash2 size={14} />
    </button>
  )
}


function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-t border-gray-100 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3.5 bg-gray-100 rounded" style={{ width: `${[60, 80, 55, 40, 30][i] ?? 50}%` }} />
        </td>
      ))}
    </tr>
  )
}


type AppTab = 'drafts' | 'submitted' | 'completed'

export default function Dashboard() {
  const { user, isVerified } = useAuth()
  const navigate = useNavigate()

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [appDrafts,   setAppDrafts]   = useState<ApplicationDraft[]>([])
  const [programs,    setPrograms]    = useState<Program[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [showVerifyModal, setShowVerifyModal] = useState(false)

  const handleVerifyGate = (path: string) => {
    if (isVerified) {
      navigate(path)
      return
    }
    localStorage.setItem('ceda_post_verify_redirect', path)
    setShowVerifyModal(true)
  }
  const [appTab,      setAppTab]      = useState<AppTab>('drafts')

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([
      submissionsService.getMySubmissions(),
      submissionsService.getMyDrafts(),
      programsService.getPublic(),
    ])
      .then(([subs, drafts, progs]) => { setSubmissions(subs); setAppDrafts(drafts); setPrograms(progs) })
      .catch(err => setError(parseApiError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const challenges = useMemo(
    () => programs.filter(p => p.program_type?.code !== 'idea' && p.status === 'published'),
    [programs]
  )

  const programMap = useMemo(() => {
    const m: Record<string, string> = {}
    programs.forEach(p => { m[p.id] = p.title })
    return m
  }, [programs])

  function programName(sub: Submission): string {
    if (typeof sub.program_detail === 'object' && sub.program_detail !== null) {
      const d = sub.program_detail as Record<string, unknown>
      if (typeof d.title === 'string') return d.title
    }
    return programMap[sub.program] ?? sub.program ?? '—'
  }

  function draftProgramName(d: ApplicationDraft): string {
    return d.program_title ?? programMap[d.program] ?? '—'
  }

  const active    = useMemo(() => submissions.filter(isSubmitted), [submissions])
  const completed = useMemo(() => submissions.filter(isCompleted), [submissions])

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const tabSubs: Record<AppTab, Submission[]> = {
    drafts:    submissions.filter(isDraft),
    submitted: active,
    completed,
  }

  const tabDefs: { key: AppTab; label: string; count: number }[] = [
    { key: 'drafts',    label: 'Drafts',    count: appDrafts.length },
    { key: 'submitted', label: 'In Review', count: active.length },
    { key: 'completed', label: 'Decided',   count: completed.length },
  ]

  return (
    <div className="bg-gray-50 min-h-screen">

      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-extrabold shrink-0" style={{ background: '#A01E0A' }}>
              {(user?.first_name.charAt(0) ?? '') + (user?.last_name.charAt(0) ?? '')}
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">{greeting}</p>
              <h1 className="text-xl font-extrabold text-gray-900 leading-tight">
                {user?.first_name} {user?.last_name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer" title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <AlertCircle size={15} /> {error}
            <button onClick={load} className="ml-auto underline font-medium cursor-pointer">Retry</button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleVerifyGate('/innovate')}
            className="rounded-2xl px-5 py-5 flex items-start gap-4 hover:opacity-90 transition-opacity"
            style={{ background: '#A01E0A' }}
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
              <PlusCircle size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-white leading-snug">Submit an idea</p>
              <p className="text-[11.5px] text-white/60 mt-0.5">Start a new innovation submission</p>
            </div>
          </button>

          <Link
            to="/challenges"
            className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-5 py-5 flex items-start gap-4 hover:shadow-md transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-xl bg-[#2563eb]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Trophy size={18} className="text-[#2563eb]" />
            </div>
            <div>
              <p className="text-[13.5px] font-bold text-gray-800 leading-snug">Join a challenge</p>
              <p className="text-[11.5px] text-gray-400 mt-0.5">
                {challenges.length > 0 ? `${challenges.length} challenge${challenges.length !== 1 ? 's' : ''} open now` : 'View open challenges'}
              </p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<FileText size={18} />}    label="Submitted"  value={submissions.length} color="#A01E0A" />
          <StatCard icon={<Clock size={18} />}        label="Drafts"     value={appDrafts.length}   color="#d97706" />
          <StatCard icon={<Trophy size={18} />}       label="In Review"  value={active.length}      color="#2563eb" />
          <StatCard icon={<CheckCircle2 size={18} />} label="Completed"  value={completed.length}   color="#16a34a" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">

              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <FileText size={15} className="text-gray-400" /> My Applications
                </h2>
                <button
                  type="button"
                  onClick={() => handleVerifyGate('/innovate')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-xl text-white"
                  style={{ background: '#A01E0A' }}
                >
                  <PlusCircle size={12} /> New Submission
                </button>
              </div>

              <div className="flex border-b border-gray-100 px-5 gap-0">
                {tabDefs.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setAppTab(key)}
                    className={`relative px-3 py-3 text-[12.5px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      appTab === key
                        ? 'text-[#A01E0A]'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        appTab === key ? 'bg-[#A01E0A] text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}
                      </span>
                    )}
                    {appTab === key && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#A01E0A' }} />
                    )}
                  </button>
                ))}
              </div>

              {appTab === 'drafts' && (
                loading ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Application', 'Reference', 'Progress', 'Updated', ''].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{[1, 2].map(i => <SkeletonRow key={i} cols={5} />)}</tbody>
                  </table>
                ) : appDrafts.length === 0 ? (
                  <div className="text-center py-14 px-4">
                    <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <Clock size={20} className="text-gray-200" />
                    </div>
                    <p className="text-sm font-semibold text-gray-500 mb-1">No drafts yet</p>
                    <p className="text-xs text-gray-400 mb-4">Start an application — it will be auto-saved as you go.</p>
                    <button
                      type="button"
                      onClick={() => handleVerifyGate('/innovate')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white"
                      style={{ background: '#A01E0A' }}
                    >
                      <PlusCircle size={12} /> Start an application
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="sm:hidden divide-y divide-gray-100">
                      {appDrafts.map((d) => {
                        const pct = d.progress_metadata?.percent_complete ?? 0
                        return (
                          <div key={d.id} className="px-4 py-3.5 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-[13px] truncate">
                                  {d.title && d.title !== 'Untitled idea' ? d.title : 'Untitled draft'}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{draftProgramName(d)}</p>
                              </div>
                              <span className="text-[10px] font-mono text-[#A01E0A] bg-[#A01E0A]/[0.06] px-2 py-0.5 rounded-md shrink-0">
                                {d.reference_number ?? 'DRAFT'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <ProgressBar pct={pct} />
                              {pct < 100 && pct > 0 && <AlertTriangle size={12} className="text-amber-400 shrink-0" />}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-gray-400">{d.updated_at ? formatDate(d.updated_at) : '—'}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyGate(`/innovate?draft=${d.id}`)}
                                  className="text-[12px] font-semibold text-[#A01E0A] flex items-center gap-0.5"
                                >
                                  Resume <ArrowRight size={11} />
                                </button>
                                <DeleteDraftButton draftId={d.id} onDeleted={() => setAppDrafts(prev => prev.filter(x => x.id !== d.id))} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {['Application', 'Reference', 'Progress', 'Updated', ''].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {appDrafts.map((d) => {
                            const pct = d.progress_metadata?.percent_complete ?? 0
                            return (
                              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                                <td className="px-5 py-3.5">
                                  <p className="font-semibold text-gray-900 text-[13px] max-w-[180px] truncate">
                                    {d.title && d.title !== 'Untitled idea' ? d.title : 'Untitled draft'}
                                  </p>
                                  <p className="text-[11px] text-gray-400 mt-0.5">{draftProgramName(d)}</p>
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="text-[11px] font-mono text-[#A01E0A] bg-[#A01E0A]/[0.06] px-2 py-0.5 rounded-md">
                                    {d.reference_number ?? 'DRAFT'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <ProgressBar pct={pct} />
                                    {pct < 100 && pct > 0 && <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />}
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-[12px] text-gray-400 whitespace-nowrap">
                                  {d.updated_at ? formatDate(d.updated_at) : '—'}
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyGate(`/innovate?draft=${d.id}`)}
                                      className="text-[12px] font-semibold text-[#A01E0A] hover:underline flex items-center gap-0.5 whitespace-nowrap"
                                    >
                                      Resume <ArrowRight size={11} />
                                    </button>
                                    <DeleteDraftButton draftId={d.id} onDeleted={() => setAppDrafts(prev => prev.filter(x => x.id !== d.id))} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}

              {(appTab === 'submitted' || appTab === 'completed') && (
                loading ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Title', 'Challenge', 'Status', 'Date', 'Ref'].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{[1, 2, 3].map(i => <SkeletonRow key={i} />)}</tbody>
                  </table>
                ) : tabSubs[appTab].length === 0 ? (
                  <div className="text-center py-14 px-4">
                    <p className="text-sm font-semibold text-gray-500 mb-1">
                      {appTab === 'submitted' ? 'Nothing under review' : 'No decided applications yet'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {appTab === 'submitted' ? 'Submissions currently being reviewed will appear here.' : 'Applications with a final decision (approved, rejected, etc.) will appear here.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="sm:hidden divide-y divide-gray-100">
                      {tabSubs[appTab].map(sub => {
                        const { label, variant } = statusMeta(sub.current_status)
                        const isReturned = sub.current_status?.toLowerCase() === 'returned'
                        return (
                          <div
                            key={sub.id}
                            className="px-4 py-3.5 cursor-pointer hover:bg-gray-50/60 transition-colors"
                            onClick={() => navigate(`/submissions/${sub.id}`)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-[13px] truncate">{sub.title || '—'}</p>
                                <p className="text-[11px] text-gray-400 truncate mt-0.5">{programName(sub)}</p>
                              </div>
                              <Badge variant={variant} className="shrink-0">{label}</Badge>
                            </div>
                            {isReturned && (
                              <span className="text-[11px] font-medium text-amber-600 block mb-1">Action required →</span>
                            )}
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] font-mono text-gray-400">{sub.reference_number || '—'}</span>
                              <span className="text-[11px] text-gray-400">{sub.submitted_at ? formatDate(sub.submitted_at) : '—'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            {['Title', 'Challenge', 'Status', 'Date', 'Ref'].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tabSubs[appTab].map(sub => {
                            const { label, variant } = statusMeta(sub.current_status)
                            const isReturned = sub.current_status?.toLowerCase() === 'returned'
                            return (
                              <tr
                                key={sub.id}
                                className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => navigate(`/submissions/${sub.id}`)}
                              >
                                <td className="px-5 py-3.5">
                                  <p className="font-semibold text-gray-900 text-[13px] max-w-[180px] truncate">{sub.title || '—'}</p>
                                  {isReturned && (
                                    <span className="text-[11px] font-medium text-amber-600 mt-0.5 block">Action required →</span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-gray-500 text-[13px] max-w-[160px]">
                                  <span className="truncate block">{programName(sub)}</span>
                                </td>
                                <td className="px-5 py-3.5"><Badge variant={variant}>{label}</Badge></td>
                                <td className="px-5 py-3.5 text-gray-400 text-[12px] whitespace-nowrap">
                                  {sub.submitted_at ? formatDate(sub.submitted_at) : '—'}
                                </td>
                                <td className="px-5 py-3.5 text-gray-400 text-[12px] font-mono">{sub.reference_number || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}

            </div>
          </div>

          <div className="flex flex-col gap-4">
            <PlaceholderCard
              icon={<Trophy size={18} />}
              title="Active Challenges"
              body={
                challenges.length > 0
                  ? `${challenges.length} challenge${challenges.length !== 1 ? 's' : ''} currently open.`
                  : 'No open challenges right now. Check back soon.'
              }
              action="Browse challenges"
              to="/challenges"
            />
            <PlaceholderCard
              icon={<Users size={18} />}
              title="My Teams"
              body="Team collaboration features are coming soon."
            />
            <PlaceholderCard
              icon={<Bell size={18} />}
              title="Recent Activity"
              body="Your activity feed will appear here — submissions, status updates, and announcements."
            />
          </div>
        </div>

      </div>

      <Modal
        open={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        title="Email verification required"
      >
        <VerificationRequired
          email={user?.email}
          variant="modal"
          message="Please verify your email before starting or editing a submission."
        />
      </Modal>
    </div>
  )
}

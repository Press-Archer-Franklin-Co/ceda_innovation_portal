import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Clock,
  FileText, ExternalLink, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  submissionsService,
  type SubmissionDetail as Sub,
  type SubmissionFileDocument,
  type TrackingDetail,
  type SubmissionResponse,
  type JourneyActivity,
  type JourneyStage,
} from '../services/submissions.service'
import { parseApiError } from '../utils/apiError'
import DocumentLink from '../components/documents/DocumentLink'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import VerificationRequired from '../components/ui/VerificationRequired'
import StandardHero from '../components/ui/StandardHero'
import { useAuth } from '../context/AuthContext'
import { groupResponses, normalizeResponses } from '../utils/applicantDisplay'
import { EMPTY_CELL } from '../lib/format'


function fmt(iso: string | null | undefined) {
  if (!iso) return EMPTY_CELL
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return EMPTY_CELL
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function getFileItems(raw: unknown): SubmissionFileDocument[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    return raw.startsWith('http') ? [{ id: '', file_url: raw }] : []
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is SubmissionFileDocument => Boolean(item) && typeof item === 'object')
  }
  if (typeof raw === 'object') {
    return [raw as SubmissionFileDocument]
  }
  return []
}


function ResponseValue({ resp }: { resp: SubmissionResponse }) {
  const raw = resp.value

  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-gray-400 italic text-sm">Not provided</span>
  }

  if (typeof raw === 'boolean' || resp.field_type === 'boolean') {
    const yes = raw === true || raw === 'true'
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${yes ? 'text-[#A01E0A]' : 'text-gray-400'}`}>
        {yes
          ? <><CheckCircle2 size={14} /> Yes</>
          : <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 inline-block" /> No</>
        }
      </span>
    )
  }

  if (resp.field_type === 'file') {
    const files = getFileItems(raw)
    if (files.length === 0) return <span className="text-gray-400 italic text-sm">No file</span>
    return (
      <div className="flex flex-col gap-2">
        {files.map((file, index) => {
          const label = file.original_filename || `Attachment ${index + 1}`
          if (file.id) {
            return (
              <DocumentLink
                key={file.id}
                documentId={file.id}
                filename={file.original_filename}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#A01E0A] hover:underline text-left"
              >
                <ExternalLink size={13} /> {label}
              </DocumentLink>
            )
          }
          const legacyHref = file.file_url || file.file || file.external_url || ''
          if (!legacyHref) {
            return <span key={`${label}-${index}`} className="text-sm text-gray-500">{label}</span>
          }
          return (
            <a
              key={`${label}-${index}`}
              href={legacyHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#A01E0A] hover:underline"
            >
              <ExternalLink size={13} /> {label}
            </a>
          )
        })}
      </div>
    )
  }

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try { parsed = JSON.parse(trimmed) } catch {  }
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return <span className="text-gray-400 italic text-sm">None</span>
    return (
      <div className="flex flex-wrap gap-1.5">
        {parsed.map((item, i) => (
          <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#A01E0A]/[0.07] text-[#A01E0A]">
            {String(item).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        ))}
      </div>
    )
  }

  if (resp.field_type === 'url' && typeof parsed === 'string' && parsed.startsWith('http')) {
    return (
      <a href={parsed} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#A01E0A] hover:underline break-all">
        {parsed} <ExternalLink size={11} />
      </a>
    )
  }

  const text = String(parsed)
  const isLong = text.length > 120
  return <p className={`text-sm text-gray-800 leading-relaxed ${isLong ? 'whitespace-pre-wrap' : ''}`}>{text}</p>
}

function journeyDotClass(state?: string) {
  switch ((state || '').toLowerCase()) {
    case 'current': return 'bg-blue-400'
    case 'returned': return 'bg-amber-400'
    case 'rejected': return 'bg-red-400'
    case 'completed': return 'bg-emerald-400'
    default: return 'bg-gray-300'
  }
}

function journeyStateLabel(state?: string) {
  switch ((state || '').toLowerCase()) {
    case 'current': return 'Active'
    case 'returned': return 'Needs revision'
    case 'rejected': return 'Closed'
    case 'completed': return 'Completed'
    default: return 'Pending'
  }
}

function journeyStatePillClass(state?: string) {
  switch ((state || '').toLowerCase()) {
    case 'current': return 'bg-blue-50 text-blue-700 ring-blue-100'
    case 'returned': return 'bg-amber-50 text-amber-700 ring-amber-100'
    case 'rejected': return 'bg-red-50 text-red-700 ring-red-100'
    case 'completed': return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    default: return 'bg-gray-100 text-gray-500 ring-gray-100'
  }
}

function outcomeLabel(outcome?: string | null) {
  const map: Record<string, string> = {
    pass: 'Passed',
    return_for_correction: 'Returned for Revision',
    reject: 'Not Selected',
  }
  return outcome ? (map[outcome] ?? outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : ''
}


function isLongField(resp: SubmissionResponse): boolean {
  if (['textarea'].includes(resp.field_type)) return true
  if (typeof resp.value === 'string' && resp.value.length > 120) return true
  return false
}


function activityStateLabel(activity?: JourneyActivity | null) {
  const action = (activity?.action || '').toLowerCase()
  if (action === 'return') return 'Returned for correction'
  if (action === 'reject' || action === 'screen_out') return 'Not selected'
  if (action === 'approve') return 'Approved to continue'
  return activity?.state ? journeyStateLabel(activity.state) : 'Released feedback'
}

function ReviewFeedbackModal({
  stage,
  activity,
  onClose,
}: {
  stage: JourneyStage | null
  activity: JourneyActivity | null
  onClose: () => void
}) {
  const reviews = activity?.reviews ?? []
  const comments = activity?.comments ?? []
  const aggregate = activity?.aggregate ?? null
  const [openReviewId, setOpenReviewId] = useState<string | null>(null)

  useEffect(() => {
    setOpenReviewId(reviews[0]?.id ?? null)
  }, [activity?.id, reviews])

  const header = stage && activity ? (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#2E1E18] via-[#5A3C32] to-[#6B4A3E] px-5 py-5 sm:px-7 sm:py-6 text-white">
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.9) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="relative z-10 pr-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-100/80 mb-2">
          {stage.label} - {activityStateLabel(activity)}
        </p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100/75">Released feedback</p>
            <h3 className="mt-1 text-2xl sm:text-3xl font-black leading-tight">{activityStateLabel(activity)}</h3>
            <p className="mt-1 text-xs text-emerald-50/80">Released {fmt(activity.timestamp)}</p>
            <span className="mt-3 inline-flex bg-white/12 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white ring-1 ring-white/20">
              {activity.action.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100/75">Stage outcome</p>
            <p className="mt-1 text-lg font-black">{outcomeLabel(aggregate?.outcome) || 'Review completed'}</p>
            {aggregate && (
              <p className="mt-1 text-xs text-emerald-50/80">
                {aggregate.completed_reviews} completed review{aggregate.completed_reviews === 1 ? '' : 's'}
              </p>
            )}
            {aggregate?.pct !== null && aggregate?.pct !== undefined && (
              <p className="mt-2 text-4xl font-black text-white">{aggregate.pct.toFixed(1)}%</p>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <Modal
      open={Boolean(stage && activity)}
      onClose={onClose}
      header={header}
      title={header ? undefined : 'Review feedback'}
      size="xl"
      bodyClassName="bg-gray-50"
    >
      <div className="space-y-4">
        {comments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Released comment</p>
            {comments.map(comment => (
              <div
                key={comment.id}
                className={`rounded-2xl border px-4 py-3 ${
                  comment.kind === 'manager'
                    ? 'border-[#A01E0A]/10 bg-[#A01E0A]/[0.04]'
                    : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {comment.kind === 'manager' ? 'CEDA Innovation Team comment' : comment.label || 'CEDA Innovation Team'}
                  </p>
                  <p className="text-[10px] text-gray-400">{fmt(comment.timestamp)}</p>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{comment.comment}</p>
              </div>
            ))}
          </div>
        )}

        {reviews.length > 0 ? (
          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Marking details</p>
            {reviews.map((review, index) => {
              const isOpen = openReviewId === review.id
              return (
                <div key={review.id} className="border border-gray-100 bg-white overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenReviewId(isOpen ? null : review.id)}
                    className="w-full px-4 py-3 border-b border-gray-100 bg-white text-left hover:bg-[#A01E0A]/[0.03] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-gray-950">{review.reviewer_label || `Reviewer ${index + 1}`}</p>
                        <p className="text-xs text-gray-400">Submitted {fmt(review.submitted_at)}</p>
                      </div>
                      <div className="flex items-start gap-3">
                        {review.total_score !== null && (
                          <div className="text-right">
                            <p className="text-lg font-black text-[#A01E0A]">
                              {review.total_score.toFixed(1)}<span className="text-xs text-gray-400">/{review.max_score}</span>
                            </p>
                            {review.total_pct !== null && (
                              <p className="text-xs font-bold text-amber-600">{review.total_pct.toFixed(1)}%</p>
                            )}
                          </div>
                        )}
                        {isOpen ? <ChevronUp size={16} className="mt-1 text-gray-400" /> : <ChevronDown size={16} className="mt-1 text-gray-400" />}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div>
                      {review.overall_comment && (
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Overall comment</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{review.overall_comment}</p>
                        </div>
                      )}

                      <div className="divide-y divide-gray-100">
                        {review.criteria.map(criterion => (
                          <div key={criterion.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-gray-900 leading-snug">{criterion.criterion_name}</p>
                              <p className="text-sm font-black text-gray-950 whitespace-nowrap">
                                {criterion.raw_score.toFixed(1)}/{criterion.max_score}
                              </p>
                            </div>
                            {criterion.comment ? (
                              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed mt-2">{criterion.comment}</p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-2">No criterion comment added.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
            No marking feedback is available for this released activity.
          </p>
        )}
      </div>
    </Modal>
  )
}

function JourneyStageCard({
  stage,
  open,
  onToggle,
  onOpenActivity,
}: {
  stage: JourneyStage
  open: boolean
  onToggle: () => void
  onOpenActivity: (stage: JourneyStage, activity: JourneyActivity) => void
}) {
  const activities = stage.activities ?? []
  const hasActivities = activities.length > 0

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3.5 py-3.5 text-left flex items-center gap-3 hover:bg-[#A01E0A]/[0.025] transition-colors"
      >
        <span className={`h-3 w-3 rounded-full shrink-0 ring-4 ring-gray-50 ${journeyDotClass(stage.state)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">{stage.label}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${journeyStatePillClass(stage.state)}`}>
              {journeyStateLabel(stage.state)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{fmt(stage.timestamp)}</p>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="max-h-[min(460px,55vh)] overflow-y-auto overflow-x-hidden px-3.5 pb-3.5 space-y-3 border-t border-gray-100 bg-gray-50/45">
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Step status</p>
            <p className="break-words text-xs text-gray-700">
              {stage.is_current ? 'Your submission is currently here.' : journeyStateLabel(stage.state)}
            </p>
          </div>

          {hasActivities ? (
            <div className="min-w-0 space-y-2">
              {activities.map((activity, index) => (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => onOpenActivity(stage, activity)}
                  className="block w-full min-w-0 rounded-lg border border-[#A01E0A]/15 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-[#A01E0A]/[0.04]"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-xs font-bold text-[#A01E0A]">
                        Activity {index + 1}: {activityStateLabel(activity)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 break-words text-[11px] text-gray-500">
                        {activity.comment || 'Released feedback is available.'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">{fmt(activity.timestamp)}</p>
                    </div>
                    <span className="shrink-0 text-lg text-[#A01E0A]">›</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-[11px] text-gray-400">
              No released feedback for this step yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StatusSidebar({
  sub, tracking, onOpenActivity,
}: {
  sub: Sub
  tracking: TrackingDetail | null
  onOpenActivity: (stage: JourneyStage, activity: JourneyActivity) => void
}) {
  const journey = tracking?.journey ?? []
  const currentStage = journey.find(stage => ['current', 'returned', 'rejected'].includes((stage.state || '').toLowerCase()))
  const [openStageId, setOpenStageId] = useState<string | null>(currentStage?.id ?? journey[0]?.id ?? null)
  const progName = typeof sub.program_detail === 'object' && sub.program_detail
    ? (sub.program_detail as { title?: string }).title ?? EMPTY_CELL
    : EMPTY_CELL

  useEffect(() => {
    setOpenStageId(currentStage?.id ?? journey[0]?.id ?? null)
  }, [currentStage?.id, journey.length])

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_12px_36px_rgba(90,60,50,0.08)] flex flex-col">
      <div className="bg-gradient-to-br from-[#5A3C32] via-[#084426] to-[#6B4A3E] px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-100/80">Application Info</p>
            <p className="mt-0.5 truncate text-sm font-black leading-tight">{sub.title || 'Submission'}</p>
          </div>
          <Badge status={sub.current_status} className="shrink-0" />
        </div>
      </div>

      <div className="border-b border-gray-100 px-4 py-3 shrink-0">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Reference</p>
            <p className="truncate font-mono font-semibold text-gray-800">{sub.reference_number ?? EMPTY_CELL}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Submitted</p>
            <p className="truncate font-semibold text-gray-700">{fmtDate(sub.submitted_at)}</p>
          </div>
          <div className="col-span-2 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Programme</p>
            <p className="truncate font-semibold text-gray-700">{progName}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#A01E0A]/[0.07]">
              <Clock size={14} className="text-[#A01E0A]" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Submission Journey</p>
              <p className="text-xs text-gray-500">Track each public workflow step</p>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">{journey.length}</span>
        </div>

        <div className="max-h-[55vh] min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4 space-y-3 xl:max-h-[calc(100vh-220px)]">
          {journey.length === 0 && (
            <div className="border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
              <p className="text-xs text-gray-500">No journey history available yet.</p>
            </div>
          )}
          {journey.map(stage => (
            <JourneyStageCard
              key={stage.id}
              stage={stage}
              open={openStageId === stage.id}
              onToggle={() => setOpenStageId(openStageId === stage.id ? null : stage.id)}
              onOpenActivity={onOpenActivity}
            />
          ))}
        </div>
      </div>
    </div>
  )
}


export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isVerified, user } = useAuth()

  const [sub,          setSub]         = useState<Sub | null>(null)
  const [tracking,     setTracking]    = useState<TrackingDetail | null>(null)
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState('')
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [feedbackStage, setFeedbackStage] = useState<JourneyStage | null>(null)
  const [feedbackActivity, setFeedbackActivity] = useState<JourneyActivity | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const [subData, trackData] = await Promise.all([
        submissionsService.getSubmission(id),
        submissionsService.getTrackingDetail(id),
      ])
      setSub(subData); setTracking(trackData)
    } catch (err) { setError(parseApiError(err)) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const isReturned = tracking?.applicant_action_required ?? false
  const canEdit    = isReturned && !sub?.locked_for_editing

  const handleEditResubmit = () => {
    if (!id) return
    if (isVerified) {
      navigate(`/innovate?submission=${id}`)
      return
    }
    localStorage.setItem('ceda_post_verify_redirect', `/innovate?submission=${id}`)
    setShowVerifyModal(true)
  }

  const openFeedback = (stage: JourneyStage, activity: JourneyActivity) => {
    setFeedbackStage(stage)
    setFeedbackActivity(activity)
  }

  const closeFeedback = () => {
    setFeedbackStage(null)
    setFeedbackActivity(null)
  }

  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen">
        <div className="bg-white border-b border-gray-100 h-[68px] animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 animate-pulse">
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/2" />
              <div className="h-48 bg-gray-200 rounded-2xl" />
              <div className="h-96 bg-gray-200 rounded-2xl" />
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-gray-200 rounded-2xl" />
              <div className="h-64 bg-gray-200 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !sub) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-gray-400 text-sm mb-4">{error || 'Submission not found.'}</p>
        <Link to="/dashboard" className="text-sm font-semibold text-[#A01E0A] hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={13} /> Back to Dashboard
        </Link>
      </div>
    )
  }

  const returnEntry = [...(tracking?.status_history ?? [])].reverse().find(h =>
    ['returned', 'requires_more_information'].includes(h.to_status?.toLowerCase())
  )
  const latestJourneyComment = [...(tracking?.journey ?? [])]
    .reverse()
    .flatMap(stage => [...(stage.comments ?? [])].reverse())
    .find(comment => (comment.comment || '').trim())
  const latestReturnFeedback = [...(tracking?.journey ?? [])]
    .reverse()
    .flatMap(stage => [...(stage.activities ?? [])].reverse().map(activity => ({ stage, activity })))
    .find(item => ['return', 'returned'].includes((item.activity.action || item.activity.state || '').toLowerCase()))
  const responses = normalizeResponses(sub.responses ?? [], sub.title)
  const grouped = groupResponses(responses)

  return (
    <div className="bg-gray-50 min-h-screen pb-16">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        <StandardHero
          className="!max-w-none !mx-0 !px-0 !py-0"
          eyebrow="Submission Tracking"
          title={sub.title || 'Untitled'}
          subtitle={
            typeof sub.program_detail === 'object' && sub.program_detail
              ? (sub.program_detail as { title?: string }).title ?? EMPTY_CELL
              : EMPTY_CELL
          }
          gradient="linear-gradient(125deg, #2E1E18 0%, #5A3C32 55%, #6B4A3E 100%)"
        />

        {isReturned && (
          <StandardHero
            className="!max-w-none !mx-0 !px-0 !py-0"
            eyebrow="Action Required"
            title="Returned For Revision"
            subtitle={
              latestJourneyComment?.comment || returnEntry?.comment || returnEntry?.reason || 'Review the comment, update your submission, and resubmit when ready.'
            }
            gradient="linear-gradient(125deg, #3f2a00 0%, #7a4b00 45%, #b56a00 100%)"
            actions={
              <div className="flex flex-wrap gap-3">
                {latestReturnFeedback && (
                  <button
                    type="button"
                    onClick={() => openFeedback(latestReturnFeedback.stage, latestReturnFeedback.activity)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/12 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/18"
                  >
                    View feedback
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleEditResubmit}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#5b3700] transition-colors hover:bg-[#fff6e5]"
                  >
                    Edit &amp; Resubmit
                  </button>
                )}
              </div>
            }
          />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className="order-2 xl:order-1 min-w-0">
            {responses.length > 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <FileText size={14} className="text-gray-400" />
              <h2 className="font-bold text-gray-900 text-sm">Submission Details</h2>
              <span className="text-[11px] text-gray-400 font-normal ml-1">({responses.length} fields)</span>
            </div>

            <div className="p-5 sm:p-6">
              {[
                { key: 'applicant', title: 'Applicant Information' },
                { key: 'contact', title: 'Contact Information' },
                { key: 'identity', title: 'Identity Information' },
                { key: 'solution', title: 'Solution Information' },
                { key: 'supporting', title: 'Supporting Information' },
              ].map((section) => {
                const items = grouped[section.key] ?? []
                if (items.length === 0) return null
                return (
                  <div key={section.key} className="mb-6 last:mb-0">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">{section.title}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
                      {items.map((resp, i) => {
                        const wide = isLongField(resp) || ['file', 'boolean', 'multiselect'].includes(resp.field_type)
                        return (
                          <div
                            key={resp.id ?? i}
                            className={`py-3 border-b border-gray-50 last:border-0 ${wide ? 'sm:col-span-2' : ''}`}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                              {resp.field_label || resp.field_key}
                            </p>
                            <ResponseValue resp={resp} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8 text-center">
                <Info size={20} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No responses recorded for this submission.</p>
              </div>
            )}
          </div>

          <div className="order-1 xl:order-2 xl:sticky xl:top-2 xl:max-h-[calc(100vh-1rem)]">
            <StatusSidebar
              sub={sub}
              tracking={tracking}
              onOpenActivity={openFeedback}
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
          message="Please verify your email before editing this submission."
        />
      </Modal>

      <ReviewFeedbackModal
        stage={feedbackStage}
        activity={feedbackActivity}
        onClose={closeFeedback}
      />
    </div>
  )
}

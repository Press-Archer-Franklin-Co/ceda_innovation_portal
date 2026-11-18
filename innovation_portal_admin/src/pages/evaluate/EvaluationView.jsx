import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronUp,
  FileText, Image, Download, X, AlertCircle, Lock, Info, Star,
  Paperclip, User, Lightbulb, TrendingUp, Eye, Save,
  ThumbsUp, ThumbsDown, RotateCcw, MessageSquare,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import StatusPill from '../../components/ui/StatusPill'
import ErrorState from '../../components/ui/ErrorState'
import { useSubmission, useSubmissionWorkflow, useWorkflowAction } from '../../lib/queries/submissions'
import {
  useMyCycle, useSaveCycleScores, useSubmitCycle,
} from '../../lib/queries/evaluations'
import { assignments as assignmentsApi, documents as documentsApi, tasks as tasksApi } from '../../lib/api/endpoints'
import { downloadDocument } from '../../lib/documentDownload'
import { useAuth } from '../../lib/auth/AuthContext'
import { formatResponseValue, normalizeResponses } from '../../lib/applicantDisplay'


function formatLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

const SECTION_PATTERNS = {
  applicant: [/name/i, /email/i, /phone/i, /mobile/i, /address/i, /city/i,
    /country/i, /nationality/i, /organisation/i, /organization/i, /company/i,
    /institution/i, /department/i, /role/i, /position/i, /gender/i, /age/i],
  project: [/title/i, /project/i, /idea/i, /description/i, /summary/i,
    /overview/i, /problem/i, /challenge/i, /solution/i, /approach/i,
    /category/i, /sector/i, /technology/i, /innovation/i, /novelty/i,
    /patent/i, /prototype/i, /stage/i, /trl/i],
  business: [/market/i, /revenue/i, /business/i, /financial/i, /budget/i,
    /cost/i, /funding/i, /investment/i, /profit/i, /monetiz/i, /pricing/i,
    /customer/i, /user/i, /target/i, /competitor/i, /partner/i, /team/i,
    /employee/i, /staff/i, /hire/i],
  impact: [/impact/i, /social/i, /environment/i, /benefit/i, /outcome/i,
    /sdg/i, /sustainability/i, /scalab/i, /replicate/i, /community/i,
    /beneficiar/i, /reach/i, /measure/i, /metric/i, /kpi/i],
}

function groupFormResponses(responses) {
  if (!responses) return { applicant: [], project: [], business: [], impact: [], other: [] }
  const items = normalizeResponses(Array.isArray(responses) ? responses : [])

  const groups = { applicant: [], project: [], business: [], impact: [], other: [] }
  items.forEach(item => {
    if (!item) return
    const val = item.value
    if (val === null || val === undefined || val === '') return
    if (Array.isArray(val) && val.length === 0) return
    if (item.field_type === 'file') return
    const label = String(item.field_label || item.label || item.key || '')
    let placed = false
    for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
      if (patterns.some(p => p.test(label))) {
        groups[section].push(item)
        placed = true
        break
      }
    }
    if (!placed) groups.other.push(item)
  })
  return groups
}

function getFileType(filename = '') {
  const src = filename.toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(src)) return 'image'
  if (/\.(pdf)(\?|$)/i.test(src)) return 'pdf'
  return 'other'
}


function DocumentViewerPanel({ doc, onClose }) {
  const type = getFileType(doc.original_filename)
  const [objectUrl, setObjectUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let url = null
    setObjectUrl(null)
    setError(null)
    documentsApi.downloadBlob(doc.id, { inline: true })
      .then(blob => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setObjectUrl(url)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || 'Unable to load document.')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [doc.id])

  const handleDownload = async () => {
    try {
      await downloadDocument(doc)
    } catch (err) {
      setError(err.message || 'Unable to download document.')
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-white rounded-2xl border border-ceda-border shadow-xl">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-ceda-border bg-ceda-surface/60 rounded-t-2xl flex-shrink-0">
        <FileText size={15} className="text-ceda-muted flex-shrink-0" />
        <p className="flex-1 text-sm font-medium text-ceda-dark truncate">{doc.original_filename}</p>
        <button
          onClick={handleDownload}
          className="btn-ghost btn-sm flex items-center gap-1.5 text-xs"
        >
          <Download size={13} /> Open
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-ceda-border/40 transition-colors"
        >
          <X size={14} className="text-ceda-muted" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-b-2xl">
        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-ceda-muted">
            <FileText size={40} strokeWidth={1} />
            <p className="text-sm">{error}</p>
          </div>
        )}
        {!error && !objectUrl && (
          <div className="flex items-center justify-center h-full text-ceda-muted text-sm">Loading…</div>
        )}
        {!error && objectUrl && type === 'image' && (
          <div className="w-full h-full flex items-center justify-center bg-ceda-surface/40 p-4">
            <img
              src={objectUrl}
              alt={doc.original_filename}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        )}
        {!error && objectUrl && type === 'pdf' && (
          <iframe
            src={objectUrl}
            className="w-full h-full border-0"
            title={doc.original_filename}
          />
        )}
        {!error && objectUrl && type === 'other' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-ceda-muted">
            <FileText size={40} strokeWidth={1} />
            <p className="text-sm">Preview not available for this file type.</p>
            <button
              onClick={handleDownload}
              className="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <Download size={13} /> Download File
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


const LONG_THRESHOLD = 200

function FieldValue({ value }) {
  const [expanded, setExpanded] = useState(false)
  const text = formatResponseValue(value)
  const isLong = text.length > LONG_THRESHOLD

  if (!isLong) {
    return <p className="text-sm text-ceda-dark mt-0.5 break-words whitespace-pre-wrap">{text}</p>
  }

  return (
    <div>
      <p className="text-sm text-ceda-dark mt-0.5 break-words whitespace-pre-wrap">
        {expanded ? text : `${text.slice(0, LONG_THRESHOLD)}…`}
      </p>
      <button
        onClick={() => setExpanded(p => !p)}
        className="text-xs text-ceda-green font-medium mt-1 hover:underline"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  )
}


function SubmissionSection({ title, icon: Icon, items, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!items?.length) return null

  const shortFields = items.filter(item => {
    const v = formatResponseValue(item.value)
    return v.length < 80 && !v.includes('\n')
  })
  const longFields = items.filter(item => {
    const v = formatResponseValue(item.value)
    return v.length >= 80 || v.includes('\n')
  })

  return (
    <div className="rounded-2xl border border-ceda-border bg-white overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-ceda-surface/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-ceda-forest" />
        </div>
        <span className="flex-1 text-sm font-semibold text-ceda-dark">{title}</span>
        <span className="text-xs text-ceda-muted mr-2">{items.length} field{items.length !== 1 ? 's' : ''}</span>
        {open ? <ChevronUp size={14} className="text-ceda-muted" /> : <ChevronDown size={14} className="text-ceda-muted" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-ceda-border/50">
          {shortFields.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {shortFields.map((item, i) => (
                <div key={i} className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">
                    {formatLabel(item.field_label || item.label || item.key)}
                  </p>
                  <FieldValue value={item.value} />
                </div>
              ))}
            </div>
          )}
          {longFields.map((item, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1">
                {formatLabel(item.field_label || item.label || item.key)}
              </p>
              <FieldValue value={item.value} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function AttachmentsSection({ groupedDocuments, onDocumentOpen }) {
  const [open, setOpen] = useState(true)
  const allDocs = Object.values(groupedDocuments).flat()
  if (!allDocs.length) return null

  return (
    <div className="rounded-2xl border border-ceda-border bg-white overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-ceda-surface/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Paperclip size={15} className="text-blue-600" />
        </div>
        <span className="flex-1 text-sm font-semibold text-ceda-dark">Attachments</span>
        <span className="text-xs text-ceda-muted mr-2">{allDocs.length} file{allDocs.length !== 1 ? 's' : ''}</span>
        {open ? <ChevronUp size={14} className="text-ceda-muted" /> : <ChevronDown size={14} className="text-ceda-muted" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-ceda-border/50 space-y-4">
          {Object.entries(groupedDocuments).map(([fieldKey, docs]) => (
            <div key={fieldKey}>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-2">
                {formatLabel(fieldKey)}
              </p>
              <div className="space-y-1.5">
                {docs.map(doc => {
                  const type = getFileType(doc.original_filename)
                  const Icon = type === 'image' ? Image : FileText
                  return (
                    <button
                      key={doc.id}
                      onClick={() => onDocumentOpen(doc)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-ceda-border bg-ceda-surface/40 hover:bg-ceda-green-pale hover:border-ceda-green/30 transition-all text-left group"
                    >
                      <Icon size={14} className="text-ceda-muted group-hover:text-ceda-forest flex-shrink-0" />
                      <span className="flex-1 text-xs text-ceda-dark truncate">{doc.original_filename}</span>
                      <Eye size={12} className="text-ceda-muted group-hover:text-ceda-forest flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function SubmissionMeta({ submission }) {
  const innovator = submission?.innovator_detail
  const workflow  = submission?.workflow
  const step      = workflow?.current_step_detail

  const metaItems = [
    innovator?.full_name   && { label: 'Applicant',   value: innovator.full_name },
    innovator?.email       && { label: 'Email',        value: innovator.email },
    submission?.submitted_at && { label: 'Submitted', value: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(submission.submitted_at)) },
    submission?.program_detail?.title && { label: 'Program', value: submission.program_detail.title },
    submission?.submission_type && { label: 'Type', value: String(submission.submission_type).replace(/_/g, ' ') },
  ].filter(Boolean)

  return (
    <div className="rounded-2xl border border-ceda-border bg-white overflow-hidden">
      {step && (
        <div className="flex items-center gap-3 px-5 py-3 bg-ceda-forest/5 border-b border-ceda-border/50">
          <div className="w-2 h-2 rounded-full bg-ceda-green flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ceda-forest">
              Current stage: {step.name}
            </p>
            {step.assignment_role && (
              <p className="text-[10px] text-ceda-muted capitalize">
                {step.assignment_role} review
              </p>
            )}
          </div>
          {workflow?.status && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-ceda-green-pale text-ceda-forest capitalize">
              {workflow.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      )}

      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {metaItems.map((m, i) => (
            <div key={i} className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">{m.label}</p>
              <p className="text-sm text-ceda-dark mt-0.5 truncate">{m.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function SubmissionContent({ submission, groupedDocuments, onDocumentOpen }) {
  const groups = useMemo(
    () => groupFormResponses(submission?.responses),
    [submission?.responses],
  )

  const SECTIONS = [
    { key: 'applicant', title: 'Applicant',      icon: User,      items: groups.applicant },
    { key: 'project',   title: 'Project Details', icon: Lightbulb, items: groups.project },
    { key: 'business',  title: 'Business',        icon: TrendingUp, items: groups.business },
    { key: 'impact',    title: 'Impact',          icon: Star,      items: groups.impact },
    { key: 'other',     title: 'Other Details',   icon: FileText,  items: groups.other },
  ]

  const hasAnySection = SECTIONS.some(s => s.items?.length > 0)
  const hasAnyDocs    = Object.values(groupedDocuments).flat().length > 0

  return (
    <div className="space-y-4">
      <SubmissionMeta submission={submission} />
      {SECTIONS.map(s => (
        <SubmissionSection
          key={s.key}
          title={s.title}
          icon={s.icon}
          items={s.items}
          defaultOpen={s.key === 'applicant' || s.key === 'project'}
        />
      ))}
      <AttachmentsSection
        groupedDocuments={groupedDocuments}
        onDocumentOpen={onDocumentOpen}
      />
      {!hasAnySection && !hasAnyDocs && (submission?.responses?.length === 0 || !submission?.responses) && (
        <div className="rounded-2xl border border-ceda-border bg-white px-6 py-8 text-center">
          <FileText size={28} className="text-ceda-muted mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ceda-dark mb-1">No form responses recorded</p>
          <p className="text-xs text-ceda-muted">This submission may have been created without completing the application form.</p>
        </div>
      )}
    </div>
  )
}

function SourceReviewDetails({ cycleData, collapsed = false, onToggle }) {
  const criteria = cycleData?.criteria ?? []
  const scorecards = cycleData?.peer_scorecards ?? []
  const aggregate = cycleData?.aggregate
  const sourceName = cycleData?.source_review_step_name ?? 'Previous review'
  if (!scorecards.length) return null

  const maxRaw = criteria.reduce((sum, c) => sum + parseFloat(c.max_score || 0), 0)

  return (
    <div className="rounded-2xl border border-ceda-green/30 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 bg-ceda-forest text-white text-left"
        aria-expanded={!collapsed}
      >
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/70">
          Manager review context
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
          <div>
            <h2 className="text-xl font-bold">{sourceName} marking details</h2>
            <p className="text-xs text-white/75 mt-1">
              {collapsed
                ? 'Collapsed while you make the manager decision. Click to expand.'
                : 'Review these officer marks before submitting the manager decision.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {aggregate?.score != null && (
              <div className="text-right">
                <p className="text-2xl font-bold">{Number(aggregate.score).toFixed(1)}</p>
                <p className="text-xs text-white/70">
                  out of {maxRaw} · {Number(aggregate.pct ?? 0).toFixed(0)}%
                </p>
              </div>
            )}
            <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
        </div>
      </button>

      {collapsed ? (
        <div className="px-5 py-3 bg-white border-t border-ceda-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ceda-muted">
            <span>{scorecards.length} completed review{scorecards.length === 1 ? '' : 's'} available.</span>
            {aggregate?.score != null && (
              <span className="font-semibold text-ceda-dark">
                Aggregate: {Number(aggregate.score).toFixed(1)} / {maxRaw} · {Number(aggregate.pct ?? 0).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      ) : (
      <div className="p-5 space-y-4">
        {scorecards.map((review, idx) => {
          const scoreMap = {}
          ;(review.scores ?? []).forEach(score => {
            scoreMap[score.criterion_id] = score
          })
          const submitted = review.submitted_at
            ? new Intl.DateTimeFormat('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              }).format(new Date(review.submitted_at))
            : null
          const pct = maxRaw > 0 ? Math.round((parseFloat(review.total_score || 0) / maxRaw) * 100) : 0

          return (
            <div key={idx} className="rounded-xl border border-ceda-border overflow-hidden">
              <div className="px-4 py-3 bg-ceda-surface/70 border-b border-ceda-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">Marked by</p>
                    <p className="text-base font-bold text-ceda-dark">
                      {review.reviewer_name ?? review.reviewer_label ?? `Reviewer ${idx + 1}`}
                    </p>
                    {review.reviewer_role && (
                      <p className="text-xs text-ceda-muted mt-0.5">{review.reviewer_role.replace(/_/g, ' ')}</p>
                    )}
                    {submitted && <p className="text-xs text-ceda-muted mt-0.5">Submitted {submitted}</p>}
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-xl font-bold',
                      pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500',
                    )}>
                      {parseFloat(review.total_score || 0).toFixed(1)}
                      <span className="text-xs font-normal text-ceda-muted">/{maxRaw}</span>
                    </p>
                    <p className="text-xs font-semibold text-ceda-muted">{pct}%</p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-ceda-border/70">
                {criteria.map((criterion) => {
                  const score = scoreMap[criterion.id]
                  return (
                    <div key={criterion.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ceda-dark leading-snug">{criterion.name}</p>
                        <p className="text-sm font-bold text-ceda-dark whitespace-nowrap">
                          {score ? parseFloat(score.raw_score ?? 0).toFixed(1) : '-'}
                          <span className="text-xs font-normal text-ceda-muted">/{score?.max_score ?? criterion.max_score}</span>
                        </p>
                      </div>
                      {score?.comment && (
                        <p className="text-xs text-ceda-muted mt-2 italic leading-relaxed whitespace-pre-wrap">
                          {score.comment}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {review.overall_comment && (
                <div className="px-4 py-3 bg-ceda-surface/50 border-t border-ceda-border">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1">
                    Overall comment
                  </p>
                  <p className="text-sm text-ceda-dark leading-relaxed whitespace-pre-wrap">
                    {review.overall_comment}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}


function CriterionSliderRow({ criterion, score, comment, locked, onScoreChange, onCommentChange }) {
  const [showComment, setShowComment] = useState(false)
  const min = parseFloat(criterion.min_score ?? 0)
  const max = parseFloat(criterion.max_score ?? 10)
  const raw = parseFloat(score)
  const numScore = isNaN(raw) ? null : raw
  const pct = numScore !== null && max > min
    ? Math.round(((numScore - min) / (max - min)) * 100)
    : null
  const commentRequired = criterion.comment_required_below != null
    && numScore !== null
    && numScore < parseFloat(criterion.comment_required_below)
  const isScored = numScore !== null

  return (
    <div className={cn(
      'rounded-xl border bg-white p-4 transition-colors',
      isScored ? 'border-ceda-green/30' : 'border-ceda-border',
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isScored
              ? <CheckCircle2 size={12} className="text-ceda-green flex-shrink-0" />
              : <div className="w-3 h-3 rounded-full border-2 border-ceda-border flex-shrink-0" />
            }
            <p className="text-xs font-semibold text-ceda-dark leading-snug">{criterion.name}</p>
          </div>
          {criterion.description && (
            <p className="text-[11px] text-ceda-muted mt-1 leading-relaxed pl-4">{criterion.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={cn(
            'text-base font-bold leading-none',
            pct === null ? 'text-ceda-border' :
            pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
          )}>
            {numScore !== null ? numScore.toFixed(1) : '—'}
          </p>
          <p className="text-[10px] text-ceda-muted">/ {criterion.max_score}</p>
        </div>
      </div>

      <div className="pl-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-ceda-muted w-6 text-right flex-shrink-0">{min}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={max <= 10 ? 0.5 : 1}
            value={numScore ?? min}
            disabled={locked}
            onChange={e => onScoreChange(e.target.value)}
            className={cn(
              'flex-1 h-2 rounded-full appearance-none cursor-pointer accent-ceda-green',
              locked && 'cursor-not-allowed opacity-60',
              numScore === null && 'opacity-40'
            )}
          />
          <span className="text-[10px] text-ceda-muted w-6 flex-shrink-0">{max}</span>
        </div>

        {pct !== null && (
          <div className="mx-8 mt-0.5 mb-2">
            <div className="h-1 bg-ceda-surface rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={cn(
              'text-[10px] font-semibold text-right mt-0.5',
              pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
            )}>{pct}%</p>
          </div>
        )}

        {!locked && (
          <button
            onClick={() => setShowComment(p => !p)}
            className="flex items-center gap-1 text-[10px] text-ceda-muted hover:text-ceda-dark transition-colors mt-1"
          >
            <MessageSquare size={10} />
            {commentRequired
              ? <span className="text-amber-600 font-semibold">Comment required</span>
              : showComment ? 'Hide comment' : 'Add comment'}
          </button>
        )}

        {(showComment || commentRequired || (locked && comment)) && (
          <textarea
            rows={2}
            disabled={locked}
            value={comment ?? ''}
            onChange={e => onCommentChange(e.target.value)}
            placeholder={commentRequired
              ? `Required — score is below ${criterion.comment_required_below}`
              : 'Your reasoning or observations…'}
            className={cn(
              'textarea text-xs resize-none w-full mt-2',
              commentRequired && !comment && 'border-amber-400',
            )}
          />
        )}
        {locked && comment && (
          <p className="text-xs text-ceda-muted italic mt-2 break-words">{comment}</p>
        )}
      </div>
    </div>
  )
}


function getManagerApproveHint(cycleData) {
  if (cycleData?.readonly_reason !== 'manager_review_context') return null

  const sourceName = cycleData?.source_review_step_name ?? 'previous review'
  const outcome = cycleData?.aggregate?.outcome
  const pct = cycleData?.aggregate?.pct
  const scoreLine = pct != null ? ` The current result is ${Number(pct).toFixed(0)}%.` : ''

  if (outcome === 'pass') {
    return `Approve Outcome will accept the ${sourceName} result and move this submission to the next workflow stage.${scoreLine}`
  }
  if (outcome === 'return_for_correction') {
    return `Approve Outcome will accept the ${sourceName} result and return this submission to the applicant for correction.${scoreLine}`
  }
  if (outcome === 'reject') {
    const isOfficerReview = cycleData?.source_review_step === 'officer_review'
    return `Approve Outcome will accept the ${sourceName} result and ${isOfficerReview ? 'screen out' : 'reject'} this submission.${scoreLine}`
  }

  return `Approve Outcome will accept the ${sourceName} result and continue using the calculated workflow outcome.`
}

function ManualActionPanel({ myTask, allowedActions = [], onClaim, onTaskComplete, claimPending, taskPending, cycleData }) {
  const [note, setNote] = useState('')
  const [activeAction, setActiveAction] = useState(null)
  const [error, setError] = useState(null)
  const actions = allowedActions
  const approveHint = getManagerApproveHint(cycleData)
  const hasAction = (action) => actions.includes(action)
  const needsReason = (action) => ['send_back', 'return'].includes(action)
  const canRun = () => !taskPending

  const run = async (action) => {
    setError(null)
    if (needsReason(action) && !note.trim()) {
      setError('Please add the manager review comment before returning this for review.')
      return
    }
    setActiveAction(action)
    try {
      await onTaskComplete(action, note.trim())
    } catch (e) {
      setError(e?.message ?? 'Action failed.')
    } finally {
      setActiveAction(null)
    }
  }

  if (myTask?.status === 'completed') {
    const outcome = myTask.outcome
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-ceda-border flex-shrink-0">
          <div className="flex items-center gap-2 text-green-700">
            <Lock size={15} />
            <span className="text-sm font-semibold">Decision recorded</span>
          </div>
        </div>
        <div className="px-5 py-6">
          <div className={cn(
            'rounded-xl border px-4 py-3 text-sm font-semibold',
            outcome === 'approve' && 'bg-green-50 border-green-200 text-green-700',
            outcome === 'reject'  && 'bg-red-50 border-red-200 text-red-600',
            outcome === 'return'  && 'bg-amber-50 border-amber-200 text-amber-700',
            outcome === 'send_back' && 'bg-blue-50 border-blue-200 text-blue-700',
          )}>
            {outcome === 'approve' && '✓ Approved'}
            {outcome === 'reject'  && '✗ Rejected'}
            {outcome === 'return'  && '↩ Returned for Correction'}
            {outcome === 'send_back' && '↩ Sent Back for Re-review'}
            {!outcome && '✓ Submitted'}
          </div>
          <p className="text-[11px] text-ceda-muted mt-3">
            Your decision has been recorded. The step will advance automatically once all required reviews are in.
          </p>
        </div>
      </div>
    )
  }

  if (!myTask || myTask.status === 'pending') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-ceda-border flex-shrink-0">
          <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">Review</p>
          <p className="text-[11px] text-ceda-muted mt-1">
            Claim this submission to begin your review.
          </p>
        </div>
        <div className="px-5 py-6">
          <button
            disabled={claimPending || !myTask}
            onClick={onClaim}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ceda-forest hover:bg-ceda-forest/90 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {claimPending ? 'Claiming…' : 'Claim & Start Review'}
          </button>
          {!myTask && (
            <p className="text-[11px] text-ceda-muted mt-3 text-center">
              You are not assigned to this submission.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-ceda-border flex-shrink-0">
        <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide">Your Decision</p>
        <p className="text-[11px] text-ceda-muted mt-1">
          Review the submission then submit your decision below.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {!actions.length && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            No workflow decisions are currently available for your active role on this step.
          </div>
        )}
        {approveHint && hasAction('approve') && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-xs text-green-800 leading-relaxed">
            <div className="flex items-start gap-2">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900">What approval will do</p>
                <p className="mt-1">{approveHint}</p>
                {hasAction('send_back') && (
                  <p className="mt-2 text-green-700">
                    Use Return for Officer Review only when the officer must correct or redo the marking.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted block mb-1.5">
            Manager review / reason
          </label>
          <textarea
            rows={4}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add the manager review, decision reason, or what must be reviewed again…"
            className="textarea text-sm resize-none w-full"
          />
          {(hasAction('send_back') || hasAction('return')) && (
            <p className="text-[11px] text-ceda-muted mt-1">
              Required when sending back for review or returning to the submitter.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="space-y-2 pt-1">
          {hasAction('approve') && (
            <button
              disabled={!canRun()}
              onClick={() => run('approve')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <ThumbsUp size={14} />
              {activeAction === 'approve' ? 'Submitting…' : 'Approve Outcome'}
            </button>
          )}
          {hasAction('send_back') && (
            <button
              disabled={!canRun()}
              onClick={() => run('send_back')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <RotateCcw size={14} />
              {activeAction === 'send_back' ? 'Submitting…' : 'Return for Officer Review'}
            </button>
          )}
          {hasAction('return') && (
            <button
              disabled={!canRun()}
              onClick={() => run('return')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <RotateCcw size={14} />
              {activeAction === 'return' ? 'Submitting…' : 'Return for Correction'}
            </button>
          )}
          {hasAction('reject') && (
            <button
              disabled={!canRun()}
              onClick={() => run('reject')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-red-400 hover:bg-red-50 text-red-600 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <ThumbsDown size={14} />
              {activeAction === 'reject' ? 'Submitting…' : 'Reject'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


function ScoreSlider({ min, max, step, value, disabled, onChange, unscored }) {
  const pct = value != null && max > min
    ? Math.round(((value - min) / (max - min)) * 100)
    : 0
  const trackColor = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          disabled={disabled}
          onChange={e => onChange(parseFloat(e.target.value))}
          className={cn(
            'w-full h-3 rounded-full appearance-none outline-none',
            'focus-visible:ring-2 focus-visible:ring-ceda-green focus-visible:ring-offset-2',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing',
          )}
          style={{
            background: disabled || unscored
              ? `#e5e7eb`
              : `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
            WebkitAppearance: 'none',
          }}
        />
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-ceda-muted font-medium">{min}</span>
        {unscored && !disabled && (
          <span className="text-[10px] text-ceda-muted italic animate-pulse">drag to score</span>
        )}
        <span className="text-[10px] text-ceda-muted font-medium">{max}</span>
      </div>

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid ${disabled ? '#9ca3af' : (pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626')};
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          cursor: ${disabled ? 'not-allowed' : 'grab'};
          transition: border-color 0.15s, transform 0.1s;
        }
        input[type='range']:not(:disabled)::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        input[type='range']:not(:disabled):active::-webkit-slider-thumb {
          transform: scale(1.2);
          cursor: grabbing;
        }
        input[type='range']::-moz-range-thumb {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: white;
          border: 3px solid ${disabled ? '#9ca3af' : (pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626')};
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          cursor: ${disabled ? 'not-allowed' : 'grab'};
        }
      `}</style>
    </div>
  )
}


function CriteriaDeck({
  criteria, scores, overall, cycleData, locked,
  onScoreChange, onCommentChange, onOverallChange,
  onSave, onSubmit, saveMutation, submitMutation,
}) {
  const [activeIdx, setActiveIdx] = useState(() => {
    const first = criteria.findIndex(c => {
      const v = scores[c.id]?.score
      return v === '' || v == null || isNaN(parseFloat(v))
    })
    return first >= 0 ? first : 0
  })
  const [showComment, setShowComment] = useState(false)
  const [showOverall, setShowOverall] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => { setShowComment(false) }, [activeIdx])

  const c = criteria[activeIdx]
  const isLast = activeIdx === criteria.length - 1

  const min = parseFloat(c.min_score ?? 0)
  const max = parseFloat(c.max_score ?? 10)
  const step = max <= 10 ? 0.5 : 1
  const rawVal = scores[c.id]?.score
  const numScore = rawVal !== '' && rawVal != null && !isNaN(parseFloat(rawVal)) ? parseFloat(rawVal) : null
  const unscored = numScore === null
  const pct = numScore !== null ? Math.round(((numScore - min) / (max - min)) * 100) : null

  const commentRequired = c.comment_required_below != null
    && numScore !== null
    && numScore < parseFloat(c.comment_required_below)

  const scoredCount = criteria.filter(c => {
    const v = scores[c.id]?.score
    return v !== '' && v != null && !isNaN(parseFloat(v))
  }).length
  const totalRaw = criteria.reduce((sum, c) => {
    const v = parseFloat(scores[c.id]?.score); return sum + (isNaN(v) ? 0 : v)
  }, 0)
  const maxRaw = criteria.reduce((sum, c) => sum + parseFloat(c.max_score || 0), 0)

  const handleSubmit = async () => {
    setSubmitError(null)
    if (locked) return
    try { await onSubmit() } catch (e) { setSubmitError(e?.message ?? 'Submit failed.') }
  }

  return (
    <div className="flex flex-col h-full">

      <div className="flex items-center justify-between px-4 py-2 border-b border-ceda-border bg-ceda-surface/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {criteria.map((_, i) => {
              const s = scores[criteria[i].id]?.score
              const done = s !== '' && s != null && !isNaN(parseFloat(s))
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  title={criteria[i].name}
                  className={cn(
                    'rounded-full transition-all duration-150',
                    i === activeIdx ? 'w-4 h-2.5 bg-ceda-forest' :
                    done            ? 'w-2.5 h-2.5 bg-ceda-green' :
                                      'w-2.5 h-2.5 bg-ceda-border hover:bg-ceda-muted'
                  )}
                />
              )
            })}
          </div>
          <span className="text-[10px] text-ceda-muted">
            {scoredCount}/{criteria.length}
          </span>
          {cycleData?.stage_config?.blind_scoring && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">Blind</span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-ceda-dark">{totalRaw.toFixed(1)}</span>
          <span className="text-[10px] text-ceda-muted">/{maxRaw}</span>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ceda-muted mb-0.5">
              {activeIdx + 1} of {criteria.length}
            </p>
            <h3 className="text-sm font-semibold text-ceda-dark leading-snug line-clamp-2">{c.name}</h3>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={cn(
              'text-xl font-bold leading-none',
              pct === null ? 'text-ceda-border' :
              pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
            )}>
              {numScore !== null ? numScore.toFixed(1) : '—'}
            </p>
            <p className="text-[10px] text-ceda-muted">/ {max}</p>
          </div>
        </div>
        {c.description && (
          <p className="text-[11px] text-ceda-muted mt-1 leading-relaxed line-clamp-2">{c.description}</p>
        )}
      </div>

      <div className="px-4 pb-2 flex-shrink-0">
        <ScoreSlider
          min={min} max={max} step={step}
          value={numScore ?? min}
          disabled={locked}
          unscored={unscored}
          onChange={val => {
            if (locked) return
            onScoreChange(c.id, String(val))
          }}
        />
      </div>

      <div className="px-4 flex-shrink-0">
        {commentRequired && !locked ? (
          <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mb-1">
            <AlertCircle size={10} />
            Comment required below {c.comment_required_below}
          </p>
        ) : (
          <button
            onClick={() => setShowComment(p => !p)}
            disabled={locked}
            className={cn(
              'flex items-center gap-1 text-[11px] transition-colors mb-1',
              locked ? 'text-ceda-muted/60 cursor-not-allowed' : 'text-ceda-muted hover:text-ceda-dark',
            )}
          >
            <MessageSquare size={10} />
            {showComment ? 'Hide comment' : 'Add comment'}
          </button>
        )}
        {((showComment || commentRequired) && !locked) || (locked && scores[c.id]?.comment) ? (
          <textarea
            rows={2}
            value={scores[c.id]?.comment ?? ''}
            onChange={e => onCommentChange(c.id, e.target.value)}
            placeholder={commentRequired ? 'Required — explain your score…' : 'Optional comment…'}
            disabled={locked}
            className={cn(
              'textarea text-xs resize-none w-full',
              commentRequired && !scores[c.id]?.comment && 'border-amber-400',
              locked && 'cursor-not-allowed opacity-60',
            )}
          />
        ) : null}
      </div>

      {isLast && (
        <div className="px-4 pt-1 flex-shrink-0">
          <button
            onClick={() => setShowOverall(p => !p)}
            disabled={locked}
            className={cn(
              'flex items-center gap-1 text-[11px] transition-colors mb-1',
              locked ? 'text-ceda-muted/60 cursor-not-allowed' : 'text-ceda-muted hover:text-ceda-dark',
            )}
          >
            <MessageSquare size={10} />
            {showOverall ? 'Hide overall comment' : 'Add overall comment'}
          </button>
          {(showOverall && !locked) || (locked && overall) ? (
            <textarea
              rows={2}
              value={overall}
              onChange={e => onOverallChange(e.target.value)}
              placeholder="Overall observations…"
              disabled={locked}
              className={cn('textarea text-xs resize-none w-full', locked && 'cursor-not-allowed opacity-60')}
            />
          ) : null}
        </div>
      )}

      <div className="flex-1" />

      {submitError && (
        <p className="px-4 pb-1 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={10} /> {submitError}
        </p>
      )}

      <div className="px-4 pb-4 pt-2 border-t border-ceda-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveIdx(i => Math.max(i - 1, 0))}
            disabled={activeIdx === 0}
            className="btn-ghost btn-sm disabled:opacity-30"
          >
            ← Prev
          </button>
          <div className="flex-1" />
          {!isLast ? (
            <button
              onClick={() => setActiveIdx(i => Math.min(i + 1, criteria.length - 1))}
              className="btn-primary btn-sm"
            >
              Next →
            </button>
          ) : (
            <>
              <button
                onClick={onSave}
                disabled={saveMutation.isPending || locked}
                className="btn-secondary btn-sm flex items-center gap-1"
              >
                <Save size={11} />
                {saveMutation.isPending ? 'Saving…' : (locked ? 'Read-only' : 'Save')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || locked}
                className="btn-primary btn-sm flex items-center gap-1"
              >
                <Star size={11} />
                {submitMutation.isPending ? 'Submitting…' : (locked ? 'Read-only' : 'Submit')}
              </button>
            </>
          )}
        </div>
        {isLast && (
          <p className="text-[10px] text-ceda-muted text-center mt-1">
            Submit locks your scores permanently.
          </p>
        )}
      </div>
    </div>
  )
}


function CriterionRow({ name, rawScore, maxScore, comment }) {
  const raw = rawScore != null ? parseFloat(rawScore) : null
  const max = parseFloat(maxScore || 10)
  const p   = raw !== null && max > 0 ? Math.round((raw / max) * 100) : null

  return (
    <div className="py-2 border-b border-ceda-border/50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-ceda-dark leading-snug flex-1 min-w-0">{name}</p>
        <p className={cn(
          'text-xs font-bold flex-shrink-0 whitespace-nowrap',
          p === null    ? 'text-ceda-muted' :
          p >= 70       ? 'text-green-600' :
          p >= 40       ? 'text-amber-600' : 'text-red-500',
        )}>
          {raw !== null ? raw.toFixed(1) : '—'}
          <span className="font-normal text-ceda-muted">/{max}</span>
        </p>
      </div>
      {p !== null && (
        <div className="mt-1 h-1 bg-ceda-surface rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full', p >= 70 ? 'bg-green-500' : p >= 40 ? 'bg-amber-400' : 'bg-red-400')}
            style={{ width: `${p}%` }}
          />
        </div>
      )}
      {comment && (
        <p className="text-[10px] text-ceda-muted mt-1 italic leading-snug break-words">{comment}</p>
      )}
    </div>
  )
}


function ScorecardCard({ label, reviewerRole, submittedAt, totalScore, maxRaw, overallComment, scores, criteria, accentCls, defaultExpanded = false, heading = 'Reviewer' }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const pct = maxRaw > 0 ? Math.round((parseFloat(totalScore) / maxRaw) * 100) : 0
  const dt  = submittedAt
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(submittedAt))
    : null

  const scoreMap = useMemo(() => {
    const m = {}
    scores?.forEach(s => { m[s.criterion_id] = s })
    return m
  }, [scores])

  return (
    <div className={cn('rounded-xl border bg-white overflow-hidden', accentCls ?? 'border-ceda-border')}>
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-ceda-surface/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted">{heading}</p>
          <p className="text-sm font-semibold text-ceda-dark truncate">{label}</p>
          {reviewerRole && (
            <p className="text-[10px] text-ceda-muted mt-0.5">{reviewerRole.replace(/_/g, ' ')}</p>
          )}
          {dt && <p className="text-[10px] text-ceda-muted mt-0.5">{dt}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <p className={cn(
            'text-sm font-bold leading-none',
            pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500',
          )}>
            {parseFloat(totalScore).toFixed(1)}
            <span className="text-[10px] font-normal text-ceda-muted">/{maxRaw}</span>
          </p>
          <span className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
            pct >= 70 ? 'bg-green-100 text-green-700' :
            pct >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600',
          )}>
            {pct}%
          </span>
          {expanded
            ? <ChevronUp size={12} className="text-ceda-muted" />
            : <ChevronDown size={12} className="text-ceda-muted" />}
        </div>
      </button>

      <div className="mx-3 mb-2 h-1 bg-ceda-surface rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-ceda-border/50">
          <div className="mt-2 rounded-lg bg-ceda-surface/60 border border-ceda-border/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1">Marked by</p>
            <p className="text-xs font-semibold text-ceda-dark">{label}</p>
            {dt && <p className="text-[10px] text-ceda-muted mt-0.5">Submitted {dt}</p>}
          </div>
          <div className="mt-2">
            {criteria.map(c => {
              const s = scoreMap[c.id]
              return (
                <CriterionRow
                  key={c.id}
                  name={c.name}
                  rawScore={s ? (s.raw_score ?? s.score) : null}
                  maxScore={s?.max_score ?? c.max_score}
                  comment={s?.comment ?? ''}
                />
              )
            })}
          </div>
          {overallComment && (
            <div className="mt-2 pt-2 border-t border-ceda-border/50">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1">Overall comment</p>
              <p className="text-xs text-ceda-dark leading-relaxed break-words">{overallComment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function ScoreSubmittedSummary({ criteria, myScorecard, cycleData }) {
  const sourceScorecards = cycleData?.peer_scorecards ?? []
  const primaryScorecard = myScorecard ?? sourceScorecards[0] ?? null
  const isReviewContext  = !myScorecard && sourceScorecards.length > 0
  const total   = primaryScorecard?.total_score ?? cycleData?.aggregate?.score ?? 0
  const maxRaw  = criteria.reduce((s, c) => s + parseFloat(c.max_score || 0), 0)
  const pct     = maxRaw > 0 ? Math.round((total / maxRaw) * 100) : 0
  const outcome = cycleData?.aggregate?.outcome

  const completedReviews = cycleData?.completed_reviews ?? 0
  const requiredReviews  = cycleData?.required_reviews ?? 0
  const pendingCount     = cycleData?.pending_count ?? Math.max(0, requiredReviews - completedReviews)
  const waitingForMore   = pendingCount > 0

  const dt = primaryScorecard?.submitted_at
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(primaryScorecard.submitted_at))
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="px-5 py-4 border-b border-ceda-border flex-shrink-0 bg-green-50/60">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-700">
            {isReviewContext
              ? `${cycleData?.source_review_step_name ?? 'Previous review'} submitted`
              : myScorecard?.reviewer_name ? `${myScorecard.reviewer_name} — submitted` : 'Evaluation submitted'}
          </p>
        </div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <p className="text-3xl font-bold text-ceda-dark leading-none">{parseFloat(total).toFixed(1)}</p>
            <p className="text-[11px] text-ceda-muted">out of {maxRaw} points</p>
          </div>
          <p className={cn(
            'text-2xl font-bold',
            pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500',
          )}>{pct}%</p>
        </div>
        <div className="h-2 bg-white rounded-full overflow-hidden border border-green-200">
          <div
            className={cn('h-full rounded-full transition-all', pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {dt && <p className="text-[10px] text-ceda-muted mt-1.5">Submitted {dt}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {waitingForMore && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
              <Info size={12} className="flex-shrink-0" />
              Waiting for other reviewers
            </p>
            <p className="text-xs text-amber-600 mb-2">
              {completedReviews} of {requiredReviews} reviews complete.
            </p>
            <div className="flex gap-1.5">
              {Array.from({ length: requiredReviews }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                    i < completedReviews
                      ? 'bg-ceda-green text-white'
                      : 'bg-white border-2 border-ceda-border text-ceda-muted',
                  )}
                >
                  {i < completedReviews ? '✓' : i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {cycleData?.peer_scores_available && cycleData?.aggregate && !waitingForMore && (
          <div className={cn(
            'rounded-xl border px-4 py-3',
            outcome === 'pass'                  ? 'bg-green-50 border-green-200' :
            outcome === 'reject'                ? 'bg-red-50 border-red-200' :
            outcome === 'return_for_correction' ? 'bg-amber-50 border-amber-200' :
            'bg-ceda-surface border-ceda-border',
          )}>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1">Final outcome</p>
            <p className={cn(
              'text-sm font-bold capitalize',
              outcome === 'pass'                  ? 'text-green-700' :
              outcome === 'reject'                ? 'text-red-600' :
              outcome === 'return_for_correction' ? 'text-amber-700' : 'text-ceda-dark',
            )}>
              {outcome ? outcome.replace(/_/g, ' ') : `${cycleData.aggregate.score?.toFixed(1)} pts`}
            </p>
            {cycleData.aggregate.score != null && (
              <p className="text-xs text-ceda-muted mt-0.5">
                Aggregate: {cycleData.aggregate.score.toFixed(1)} pts · {cycleData.aggregate.pct?.toFixed(0)}%
              </p>
            )}
          </div>
        )}

        {myScorecard && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1.5">My evaluation</p>
            <ScorecardCard
              label={myScorecard.reviewer_name ?? 'My scores'}
              reviewerRole={myScorecard.reviewer_role}
              submittedAt={myScorecard.submitted_at}
              totalScore={myScorecard.total_score}
              maxRaw={maxRaw}
              overallComment={myScorecard.overall_comment}
              scores={myScorecard.scores}
              criteria={criteria}
              accentCls="border-ceda-green/40"
            />
          </div>
        )}

        {isReviewContext && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1.5">
              Submitted review
            </p>
            <div className="space-y-2">
              {sourceScorecards.map((review, idx) => (
                <ScorecardCard
                  key={idx}
                  label={review.reviewer_label ?? review.reviewer_name ?? `Reviewer ${idx + 1}`}
                  heading="Marked by"
                  reviewerRole={review.reviewer_role}
                  submittedAt={review.submitted_at}
                  totalScore={review.total_score}
                  maxRaw={maxRaw}
                  overallComment={review.overall_comment}
                  scores={review.scores}
                  criteria={criteria}
                  accentCls="border-ceda-green/40"
                  defaultExpanded
                />
              ))}
            </div>
          </div>
        )}

        {cycleData?.peer_scores_available && !isReviewContext && (
          <>
            {cycleData.peer_scorecards?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1.5">
                  Other reviewers
                </p>
                <div className="space-y-2">
                  {cycleData.peer_scorecards.map((peer, idx) => (
                    <ScorecardCard
                      key={idx}
                      label={peer.reviewer_label}
                      reviewerRole={peer.reviewer_role}
                      submittedAt={peer.submitted_at}
                      totalScore={peer.total_score}
                      maxRaw={maxRaw}
                      overallComment={peer.overall_comment}
                      scores={peer.scores}
                      criteria={criteria}
                    />
                  ))}
                </div>
              </div>
            )}

            {cycleData.pending_scorecards?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-ceda-muted mb-1.5">
                  Pending
                </p>
                <div className="space-y-2">
                  {cycleData.pending_scorecards.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-dashed border-ceda-border bg-ceda-surface/40 px-3 py-2.5 flex items-center gap-2"
                    >
                      <div className="w-4 h-4 rounded-full border-2 border-ceda-border flex-shrink-0" />
                      <p className="text-xs text-ceda-muted italic">{p.reviewer_label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ReadOnlyNotice({ title, message }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-ceda-border bg-ceda-surface/60">
        <p className="text-sm font-semibold text-ceda-dark">{title}</p>
        <p className="text-xs text-ceda-muted mt-1">{message}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="rounded-xl border border-ceda-border bg-white p-4">
          <p className="text-xs text-ceda-muted">
            This evaluation is locked because you do not have an active assignment for this submission.
            If you believe this is incorrect, contact an administrator.
          </p>
        </div>
      </div>
    </div>
  )
}

function ManagerReviewNotice({ review }) {
  if (!review?.action) return null
  const label = review.action === 'send_back'
    ? 'Manager returned this for officer review'
    : 'Manager returned this for correction'
  const when = review.timestamp
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(review.timestamp))
    : null

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 flex-shrink-0">
      <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 mb-1">
        Manager review
      </p>
      <p className="text-sm font-semibold text-amber-900">{label}</p>
      <p className="text-xs text-amber-800 mt-2 whitespace-pre-wrap leading-relaxed">
        {review.comment || 'No manager comment was captured for this earlier send-back. New send-backs now require a manager review comment.'}
      </p>
      {(review.performed_by_name || when) && (
        <p className="text-[11px] text-amber-700 mt-2">
          {review.performed_by_name || 'Manager'}{when ? ` · ${when}` : ''}
        </p>
      )}
    </div>
  )
}


function RightPanel({
  submissionId, criteria, scores, overall, locked, cycleData,
  onScoreChange, onCommentChange, onOverallChange,
  onSave, onSubmit, onManualAction,
  saveMutation, submitMutation, workflowActionPending, lastWorkflowAction,
  myTask, allowedActions, managerReview, onClaim, onTaskComplete, claimPending, taskPending,
}) {
  const hasCriteria = criteria.length > 0
  const myCard      = cycleData?.my_scorecard
  const submitted   = myCard?.status === 'locked' || myCard?.status === 'submitted'
  const readOnly    = locked && !submitted
  const hasReadonlyScorecards = cycleData?.peer_scores_available && (cycleData?.peer_scorecards?.length ?? 0) > 0
  const isManagerReviewContext = cycleData?.readonly_reason === 'manager_review_context'
  const wrap = (content) => (
    <div className="flex flex-col h-full min-h-0">
      <ManagerReviewNotice review={managerReview} />
      <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
    </div>
  )

  if (!hasCriteria) {
    return wrap(
      <ManualActionPanel
        myTask={myTask}
        allowedActions={allowedActions}
        onClaim={onClaim}
        onTaskComplete={onTaskComplete}
        claimPending={claimPending}
        taskPending={taskPending}
        cycleData={cycleData}
      />
    )
  }

  if (readOnly && !hasReadonlyScorecards) {
    return wrap(
      <ReadOnlyNotice
        title="Read-only review"
        message="Your previous work is complete. No further actions are available here."
      />
    )
  }

  if (hasReadonlyScorecards) {
    if (isManagerReviewContext) {
      return wrap(
        <ManualActionPanel
          myTask={myTask}
          allowedActions={allowedActions}
          onClaim={onClaim}
          onTaskComplete={onTaskComplete}
          claimPending={claimPending}
          taskPending={taskPending}
          cycleData={cycleData}
        />
      )
    }

    return wrap(
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 border-b border-ceda-border">
          <ScoreSubmittedSummary
            criteria={criteria}
            myScorecard={myCard}
            cycleData={cycleData}
          />
        </div>
        <div className="h-[320px] flex-shrink-0">
          <ManualActionPanel
            myTask={myTask}
            allowedActions={allowedActions}
            onClaim={onClaim}
            onTaskComplete={onTaskComplete}
            claimPending={claimPending}
            taskPending={taskPending}
            cycleData={cycleData}
          />
        </div>
      </div>
    )
  }

  if (submitted) {
    return wrap(
      <ScoreSubmittedSummary
        criteria={criteria}
        myScorecard={myCard}
        cycleData={cycleData}
      />
    )
  }

  return wrap(
    <CriteriaDeck
      criteria={criteria}
      scores={scores}
      overall={overall}
      locked={locked}
      cycleData={cycleData}
      onScoreChange={onScoreChange}
      onCommentChange={onCommentChange}
      onOverallChange={onOverallChange}
      onSave={onSave}
      onSubmit={onSubmit}
      saveMutation={saveMutation}
      submitMutation={submitMutation}
    />
  )
}


export default function EvaluationView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: submission, isLoading: subLoading, error: subError, refetch: refetchSub } = useSubmission(id)
  const { data: cycleRaw, isLoading: cycleLoading, error: cycleError, refetch: refetchCycle } = useMyCycle(id)
  const { data: workflow, refetch: refetchWorkflow } = useSubmissionWorkflow(id)
  const { data: documentsData } = useQuery({
    queryKey: ['submissions', id, 'documents'],
    queryFn: () => documentsApi.forSubmission(id, { grouped: true }),
    enabled: !!id,
  })

  const cycleData = cycleRaw?.data ?? cycleRaw
  const criteria  = cycleData?.criteria ?? []
  const myCard    = cycleData?.my_scorecard
  const canScore  = cycleData?.can_score ?? true
  const locked    = !canScore || myCard?.status === 'locked' || myCard?.status === 'submitted'

  const requiresAssignment = workflow?.requires_assignment
  const requiresEvaluation = workflow?.requires_evaluation
  const taskItems = workflow?.task_summary?.items ?? []
  const activeTaskStatuses = ['claimed', 'pending']
  const myActiveTask = taskItems.find(t => t.assignee_id === user?.id && activeTaskStatuses.includes(t.status))
  const myAnyTask = taskItems.find(t => t.assignee_id === user?.id)
  const myTask = requiresAssignment
    ? (myActiveTask ?? taskItems.find(t => t.can_claim_submission) ?? myAnyTask ?? null)
    : (myActiveTask ?? myAnyTask ?? taskItems.find(t => !t.assignee_id) ?? null)

  const saveMutation    = useSaveCycleScores()
  const submitMutation  = useSubmitCycle()
  const { mutateAsync: _workflowAction, isPending: workflowPending } = useWorkflowAction()

  const [claimPending,  setClaimPending]  = useState(false)
  const [taskPending,   setTaskPending]   = useState(false)

  const handleClaim = useCallback(async () => {
    if (!myTask?.task_id && !myTask?.can_claim_submission) return
    setClaimPending(true)
    try {
      if (myTask.can_claim_submission) {
        await assignmentsApi.claimSubmission(myTask.claim_submission_id ?? id)
      } else {
        await tasksApi.claim(myTask.task_id)
      }
      refetchWorkflow()
      refetchCycle()
    } finally {
      setClaimPending(false)
    }
  }, [id, myTask, refetchCycle, refetchWorkflow])

  const handleTaskComplete = useCallback(async (outcome, comment) => {
    if (!myTask?.task_id) return
    setTaskPending(true)
    try {
      await tasksApi.complete(myTask.task_id, { outcome, comment })
      refetchWorkflow()
      refetchSub()
      refetchCycle()
    } finally {
      setTaskPending(false)
    }
  }, [myTask, refetchWorkflow, refetchSub, refetchCycle])

  const [scores, setScores]               = useState({})
  const [overall, setOverall]             = useState('')
  const [viewingDoc, setViewingDoc]       = useState(null)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [lastWorkflowAction, setLastWorkflowAction] = useState(null)
  const [managerContextCollapsed, setManagerContextCollapsed] = useState(false)

  useEffect(() => {
    if (myCard?.scores?.length) {
      const init = {}
      myCard.scores.forEach(s => {
        init[s.criterion_id] = { score: s.raw_score ?? '', comment: s.comment ?? '' }
      })
      setScores(init)
      setOverall(myCard.overall_comment ?? '')
    }
  }, [myCard])

  const groupedDocuments = documentsData?.grouped_by_field ?? {}

  const buildPayload = useCallback(() =>
    criteria.map(c => ({
      criterion_id: c.id,
      type: c.type ?? 'library',
      raw_score: String(scores[c.id]?.score ?? 0),
      comment: scores[c.id]?.comment ?? '',
    })),
  [criteria, scores])

  const handleSave = useCallback(() => {
    saveMutation.mutate({ subId: id, scores: buildPayload(), overall_comment: overall })
  }, [id, buildPayload, overall, saveMutation])

  const handleSubmit = useCallback(() =>
    submitMutation.mutateAsync({
      subId: id,
      scores: buildPayload(),
      overall_comment: overall,
    }).then(() => refetchCycle()),
  [id, buildPayload, overall, submitMutation, refetchCycle])

  const handleScoreChange   = useCallback((cId, val) =>
    setScores(p => ({ ...p, [cId]: { ...(p[cId] ?? {}), score: val } })), [])
  const handleCommentChange = useCallback((cId, val) =>
    setScores(p => ({ ...p, [cId]: { ...(p[cId] ?? {}), comment: val } })), [])

  const handleManualAction = useCallback(async (action, note) => {
    await _workflowAction({ id, body: { action, comment: note } })
    setLastWorkflowAction(action)
    refetchSub()
  }, [_workflowAction, id, refetchSub])

  if (subLoading || cycleLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-ceda-border/30 animate-pulse" />)}
        </div>
        <div className="w-80 xl:w-96 border-l p-4 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-xl bg-ceda-border/30 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (subError)    return <ErrorState message={subError.message} onRetry={refetchSub} />
  if (!submission) return <ErrorState message="Submission not found." onRetry={refetchSub} />

  if (cycleError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle size={32} className="text-ceda-muted mb-3" strokeWidth={1.5} />
        <p className="text-base font-semibold text-ceda-dark mb-1">Cannot load evaluation</p>
        <p className="text-sm text-ceda-muted mb-4 max-w-sm">{cycleError?.message}</p>
        <button onClick={refetchCycle} className="btn-secondary btn-sm">Retry</button>
        <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mt-2">← Go back</button>
      </div>
    )
  }

  const titleDisplay = submission.title || submission.reference_number || `Submission ${id.slice(0, 8)}`
  const programName  = submission.program_detail?.title ?? ''
  const submitted    = locked || myCard?.status === 'locked' || myCard?.status === 'submitted'
  const panelLabel   = submitted ? 'My Scores' : criteria.length > 0 ? 'Score' : 'Decide'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-ceda-border bg-white flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-ceda-surface transition-colors flex-shrink-0"
        >
          <ArrowLeft size={15} className="text-ceda-muted" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ceda-dark truncate">{titleDisplay}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {submission.reference_number && (
              <span className="text-[11px] font-mono text-ceda-muted">{submission.reference_number}</span>
            )}
            {programName && <span className="text-[11px] text-ceda-muted">· {programName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusPill status={submission.current_status} />
          <button
            onClick={() => setMobilePanelOpen(p => !p)}
            className="lg:hidden btn-secondary btn-sm flex items-center gap-1.5"
          >
            <Star size={12} />
            {panelLabel}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        <div className="flex-1 overflow-y-auto p-6 relative">
          {viewingDoc && (
            <DocumentViewerPanel doc={viewingDoc} onClose={() => setViewingDoc(null)} />
          )}
          {cycleData?.readonly_reason === 'manager_review_context' && (
            <div className="mb-5">
              <SourceReviewDetails
                cycleData={cycleData}
                collapsed={managerContextCollapsed}
                onToggle={() => setManagerContextCollapsed((value) => !value)}
              />
            </div>
          )}
          <SubmissionContent
            submission={submission}
            groupedDocuments={groupedDocuments}
            onDocumentOpen={setViewingDoc}
          />
        </div>

        <div
          className="hidden lg:flex w-80 xl:w-96 flex-col flex-shrink-0 border-l border-ceda-border bg-white overflow-hidden"
          onMouseEnter={() => {
            if (cycleData?.readonly_reason === 'manager_review_context') {
              setManagerContextCollapsed(true)
            }
          }}
        >
          <RightPanel
            submissionId={id}
            criteria={criteria}
            scores={scores}
            overall={overall}
            locked={locked}
            cycleData={cycleData}
            onScoreChange={handleScoreChange}
            onCommentChange={handleCommentChange}
            onOverallChange={setOverall}
            onSave={handleSave}
            onSubmit={handleSubmit}
            onManualAction={handleManualAction}
            saveMutation={saveMutation}
            submitMutation={submitMutation}
            workflowActionPending={workflowPending}
            lastWorkflowAction={lastWorkflowAction}
            myTask={myTask}
            allowedActions={workflow?.allowed_actions ?? []}
            managerReview={workflow?.latest_manager_review}
            onClaim={handleClaim}
            onTaskComplete={handleTaskComplete}
            claimPending={claimPending}
            taskPending={taskPending}
          />
        </div>
      </div>

      {mobilePanelOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobilePanelOpen(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ceda-border flex-shrink-0">
              <p className="text-sm font-semibold text-ceda-dark">{panelLabel}</p>
              <button onClick={() => setMobilePanelOpen(false)}>
                <X size={18} className="text-ceda-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RightPanel
                submissionId={id}
                criteria={criteria}
                scores={scores}
                overall={overall}
                locked={locked}
                cycleData={cycleData}
                onScoreChange={handleScoreChange}
                onCommentChange={handleCommentChange}
                onOverallChange={setOverall}
                onSave={handleSave}
                onSubmit={handleSubmit}
                onManualAction={handleManualAction}
                saveMutation={saveMutation}
                submitMutation={submitMutation}
                workflowActionPending={workflowPending}
                lastWorkflowAction={lastWorkflowAction}
                myTask={myTask}
                allowedActions={workflow?.allowed_actions ?? []}
                managerReview={workflow?.latest_manager_review}
                onClaim={handleClaim}
                onTaskComplete={handleTaskComplete}
                claimPending={claimPending}
                taskPending={taskPending}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

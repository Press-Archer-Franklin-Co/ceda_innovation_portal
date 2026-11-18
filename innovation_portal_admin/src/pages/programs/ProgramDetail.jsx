import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, ClipboardList, ExternalLink, FileText, GitBranch, Layers, Newspaper, Plus, Users, ExternalLink as LinkIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import StatusPill from '../../components/ui/StatusPill'
import DataTable from '../../components/ui/DataTable'
import Tabs from '../../components/ui/Tabs'
import ErrorState from '../../components/ui/ErrorState'
import { SkeletonTable, SkeletonStatCards } from '../../components/ui/LoadingSkeleton'
import { useProgram, useProgramForm, useProgramSubmissions } from '../../lib/queries/programs'
import ProgramFormEditor from '../../components/programs/ProgramFormEditor'
import { programs as programsApi, content as contentApi } from '../../lib/api/endpoints'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function InfoItem({ label, value }) {
  return (
    <div className="py-2 border-b border-ceda-border/60 last:border-b-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ceda-muted">{label}</p>
      <p className="text-sm text-ceda-dark mt-0.5">{value ?? '—'}</p>
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

export default function ProgramDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [actionError, setActionError] = useState(null)
  const [actionState, setActionState] = useState(null)
  const [targetStatus, setTargetStatus] = useState('')
  const { data: program, isLoading, error, refetch } = useProgram(id)
  const { data: form } = useProgramForm(id)
  const { data: submissionsData, isLoading: submissionsLoading, error: submissionsError, refetch: refetchSubmissions } = useProgramSubmissions(id)

  const isHackathon = (() => {
    const pt = program?.program_type
    if (!pt) return false
    const code = typeof pt === 'object' ? pt.code : String(pt)
    return code === 'hackathon' || code === 'innovation_challenge'
  })()

  const { data: hackathonContent, isLoading: hackathonLoading } = useQuery({
    queryKey: ['hackathon-content-by-program', id],
    queryFn: () => contentApi.hackathons({ program: id }),
    enabled: !!id && isHackathon,
    select: (d) => {
      const items = Array.isArray(d) ? d : d?.results ?? []
      return items[0] ?? null
    },
  })

  const submissions = Array.isArray(submissionsData) ? submissionsData : submissionsData?.results ?? []
  const workflowDefinitions = program?.workflow_definitions ?? []
  const activeWorkflow = program?.active_workflow_definition

  const statusCounts = useMemo(() => {
    const counts = new Map()
    for (const item of submissions) {
      const key = item.current_status || 'unknown'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()]
  }, [submissions])

  const runSetStatus = async () => {
    if (!targetStatus || targetStatus === program.status) return
    setActionError(null)
    setActionState(`set-status:${targetStatus}`)
    try {
      await programsApi.setStatus(id, { status: targetStatus })
      await refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionState(null)
    }
  }

  useEffect(() => {
    if (program?.status) setTargetStatus(program.status)
  }, [program?.status])

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <SkeletonStatCards count={4} />
        <div className="mt-6"><SkeletonTable rows={5} cols={4} /></div>
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  if (!program) {
    return <ErrorState message="Program not found." onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={program.title}
        subtitle={program.program_type?.name ?? 'Program'}
        back={
          <button onClick={() => navigate('/programs')} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> Programs
          </button>
        }
        badge={<StatusPill status={program.status} />}
        actions={
          <>
            <select
              className="input h-9 py-0 text-sm w-36"
              value={targetStatus || program.status}
              onChange={(e) => setTargetStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button className="btn-secondary btn-sm" disabled={!!actionState || (targetStatus || program.status) === program.status} onClick={runSetStatus}>
              {String(actionState || '').startsWith('set-status:') ? 'Saving Status…' : 'Set Status'}
            </button>
            <button className="btn-primary btn-sm" onClick={() => navigate(`/programs/${program.id}/edit`)}>
              Edit Program
            </button>
          </>
        }
      />

      {actionError && (
        <div className="mb-5 rounded-xl border border-ceda-red/20 bg-ceda-red-pale px-4 py-3 text-sm text-ceda-red">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Submissions', value: submissions.length, icon: ClipboardList },
          { label: 'Form Fields', value: form?.fields?.length ?? 0, icon: FileText },
          { label: 'Workflow Versions', value: workflowDefinitions.length, icon: GitBranch },
          { label: 'Max Team Size', value: program.max_team_size ?? '—', icon: Users },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0">
                <Icon size={17} className="text-ceda-forest" />
              </div>
              <div>
                <p className="text-lg font-bold text-ceda-dark leading-none">{item.value}</p>
                <p className="text-xs text-ceda-muted mt-0.5">{item.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'form', label: 'Submission Form', count: form?.fields?.length ?? 0 },
          { key: 'workflow', label: 'Workflow', count: workflowDefinitions.length },
          { key: 'submissions', label: 'Submissions', count: submissions.length },
          ...(isHackathon ? [{ key: 'public_content', label: 'Public Content' }] : []),
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <SectionCard title="Program Timeline">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoItem label="Opening Date" value={formatDate(program.opening_date)} />
                <InfoItem label="Closing Date" value={formatDate(program.closing_date)} />
                <InfoItem label="Screening Start" value={formatDate(program.screening_start)} />
                <InfoItem label="Screening End" value={formatDate(program.screening_end)} />
                <InfoItem label="Judging Start" value={formatDate(program.judging_start)} />
                <InfoItem label="Judging End" value={formatDate(program.judging_end)} />
                <InfoItem label="Event Date" value={formatDate(program.event_date)} />
                <InfoItem label="Public Visibility" value={program.is_public ? 'Visible publicly' : 'Staff only'} />
              </div>
            </SectionCard>

            <SectionCard title="Submission Rules">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoItem label="Allow Team Submission" value={program.allow_team_submission ? 'Yes' : 'No'} />
                <InfoItem label="Allow Individual Submission" value={program.allow_individual_submission ? 'Yes' : 'No'} />
                {program.terms_and_conditions ? (
                  <div className="py-2 border-b border-ceda-border/60 last:border-b-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ceda-muted">Terms and Conditions</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-ceda-dark">{program.terms_and_conditions.title}</span>
                      {program.terms_and_conditions.document_link && (
                        <a
                          href={program.terms_and_conditions.document_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-ceda-forest hover:underline flex-shrink-0"
                        >
                          <ExternalLink size={11} /> View
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <InfoItem label="Terms and Conditions" value="Not configured" />
                )}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard title="Workflow">
              {activeWorkflow ? (
                <>
                  <InfoItem label="Active Definition" value={`${activeWorkflow.name} (v${activeWorkflow.version})`} />
                  <InfoItem label="Status" value={activeWorkflow.status} />
                  <Link className="btn-secondary btn-sm mt-3 inline-flex" to={`/admin/workflows/${activeWorkflow.id}/builder`}>
                    <GitBranch size={14} /> Open Runtime Workflow
                  </Link>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-ceda-muted">No active workflow is linked to this program yet.</p>
                  <Link className="btn-primary btn-sm inline-flex" to="/admin/workflows">
                    <GitBranch size={14} /> Define Workflow
                  </Link>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Submission Status Mix">
              {statusCounts.length === 0 ? (
                <p className="text-sm text-ceda-muted">No submissions yet.</p>
              ) : (
                <div className="space-y-2">
                  {statusCounts.map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between gap-2">
                      <StatusPill status={status} dot={false} className="flex-1 justify-start" />
                      <span className="text-sm font-semibold text-ceda-dark">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'form' && <ProgramFormEditor programId={program.id} />}

      {tab === 'workflow' && (
        <SectionCard title="Workflow Definitions" subtitle="Runtime workflow versions available for this program.">
          {workflowDefinitions.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-ceda-muted">No workflow definitions exist yet for this program.</p>
              <Link className="btn-primary btn-sm inline-flex" to="/admin/workflows">
                <GitBranch size={14} /> Create Workflow
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {workflowDefinitions.map((definition) => (
                <div key={definition.id} className="rounded-xl border border-ceda-border bg-white px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ceda-dark truncate">{definition.name}</p>
                    <p className="text-xs text-ceda-muted">{definition.code} · Version {definition.version}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={definition.status} />
                    <Link className="btn-secondary btn-sm" to={`/admin/workflows/${definition.id}/builder`}>
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'public_content' && (
        <div className="space-y-5">
          {hackathonLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-32 bg-ceda-surface rounded-xl" />
            </div>
          ) : hackathonContent ? (
            <>
              <div className="rounded-xl border border-ceda-border bg-white p-5 flex items-start gap-5">
                {hackathonContent.banner_image_url ? (
                  <img
                    src={hackathonContent.banner_image_url}
                    alt="banner"
                    className="w-28 h-20 rounded-lg object-cover flex-shrink-0 border border-ceda-border"
                  />
                ) : (
                  <div className="w-28 h-20 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0 border border-ceda-border">
                    <Newspaper size={22} className="text-ceda-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-ceda-dark text-sm truncate">{hackathonContent.program_title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hackathonContent.is_published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {hackathonContent.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  {hackathonContent.theme && (
                    <p className="text-[12px] text-ceda-muted mb-2 italic">"{hackathonContent.theme}"</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-[11px] text-ceda-muted mt-1">
                    <span>{hackathonContent.prizes?.length ?? 0} prizes</span>
                    <span>·</span>
                    <span>{hackathonContent.faq?.length ?? 0} FAQ items</span>
                    <span>·</span>
                    <span>{hackathonContent.judges?.length ?? 0} judges</span>
                    <span>·</span>
                    <span>{hackathonContent.schedule?.length ?? 0} milestones</span>
                    <span>·</span>
                    <span>{hackathonContent.media?.length ?? 0} media files</span>
                  </div>
                </div>
                <Link
                  to={`/content/hackathons/${hackathonContent.id}`}
                  className="btn-primary btn-sm flex-shrink-0 flex items-center gap-1.5"
                >
                  <FileText size={13} /> Edit Public Content
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Description', ok: !!hackathonContent.description },
                  { label: 'Rules', ok: !!hackathonContent.rules },
                  { label: 'Prizes', ok: (hackathonContent.prizes?.length ?? 0) > 0 },
                  { label: 'FAQ', ok: (hackathonContent.faq?.length ?? 0) > 0 },
                  { label: 'Schedule', ok: (hackathonContent.schedule?.length ?? 0) > 0 },
                  { label: 'Judges', ok: (hackathonContent.judges?.length ?? 0) > 0 },
                  { label: 'Banner', ok: !!hackathonContent.banner_image_url },
                  { label: 'Media', ok: (hackathonContent.media?.length ?? 0) > 0 },
                ].map(({ label, ok }) => (
                  <div key={label} className={`rounded-lg border px-3 py-2.5 flex items-center gap-2 ${ok ? 'border-green-200 bg-green-50' : 'border-ceda-border bg-ceda-surface'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-[11px] font-semibold text-ceda-dark">{label}</span>
                    {!ok && <span className="ml-auto text-[10px] text-ceda-muted">Empty</span>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <SectionCard>
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-full bg-ceda-surface flex items-center justify-center mx-auto mb-4">
                  <Newspaper size={24} className="text-ceda-muted" />
                </div>
                <p className="font-semibold text-ceda-dark mb-1">No public content page yet</p>
                <p className="text-sm text-ceda-muted mb-6 max-w-sm mx-auto">
                  Create a public-facing content page for this hackathon. It will show prizes, rules, FAQ, judges, schedule, and a media gallery to participants.
                </p>
                <Link
                  to={`/content/hackathons/new?program=${id}`}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus size={14} /> Create Public Content Page
                </Link>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {tab === 'submissions' && (
        <SectionCard title="Program Submissions" padding={false}>
          {submissionsLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : submissionsError ? (
            <ErrorState message={submissionsError.message} onRetry={refetchSubmissions} />
          ) : (
            <DataTable
              columns={[
                { key: 'reference_number', label: 'Reference', width: 140 },
                { key: 'title', label: 'Title', sortable: true },
                { key: 'current_status', label: 'Status', width: 140, render: (value) => <StatusPill status={value} /> },
                { key: 'submitted_at', label: 'Submitted', width: 140, render: (value) => formatDate(value) },
              ]}
              data={submissions}
              onRowClick={(row) => navigate(`/submissions/${row.id}`)}
              emptyTitle="No submissions yet"
              emptyMessage="Applications for this program will appear here."
            />
          )}
        </SectionCard>
      )}
    </div>
  )
}

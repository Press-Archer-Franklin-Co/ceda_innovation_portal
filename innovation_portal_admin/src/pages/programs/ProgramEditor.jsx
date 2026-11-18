import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ExternalLink, Plus, Save, Square, Upload, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import ErrorState from '../../components/ui/ErrorState'
import StatusPill from '../../components/ui/StatusPill'
import { useCreateProgram, useCreateTermsAndConditions, useProgram, useProgramTypes, usePrograms, useUpdateProgram, useTermsAndConditionsList } from '../../lib/queries/programs'
import { programs as programsApi } from '../../lib/api/endpoints'
import ChallengeJudgingCard from '../../components/programs/ChallengeJudgingCard'

function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}


const EMPTY_FORM = {
  title: '',
  description: '',
  program_type_id: '',
  opening_date: '',
  closing_date: '',
  screening_start: '',
  screening_end: '',
  judging_start: '',
  judging_end: '',
  event_date: '',
  results_publish_at: '',
  audience: 'internal',
  max_entries_per_person: '1',
  marking_criteria: '',
  is_public: true,
  allow_team_submission: true,
  allow_individual_submission: true,
  max_team_size: 5,
  terms_and_conditions_id: '',
}

const AUDIENCE_OPTIONS = [
  { value: 'internal', label: 'Internal', help: 'CEDA staff only (signed in with CEDA SSO).' },
  { value: 'public', label: 'Public', help: 'Non-CEDA participants only. CEDA staff cannot enter.' },
  { value: 'both', label: 'Internal and public', help: 'Anyone can enter.' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

export default function ProgramEditor() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { data: program, isLoading, error, refetch } = useProgram(id)
  const { data: programsData } = usePrograms()
  const { data: programTypesData } = useProgramTypes()
  const { data: tcData } = useTermsAndConditionsList()
  const createProgram = useCreateProgram()
  const updateProgram = useUpdateProgram()
  const createTC = useCreateTermsAndConditions()
  const tcList = Array.isArray(tcData) ? tcData : tcData?.results ?? []
  const activeTcList = tcList.filter(tc => tc.active)

  const [addingTC, setAddingTC] = useState(false)
  const [tcDocMode, setTcDocMode] = useState('url')
  const [newTC, setNewTC] = useState({ title: '', document_url: '', pdf_file: null })

  const handleCreateTC = async () => {
    const fd = new FormData()
    fd.append('title', newTC.title.trim())
    fd.append('content', '')
    fd.append('active', 'true')
    if (tcDocMode === 'url') {
      fd.append('document_url', newTC.document_url.trim())
    } else if (newTC.pdf_file instanceof File) {
      fd.append('pdf_file', newTC.pdf_file)
    }
    const created = await createTC.mutateAsync(fd)
    setForm(prev => ({ ...prev, terms_and_conditions_id: created.id }))
    setAddingTC(false)
    setNewTC({ title: '', document_url: '', pdf_file: null })
  }
  const [actionError, setActionError] = useState(null)
  const [actionState, setActionState] = useState(null)
  const [targetStatus, setTargetStatus] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const programs = Array.isArray(programsData) ? programsData : programsData?.results ?? []
  const programTypes = Array.isArray(programTypesData) ? programTypesData : programTypesData?.results ?? []
  const isChallenge = programTypes.find(type => type.id === form.program_type_id)?.code === 'innovation_challenge'

  useEffect(() => {
    if (!program) return
    setForm({
      title: program.title ?? '',
      description: program.description ?? '',
      program_type_id: program.program_type?.id ?? '',
      opening_date: toDateTimeInput(program.opening_date),
      closing_date: toDateTimeInput(program.closing_date),
      screening_start: toDateTimeInput(program.screening_start),
      screening_end: toDateTimeInput(program.screening_end),
      judging_start: toDateTimeInput(program.judging_start),
      judging_end: toDateTimeInput(program.judging_end),
      event_date: toDateTimeInput(program.event_date),
      results_publish_at: toDateTimeInput(program.results_publish_at),
      audience: program.audience ?? 'both',
      max_entries_per_person: program.max_entries_per_person == null ? '' : String(program.max_entries_per_person),
      marking_criteria: program.marking_criteria ?? '',
      is_public: !!program.is_public,
      allow_team_submission: !!program.allow_team_submission,
      allow_individual_submission: !!program.allow_individual_submission,
      max_team_size: program.max_team_size ?? 5,
      terms_and_conditions_id: program.terms_and_conditions?.id ?? '',
    })
  }, [program])

  useEffect(() => {
    if (program?.status) setTargetStatus(program.status)
  }, [program?.status])

  const busy = createProgram.isPending || updateProgram.isPending || actionState

  const save = async () => {
    setActionError(null)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      program_type_id: form.program_type_id,
      opening_date: toIso(form.opening_date),
      closing_date: toIso(form.closing_date),
      screening_start: toIso(form.screening_start),
      screening_end: toIso(form.screening_end),
      judging_start: toIso(form.judging_start),
      judging_end: toIso(form.judging_end),
      event_date: toIso(form.event_date),
      results_publish_at: toIso(form.results_publish_at),
      audience: form.audience,
      max_entries_per_person: form.max_entries_per_person === '' ? null : Number(form.max_entries_per_person),
      ...(isChallenge ? { marking_criteria: form.marking_criteria || null } : {}),
      is_public: form.is_public,
      allow_team_submission: form.allow_team_submission,
      allow_individual_submission: form.allow_individual_submission,
      max_team_size: Number(form.max_team_size || 1),
      ...(form.terms_and_conditions_id ? { terms_and_conditions_id: form.terms_and_conditions_id } : { terms_and_conditions_id: null }),
    }

    try {
      const result = isEdit
        ? await updateProgram.mutateAsync({ id, ...payload })
        : await createProgram.mutateAsync(payload)
      navigate(`/programs/${result.id}`)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const runSetStatus = async () => {
    if (!id || !targetStatus || targetStatus === program?.status) return
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

  if (isEdit && isLoading) {
    return <div className="h-32 rounded-xl bg-ceda-border/30 animate-pulse" />
  }

  if (isEdit && error) {
    return <ErrorState message={error.message} onRetry={refetch} />
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={isEdit ? 'Edit Program' : 'Create Program'}
        subtitle={isEdit ? 'Update program settings, dates, and submission behaviour.' : 'Create a new program or hackathon for the staff lifecycle.'}
        back={
          <button onClick={() => navigate(isEdit ? `/programs/${id}` : '/programs')} className="btn-ghost btn-sm -ml-2">
            <ArrowLeft size={14} /> {isEdit ? 'Program' : 'Programs'}
          </button>
        }
        badge={isEdit ? <StatusPill status={program?.status} /> : null}
        actions={
          <>
            {isEdit && (
              <>
                <select
                  className="input h-9 py-0 text-sm w-36"
                  value={targetStatus || program?.status || 'draft'}
                  onChange={(e) => setTargetStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button className="btn-secondary btn-sm" disabled={busy || targetStatus === program?.status} onClick={runSetStatus}>
                  <Square size={14} /> {String(actionState || '').startsWith('set-status:') ? 'Saving Status…' : 'Set Status'}
                </button>
              </>
            )}
            <button className="btn-primary btn-sm" disabled={busy || !form.title.trim() || !form.program_type_id} onClick={save}>
              <Save size={14} /> {busy ? 'Saving…' : 'Save Program'}
            </button>
          </>
        }
      />

      {actionError && (
        <div className="mb-5 rounded-xl border border-ceda-red/20 bg-ceda-red-pale px-4 py-3 text-sm text-ceda-red">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <SectionCard title="Core Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Title</label>
                <input className="input" value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea className="input min-h-28 resize-y" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Program Type</label>
                <select className="input" value={form.program_type_id} onChange={(e) => setForm(prev => ({ ...prev, program_type_id: e.target.value }))}>
                  <option value="">Select type…</option>
                  {programTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Current Status</label>
                <div className="flex items-center h-11 px-3 rounded-xl border border-ceda-border bg-ceda-surface">
                  {isEdit ? <StatusPill status={program?.status} /> : <span className="text-sm text-ceda-muted">Draft on create</span>}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Timeline">
            {isChallenge && (
              <p className="text-xs text-ceda-muted mb-4">
                Entries can only be started, edited and submitted between the opening and closing date and time.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ['opening_date', isChallenge ? 'Entries Open' : 'Opening Date'],
                ['closing_date', isChallenge ? 'Entries Close' : 'Closing Date'],
                ...(isChallenge ? [] : [
                  ['screening_start', 'Screening Start'],
                  ['screening_end', 'Screening End'],
                  ['judging_start', 'Judging Start'],
                  ['judging_end', 'Judging End'],
                ]),
                ['event_date', 'Event Date'],
                ...(isChallenge ? [['results_publish_at', 'Announce Results No Earlier Than']] : []),
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form[key]}
                    onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          {isChallenge && (
            <SectionCard title="Who Can Enter">
              <div className="space-y-2">
                {AUDIENCE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-start gap-2 text-sm text-ceda-dark cursor-pointer">
                    <input
                      type="radio"
                      name="audience"
                      className="mt-1"
                      checked={form.audience === opt.value}
                      onChange={() => setForm(prev => ({ ...prev, audience: opt.value }))}
                    />
                    <span>
                      <span className="font-semibold">{opt.label}</span>
                      <span className="block text-xs text-ceda-muted">{opt.help}</span>
                    </span>
                  </label>
                ))}
                <div className="pt-3">
                  <label className="label">Entries per person</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    placeholder="No limit"
                    value={form.max_entries_per_person}
                    onChange={(e) => setForm(prev => ({ ...prev, max_entries_per_person: e.target.value }))}
                  />
                  <p className="text-xs text-ceda-muted mt-1">How many entries one person can submit. Leave blank for no limit.</p>
                </div>
              </div>
            </SectionCard>
          )}

          {isChallenge && <ChallengeJudgingCard programId={isEdit ? id : null} form={form} setForm={setForm} />}

          {isChallenge && isEdit && (
            <SectionCard title="Results">
              {program?.results_announced_at ? (
                <p className="text-sm text-ceda-dark">
                  Winners announced and emailed on {new Date(program.results_announced_at).toLocaleString()}.
                </p>
              ) : program?.results_hold_reason ? (
                <div className="rounded-xl border border-ceda-red/20 bg-ceda-red-pale px-3 py-2 text-sm text-ceda-red">
                  On hold: {program.results_hold_reason}
                </div>
              ) : (
                <p className="text-sm text-ceda-muted">
                  Winners are emailed automatically once every entry has been marked, or when marking closes.
                </p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Submission Rules">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-ceda-dark">
                <input type="checkbox" checked={form.is_public} onChange={(e) => setForm(prev => ({ ...prev, is_public: e.target.checked }))} />
                Visible on public portal
              </label>
              <label className="flex items-center gap-2 text-sm text-ceda-dark">
                <input type="checkbox" checked={form.allow_team_submission} onChange={(e) => setForm(prev => ({ ...prev, allow_team_submission: e.target.checked }))} />
                Allow team submissions
              </label>
              <label className="flex items-center gap-2 text-sm text-ceda-dark">
                <input type="checkbox" checked={form.allow_individual_submission} onChange={(e) => setForm(prev => ({ ...prev, allow_individual_submission: e.target.checked }))} />
                Allow individual submissions
              </label>
              <div>
                <label className="label">Max Team Size</label>
                <input className="input" type="number" min="1" value={form.max_team_size} onChange={(e) => setForm(prev => ({ ...prev, max_team_size: e.target.value }))} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Terms & Conditions">
            <div className="space-y-3">
              {!addingTC ? (
                <>
                  <select
                    className="input"
                    value={form.terms_and_conditions_id}
                    onChange={(e) => setForm(prev => ({ ...prev, terms_and_conditions_id: e.target.value }))}
                  >
                    <option value="">— None —</option>
                    {activeTcList.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.title}</option>
                    ))}
                  </select>

                  {form.terms_and_conditions_id && (() => {
                    const sel = activeTcList.find(tc => tc.id === form.terms_and_conditions_id)
                      || tcList.find(tc => tc.id === form.terms_and_conditions_id)
                    return sel?.document_link ? (
                      <a
                        href={sel.document_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-ceda-forest hover:underline"
                      >
                        <ExternalLink size={11} /> Preview document
                      </a>
                    ) : null
                  })()}

                  <button
                    className="btn-ghost btn-sm text-ceda-forest w-full justify-center border border-dashed border-ceda-green/40"
                    onClick={() => setAddingTC(true)}
                  >
                    <Plus size={13} /> Upload new T&C document
                  </button>

                  <p className="text-xs text-ceda-muted">
                    Participants see this before submitting.{' '}
                    <Link to="/admin/terms" className="text-ceda-forest hover:underline">All documents →</Link>
                  </p>
                </>
              ) : (
                <div className="space-y-3 rounded-xl border border-ceda-border bg-ceda-surface/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ceda-dark">New T&C Document</p>
                    <button onClick={() => setAddingTC(false)} className="text-ceda-muted hover:text-ceda-dark">
                      <X size={14} />
                    </button>
                  </div>

                  <div>
                    <label className="label">Title *</label>
                    <input
                      className="input"
                      value={newTC.title}
                      autoFocus
                      onChange={(e) => setNewTC(p => ({ ...p, title: e.target.value }))}
                      placeholder="e.g. CEDA Hackathon 2026 – Terms"
                    />
                  </div>

                  <div>
                    <div className="flex gap-2 mb-2">
                      <button
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${tcDocMode === 'url' ? 'bg-ceda-forest text-white border-ceda-forest' : 'border-ceda-border text-ceda-muted hover:bg-ceda-surface'}`}
                        onClick={() => setTcDocMode('url')}
                      >External URL</button>
                      <button
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${tcDocMode === 'file' ? 'bg-ceda-forest text-white border-ceda-forest' : 'border-ceda-border text-ceda-muted hover:bg-ceda-surface'}`}
                        onClick={() => setTcDocMode('file')}
                      >Upload PDF</button>
                    </div>
                    {tcDocMode === 'url' ? (
                      <input
                        className="input"
                        type="url"
                        value={newTC.document_url}
                        onChange={(e) => setNewTC(p => ({ ...p, document_url: e.target.value }))}
                        placeholder="https://…/terms.pdf"
                      />
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer border border-dashed border-ceda-border rounded-xl px-3 py-3 hover:bg-white transition-colors">
                        <Upload size={13} className="text-ceda-muted flex-shrink-0" />
                        <span className="text-xs text-ceda-muted">
                          {newTC.pdf_file instanceof File ? newTC.pdf_file.name : 'Choose PDF…'}
                        </span>
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => setNewTC(p => ({ ...p, pdf_file: e.target.files?.[0] ?? null }))}
                        />
                      </label>
                    )}
                  </div>

                  <button
                    className="btn-primary btn-sm w-full justify-center"
                    disabled={createTC.isPending || !newTC.title.trim()}
                    onClick={handleCreateTC}
                  >
                    <Save size={13} /> {createTC.isPending ? 'Saving…' : 'Save & Select'}
                  </button>
                  {createTC.error && (
                    <p className="text-xs text-ceda-red">{createTC.error.message}</p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

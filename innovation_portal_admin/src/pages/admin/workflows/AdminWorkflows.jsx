import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Workflow, Plus, Play, Archive, Copy, Trash2,
  RefreshCw, ChevronRight, AlertTriangle, GitBranch,
  Eye, ChevronDown,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  useWorkflowDefinitions,
  useCreateWorkflow,
  useDeleteWorkflow,
  usePublishWorkflow,
  useActivateWorkflowDef,
  useArchiveWorkflow,
  useCloneWorkflow,
} from '../../../lib/queries/workflowBuilder'
import { usePrograms } from '../../../lib/queries/programs'
import ErrorState from '../../../components/ui/ErrorState'
import { SkeletonTable } from '../../../components/ui/LoadingSkeleton'
import { useConfirm } from '../../../components/ui/confirm'

const STATUS_STYLE = {
  draft:     'bg-gray-100 text-gray-600',
  published: 'bg-blue-100 text-blue-700',
  active:    'bg-ceda-green-pale text-ceda-forest font-semibold',
  inactive:  'bg-amber-100 text-amber-700',
  archived:  'bg-gray-200 text-gray-500',
}

function StatusBadge({ status }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs capitalize', STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600')}>
      {status ?? '—'}
    </span>
  )
}

function CreateModal({ onClose, onCreate, programs }) {
  const [form, setForm] = useState({
    name:          '',
    description:   '',
    workflow_type: '',
    program:       '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)

  const programList = Array.isArray(programs) ? programs : (programs?.results ?? [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleProgramChange = (e) => {
    const programId = e.target.value
    const program = programList.find(p => String(p.id) === programId)
    const typeCode = typeof program?.program_type === 'object' ? program?.program_type?.code : program?.program_type
    setForm(f => ({ ...f, program: programId, workflow_type: typeCode || f.workflow_type }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.program) return
    setBusy(true)
    setErr(null)
    try {
      const body = {
        name:    form.name.trim(),
        program: form.program,
        ...(form.description.trim()   && { description:   form.description.trim() }),
        ...(form.workflow_type.trim() && { workflow_type: form.workflow_type.trim() }),
      }
      const result = await onCreate(body)
      onClose(result)
    } catch (ex) {
      setErr(ex.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ceda-border">
          <h2 className="text-base font-semibold text-ceda-dark">New Workflow Definition</h2>
          <button onClick={() => onClose(null)} className="text-ceda-muted hover:text-ceda-dark text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {err && <p className="text-sm text-ceda-red bg-ceda-red-pale rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className="block text-xs font-medium text-ceda-muted mb-1">Program *</label>
            <div className="relative">
              <select
                required
                className="input w-full text-sm appearance-none pr-8"
                value={form.program}
                onChange={handleProgramChange}
              >
                <option value="">Select program…</option>
                {programList.map(p => (
                  <option key={p.id} value={p.id}>{p.title ?? p.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ceda-muted pointer-events-none" />
            </div>
            <p className="text-[10px] text-ceda-muted mt-1">Each workflow is linked to a program</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ceda-muted mb-1">Name *</label>
            <input
              autoFocus
              required
              className="input w-full"
              placeholder="e.g. Idea Review Workflow"
              value={form.name}
              onChange={set('name')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ceda-muted mb-1">Workflow Type</label>
            <input
              className="input w-full text-sm"
              placeholder="Filled in from the program"
              value={form.workflow_type}
              onChange={set('workflow_type')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ceda-muted mb-1">Description</label>
            <textarea
              className="input w-full resize-none text-sm"
              rows={3}
              placeholder="Optional description…"
              value={form.description}
              onChange={set('description')}
            />
          </div>
        </form>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-ceda-border">
          <button type="button" onClick={() => onClose(null)} className="btn-secondary btn-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={!form.name.trim() || !form.program || busy}
            className="btn-primary btn-sm"
          >
            {busy ? 'Creating…' : 'Create Workflow'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkflowRow({ wf, onAction }) {
  const navigate = useNavigate()
  const canPublish  = wf.status === 'draft'
  const canActivate = wf.status === 'published'
  const canArchive  = ['draft', 'published', 'active', 'inactive'].includes(wf.status)
  const canDelete   = wf.status === 'draft'

  const createdDate = wf.published_at
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(wf.published_at))
    : '—'

  return (
    <tr
      className="hover:bg-ceda-surface/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/admin/workflows/${wf.id}/builder`)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
            <GitBranch size={14} className="text-ceda-forest" />
          </div>
          <div>
            <p className="text-sm font-medium text-ceda-dark">{wf.name}</p>
            {wf.code && <p className="text-xs text-ceda-muted font-mono">{wf.code}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-ceda-muted">{wf.workflow_type || '—'}</td>
      <td className="px-4 py-3"><StatusBadge status={wf.status} /></td>
      <td className="px-4 py-3 text-xs text-ceda-muted">{wf.node_count ?? '—'} nodes</td>
      <td className="px-4 py-3 text-xs text-ceda-muted">v{wf.version ?? 1}</td>
      <td className="px-4 py-3 text-xs text-ceda-muted">{createdDate}</td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            title="Open Builder"
            onClick={() => navigate(`/admin/workflows/${wf.id}/builder`)}
            className="p-1.5 rounded hover:bg-ceda-surface text-ceda-muted hover:text-ceda-dark transition-colors"
          >
            <ChevronRight size={15} />
          </button>
          <button
            title="View Instances"
            onClick={() => navigate(`/admin/workflows/${wf.id}/instances`)}
            className="p-1.5 rounded hover:bg-ceda-surface text-ceda-muted hover:text-ceda-dark transition-colors"
          >
            <Eye size={14} />
          </button>
          {canPublish && (
            <button title="Publish (step 1 of 2: then Activate)" onClick={() => onAction('publish', wf.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
              <Play size={12} /> Publish
            </button>
          )}
          {canActivate && (
            <button title="Activate: new entries will follow this workflow" onClick={() => onAction('activate', wf.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-white bg-ceda-forest hover:bg-ceda-dark transition-colors">
              <Play size={12} /> Activate
            </button>
          )}
          <button title="Clone" onClick={() => onAction('clone', wf.id)}
            className="p-1.5 rounded hover:bg-ceda-surface text-ceda-muted hover:text-ceda-dark transition-colors">
            <Copy size={14} />
          </button>
          {canArchive && (
            <button title="Archive" onClick={() => onAction('archive', wf.id)}
              className="p-1.5 rounded hover:bg-amber-50 text-ceda-muted hover:text-amber-600 transition-colors">
              <Archive size={14} />
            </button>
          )}
          {canDelete && (
            <button title="Delete" onClick={() => onAction('delete', wf.id)}
              className="p-1.5 rounded hover:bg-ceda-red-pale text-ceda-muted hover:text-ceda-red transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function AdminWorkflows() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [actionErr, setActionErr]   = useState(null)

  const { data, isLoading, error, refetch, isFetching } = useWorkflowDefinitions()
  const { data: programsData } = usePrograms()
  const createMut   = useCreateWorkflow()
  const deleteMut   = useDeleteWorkflow()
  const publishMut  = usePublishWorkflow()
  const activateMut = useActivateWorkflowDef()
  const archiveMut  = useArchiveWorkflow()
  const cloneMut    = useCloneWorkflow()

  const wfList = Array.isArray(data) ? data : (data?.results ?? [])

  const handleCreate = (body) => createMut.mutateAsync(body)

  const handleCreateClose = (result) => {
    setShowCreate(false)
    if (result?.id) navigate(`/admin/workflows/${result.id}/builder`)
  }

  const handleAction = async (action, id) => {
    setActionErr(null)
    try {
      switch (action) {
        case 'publish':  await publishMut.mutateAsync(id);  break
        case 'activate': await activateMut.mutateAsync(id); break
        case 'archive':  await archiveMut.mutateAsync(id);  break
        case 'clone':    await cloneMut.mutateAsync(id);    break
        case 'delete':
          if (await confirm({ title: 'Delete this workflow?', note: 'This cannot be undone.', confirmLabel: 'Delete workflow' })) {
            await deleteMut.mutateAsync(id)
          }
          break
        default: break
      }
    } catch (ex) {
      setActionErr(ex.message)
    }
  }

  const is403 = error?.message?.includes('403') || error?.message?.includes('Forbidden') || error?.message?.includes('permission')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ceda-dark">Workflow Definitions</h1>
          <p className="text-sm text-ceda-muted mt-0.5">Design, publish, and monitor workflow templates</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="btn-secondary btn-sm flex items-center gap-1.5">
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={14} /> New Workflow
          </button>
        </div>
      </div>

      {actionErr && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-xl bg-ceda-red-pale border border-ceda-red/20 text-ceda-red text-sm">
          <AlertTriangle size={15} />
          <span className="flex-1">{actionErr}</span>
          <button className="text-xs underline" onClick={() => setActionErr(null)}>Dismiss</button>
        </div>
      )}

      {is403 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4 border border-amber-200">
            <AlertTriangle size={24} className="text-amber-500" strokeWidth={1.5} />
          </div>
          <p className="text-base font-semibold text-ceda-dark mb-1">Admin Access Required</p>
          <p className="text-sm text-ceda-muted max-w-sm">
            Workflow management requires Django admin-level permissions.
            Contact your system administrator to grant access.
          </p>
        </div>
      ) : isLoading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : (
        <div className="card overflow-hidden">
          {wfList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Workflow size={32} className="text-ceda-border mb-3" strokeWidth={1.5} />
              <p className="text-sm font-medium text-ceda-dark mb-1">No workflows yet</p>
              <p className="text-xs text-ceda-muted mb-4">Create your first workflow definition to get started.</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm flex items-center gap-1.5">
                <Plus size={13} /> New Workflow
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ceda-border bg-ceda-surface/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Nodes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Published</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ceda-border/50">
                {wfList.map(wf => (
                  <WorkflowRow key={wf.id} wf={wf} onAction={handleAction} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={handleCreateClose}
          onCreate={handleCreate}
          programs={programsData}
        />
      )}
    </div>
  )
}

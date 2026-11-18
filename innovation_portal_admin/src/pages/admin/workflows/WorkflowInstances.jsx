import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Activity, Clock,
  CheckCircle2, XCircle, Pause, ChevronRight, Loader2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useWorkflowDefinition, useWorkflowInstances, useWorkflowInstance, useCancelInstance, usePauseInstance, useResumeInstance } from '../../../lib/queries/workflowBuilder'
import ErrorState from '../../../components/ui/ErrorState'


const INSTANCE_STATUS = {
  in_progress: { label: 'In Progress', icon: Activity,     color: 'text-ceda-green',  bg: 'bg-ceda-green-pale' },
  paused:      { label: 'Paused',      icon: Pause,        color: 'text-amber-600',  bg: 'bg-amber-50' },
  completed:   { label: 'Completed',   icon: CheckCircle2, color: 'text-gray-500',   bg: 'bg-gray-100' },
  rejected:    { label: 'Rejected',    icon: XCircle,      color: 'text-ceda-red',    bg: 'bg-ceda-red-pale' },
  returned:    { label: 'Returned',    icon: RefreshCw,    color: 'text-amber-600',  bg: 'bg-amber-50' },
  cancelled:   { label: 'Cancelled',   icon: XCircle,      color: 'text-gray-400',   bg: 'bg-gray-100' },
}

function InstanceBadge({ status }) {
  const s = INSTANCE_STATUS[status] ?? { label: status ?? '—', icon: Activity, color: 'text-ceda-muted', bg: 'bg-ceda-surface' }
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', s.bg, s.color)}>
      <Icon size={11} />
      {s.label}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
}


function InstanceRow({ instance, onSelect, selected }) {
  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors',
        selected ? 'bg-ceda-green-pale/40' : 'hover:bg-ceda-surface/50'
      )}
      onClick={() => onSelect(instance)}
    >
      <td className="px-4 py-3">
        <p className="text-xs font-mono text-ceda-muted truncate max-w-[160px]">{instance.id}</p>
      </td>
      <td className="px-4 py-3 text-xs text-ceda-muted">
        {instance.entity_type ?? '—'} / <span className="font-mono">{instance.entity_id?.slice(0, 8)}…</span>
      </td>
      <td className="px-4 py-3">
        <InstanceBadge status={instance.status} />
      </td>
      <td className="px-4 py-3 text-xs text-ceda-muted">
        {instance.current_node_detail ?? instance.current_node ?? '—'}
      </td>
      <td className="px-4 py-3 text-xs text-ceda-muted">{fmtDate(instance.started_at)}</td>
      <td className="px-4 py-3">
        <ChevronRight size={15} className="text-ceda-border" />
      </td>
    </tr>
  )
}


function InstanceDetail({ instanceId, onClose }) {
  const { data, isLoading, error } = useWorkflowInstance(instanceId)
  const cancelMut  = useCancelInstance()
  const pauseMut   = usePauseInstance()
  const resumeMut  = useResumeInstance()
  const [actionErr, setActionErr] = useState(null)

  const doAction = async (action) => {
    setActionErr(null)
    try {
      if (action === 'cancel') await cancelMut.mutateAsync(instanceId)
      if (action === 'pause')  await pauseMut.mutateAsync(instanceId)
      if (action === 'resume') await resumeMut.mutateAsync(instanceId)
    } catch (ex) { setActionErr(ex.message) }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-ceda-surface border-b border-ceda-border">
        <h3 className="text-sm font-semibold text-ceda-dark">Instance Detail</h3>
        <button onClick={onClose} className="text-xs text-ceda-muted hover:text-ceda-dark">✕ Close</button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-ceda-muted" />
        </div>
      )}
      {error && <ErrorState message={error.message} />}
      {actionErr && (
        <div className="m-4 flex items-start gap-2 p-3 rounded-xl bg-ceda-red-pale border border-ceda-red/20 text-ceda-red text-sm">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {actionErr}
          <button className="ml-auto text-xs underline" onClick={() => setActionErr(null)}>×</button>
        </div>
      )}

      {data && !isLoading && (
        <div className="divide-y divide-ceda-border/50">
          <div className="px-4 py-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-ceda-muted mb-0.5">Status</p>
                <InstanceBadge status={data.status} />
              </div>
              <div>
                <p className="text-ceda-muted mb-0.5">Current Node</p>
                <p className="font-medium text-ceda-dark">{data.current_node_detail ?? '—'}</p>
              </div>
              <div>
                <p className="text-ceda-muted mb-0.5">Entity</p>
                <p className="font-medium text-ceda-dark">{data.entity_type} / <span className="font-mono">{data.entity_id?.slice(0, 8)}…</span></p>
              </div>
              <div>
                <p className="text-ceda-muted mb-0.5">Started</p>
                <p className="font-medium text-ceda-dark">{fmtDate(data.started_at)}</p>
              </div>
              {data.completed_at && (
                <div>
                  <p className="text-ceda-muted mb-0.5">Completed</p>
                  <p className="font-medium text-ceda-dark">{fmtDate(data.completed_at)}</p>
                </div>
              )}
            </div>
          </div>

          {data.action_logs?.length > 0 && (
            <div className="px-4 py-4">
              <p className="text-xs font-semibold text-ceda-muted mb-2">Action Log</p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {data.action_logs.map((log, i) => (
                  <div key={log.id ?? i} className="flex items-start gap-2 text-[11px]">
                    <span className="text-ceda-muted flex-shrink-0 w-28 truncate">{fmtDate(log.timestamp)}</span>
                    <span className="font-medium text-ceda-dark">{log.performed_by_name}</span>
                    <span className="text-ceda-muted capitalize">{log.action?.replace(/_/g, ' ')}</span>
                    {log.comment && <span className="text-ceda-muted italic">"{log.comment}"</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {['in_progress', 'paused'].includes(data.status) && (
            <div className="px-4 py-3 flex gap-2">
              {data.status === 'in_progress' && (
                <button onClick={() => doAction('pause')} disabled={pauseMut.isPending}
                  className="btn-secondary btn-sm flex items-center gap-1.5">
                  {pauseMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                  Pause
                </button>
              )}
              {data.status === 'paused' && (
                <button onClick={() => doAction('resume')} disabled={resumeMut.isPending}
                  className="btn-secondary btn-sm flex items-center gap-1.5">
                  {resumeMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                  Resume
                </button>
              )}
              <button onClick={() => doAction('cancel')} disabled={cancelMut.isPending}
                className="btn-secondary btn-sm text-ceda-red hover:bg-ceda-red-pale flex items-center gap-1.5 ml-auto">
                {cancelMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


const STATUS_TABS = [
  { key: '',            label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'paused',      label: 'Paused' },
  { key: 'completed',   label: 'Completed' },
  { key: 'cancelled',   label: 'Cancelled' },
]


export default function WorkflowInstances() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const { data: wf } = useWorkflowDefinition(id)
  const {
    data: instancesData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useWorkflowInstances({ workflow_definition: id, ...(statusFilter ? { status: statusFilter } : {}) })

  const instances = Array.isArray(instancesData) ? instancesData : instancesData?.results ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/admin/workflows/${id}/builder`)}
          className="text-ceda-muted hover:text-ceda-dark transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-ceda-dark">
            {wf?.name ?? 'Workflow'} — Instances
          </h1>
          <p className="text-sm text-ceda-muted mt-0.5">
            {instances.length} instance{instances.length !== 1 ? 's' : ''} · auto-refreshes every 15 s
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="btn-secondary btn-sm flex items-center gap-1.5 ml-auto">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {STATUS_TABS.map(t => {
          const count = t.key === ''
            ? instances.length
            : instances.filter(i => i.status === t.key).length
          return (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setSelected(null) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === t.key
                  ? 'bg-ceda-forest text-white'
                  : 'bg-ceda-surface text-ceda-muted hover:text-ceda-dark border border-ceda-border'
              )}
            >
              {t.label}
              {t.key === '' || count > 0 ? <span className="ml-1.5 opacity-70">{count}</span> : null}
            </button>
          )
        })}
      </div>

      <div className={cn('grid gap-5', selected ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1')}>
        <div className={cn('card overflow-hidden', selected ? 'lg:col-span-3' : '')}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-ceda-muted" />
            </div>
          ) : error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock size={28} className="text-ceda-border mb-2" strokeWidth={1.5} />
              <p className="text-sm text-ceda-muted">No instances found</p>
              <p className="text-xs text-ceda-muted mt-1">
                {statusFilter ? `No ${statusFilter.replace('_', ' ')} instances.` : 'Instances appear when a workflow is started on a submission.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ceda-border bg-ceda-surface/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Instance ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Current Node</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ceda-muted">Started</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ceda-border/50">
                {instances.map(inst => (
                  <InstanceRow
                    key={inst.id}
                    instance={inst}
                    selected={selected?.id === inst.id}
                    onSelect={i => setSelected(prev => prev?.id === i.id ? null : i)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="lg:col-span-2">
            <InstanceDetail instanceId={selected.id} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Play, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import PageHeader  from '../../components/ui/PageHeader'
import SectionCard from '../../components/ui/SectionCard'
import StatusPill  from '../../components/ui/StatusPill'
import EmptyState  from '../../components/ui/EmptyState'
import ErrorState  from '../../components/ui/ErrorState'
import { SkeletonTable } from '../../components/ui/LoadingSkeleton'
import { useWorkflows, useWorkflowSteps, useActivateWorkflow } from '../../lib/queries/workflows'
import { cn } from '../../lib/cn'

function WorkflowRow({ workflow }) {
  const [expanded, setExpanded] = useState(false)
  const { data: steps, isLoading: stepsLoading } = useWorkflowSteps(expanded ? workflow.id : null)
  const activate = useActivateWorkflow()

  const stepsArr = Array.isArray(steps) ? steps : steps?.results ?? []

  return (
    <div className="border-b border-ceda-border/60 last:border-0">
      <div
        className="flex items-center gap-3 px-5 py-3.5 hover:bg-ceda-surface/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <button className="text-ceda-muted hover:text-ceda-dark flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="w-8 h-8 rounded-lg bg-ceda-green-pale flex items-center justify-center flex-shrink-0">
          <GitBranch size={14} className="text-ceda-green-muted" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ceda-dark truncate">{workflow.name}</p>
          <p className="text-xs text-ceda-muted">
            Version {workflow.version} · {stepsArr.length > 0 ? `${stepsArr.length} steps` : (workflow.steps?.length ?? 0) + ' steps'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={cn(
            'badge text-[11px]',
            workflow.is_active ? 'bg-ceda-green-pale text-ceda-green-muted' : 'bg-ceda-surface text-ceda-muted'
          )}>
            {workflow.is_active ? 'Active' : 'Inactive'}
          </span>

          {!workflow.is_active && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                activate.mutate(workflow.id)
              }}
              disabled={activate.isPending}
              className="btn-secondary btn-sm"
            >
              <Play size={12} /> Activate
            </button>
          )}
          {workflow.is_active && (
            <span className="flex items-center gap-1 text-xs text-ceda-green-muted">
              <CheckCircle2 size={12} /> Active
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="bg-ceda-surface/40 px-12 pb-4 pt-2">
          {stepsLoading ? (
            <SkeletonTable rows={3} cols={3} />
          ) : stepsArr.length === 0 ? (
            <p className="text-xs text-ceda-muted py-2">No steps defined.</p>
          ) : (
            <div className="space-y-2">
              {stepsArr.map((step, i) => (
                <div key={step.id ?? i} className="flex items-start gap-3 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-ceda-border flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-ceda-muted mt-0.5">
                    {step.order ?? i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ceda-dark">{step.name}</p>
                    <p className="text-xs text-ceda-muted">
                      {step.code} · {step.role_required ?? 'Any role'}
                      {step.requires_evaluation && ' · Requires evaluation'}
                      {step.requires_assignment && ' · Requires assignment'}
                    </p>
                  </div>
                  <StatusPill status={step.is_active ? 'active' : 'inactive'} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Workflows() {
  const { data, isLoading, error, refetch } = useWorkflows()

  const workflows = Array.isArray(data) ? data : data?.results ?? []
  const activeCount = workflows.filter(w => w.is_active).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Workflow Definitions"
        subtitle="Configure and manage workflow lifecycle definitions for programs."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Workflows', value: isLoading ? '—' : workflows.length,  color: 'text-ceda-forest' },
          { label: 'Active',          value: isLoading ? '—' : activeCount,        color: 'text-ceda-green' },
          { label: 'Inactive',        value: isLoading ? '—' : workflows.length - activeCount, color: 'text-ceda-muted' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-ceda-surface flex items-center justify-center flex-shrink-0">
              <GitBranch size={17} className={s.color} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-lg font-bold text-ceda-dark leading-none">{s.value}</p>
              <p className="text-xs text-ceda-muted mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="Workflows" padding={false}>
        {isLoading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : workflows.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="No workflow definitions"
            message="Workflow definitions will appear here once created by an administrator."
          />
        ) : (
          <div className="divide-y divide-ceda-border/40">
            {workflows.map(wf => (
              <WorkflowRow key={wf.id} workflow={wf} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

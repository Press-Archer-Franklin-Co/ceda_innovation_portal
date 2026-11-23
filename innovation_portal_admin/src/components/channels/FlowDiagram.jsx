import { memo, useMemo } from 'react'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, getSmoothStepPath } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertCircle, Flag, Plus, Square } from 'lucide-react'
import DropdownMenu from '../ui/DropdownMenu'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { buildFlow } from './flowGraph'
import { pick, ussdScreenText, USSD_LIMIT } from './journeyModel'
import { stepIcon } from './stepIcons'

// The flow diagram (3.31 and 3.31b canvas): Start, one box per step, End for each outcome, one labelled line
// per branch. Click a box or a line to open its settings; "+" on a line adds a step there. Tab moves through
// the boxes and lines; Enter opens them. The layout is automatic and never saved.

const hidden = '!h-0 !w-0 !min-h-0 !min-w-0 !border-0 !bg-transparent'

function StepNode({ data, selected }) {
  const { t } = useI18n()
  const { step, spec, typeLabel, lang, channel, onOpen, problems } = data
  const Icon = stepIcon(step.type)
  const errors = problems.filter((p) => p.level === 'error')
  const text = pick(step.text, lang)
  const chars = channel === 'ussd' ? ussdScreenText(step, lang, data.types).length : 0
  return (
    <div className="w-[240px]">
      <Handle type="target" position={Position.Top} className={hidden} isConnectable={false} />
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        aria-label={`${typeLabel}: ${step.title || text || step.key}${errors.length ? `. ${t('ch.flow.problemsCount', { count: errors.length })}` : ''}`}
        className={cn(
          'block w-full rounded-card border bg-surface px-3 py-2 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          selected ? 'border-primary ring-1 ring-primary' : errors.length ? 'border-danger' : 'border-border',
        )}
      >
        <span className="flex items-center gap-1.5 text-d-cap text-muted">
          {data.isStart ? <Flag size={13} aria-hidden className="text-primary shrink-0" /> : <Icon size={13} aria-hidden className="shrink-0" />}
          <span className="truncate">{typeLabel}{step.title ? ` · ${step.title}` : ''}</span>
          {errors.length > 0 && <AlertCircle size={13} aria-hidden className="ml-auto shrink-0 text-danger" />}
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-text line-clamp-2">{text || <span className="italic text-muted">{spec?.text ? t('ch.canvas.noText') : typeLabel}</span>}</span>
        {errors.length > 0 && <span className="mt-1 block truncate text-d-cap text-danger">{errors[0].message}</span>}
        {channel === 'ussd' && spec?.text && <span className={cn('mt-0.5 block text-d-cap', chars > USSD_LIMIT ? 'text-danger' : 'text-muted')}>{t('ch.flow.chars', { count: chars, max: USSD_LIMIT })}</span>}
      </button>
      <Handle type="source" position={Position.Bottom} className={hidden} isConnectable={false} />
    </div>
  )
}

function StartNode({ data }) {
  return (
    <div className="flex h-10 w-[240px] items-center justify-center">
      <span className="rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-white">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className={hidden} isConnectable={false} />
    </div>
  )
}

function EndNode({ data }) {
  return (
    <div className="flex h-10 w-[240px] items-center justify-center">
      <Handle type="target" position={Position.Top} className={hidden} isConnectable={false} />
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold', data.problem ? 'border-danger bg-danger-soft text-danger' : 'border-border bg-surface2 text-muted')}>
        {data.problem ? <AlertCircle size={12} aria-hidden /> : <Square size={10} aria-hidden />}
        {data.label}
      </span>
    </div>
  )
}

function BranchEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }) {
  const { t } = useI18n()
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 })
  const canSelect = data.from !== '__start' && data.port
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: selected ? 'rgb(var(--c-primary))' : 'rgb(var(--c-muted))', strokeWidth: selected ? 2 : 1.25 }} />
      {canSelect && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            <button
              type="button"
              onClick={() => data.onOpen()}
              aria-pressed={selected}
              aria-label={t('ch.flow.branchAria', { label: data.label || t('ch.flow.then'), from: data.fromName })}
              className={cn('max-w-[180px] truncate rounded-full border px-2 py-0.5 text-[11px] font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text hover:border-primary')}
            >
              {data.label || t('ch.flow.then')}
            </button>
            <DropdownMenu
              label={t('ch.flow.addOnBranch')}
              width={220}
              trigger={(props) => (
                <button {...props} type="button" className="grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-muted shadow-sm hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Plus size={12} aria-hidden />
                </button>
              )}
              items={data.addItems}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { step: memo(StepNode), start: memo(StartNode), end: memo(EndNode) }
const edgeTypes = { branch: BranchEdge }

function Diagram({ steps, startKey, types, channel, lang, problems, selected, onSelect, onAddOnBranch, typeLabel }) {
  const { t } = useI18n()
  const words = useMemo(() => ({
    start: t('ch.flow.start'), end: t('ch.flow.end'), end_sent: t('ch.flow.endSent'), end_not_sent: t('ch.flow.endNotSent'), end_handover: t('ch.flow.endHandover'),
    nowhere: t('ch.flow.nowhere'), true_next: t('ch.flow.yes'), false_next: t('ch.flow.no'), success_next: t('ch.flow.sent'), error_next: t('ch.flow.notSent'),
    continue_next: t('ch.flow.continue'), main_menu: t('ch.flow.mainMenu'), any_answer: t('ch.flow.anyAnswer'),
  }), [t])
  const flow = useMemo(() => buildFlow(steps, startKey, types, { lang, words, problems }), [steps, startKey, types, lang, words, problems])
  const names = useMemo(() => Object.fromEntries(steps.map((s) => [s.key, s.title || pick(s.text, lang) || s.key])), [steps, lang])
  const addable = useMemo(() => Object.values(types).filter((spec) => channel !== 'ussd' || !['file', 'my_ideas'].includes(spec.type)), [types, channel])

  const nodes = flow.nodes.map((node) => node.data.kind !== 'step' ? { ...node, selectable: false, focusable: false } : {
    ...node,
    selected: selected?.kind === 'node' && selected.key === node.id,
    focusable: false,
    data: { ...node.data, spec: types[node.data.step.type], typeLabel: typeLabel(node.data.step.type), lang, channel, types, onOpen: () => onSelect({ kind: 'node', key: node.id }) },
  })
  const edges = flow.edges.map((edge) => ({
    ...edge,
    focusable: false,
    selected: selected?.kind === 'branch' && selected.id === edge.id,
    data: {
      ...edge.data,
      fromName: names[edge.data.from] ?? '',
      onOpen: () => onSelect({ kind: 'branch', id: edge.id, key: edge.data.from, port: edge.data.port }),
      addItems: addable.map((spec) => ({ key: spec.type, label: typeLabel(spec.type), icon: (() => { const I = stepIcon(spec.type); return <I size={14} aria-hidden /> })(), onSelect: () => onAddOnBranch(spec.type, { key: edge.data.from, port: edge.data.port }) })),
    },
  }))

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => onSelect(null)}
      aria-label={t('ch.flow.diagram')}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-left" aria-label={t('ch.flow.zoom')} />
      <MiniMap pannable zoomable className="!hidden md:!block" ariaLabel={t('ch.flow.minimap')} />
    </ReactFlow>
  )
}

export default function FlowDiagram(props) {
  return (
    <div className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-card border border-border bg-surface2 lg:h-full" role="region" aria-label={props.label}>
      <ReactFlowProvider>
        <Diagram {...props} />
      </ReactFlowProvider>
    </div>
  )
}

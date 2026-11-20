import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Rocket, Save, AlertCircle } from 'lucide-react'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import ErrorState from '../../components/ui/ErrorState'
import Skeleton from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toast'
import { useConfirm } from '../../components/ui/confirm'
import JourneyCanvas from '../../components/channels/JourneyCanvas'
import NodeInspector from '../../components/channels/NodeInspector'
import PhoneSimulator from '../../components/channels/PhoneSimulator'
import { JourneyStatusTag, ChannelTag } from '../../components/channels/tags'
import { NODE_ICONS, TYPE_ORDER, fromJourney, newNode, toPayload, unlinkTarget } from '../../components/channels/journeyModel'
import { useJourney, usePublishJourney, useSaveNodes, useValidateJourney } from '../../lib/queries/channels'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'

function PaletteItem({ type, onAdd }) {
  const t = useT()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { type } })
  const Icon = NODE_ICONS[type]
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        onClick={() => onAdd(type)}
        title={t(`ch.typeHint.${type}`)}
        className={cn('w-full flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 h-8 text-[12px] text-text hover:border-primary cursor-grab whitespace-nowrap', isDragging && 'opacity-50')}
      >
        <Icon size={14} aria-hidden className="text-muted shrink-0" />
        <span className="truncate">{t(`ch.type.${type}`)}</span>
      </button>
    </li>
  )
}

function problemsByNode(problems) {
  const map = {}
  ;(problems ?? []).forEach((p) => {
    if (!p.node) return
    ;(map[p.node] = map[p.node] ?? []).push(p)
  })
  return map
}

export default function JourneyBuilder() {
  const { id } = useParams()
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const journeyQuery = useJourney(id)
  const saveNodes = useSaveNodes()
  const validate = useValidateJourney()
  const publish = usePublishJourney()
  const canvasRef = useRef(null)

  const [nodes, setNodes] = useState([])
  const [startKey, setStartKey] = useState('')
  const [baseline, setBaseline] = useState('')
  const [selected, setSelected] = useState(null)
  const [activeNode, setActiveNode] = useState(null)
  const [panel, setPanel] = useState('step')
  const [problems, setProblems] = useState(null)
  const [dragType, setDragType] = useState(null)

  const journey = journeyQuery.data
  const snapshot = useCallback((list, start) => JSON.stringify({ n: toPayload(list), s: start }), [])

  // Load the server copy once per journey (and after each save), then edit locally.
  useEffect(() => {
    if (!journey) return
    const list = fromJourney(journey)
    setNodes(list)
    setStartKey(journey.start_key || '')
    setBaseline(snapshot(list, journey.start_key || ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id, journey?.updated_at])

  const dirty = journey ? snapshot(nodes, startKey) !== baseline : false

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (journey && nodes.length) canvasRef.current?.fit({ readable: true })
    // Fit once after the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id, nodes.length > 0])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor))
  const byProblem = useMemo(() => problemsByNode(problems), [problems])
  const selectedNode = nodes.find((n) => n.key === selected)

  const addNode = (type, position) => {
    const center = position ?? canvasRef.current?.toCanvas(window.innerWidth / 2, window.innerHeight / 2) ?? { x: 40, y: 40 }
    const node = newNode(type, nodes, { x: Math.round(center.x - 100), y: Math.round(center.y - 30) })
    setNodes((list) => [...list, node])
    if (!startKey) setStartKey(node.key)
    setSelected(node.key)
    setPanel('step')
  }

  const onDragEnd = (event) => {
    setDragType(null)
    if (event.over?.id !== 'journey-canvas') return
    const type = event.active.data.current?.type
    const pointer = event.activatorEvent
    if (!type || !pointer || pointer.clientX === undefined) return
    const point = canvasRef.current?.toCanvas(pointer.clientX + event.delta.x, pointer.clientY + event.delta.y)
    addNode(type, point)
  }

  const updateNode = (next) => setNodes((list) => list.map((n) => (n.key === next.key ? next : n)))

  const deleteNode = async (node) => {
    const ok = await confirm({
      title: t('ch.builder.deleteTitle', { name: node.title || t(`ch.type.${node.type}`) }),
      body: t('ch.builder.deleteBody'),
      confirmLabel: t('ch.inspector.delete'),
    })
    if (!ok) return
    setNodes((list) => list.filter((n) => n.key !== node.key).map((n) => unlinkTarget(n, node.key, t)))
    if (startKey === node.key) setStartKey('')
    setSelected(null)
  }

  const save = async ({ quiet = false } = {}) => {
    try {
      const saved = await saveNodes.mutateAsync({ id, body: { nodes: toPayload(nodes), start_key: startKey } })
      const list = fromJourney(saved)
      setBaseline(snapshot(list, saved.start_key || ''))
      if (!quiet) toast.show({ title: t('ch.builder.saved'), tone: 'success' })
      return true
    } catch (error) {
      toast.show({ title: t('ch.builder.saveFailed'), body: error.message, tone: 'error' })
      return false
    }
  }

  const check = async () => {
    if (dirty && !(await save({ quiet: true }))) return
    try {
      const result = await validate.mutateAsync(id)
      setProblems(result.problems)
      toast.show({
        title: result.ok ? t('ch.builder.checkOk') : t('ch.builder.checkProblems', { count: result.problems.filter((p) => p.level === 'error').length }),
        tone: result.ok ? 'success' : 'warning',
      })
    } catch (error) {
      toast.show({ title: t('ch.builder.checkFailed'), body: error.message, tone: 'error' })
    }
  }

  const doPublish = async () => {
    if (dirty && !(await save({ quiet: true }))) return
    try {
      const version = await publish.mutateAsync(id)
      setProblems(version.warnings ?? [])
      toast.show({ title: t('ch.builder.published', { version: version.number }), body: t('ch.builder.publishedBody'), tone: 'success' })
    } catch (error) {
      const list = error.data?.errors?.problems
      if (list) {
        setProblems(list)
        toast.show({ title: t('ch.builder.publishRefused'), body: t('ch.builder.publishRefusedBody'), tone: 'warning' })
      } else {
        toast.show({ title: t('ch.builder.publishFailed'), body: error.message, tone: 'error' })
      }
    }
  }

  if (journeyQuery.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }
  if (journeyQuery.isError) {
    return <ErrorState title={t('ch.builder.loadFailed')} message={journeyQuery.error?.message} onRetry={() => journeyQuery.refetch()} retrying={journeyQuery.isFetching} framed />
  }
  if (!journey) return null

  const errorList = (problems ?? []).filter((p) => p.level === 'error')
  const generalProblems = (problems ?? []).filter((p) => !p.node)

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragType(e.active.data.current?.type)} onDragEnd={onDragEnd} onDragCancel={() => setDragType(null)}>
      <div className="flex flex-col gap-3 min-h-[calc(100vh-7rem)]">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link to="/channels/journeys" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={14} aria-hidden />{t('ch.nav.journeys')}</Link>
          <h1 className="text-lg 2xl:text-[22px] font-bold text-text truncate">{journey.name}</h1>
          <ChannelTag channel={journey.channel} />
          <JourneyStatusTag journey={journey} dirty={dirty} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {dirty && <span className="text-xs text-warning" aria-live="polite">{t('ch.builder.unsaved')}</span>}
            <Button variant="secondary" size="sm" icon={<ClipboardCheck size={14} />} loading={validate.isPending} onClick={check}>{t('ch.builder.check')}</Button>
            <Button variant="secondary" size="sm" icon={<Save size={14} />} loading={saveNodes.isPending} disabled={!dirty} onClick={() => save()}>{t('common.save')}</Button>
            <Button size="sm" icon={<Rocket size={14} />} loading={publish.isPending} onClick={doPublish}>{t('ch.builder.publish')}</Button>
          </div>
        </header>

        {problems && (
          <div role="status" className={cn('rounded-control px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1', errorList.length ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
            {errorList.length ? <AlertCircle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
            <span className="font-bold">{errorList.length ? t('ch.builder.fixBefore', { count: errorList.length }) : t('ch.builder.noErrors')}</span>
            {generalProblems.map((p, i) => <span key={i}>{p.message}</span>)}
            {errorList.length > 0 && <span className="text-text/80">{t('ch.builder.fixHint')}</span>}
          </div>
        )}

        <div className="flex-1 grid gap-3 grid-cols-1 lg:grid-cols-[150px_minmax(0,1fr)_340px] 2xl:grid-cols-[168px_minmax(0,1fr)_380px]">
          <nav aria-label={t('ch.builder.palette')} className="lg:sticky lg:top-2 self-start">
            <p className="text-d-cap text-muted mb-1.5">{t('ch.builder.paletteHint')}</p>
            <ul className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1">
              {TYPE_ORDER.map((type) => <PaletteItem key={type} type={type} onAdd={(tp) => addNode(tp)} />)}
            </ul>
          </nav>

          <JourneyCanvas
            ref={canvasRef}
            className="h-[60vh] lg:h-auto lg:min-h-[520px]"
            nodes={nodes}
            startKey={startKey}
            selectedKey={selected}
            activeKey={panel === 'phone' ? activeNode : null}
            problems={byProblem}
            onSelect={(key) => { setSelected(key); if (key) setPanel('step') }}
            onChange={(list) => setNodes(list)}
          />

          <div className="rounded-card border border-border bg-surface p-3.5 2xl:p-[22px] self-start lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
            <Tabs
              tabs={[{ key: 'step', label: t('ch.builder.tabStep') }, { key: 'phone', label: t('ch.builder.tabPhone') }]}
              active={panel}
              onChange={setPanel}
              idPrefix="builder-panel"
              className="mb-3"
            />
            {panel === 'step' && (
              selectedNode ? (
                <NodeInspector
                  key={selectedNode.key}
                  node={selectedNode}
                  nodes={nodes}
                  channel={journey.channel}
                  isStart={selectedNode.key === startKey}
                  problems={byProblem[selectedNode.key]}
                  onChange={updateNode}
                  onSetStart={() => setStartKey(selectedNode.key)}
                  onDelete={() => deleteNode(selectedNode)}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <div className="py-6 text-center text-sm text-muted">
                  <p className="font-bold text-text mb-1">{t('ch.builder.noStepTitle')}</p>
                  <p>{t('ch.builder.noStepBody')}</p>
                </div>
              )
            )}
            {panel === 'phone' && (
              <PhoneSimulator
                journey={journey}
                beforeStart={async () => (dirty ? save({ quiet: true }) : true)}
                onActiveNode={setActiveNode}
              />
            )}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragType ? (
          <div className="flex items-center gap-2 rounded-control border border-primary bg-surface px-2.5 h-8 text-[12px] shadow-lg">
            {(() => { const Icon = NODE_ICONS[dragType]; return <Icon size={14} aria-hidden /> })()}
            {t(`ch.type.${dragType}`)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}


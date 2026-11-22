import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, GripVertical, Megaphone, Save } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toast'
import { buttonClasses } from '../../components/ui/buttonClasses'
import JourneyList from '../../components/channels/JourneyList'
import StepPanel from '../../components/channels/StepPanel'
import { JourneyStatusTag } from '../../components/channels/tags'
import { stepIcon } from '../../components/channels/stepIcons'
import { useJourneyEditor } from '../../components/channels/useJourneyEditor'
import { useWide } from '../../components/channels/useWide'
import { moveAfter, newNode, pick, portsOf, runOrder } from '../../components/channels/journeyModel'
import { useChannelConnections, useJourneys } from '../../lib/queries/channels'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

// 3.31b WhatsApp flows (Figma 145:1608 website, 145:2060 phone). WhatsApp is a chat, so a flow is a list of
// message blocks, top to bottom. ① Flows ② blocks; drag to reorder or drag new blocks in from the left
// ③ block settings in English and Setswana ④ live chat preview ⑤ message templates (set on the connection).
// Every block type the API lists is offered. Phone: the list of flows; building is for a computer.

function useTypeLabel() {
  const { t, lang } = useI18n()
  // Chat words for the WhatsApp palette where the strings have them; otherwise the API's own label.
  return (spec) => {
    const key = `ch.wa.block.${spec.type}`
    const own = t(key)
    return own !== key ? own : lang === 'tn' ? spec.label_tn || spec.label : spec.label
  }
}

function PaletteBlock({ spec, onAdd }) {
  const label = useTypeLabel()(spec)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${spec.type}` })
  const Icon = stepIcon(spec.type)
  return (
    <li>
      <button ref={setNodeRef} type="button" {...listeners} {...attributes} onClick={() => onAdd(spec.type)}
        className={cn('w-full flex items-center gap-2 rounded-control border border-border bg-surface px-3 h-9 text-[13px] text-text hover:border-primary cursor-grab', isDragging && 'opacity-50')}>
        <Icon size={15} aria-hidden className="text-muted shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    </li>
  )
}

function Chips({ items, more }) {
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {items.map((label, i) => <span key={i} className="rounded-full bg-surface2 px-2.5 py-0.5 text-d-cap font-bold text-text">{label || '…'}</span>)}
      {more > 0 && <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-d-cap font-bold text-text">+{more}</span>}
    </span>
  )
}

function Block({ node, types, lang, selected, problems, onSelect }) {
  const { t } = useI18n()
  const label = useTypeLabel()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.key })
  const spec = types[node.type]
  const options = portsOf(node, types).filter((p) => p.number).map((p) => pick(p.label, lang))
  const choices = node.settings?.answer_type === 'choice' ? (node.settings.choices ?? []).map((c) => pick(c.label, lang)) : []
  const chips = options.length ? options : choices
  const errors = problems?.filter((p) => p.level === 'error').length ?? 0
  const caption = [spec ? label(spec) : t('ch.status.unknown')]
  if (node.settings?.variable) caption.push(t('ch.ussd.saves', { name: node.settings.variable }))
  if (spec?.ends_when && node.settings?.[spec.ends_when]) caption.push(t('ch.wa.ends'))
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-60')}>
      <div className={cn('flex rounded-card border bg-surface shadow-sm', selected ? 'border-primary ring-1 ring-primary' : errors ? 'border-danger' : 'border-border')}>
        <button type="button" onClick={onSelect} aria-pressed={selected} className="flex-1 min-w-0 text-left px-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-l-card">
          <span className="flex items-center gap-1.5 text-d-cap text-muted">
            <span className="truncate">{caption.join(' · ')}</span>
            {errors > 0 && <AlertCircle size={13} className="text-danger shrink-0" aria-label={t('ch.canvas.problems', { count: errors })} />}
          </span>
          <span className="mt-1 block text-sm text-text whitespace-pre-line">{pick(node.text, lang) || <span className="italic text-muted">{t('ch.canvas.noText')}</span>}</span>
          {chips.length > 0 && <Chips items={chips.slice(0, 3)} more={chips.length - 3} />}
        </button>
        <button type="button" {...attributes} {...listeners} aria-label={t('ch.wa.dragBlock')} className="w-8 grid place-items-center text-muted hover:text-text cursor-grab touch-none">
          <GripVertical size={16} aria-hidden />
        </button>
      </div>
    </li>
  )
}

function Preview({ order, selectedKey, types, lang }) {
  const { t } = useI18n()
  const upto = Math.max(0, order.findIndex((n) => n.key === selectedKey))
  const shown = order.slice(Math.max(0, upto - 2), upto + 1).filter((n) => types[n.type]?.text && pick(n.text, lang))
  return (
    <section aria-label={t('ch.wa.preview')} className="rounded-card bg-surface2 p-3 space-y-1.5">
      <p className="text-d-cap font-bold text-muted">{t('ch.wa.preview')}</p>
      {shown.length === 0 && <p className="text-d-cap text-muted">{t('ch.wa.previewEmpty')}</p>}
      {shown.map((node) => {
        const options = portsOf(node, types).filter((p) => p.number)
        return (
          <div key={node.key} className="space-y-1">
            <p className="max-w-[90%] rounded-card bg-surface px-2.5 py-1.5 text-[12px] text-text whitespace-pre-line">{pick(node.text, lang)}</p>
            {options.length > 0 && options.length <= 3 && options.map((o) => (
              <p key={o.id} className="max-w-[90%] rounded-control bg-surface py-1 text-center text-[12px] font-bold text-info">{pick(o.label, lang) || '…'}</p>
            ))}
            {options.length > 3 && <p className="max-w-[90%] rounded-control bg-surface py-1 text-center text-[12px] font-bold text-info">{t('ch.sim.choose')}</p>}
          </div>
        )
      })}
    </section>
  )
}

function TemplatesCard() {
  const { t } = useI18n()
  const { data, isLoading, isError } = useChannelConnections({ kind: 'whatsapp' })
  if (isLoading) return <Skeleton className="h-16 w-full" />
  if (isError) return null
  const list = data ?? []
  const missing = new Set(list.flatMap((c) => c.templates_missing ?? []))
  const set = list.reduce((sum, c) => sum + Object.keys(c.config?.templates ?? {}).filter((k) => c.config.templates[k]).length, 0)
  return (
    <Link to="/channels/connections/whatsapp" className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3 hover:bg-surface2">
      <Megaphone size={18} aria-hidden className="text-muted shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-text">{t('ch.wa.templates')}</span>
        <span className="block text-d-cap text-muted">{list.length ? t('ch.wa.templatesCount', { set, missing: missing.size }) : t('ch.wa.noNumber')}</span>
      </span>
      <ChevronRight size={16} aria-hidden className="text-muted" />
    </Link>
  )
}

function Builder({ editor }) {
  const { t } = useI18n()
  const toast = useToast()
  const [lang, setLang] = useState('en')
  const { journey, journeyQuery, typesQuery, types, nodes, startKey, selectedNode } = editor
  const order = useMemo(() => runOrder(nodes, startKey, types), [nodes, startKey, types])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  if (journeyQuery.isLoading || typesQuery.isLoading) return <Skeleton className="h-[520px] w-full" />
  if (journeyQuery.isError || typesQuery.isError) {
    return <ErrorState framed title={t('ch.builder.loadFailed')} message={(journeyQuery.error || typesQuery.error)?.message} onRetry={() => { journeyQuery.refetch(); typesQuery.refetch() }} />
  }
  if (!journey) return null

  const hasNext = (node) => portsOf(node, types).some((p) => p.id === 'next')

  // A new block goes after the chosen one and takes over where that one went.
  const insertAfter = (type, afterKey) => {
    const created = newNode(type, nodes, types)
    const after = nodes.find((n) => n.key === afterKey)
    let list = nodes
    if (after && hasNext(after)) {
      created.next = after.next || ''
      list = nodes.map((n) => (n.key === afterKey ? { ...n, next: created.key } : n))
    } else if (after) {
      toast.show({ title: t('ch.wa.notLinked'), body: t('ch.wa.notLinkedBody'), tone: 'info' })
    }
    editor.setNodes([...list, created])
    if (!startKey) editor.setStartKey(created.key)
    editor.setSelected(created.key)
  }

  const onDragEnd = ({ active, over }) => {
    if (!over) return
    const id = String(active.id)
    if (id.startsWith('new:')) return insertAfter(id.slice(4), String(over.id))
    if (active.id === over.id) return
    const keys = order.map((n) => n.key)
    const reordered = arrayMove(keys, keys.indexOf(id), keys.indexOf(String(over.id)))
    const at = reordered.indexOf(id)
    const before = at === 0 ? '' : reordered[at - 1]
    const prev = before ? nodes.find((n) => n.key === before) : null
    if (prev && !hasNext(prev)) {
      toast.show({ title: t('ch.wa.cannotMove'), body: t('ch.wa.cannotMoveBody'), tone: 'info' })
      return
    }
    const moved = moveAfter(nodes, id, before, startKey)
    editor.setNodes(moved.nodes)
    editor.setStartKey(moved.startKey)
  }

  const errors = (editor.problems ?? []).filter((p) => p.level === 'error')
  const palette = Object.values(types)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px] min-w-0">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-text">{journey.name}</h2>
            <JourneyStatusTag journey={journey} dirty={editor.dirty} />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {editor.dirty && <span className="text-xs text-warning" aria-live="polite">{t('ch.builder.unsaved')}</span>}
              <Button variant="ghost" size="sm" icon={<ClipboardCheck size={14} />} loading={editor.checking} onClick={editor.check}>{t('ch.builder.check')}</Button>
              <Button variant="secondary" size="sm" icon={<Save size={14} />} loading={editor.saving} disabled={!editor.dirty} onClick={() => editor.save()}>{t('common.save')}</Button>
            </div>
          </div>
          {editor.problems && (
            <p role="status" className={cn('flex items-center gap-2 rounded-control px-3 py-2 text-sm', errors.length ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
              {errors.length ? <AlertCircle size={15} aria-hidden /> : <CheckCircle2 size={15} aria-hidden />}
              {errors.length ? t('ch.builder.fixBefore', { count: errors.length }) : t('ch.builder.noErrors')}
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
            <section aria-label={t('ch.wa.blocks')}>
              <p className="text-d-cap text-muted mb-1.5">{t('ch.wa.blocks')}</p>
              <ul className="space-y-1.5">
                {palette.map((spec) => <PaletteBlock key={spec.type} spec={spec} onAdd={(type) => insertAfter(type, editor.selected || order[order.length - 1]?.key)} />)}
              </ul>
              <p className="mt-2 text-d-cap text-muted">{t('ch.wa.paletteHint')}</p>
            </section>
            <div className="rounded-card bg-surface2 p-3 min-h-[320px]" role="region" aria-label={t('ch.wa.flow')}>
              {order.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">{t('ch.wa.emptyFlow')}</p>
              ) : (
                <SortableContext items={order.map((n) => n.key)} strategy={verticalListSortingStrategy}>
                  <ol className="space-y-2.5">
                    {order.map((node) => (
                      <Block key={node.key} node={node} types={types} lang={lang} selected={editor.selected === node.key} problems={editor.problemsByNode[node.key]} onSelect={() => editor.setSelected(node.key)} />
                    ))}
                  </ol>
                </SortableContext>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-3 self-start">
          <div className="rounded-card border border-border bg-surface p-3.5 2xl:p-[22px]">
            {selectedNode ? (
              <StepPanel key={selectedNode.key} node={selectedNode} nodes={nodes} types={types} channel="whatsapp" lang={lang} onLang={setLang}
                isStart={selectedNode.key === startKey} problems={editor.problemsByNode[selectedNode.key]} onChange={editor.updateNode}
                onSetStart={() => editor.setStartKey(selectedNode.key)} onDelete={() => editor.removeNode(selectedNode)} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">{t('ch.wa.pickBlock')}</p>
            )}
          </div>
          <Preview order={order} selectedKey={editor.selected} types={types} lang={lang} />
          <TemplatesCard />
        </div>
      </div>
    </DndContext>
  )
}

export default function WhatsAppFlows() {
  const { id } = useParams()
  const { t } = useI18n()
  const wide = useWide()
  const editor = useJourneyEditor(id)
  const { data } = useJourneys({ channel: 'whatsapp' })
  const first = useMemo(() => (data ?? []).find((j) => j.channel === 'whatsapp' || j.channel === 'both'), [data])

  if (!id && wide && first) return <Navigate to={`/channels/whatsapp/${first.id}`} replace />

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('ch.wa.crumb')}</span>}
        title={t('ch.wa.title')}
        subtitle={t('ch.wa.subtitle')}
        actions={id && editor.journey ? (
          <>
            <Link to="/channels/connections/whatsapp" className={buttonClasses({ variant: 'link' })}>{t('ch.wa.templates')}</Link>
            <Link to={`/channels/try?journey=${id}&look=whatsapp`} className={buttonClasses({ variant: 'link' })}>{t('ch.ussd.openSimulator')}</Link>
            <Button loading={editor.publishing} onClick={editor.publish}>{t('ch.builder.publish')}</Button>
          </>
        ) : null}
      />
      {id && !wide && (
        <Link to="/channels/whatsapp" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft size={14} aria-hidden />{t('ch.wa.allFlows')}</Link>
      )}
      <div className={cn('grid gap-4', wide && 'lg:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[224px_minmax(0,1fr)]')}>
        {(wide || !id) && <JourneyList channel="whatsapp" activeId={id} basePath="/channels/whatsapp" />}
        {id ? <Builder editor={editor} /> : wide ? <EmptyState framed title={t('ch.wa.emptyTitle')} message={t('ch.journeys.emptyBody')} /> : null}
      </div>
    </div>
  )
}

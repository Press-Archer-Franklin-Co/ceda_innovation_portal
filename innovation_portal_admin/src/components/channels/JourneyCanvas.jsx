import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Maximize2, Minus, Plus, Play, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useT } from '../../i18n/context'
import { NODE_ICONS, NODE_TONES, NODE_WIDTH, connect, inPoint, nodeHeight, portPoint, portsOf } from './journeyModel'

// Dot grid from the border token, so it follows light and dark mode.
const DOTS = { backgroundImage: 'radial-gradient(rgb(var(--c-border)) 1px, transparent 1px)', backgroundSize: '20px 20px' }

const MIN_SCALE = 0.4
const MAX_SCALE = 1.6
const READABLE_SCALE = 0.85

const toneBar = {
  blue: 'bg-info',
  neutral: 'bg-muted',
  orange: 'bg-accent',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-primary',
  dark: 'bg-banner-deep',
}

function edgePath(from, to) {
  const dx = Math.max(40, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

/**
 * The journey canvas. Steps are positioned in canvas units; the view (pan and zoom) is a
 * transform on the layer that holds them. Drag a step's header to move it, drag from a
 * port (the dot on the right) onto another step to join them, drag the background to pan.
 */
const JourneyCanvas = forwardRef(function JourneyCanvas(
  { nodes, startKey, selectedKey, activeKey, problems = {}, onSelect, onChange, className },
  ref,
) {
  const t = useT()
  const frameRef = useRef(null)
  const [view, setView] = useState({ x: 24, y: 24, scale: 0.85 })
  const [linking, setLinking] = useState(null) // { from: key, port: id, point: {x,y} }
  const drag = useRef(null)
  const { setNodeRef, isOver } = useDroppable({ id: 'journey-canvas' })

  const byKey = useMemo(() => Object.fromEntries(nodes.map((n) => [n.key, n])), [nodes])

  const toCanvas = useCallback((clientX, clientY) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale }
  }, [view])

  // readable: open at a zoom where step text can be read, from the top-left step,
  // instead of shrinking a wide journey until nothing is legible. Fit shows it all.
  const fit = useCallback(({ readable = false } = {}) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect || nodes.length === 0) return
    const xs = nodes.map((n) => n.position?.x ?? 0)
    const ys = nodes.map((n) => n.position?.y ?? 0)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs) + NODE_WIDTH
    const maxY = Math.max(...nodes.map((n) => (n.position?.y ?? 0) + nodeHeight(n, t)))
    const fitted = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((rect.width - 48) / (maxX - minX), (rect.height - 48) / (maxY - minY))))
    const scale = readable ? Math.max(fitted, READABLE_SCALE) : fitted
    setView({ scale, x: 24 - minX * scale, y: 24 - minY * scale })
  }, [nodes, t])

  useImperativeHandle(ref, () => ({ toCanvas, fit }), [toCanvas, fit])

  const zoom = (factor) => {
    const rect = frameRef.current?.getBoundingClientRect()
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
      const cx = (rect?.width ?? 0) / 2
      const cy = (rect?.height ?? 0) / 2
      return { scale, x: cx - ((cx - v.x) / v.scale) * scale, y: cy - ((cy - v.y) / v.scale) * scale }
    })
  }

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    zoom(e.deltaY < 0 ? 1.1 : 0.9)
  }

  // Background: pan.
  const onFramePointerDown = (e) => {
    if (e.target !== e.currentTarget && !e.target.dataset?.canvasBg) return
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: view }
    e.currentTarget.setPointerCapture(e.pointerId)
    onSelect?.(null)
  }

  // Step header: move.
  const onNodePointerDown = (e, node) => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect?.(node.key)
    drag.current = { kind: 'node', key: node.key, startX: e.clientX, startY: e.clientY, origin: node.position ?? { x: 0, y: 0 }, moved: false }
    frameRef.current?.setPointerCapture(e.pointerId)
  }

  // Port: start a link.
  const onPortPointerDown = (e, node, port) => {
    e.stopPropagation()
    e.preventDefault()
    setLinking({ from: node.key, port: port.id, point: toCanvas(e.clientX, e.clientY) })
    drag.current = { kind: 'link' }
    frameRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setView({ ...d.origin, x: d.origin.x + e.clientX - d.startX, y: d.origin.y + e.clientY - d.startY })
    } else if (d.kind === 'node') {
      const dx = (e.clientX - d.startX) / view.scale
      const dy = (e.clientY - d.startY) / view.scale
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
      if (d.moved) {
        const position = { x: Math.round(d.origin.x + dx), y: Math.round(d.origin.y + dy) }
        onChange?.(nodes.map((n) => (n.key === d.key ? { ...n, position } : n)), { kind: 'move' })
      }
    } else if (d.kind === 'link') {
      setLinking((l) => (l ? { ...l, point: toCanvas(e.clientX, e.clientY) } : l))
    }
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'link' && linking) {
      const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.dataset?.nodeKey)
      const targetKey = target?.dataset.nodeKey
      if (targetKey && targetKey !== linking.from) {
        onChange?.(nodes.map((n) => (n.key === linking.from ? connect(n, linking.port, targetKey) : n)), { kind: 'link' })
      }
      setLinking(null)
    }
  }

  const edges = []
  nodes.forEach((node) => {
    portsOf(node, t).forEach((port, index) => {
      const target = byKey[port.target]
      if (!target) return
      edges.push({ id: `${node.key}:${port.id}`, d: edgePath(portPoint(node, index), inPoint(target)), active: activeKey === node.key })
    })
  })
  let linkPath = null
  if (linking) {
    const from = byKey[linking.from]
    const index = portsOf(from, t).findIndex((p) => p.id === linking.port)
    if (from && index >= 0) linkPath = edgePath(portPoint(from, index), linking.point)
  }

  const setRefs = (el) => {
    frameRef.current = el
    setNodeRef(el)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-card border border-border bg-surface2', isOver && 'ring-2 ring-primary', className)}>
      <div
        ref={setRefs}
        data-canvas-bg="1"
        role="application"
        aria-label={t('ch.canvas.label')}
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        style={DOTS}
        onPointerDown={onFramePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
          <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width="1" height="1" aria-hidden>
            <defs>
              <marker id="ch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted" />
              </marker>
              <marker id="ch-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
              </marker>
            </defs>
            {edges.map((edge) => (
              <path key={edge.id} d={edge.d} fill="none" strokeWidth={edge.active ? 2.5 : 1.75} className={edge.active ? 'stroke-primary' : 'stroke-muted'} markerEnd={`url(#${edge.active ? 'ch-arrow-active' : 'ch-arrow'})`} />
            ))}
            {linkPath && <path d={linkPath} fill="none" strokeWidth={2} strokeDasharray="6 4" className="stroke-primary" />}
          </svg>
          {nodes.map((node) => (
            <CanvasNode
              key={node.key}
              node={node}
              isStart={node.key === startKey}
              selected={node.key === selectedKey}
              active={node.key === activeKey}
              problems={problems[node.key]}
              onPointerDown={(e) => onNodePointerDown(e, node)}
              onPortPointerDown={(e, port) => onPortPointerDown(e, node, port)}
              onSelect={() => onSelect?.(node.key)}
            />
          ))}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-control border border-border bg-surface p-1 shadow-sm">
        <button type="button" className="h-7 w-7 grid place-items-center rounded-control hover:bg-surface2" onClick={() => zoom(0.85)} aria-label={t('ch.canvas.zoomOut')}><Minus size={14} aria-hidden /></button>
        <span className="w-10 text-center text-xs text-muted tabular-nums" aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <button type="button" className="h-7 w-7 grid place-items-center rounded-control hover:bg-surface2" onClick={() => zoom(1.15)} aria-label={t('ch.canvas.zoomIn')}><Plus size={14} aria-hidden /></button>
        <button type="button" className="h-7 px-2 flex items-center gap-1 rounded-control text-xs hover:bg-surface2" onClick={() => fit()}><Maximize2 size={13} aria-hidden />{t('ch.canvas.fit')}</button>
      </div>
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">{t('ch.canvas.empty')}</div>
      )}
    </div>
  )
})

export default JourneyCanvas

function CanvasNode({ node, isStart, selected, active, problems, onPointerDown, onPortPointerDown, onSelect }) {
  const t = useT()
  const Icon = NODE_ICONS[node.type] ?? Play
  const ports = portsOf(node, t)
  const errors = problems?.filter((p) => p.level === 'error') ?? []
  const warnings = problems?.filter((p) => p.level === 'warning') ?? []
  const preview = node.text?.en || ''
  return (
    <div
      data-node-key={node.key}
      className={cn(
        'absolute rounded-card border bg-surface shadow-sm select-none',
        selected ? 'border-primary ring-2 ring-primary/30' : errors.length ? 'border-danger' : warnings.length ? 'border-warning' : 'border-border',
        active && 'ring-4 ring-accent/50',
      )}
      style={{ left: node.position?.x ?? 0, top: node.position?.y ?? 0, width: NODE_WIDTH, minHeight: nodeHeight(node, t) }}
    >
      <div className={cn('h-1 rounded-t-card', toneBar[NODE_TONES[node.type]] ?? 'bg-muted')} aria-hidden />
      <button
        type="button"
        data-node-key={node.key}
        onPointerDown={onPointerDown}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
        className="w-full flex items-center gap-1.5 px-2.5 h-[26px] text-left cursor-move focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-control"
        aria-pressed={selected}
        aria-label={t('ch.canvas.stepLabel', { title: node.title || t(`ch.type.${node.type}`), type: t(`ch.type.${node.type}`) })}
      >
        <Icon size={13} aria-hidden className="text-muted shrink-0" />
        <span className="text-[12px] font-bold text-text truncate">{node.title || t(`ch.type.${node.type}`)}</span>
        {isStart && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-primary">{t('ch.canvas.start')}</span>}
        {!isStart && errors.length > 0 && <AlertCircle size={13} className="ml-auto text-danger" aria-label={t('ch.canvas.problems', { count: errors.length })} />}
        {!isStart && !errors.length && warnings.length > 0 && <AlertTriangle size={13} className="ml-auto text-warning" aria-label={t('ch.canvas.warnings', { count: warnings.length })} />}
      </button>
      <p data-node-key={node.key} className="px-2.5 h-[38px] text-[11px] leading-snug text-muted line-clamp-2 overflow-hidden">{preview || t('ch.canvas.noText')}</p>
      <ul className="pb-1" data-node-key={node.key}>
        {ports.length === 0 && <li className="h-[22px] px-2.5 text-[11px] text-muted italic" data-node-key={node.key}>{t('ch.canvas.ends')}</li>}
        {ports.map((port) => (
          <li key={port.id} className="relative h-[22px] flex items-center pl-2.5 pr-4 text-[11px] text-text" data-node-key={node.key}>
            <span className="truncate">{port.label}</span>
            <button
              type="button"
              aria-label={t('ch.canvas.dragToLink', { port: port.label })}
              onPointerDown={(e) => onPortPointerDown(e, port)}
              className={cn('absolute -right-[7px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-surface cursor-crosshair', port.target ? 'bg-primary' : 'bg-muted')}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

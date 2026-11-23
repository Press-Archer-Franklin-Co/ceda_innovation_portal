// Turns a journey (the same steps the engine runs) into the flow diagram: a Start node, one node per step,
// an End node for each way a path finishes, and one labelled line per branch. Pure, so it is easy to test.
// It never changes the steps: positions come from an automatic top-to-bottom layout and are not saved.
import dagre from '@dagrejs/dagre'
import { pick, portsOf } from './journeyModel'

export const START_ID = '__start'
const NODE_W = 240
const STEP_H = 92
const SMALL_H = 40

// Types whose path ends at the step itself (the engine finishes there).
const ENDS_HERE = new Set(['end', 'handoff'])
// Types the engine refuses to publish without a "next" (nodes.py check_graph).
const NEEDS_NEXT = new Set(['question', 'save_draft', 'lookup', 'subscribe', 'language', 'file', 'form_questions'])

/** Where each port really goes: a menu option with no target falls back to the menu's own next, as the engine does. */
function routes(node, types) {
  const ports = portsOf(node, types)
  return ports.map((port) => ({ ...port, target: port.target || (port.number && node.next ? node.next : '') }))
}

/** Branch label shown on the line: "1 · Submit an idea" for options; a short word for named ports. */
export function branchLabel(node, port, lang, words) {
  if (port.number) return `${port.number} · ${pick(port.label, lang) || '…'}`
  const named = words?.[port.id]
  if (named) return named
  if (port.id === 'next') {
    if (node.type === 'my_ideas') return words?.main_menu ?? ''
    if (node.type === 'question' && node.settings?.answer_type === 'choice') return words?.any_answer ?? ''
    return ''
  }
  return pick(port.label, lang)
}

function endLabelFor(node, port, words) {
  if (node.type === 'handoff') return words?.end_handover ?? 'Talks to a person'
  if (node.type === 'submit') return port.id === 'error_next' ? (words?.end_not_sent ?? 'Ends, not sent') : (words?.end_sent ?? 'Ends, idea sent')
  return words?.end ?? 'Ends'
}

/** Steps nothing reaches from the start. */
export function unreachable(nodes, startKey, types) {
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]))
  const seen = new Set()
  const stack = startKey && byKey[startKey] ? [startKey] : []
  while (stack.length) {
    const key = stack.pop()
    if (seen.has(key) || !byKey[key]) continue
    seen.add(key)
    for (const port of routes(byKey[key], types)) if (port.target) stack.push(port.target)
  }
  return nodes.filter((n) => !seen.has(n.key)).map((n) => n.key)
}

/**
 * Problems the diagram can see at once (the server's Check flow finds the rest):
 * a branch that leads nowhere, a question or menu with no answers, a step nothing reaches.
 */
export function flowProblems(nodes, startKey, types, words) {
  const problems = []
  const keys = new Set(nodes.map((n) => n.key))
  if (!startKey || !keys.has(startKey)) problems.push({ node: '', level: 'error', code: 'no_start', message: words?.no_start ?? 'Choose the first step.' })
  for (const node of nodes) {
    const settings = node.settings ?? {}
    if (node.type === 'menu') {
      const options = settings.options ?? []
      if (!options.length) problems.push({ node: node.key, level: 'error', code: 'no_options', message: words?.no_options ?? 'Add at least one answer.' })
      options.forEach((option, index) => {
        if (!option.next && !node.next) problems.push({ node: node.key, level: 'error', code: 'option_goes_nowhere', port: `options:${index}`, message: (words?.branch_nowhere ?? 'Answer {n} does not lead anywhere.').replace('{n}', index + 1) })
        else if (option.next && !keys.has(option.next)) problems.push({ node: node.key, level: 'error', code: 'broken_link', port: `options:${index}`, message: words?.broken ?? 'A branch points to a step that no longer exists.' })
      })
    }
    if (node.type === 'question' && settings.answer_type === 'choice' && !(settings.choices ?? []).length) {
      problems.push({ node: node.key, level: 'error', code: 'no_options', message: words?.no_choices ?? 'Add the answers people can choose.' })
    }
    if (NEEDS_NEXT.has(node.type) && !node.next) problems.push({ node: node.key, level: 'error', code: 'goes_nowhere', port: 'next', message: words?.goes_nowhere ?? 'Choose what happens next.' })
    if (node.type !== 'menu') {
      for (const port of portsOf(node, types)) {
        if (port.target && !keys.has(port.target)) problems.push({ node: node.key, level: 'error', code: 'broken_link', port: port.id, message: words?.broken ?? 'A branch points to a step that no longer exists.' })
      }
    }
  }
  if (startKey && keys.has(startKey)) {
    for (const key of unreachable(nodes, startKey, types)) problems.push({ node: key, level: 'error', code: 'unreachable', message: words?.unreachable ?? 'Nothing leads to this step.' })
  }
  return problems
}

/**
 * The diagram: { nodes, edges } in @xyflow/react's shape, laid out top to bottom.
 * node.data: { kind: start|step|end, step?, label, problems }; edge.data: { from, port, label, end? }.
 */
export function buildFlow(steps, startKey, types, { lang = 'en', words = {}, problems = [], layout = true } = {}) {
  const byKey = Object.fromEntries(steps.map((n) => [n.key, n]))
  const problemsByNode = {}
  for (const p of problems) if (p.node) (problemsByNode[p.node] = problemsByNode[p.node] ?? []).push(p)
  const nodes = [{ id: START_ID, type: 'start', data: { kind: 'start', label: words.start ?? 'Start' }, position: { x: 0, y: 0 } }]
  const edges = []
  if (startKey && byKey[startKey]) edges.push({ id: `${START_ID}|start`, source: START_ID, target: startKey, type: 'branch', data: { from: START_ID, port: 'start', label: '' } })

  for (const step of steps) {
    nodes.push({ id: step.key, type: 'step', data: { kind: 'step', step, problems: problemsByNode[step.key] ?? [], isStart: step.key === startKey }, position: { x: 0, y: 0 } })
    const ports = routes(step, types)
    for (const port of ports) {
      const label = branchLabel(step, port, lang, words)
      if (port.target && byKey[port.target]) {
        edges.push({ id: `${step.key}|${port.id}`, source: step.key, target: port.target, type: 'branch', data: { from: step.key, port: port.id, label } })
      } else if (!port.target) {
        // No step after it: the path ends here (the engine finishes the session).
        const endId = `__end:${step.key}|${port.id}`
        const nowhere = NEEDS_NEXT.has(step.type) && port.id === 'next'
        nodes.push({ id: endId, type: 'end', data: { kind: 'end', label: nowhere ? (words.nowhere ?? 'Leads nowhere') : endLabelFor(step, port, words), problem: nowhere }, position: { x: 0, y: 0 } })
        edges.push({ id: `${step.key}|${port.id}`, source: step.key, target: endId, type: 'branch', data: { from: step.key, port: port.id, label, end: true } })
      }
    }
    if (ENDS_HERE.has(step.type) || !ports.length) {
      const endId = `__end:${step.key}`
      nodes.push({ id: endId, type: 'end', data: { kind: 'end', label: endLabelFor(step, { id: '' }, words) }, position: { x: 0, y: 0 } })
      edges.push({ id: `${step.key}|end`, source: step.key, target: endId, type: 'branch', data: { from: step.key, port: '', label: '', end: true } })
    }
  }
  return layout ? layoutFlow({ nodes, edges }) : { nodes, edges }
}

export function layoutFlow({ nodes, edges }) {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: NODE_W, height: node.data.kind === 'step' ? STEP_H : SMALL_H })
  for (const edge of edges) graph.setEdge(edge.source, edge.target)
  dagre.layout(graph)
  return {
    nodes: nodes.map((node) => {
      const box = graph.node(node.id)
      const height = node.data.kind === 'step' ? STEP_H : SMALL_H
      return { ...node, position: { x: box.x - NODE_W / 2, y: box.y - height / 2 }, width: NODE_W }
    }),
    edges,
  }
}

/** What deleting a step leaves behind: the steps that nothing would reach any more. */
export function strandedBy(nodes, startKey, types, key) {
  const before = new Set(unreachable(nodes, startKey, types))
  const rest = nodes.filter((n) => n.key !== key).map((n) => ({
    ...n,
    next: n.next === key ? '' : n.next,
    settings: Object.fromEntries(Object.entries(n.settings ?? {}).map(([name, value]) => [name, value === key ? '' : Array.isArray(value) ? value.map((o) => (o && o.next === key ? { ...o, next: '' } : o)) : value])),
  }))
  return unreachable(rest, startKey === key ? '' : startKey, types).filter((k) => !before.has(k))
}

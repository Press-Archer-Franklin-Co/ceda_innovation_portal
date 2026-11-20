// Pure helpers for the journey builder: node sizes, ports, edges and new-node defaults.
// Kept apart from the components so they are easy to test.
import {
  ListOrdered, MessageSquare, HelpCircle, Save, Search, GitBranch, BellRing, Languages, Headset, CircleStop,
} from 'lucide-react'

export const NODE_WIDTH = 208
const HEADER = 30
const BODY = 38
const PORT_ROW = 22

export const NODE_ICONS = {
  menu: ListOrdered,
  message: MessageSquare,
  question: HelpCircle,
  save_draft: Save,
  lookup: Search,
  condition: GitBranch,
  subscribe: BellRing,
  language: Languages,
  handoff: Headset,
  end: CircleStop,
}

// Tone per step type, from the Tag tones (Option D tokens, no hand-typed colours).
export const NODE_TONES = {
  menu: 'blue',
  message: 'neutral',
  question: 'orange',
  save_draft: 'green',
  lookup: 'blue',
  condition: 'amber',
  subscribe: 'green',
  language: 'neutral',
  handoff: 'red',
  end: 'dark',
}

export const TYPE_ORDER = ['menu', 'message', 'question', 'save_draft', 'lookup', 'condition', 'subscribe', 'language', 'handoff', 'end']

/** Outgoing ports: [{ id, label, field }] where field says which setting the edge lives in. */
export function portsOf(node, t) {
  const settings = node.settings ?? {}
  switch (node.type) {
    case 'menu':
      return (settings.options ?? []).map((option, index) => ({
        id: `option:${index}`,
        label: `${index + 1}. ${option.label?.en || t('ch.node.untitledOption')}`,
        target: option.next || '',
      }))
    case 'condition':
      return [
        { id: 'true', label: t('ch.port.yes'), target: settings.true_next || '' },
        { id: 'false', label: t('ch.port.no'), target: settings.false_next || '' },
      ]
    case 'save_draft':
      return [
        { id: 'next', label: t('ch.port.next'), target: node.next || '' },
        { id: 'error', label: t('ch.port.ifFails'), target: settings.error_next || '' },
      ]
    case 'end':
    case 'handoff':
      return []
    case 'message':
      return settings.end ? [] : [{ id: 'next', label: t('ch.port.next'), target: node.next || '' }]
    default:
      return [{ id: 'next', label: t('ch.port.next'), target: node.next || '' }]
  }
}

export function nodeHeight(node, t) {
  return HEADER + BODY + Math.max(1, portsOf(node, t).length) * PORT_ROW
}

/** Where a port sits, in canvas coordinates. */
export function portPoint(node, portIndex) {
  const x = (node.position?.x ?? 0) + NODE_WIDTH
  const y = (node.position?.y ?? 0) + HEADER + BODY + portIndex * PORT_ROW + PORT_ROW / 2
  return { x, y }
}

export function inPoint(node) {
  return { x: node.position?.x ?? 0, y: (node.position?.y ?? 0) + HEADER / 2 }
}

/** Point a port at another node (or '' to unlink). Returns a new node. */
export function connect(node, portId, targetKey) {
  const settings = { ...(node.settings ?? {}) }
  if (portId.startsWith('option:')) {
    const index = Number(portId.split(':')[1])
    const options = [...(settings.options ?? [])]
    options[index] = { ...options[index], next: targetKey }
    return { ...node, settings: { ...settings, options } }
  }
  if (portId === 'true') return { ...node, settings: { ...settings, true_next: targetKey } }
  if (portId === 'false') return { ...node, settings: { ...settings, false_next: targetKey } }
  if (portId === 'error') return { ...node, settings: { ...settings, error_next: targetKey } }
  return { ...node, next: targetKey }
}

/** Remove every edge pointing at `key` (used when a step is deleted). */
export function unlinkTarget(node, key, t) {
  let result = node
  portsOf(node, t).forEach((port) => {
    if (port.target === key) result = connect(result, port.id, '')
  })
  return result
}

export function newKey(type, nodes) {
  const used = new Set(nodes.map((n) => n.key))
  let i = 1
  while (used.has(`${type.replace('_', '-')}-${i}`)) i += 1
  return `${type.replace('_', '-')}-${i}`
}

export function newNode(type, nodes, position) {
  const base = { key: newKey(type, nodes), type, title: '', text: {}, settings: {}, next: '', position }
  switch (type) {
    case 'menu':
      return { ...base, settings: { options: [{ label: { en: '', tn: '' }, next: '' }] } }
    case 'question':
      return { ...base, settings: { answer_type: 'text', variable: '', max_length: 160 } }
    case 'condition':
      return { ...base, settings: { check: 'registered', true_next: '', false_next: '' } }
    case 'lookup':
      return { ...base, settings: { lookup: 'open_challenges' } }
    case 'save_draft':
      return { ...base, settings: { program_id: null, title_variable: 'title', name_variable: 'name', fields: {}, create_account: true } }
    case 'subscribe':
      return { ...base, settings: { topics: ['challenges'] } }
    default:
      return base
  }
}

/** The text a USSD screen of this node shows in one language (for the character counter). */
export function ussdScreenText(node, lang) {
  const pick = (value) => (value?.[lang] || value?.en || '')
  const settings = node.settings ?? {}
  const lines = [pick(node.text)]
  let choices = []
  if (node.type === 'menu') choices = (settings.options ?? []).map((o) => pick(o.label))
  if (node.type === 'question' && settings.answer_type === 'choice') choices = (settings.choices ?? []).map((o) => pick(o.label))
  if (node.type === 'question' && settings.answer_type === 'yes_no') choices = lang === 'tn' ? ['Ee', 'Nnyaa'] : ['Yes', 'No']  // same words the API engine shows
  choices.forEach((c, i) => lines.push(`${i + 1}. ${c}`))
  return lines.filter(Boolean).join('\n')
}

export const USSD_LIMIT = 182

/** Strip builder-only fields before saving. */
export function toPayload(nodes) {
  return nodes.map(({ key, type, title, text, settings, next, position }) => ({ key, type, title: title ?? '', text: text ?? {}, settings: settings ?? {}, next: next ?? '', position }))
}

export function fromJourney(journey) {
  return (journey?.nodes ?? []).map((n) => ({ ...n, next: n.next ?? '', position: n.position?.x !== undefined ? n.position : { x: 40, y: 40 } }))
}

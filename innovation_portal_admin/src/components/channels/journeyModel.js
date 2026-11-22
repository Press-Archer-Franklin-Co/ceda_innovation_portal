// Pure helpers for the USSD and WhatsApp builders. Everything about a step type (its ports,
// defaults and settings) comes from GET /api/channels/node-types/, so a type the API adds later
// works here without code changes. `types` is that list turned into a map by typeMap().

export const USSD_LIMIT = 160 // Figma 3.31; the API refuses longer screens when publishing

export function typeMap(list) {
  return Object.fromEntries((list ?? []).map((item) => [item.type, item]))
}

export function pick(value, lang) {
  if (!value || typeof value !== 'object') return value ?? ''
  return value[lang] || value.en || ''
}

/** Outgoing ports: [{ id, label: {en, tn}, target }]. Menu options give one port each. */
export function portsOf(node, types) {
  const spec = types?.[node.type]
  const settings = node.settings ?? {}
  const ports = []
  for (const field of spec?.fields ?? []) {
    if (field.kind === 'options') {
      ;(settings[field.name] ?? []).forEach((option, index) => {
        ports.push({ id: `${field.name}:${index}`, label: option.label ?? {}, number: index + 1, target: option.next || '' })
      })
    } else if (field.kind === 'node') {
      ports.push({ id: field.name, label: { en: field.label, tn: field.label_tn }, target: settings[field.name] || '' })
    }
  }
  const ends = spec?.ends_when && settings[spec.ends_when]
  if (spec?.next && !ends) ports.push({ id: 'next', label: { en: 'Then', tn: 'Morago' }, target: node.next || '' })
  return ports
}

/** Point a port at another step ('' unlinks). Returns a new node. */
export function connect(node, portId, targetKey) {
  if (portId === 'next') return { ...node, next: targetKey }
  const settings = { ...(node.settings ?? {}) }
  const [field, index] = portId.split(':')
  if (index !== undefined) {
    const options = [...(settings[field] ?? [])]
    options[Number(index)] = { ...options[Number(index)], next: targetKey }
    return { ...node, settings: { ...settings, [field]: options } }
  }
  return { ...node, settings: { ...settings, [field]: targetKey } }
}

/** Remove every arrow to a deleted step. */
export function unlinkTarget(node, key, types) {
  let result = node
  for (const port of portsOf(node, types)) if (port.target === key) result = connect(result, port.id, '')
  return result
}

export function newKey(type, nodes) {
  const base = type.replace(/_/g, '-')
  const used = new Set(nodes.map((n) => n.key))
  let i = 1
  while (used.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export function defaultsFor(type, types) {
  const out = {}
  for (const field of types?.[type]?.fields ?? []) {
    if ('default' in field) out[field.name] = structuredClone(field.default)
  }
  return out
}

export function newNode(type, nodes, types) {
  return { key: newKey(type, nodes), type, title: '', text: {}, settings: defaultsFor(type, types), next: '', position: {} }
}

/** Steps in the order the journey runs: from the start, following ports depth first. */
export function runOrder(nodes, startKey, types) {
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]))
  const order = []
  const seen = new Set()
  const visit = (key) => {
    if (!key || seen.has(key) || !byKey[key]) return
    seen.add(key)
    order.push(byKey[key])
    for (const port of portsOf(byKey[key], types)) visit(port.target)
  }
  visit(startKey)
  for (const node of nodes) if (!seen.has(node.key)) order.push(node) // steps nobody reaches stay visible
  return order
}

/** The text a USSD screen of this step shows in one language (for the character count). */
export function ussdScreenText(node, lang, types) {
  const settings = node.settings ?? {}
  const lines = [pick(node.text, lang)]
  for (const field of types?.[node.type]?.fields ?? []) {
    if (field.kind === 'options') (settings[field.name] ?? []).forEach((o, i) => lines.push(`${i + 1}. ${pick(o.label, lang)}`))
    if (field.kind === 'choices' && settings.answer_type === 'choice') (settings[field.name] ?? []).forEach((o, i) => lines.push(`${i + 1}. ${pick(o.label, lang)}`))
  }
  if (node.type === 'question' && settings.answer_type === 'yes_no') lines.push(...(lang === 'tn' ? ['1. Ee', '2. Nnyaa'] : ['1. Yes', '2. No']))
  return lines.filter(Boolean).join('\n')
}

/** Answer names the journey saves, for the "comes from" pickers. */
export function variablesOf(nodes, types) {
  const names = new Set(['draft_reference'])
  for (const node of nodes) {
    for (const field of types?.[node.type]?.fields ?? []) {
      if (field.kind === 'variable' && node.settings?.[field.name]) names.add(node.settings[field.name])
    }
  }
  return [...names]
}

/** WhatsApp list: move a step so it runs after `afterKey` ('' = first). Keeps every other arrow. */
export function moveAfter(nodes, key, afterKey, startKey) {
  if (key === afterKey) return { nodes, startKey }
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, { ...n }]))
  const moving = byKey[key]
  if (!moving) return { nodes, startKey }
  // Take it out of the chain: whoever went to it now goes where it went.
  let start = startKey
  for (const n of Object.values(byKey)) if (n.next === key) n.next = moving.next || ''
  if (start === key) start = moving.next || ''
  // Put it back after afterKey (or at the start).
  if (!afterKey) {
    moving.next = start
    start = key
  } else {
    const after = byKey[afterKey]
    moving.next = after.next || ''
    after.next = key
  }
  return { nodes: nodes.map((n) => byKey[n.key]), startKey: start }
}

export function toPayload(nodes) {
  return nodes.map(({ key, type, title, text, settings, next, position }) => ({ key, type, title: title ?? '', text: text ?? {}, settings: settings ?? {}, next: next ?? '', position: position ?? {} }))
}

export function fromJourney(journey) {
  return (journey?.nodes ?? []).map((n) => ({ ...n, next: n.next ?? '', settings: n.settings ?? {}, text: n.text ?? {} }))
}

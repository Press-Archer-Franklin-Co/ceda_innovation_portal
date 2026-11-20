// 3.8 Home page editor: pure helpers for the list of sections (B6 GET/PUT /api/content/pages/home/draft/).
// A section is { id?, type, enabled, settings }. In the editor each one also carries a local `_key`
// so it can be told apart before the API gives it an id.

const LANGS = ['en', 'tn']
let counter = 0
const nextKey = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`

/** Sections from the API, each given a local key. */
export function fromDraft(sections = []) {
  return sections.map((s) => ({ ...s, _key: s.id ? String(s.id) : nextKey() }))
}

/** What PUT /draft/ takes: the sections in order without local keys. */
export function toPayload(sections) {
  return sections.map(({ _key, ...rest }) => (rest.id ? rest : { type: rest.type, enabled: rest.enabled, settings: rest.settings }))
}

/** Copy ids the API gave new sections onto the local list, matching by the keys that were sent. */
export function adoptIds(local, sentKeys, saved = []) {
  const ids = new Map(sentKeys.map((key, i) => [key, saved[i]?.id]))
  return local.map((s) => (!s.id && ids.get(s._key) ? { ...s, id: String(ids.get(s._key)) } : s))
}

export const typeSpec = (types, type) => types?.find((t) => t.type === type) ?? null
export const isFixed = (types, section) => !!typeSpec(types, section.type)?.fixed_first

/** Move a section; a fixed-first section (the banner) never moves and nothing can go above it. */
export function moveSection(sections, types, fromKey, toKey) {
  const from = sections.findIndex((s) => s._key === fromKey)
  const to = sections.findIndex((s) => s._key === toKey)
  if (from < 0 || to < 0 || from === to) return sections
  if (isFixed(types, sections[from]) || isFixed(types, sections[to])) return sections
  const next = sections.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function toggleSection(sections, types, key, enabled) {
  return sections.map((s) => {
    if (s._key !== key) return s
    if (typeSpec(types, s.type)?.can_disable === false) return s
    return { ...s, enabled }
  })
}

/** Add a section of `type` at the end with the type's default settings. Returns [sections, newKey]. */
export function addSection(sections, types, type) {
  const spec = typeSpec(types, type)
  if (!spec || spec.fixed_first) return [sections, null]
  const section = { type, enabled: true, settings: structuredClone(spec.default_settings ?? {}), _key: nextKey() }
  return [[...sections, section], section._key]
}

export function removeSection(sections, types, key) {
  return sections.filter((s) => s._key !== key || isFixed(types, s))
}

export function setSetting(sections, key, name, value) {
  return sections.map((s) => (s._key === key ? { ...s, settings: { ...s.settings, [name]: value } } : s))
}

/** Same rule as the API's localize(): every {en, tn} text becomes a string, English when the other is empty. */
export function localize(value, lang) {
  if (Array.isArray(value)) return value.map((v) => localize(v, lang))
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length && keys.every((k) => LANGS.includes(k)) && keys.every((k) => typeof value[k] === 'string')) {
      const text = value[lang] ?? ''
      return text.trim() ? text : value.en ?? ''
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, lang)]))
  }
  return value
}

/** Texts in a section's settings that have English but no Setswana, as setting names. */
export function missingSetswana(settings, schema) {
  const missing = []
  const visit = (value, spec, name) => {
    if (!spec || value == null) return
    if (spec.kind === 'text' && value.en?.trim() && !value.tn?.trim()) missing.push(name)
    if (spec.kind === 'button' && value.label?.en?.trim() && !value.label?.tn?.trim()) missing.push(name)
    if (spec.kind === 'list' && Array.isArray(value)) value.forEach((item) => Object.entries(spec.item ?? {}).forEach(([k, s]) => visit(item?.[k], s, name)))
  }
  Object.entries(schema ?? {}).forEach(([name, spec]) => visit(settings?.[name], spec, name))
  return [...new Set(missing)]
}

// Highlighted words: the API keeps them as one comma-separated string (the public banner splits it).
export const highlightList = (words = '') => words.split(',').map((w) => w.trim()).filter(Boolean)

export function addHighlight(words, phrase) {
  const clean = phrase.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return words
  const list = highlightList(words)
  if (list.some((w) => w.toLowerCase() === clean.toLowerCase())) return list.join(', ')
  return [...list, clean].join(', ')
}

export function removeHighlight(words, phrase) {
  return highlightList(words).filter((w) => w.toLowerCase() !== phrase.toLowerCase()).join(', ')
}

/** Split the API's [{path, message}] errors by section index: { 2: [{name, path, message}], ..., page: [...] }. */
export function errorsBySection(errors = []) {
  const out = {}
  for (const e of errors) {
    const m = /^sections\[(\d+)\](?:\.settings\.([^.[]+))?/.exec(e.path ?? '')
    const bucket = m ? m[1] : 'page'
    ;(out[bucket] ??= []).push({ name: m?.[2] ?? null, path: e.path, message: e.message })
  }
  return out
}

/** The latest approved home page request, for "Last published ... by ...". */
export function lastPublished(approvals = []) {
  return approvals
    .filter((a) => a.target_type === 'page' && a.status === 'approved' && a.decided_at)
    .sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1))[0] ?? null
}

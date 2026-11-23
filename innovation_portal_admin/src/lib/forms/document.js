// Pure operations on the B4 form document (apps/programs/form_schema.py), used by
// the drag-and-drop builder (3.5). Every function returns a new document and never
// changes the one it was given, so undo/redo is a list of snapshots.
//
// Document: { id, name: {en, tn}, description, languages, steps: [STEP], loose_fields }
// STEP:     { id?, code, title: {en, tn}, description, tips: [{en, tn}], is_active, rows: [{ row, fields: [FIELD] }] }
// FIELD:    { id?, key, type, label: {en, tn}, help_text, placeholder, required, width,
//             is_challenge_question, is_active, options: [{ value, label, description }], rules,
//             visible_if, required_if, enabled_if }

/** Width units out of 4 per row. */
export const WIDTH_UNITS = { quarter: 1, half: 2, three_quarter: 3, full: 4 }
export const WIDTHS = ['quarter', 'half', 'three_quarter', 'full']
const ROW_UNITS = 4
export const MAX_PER_ROW = 4

/** Palette groups and their element types (Figma 3.5 "Elements"). */
export const PALETTE = [
  { group: 'basic', types: ['text', 'textarea', 'number', 'date'] },
  { group: 'choices', types: ['select', 'radio', 'checkboxes', 'yes_no'] },
  { group: 'people', types: ['phone', 'email', 'district', 'omang_id'] },
  { group: 'files', types: ['file', 'media'] },
  { group: 'layout', types: ['heading', 'paragraph'] },
]

export const CHOICE_TYPES = new Set(['select', 'radio', 'checkboxes', 'multiselect'])
export const LAYOUT_TYPES = new Set(['heading', 'paragraph'])

const empty = () => ({ en: '', tn: '' })

/** "Company registration number" -> "company_registration_number". */
export function slugKey(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export function allFields(doc) {
  return [...doc.steps.flatMap((step) => step.rows.flatMap((row) => row.fields)), ...(doc.loose_fields ?? [])]
}

/** A key no other field uses, based on `base`. */
export function uniqueKey(doc, base) {
  const taken = new Set(allFields(doc).map((f) => f.key))
  const root = slugKey(base) || 'question'
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}_${n}`)) n += 1
  return `${root}_${n}`
}

/**
 * Prompt 37: "Profile field". Empty fills the people types by themselves (below); "none" never fills.
 * Same list as the API (apps/programs/profile_prefill.py).
 */
export const PROFILE_FIELDS = ['first_name', 'last_name', 'full_name', 'phone', 'email', 'district', 'organisation', 'gender', 'age_group', 'omang']
export const PROFILE_TYPE_DEFAULTS = { phone: 'phone', email: 'email', district: 'district', omang_id: 'omang' }
export const PROFILE_NONE = 'none'

/** A new field of `type`, with a working default (two options for choices). */
export function newField(doc, type, label = { en: '', tn: '' }) {
  const field = {
    key: uniqueKey(doc, label.en || type),
    type,
    label: { ...empty(), ...label },
    help_text: empty(),
    placeholder: empty(),
    required: false,
    width: 'full',
    is_challenge_question: false,
    profile_field: '',
    is_active: true,
    options: [],
    rules: [],
    visible_if: {},
    required_if: {},
    enabled_if: {},
  }
  if (CHOICE_TYPES.has(type)) {
    field.options = [
      { value: 'option_1', label: { en: 'Option 1', tn: '' }, description: empty() },
      { value: 'option_2', label: { en: 'Option 2', tn: '' }, description: empty() },
    ]
  }
  return field
}

function units(fields) {
  return fields.reduce((sum, f) => sum + (WIDTH_UNITS[f.width] ?? ROW_UNITS), 0)
}

/** Widths that share a row evenly: 1 full, 2 halves, 3 quarter-quarter-half, 4 quarters. */
function evenWidths(count) {
  if (count <= 1) return ['full']
  if (count === 2) return ['half', 'half']
  if (count === 3) return ['quarter', 'quarter', 'half']
  return ['quarter', 'quarter', 'quarter', 'quarter']
}

function renumber(step) {
  const rows = step.rows.filter((row) => row.fields.length > 0).map((row, i) => ({ ...row, row: i + 1 }))
  return { ...step, rows }
}

function mapStep(doc, stepIndex, fn) {
  return { ...doc, steps: doc.steps.map((step, i) => (i === stepIndex ? renumber(fn(step)) : step)) }
}

/** Where a field is: { stepIndex, rowIndex, index } or null. */
export function locate(doc, key) {
  for (let s = 0; s < doc.steps.length; s += 1) {
    const rows = doc.steps[s].rows
    for (let r = 0; r < rows.length; r += 1) {
      const index = rows[r].fields.findIndex((f) => f.key === key)
      if (index >= 0) return { stepIndex: s, rowIndex: r, index }
    }
  }
  return null
}

export function findField(doc, key) {
  const at = locate(doc, key)
  return at ? doc.steps[at.stepIndex].rows[at.rowIndex].fields[at.index] : null
}

function withoutField(doc, key) {
  const at = locate(doc, key)
  if (!at) return { doc, field: null }
  const field = doc.steps[at.stepIndex].rows[at.rowIndex].fields[at.index]
  const next = mapStep(doc, at.stepIndex, (step) => ({
    ...step,
    rows: step.rows.map((row, r) => (r === at.rowIndex ? { ...row, fields: row.fields.filter((f) => f.key !== key) } : row)),
  }))
  return { doc: next, field }
}

/**
 * Put `field` at `target`:
 * - { stepIndex, newRowAt }: a row of its own before row index `newRowAt` (rows.length = at the end).
 * - { stepIndex, rowIndex, index }: beside the fields already in that row, at position `index`.
 *   The row is re-split evenly when the widths no longer fit. A row holds at most 4 fields.
 * Returns the document unchanged when the drop is not possible.
 */
function placeField(doc, field, target) {
  const step = doc.steps[target.stepIndex]
  if (!step) return doc
  if (target.newRowAt !== undefined) {
    const at = Math.max(0, Math.min(target.newRowAt, step.rows.length))
    const rows = [...step.rows]
    rows.splice(at, 0, { row: 0, fields: [{ ...field, width: field.width || 'full' }] })
    return mapStep(doc, target.stepIndex, (s) => ({ ...s, rows }))
  }
  const row = step.rows[target.rowIndex]
  if (!row || row.fields.length >= MAX_PER_ROW) return doc
  const fields = [...row.fields]
  fields.splice(Math.max(0, Math.min(target.index ?? fields.length, fields.length)), 0, field)
  const fitted = units(fields) <= ROW_UNITS ? fields : fields.map((f, i) => ({ ...f, width: evenWidths(fields.length)[i] }))
  return mapStep(doc, target.stepIndex, (s) => ({
    ...s,
    rows: s.rows.map((r, i) => (i === target.rowIndex ? { ...r, fields: fitted } : r)),
  }))
}

export function addField(doc, field, target) {
  return placeField(doc, field, target)
}

export function moveField(doc, key, target) {
  const before = locate(doc, key)
  if (!before) return doc
  const { doc: without, field } = withoutField(doc, key)
  // Removing the field may have removed its row, which shifts the indices after it.
  let adjusted = target
  const rowGone = doc.steps[before.stepIndex].rows[before.rowIndex].fields.length === 1
  // Dropping a field that is alone in its row onto that same row changes nothing.
  if (rowGone && target.stepIndex === before.stepIndex && target.rowIndex === before.rowIndex) return doc
  if (target.stepIndex === before.stepIndex) {
    if (target.newRowAt !== undefined && rowGone && target.newRowAt > before.rowIndex) {
      adjusted = { ...target, newRowAt: target.newRowAt - 1 }
    } else if (target.rowIndex !== undefined) {
      if (rowGone && target.rowIndex > before.rowIndex) adjusted = { ...target, rowIndex: target.rowIndex - 1 }
      else if (target.rowIndex === before.rowIndex && (target.index ?? 0) > before.index) adjusted = { ...target, index: target.index - 1 }
    }
  }
  const placed = placeField(without, { ...field, width: target.newRowAt !== undefined ? 'full' : field.width }, adjusted)
  return placed === without ? doc : placed
}

export function updateField(doc, key, patch) {
  const at = locate(doc, key)
  if (!at) return doc
  return mapStep(doc, at.stepIndex, (step) => ({
    ...step,
    rows: step.rows.map((row, r) =>
      r === at.rowIndex ? { ...row, fields: row.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) } : row,
    ),
  }))
}

/** Widths this field may take in its row without pushing the row past full. */
export function allowedWidths(doc, key) {
  const at = locate(doc, key)
  if (!at) return WIDTHS
  const others = doc.steps[at.stepIndex].rows[at.rowIndex].fields.filter((f) => f.key !== key)
  const free = ROW_UNITS - units(others)
  return WIDTHS.filter((w) => WIDTH_UNITS[w] <= free)
}

export function setWidth(doc, key, width) {
  return allowedWidths(doc, key).includes(width) ? updateField(doc, key, { width }) : doc
}

export function removeField(doc, key) {
  return clearConditionsOn(withoutField(doc, key).doc, key)
}

/** A copy of the field right after it, in its own row. */
export function duplicateField(doc, key) {
  const at = locate(doc, key)
  if (!at) return doc
  const field = doc.steps[at.stepIndex].rows[at.rowIndex].fields[at.index]
  const { id, ...rest } = field
  void id
  const copy = { ...rest, key: uniqueKey(doc, field.key), width: 'full', options: field.options.map((o) => ({ ...o })) }
  return placeField(doc, copy, { stepIndex: at.stepIndex, newRowAt: at.rowIndex + 1 })
}

/** Conditions that point at a field that is gone would block publishing; drop those clauses. */
function clearConditionsOn(doc, key) {
  const clean = (cond) => {
    const all = (cond?.all ?? []).filter((c) => c.field !== key)
    return all.length ? { all } : {}
  }
  return {
    ...doc,
    steps: doc.steps.map((step) => ({
      ...step,
      rows: step.rows.map((row) => ({
        ...row,
        fields: row.fields.map((f) => ({ ...f, visible_if: clean(f.visible_if), required_if: clean(f.required_if), enabled_if: clean(f.enabled_if) })),
      })),
    })),
  }
}

// ── Steps ──────────────────────────────────────────────────────────────────

export function addStep(doc, title = { en: 'New step', tn: '' }) {
  const codes = new Set(doc.steps.map((s) => s.code))
  let code = slugKey(title.en) || 'step'
  let n = 2
  while (codes.has(code)) code = `${slugKey(title.en) || 'step'}_${n++}`
  return { ...doc, steps: [...doc.steps, { code, title: { ...empty(), ...title }, description: empty(), tips: [], is_active: true, rows: [] }] }
}

export function updateStep(doc, stepIndex, patch) {
  return { ...doc, steps: doc.steps.map((s, i) => (i === stepIndex ? { ...s, ...patch } : s)) }
}

/** Removes a step and every question on it. The builder asks first. */
export function removeStep(doc, stepIndex) {
  const keys = doc.steps[stepIndex]?.rows.flatMap((r) => r.fields.map((f) => f.key)) ?? []
  let next = { ...doc, steps: doc.steps.filter((_, i) => i !== stepIndex) }
  for (const key of keys) next = clearConditionsOn(next, key)
  return next
}

export function moveStep(doc, from, to) {
  if (to < 0 || to >= doc.steps.length) return doc
  const steps = [...doc.steps]
  const [step] = steps.splice(from, 1)
  steps.splice(to, 0, step)
  return { ...doc, steps }
}

// ── Translations ───────────────────────────────────────────────────────────

/** Texts with English but no Setswana, when the form offers Setswana. Same rule as publishing. */
export function missingSetswana(doc) {
  if (!(doc.languages ?? []).includes('tn')) return []
  const missing = []
  const check = (value, where, fieldKey) => {
    if (value && typeof value === 'object' && (value.en ?? '').trim() && !(value.tn ?? '').trim()) missing.push({ where, fieldKey })
  }
  doc.steps.forEach((step, s) => {
    check(step.title, `steps[${s}].title`)
    check(step.description, `steps[${s}].description`)
    ;(step.tips ?? []).forEach((tip, t) => check(tip, `steps[${s}].tips[${t}]`))
    step.rows.forEach((row) =>
      row.fields.forEach((field) => {
        if (field.is_active === false) return
        check(field.label, `${field.key}.label`, field.key)
        check(field.help_text, `${field.key}.help_text`, field.key)
        check(field.placeholder, `${field.key}.placeholder`, field.key)
        field.options.forEach((o, i) => {
          check(o.label, `${field.key}.options[${i}].label`, field.key)
          check(o.description, `${field.key}.options[${i}].description`, field.key)
        })
      }),
    )
  })
  return missing
}

// ── History ────────────────────────────────────────────────────────────────

export const HISTORY_LIMIT = 20

/** { past, present, future } with the last 20 changes. */
export function history(present) {
  return { past: [], present, future: [] }
}

export function commit(h, next) {
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}

export function undo(h) {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h) {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: h.future[0], future: h.future.slice(1) }
}

// ── Texts (for the Setswana switch and the translations panel) ─────────────

/** Every translatable text in the form, in canvas order, keyed like the API's translation rows. */
export function textRows(doc) {
  const rows = []
  doc.steps.forEach((step, s) => {
    rows.push({ key: `step.${step.code}.title`, kind: 'step', stepIndex: s, attr: 'title', value: step.title })
    if ((step.description?.en ?? '').trim()) rows.push({ key: `step.${step.code}.description`, kind: 'step', stepIndex: s, attr: 'description', value: step.description })
    ;(step.tips ?? []).forEach((tip, i) => rows.push({ key: `step.${step.code}.tips.${i + 1}`, kind: 'tip', stepIndex: s, index: i, value: tip }))
    step.rows.forEach((row) =>
      row.fields.forEach((field) => {
        rows.push({ key: `field.${field.key}.label`, kind: 'field', fieldKey: field.key, attr: 'label', value: field.label })
        for (const attr of ['help_text', 'placeholder']) {
          if ((field[attr]?.en ?? '').trim()) rows.push({ key: `field.${field.key}.${attr}`, kind: 'field', fieldKey: field.key, attr, value: field[attr] })
        }
        field.options.forEach((option, i) => {
          rows.push({ key: `option.${field.key}.${option.value}.label`, kind: 'option', fieldKey: field.key, index: i, attr: 'label', value: option.label })
          if ((option.description?.en ?? '').trim()) rows.push({ key: `option.${field.key}.${option.value}.description`, kind: 'option', fieldKey: field.key, index: i, attr: 'description', value: option.description })
        })
      }),
    )
  })
  return rows.filter((row) => (row.value?.en ?? '').trim())
}

/** Sets one language of one text row (from textRows) and returns the new document. */
export function setText(doc, row, lang, text) {
  const merge = (value) => ({ ...(value ?? { en: '', tn: '' }), [lang]: text })
  if (row.kind === 'step') return updateStep(doc, row.stepIndex, { [row.attr]: merge(doc.steps[row.stepIndex][row.attr]) })
  if (row.kind === 'tip') {
    const tips = [...(doc.steps[row.stepIndex].tips ?? [])]
    tips[row.index] = merge(tips[row.index])
    return updateStep(doc, row.stepIndex, { tips })
  }
  const field = findField(doc, row.fieldKey)
  if (!field) return doc
  if (row.kind === 'field') return updateField(doc, row.fieldKey, { [row.attr]: merge(field[row.attr]) })
  const options = field.options.map((o, i) => (i === row.index ? { ...o, [row.attr]: merge(o[row.attr]) } : o))
  return updateField(doc, row.fieldKey, { options })
}

/** Changes a field's key and every condition that points at it. */
export function renameKey(doc, from, to) {
  if (!to || from === to || allFields(doc).some((f) => f.key === to)) return doc
  const fix = (cond) => (cond?.all ? { all: cond.all.map((c) => (c.field === from ? { ...c, field: to } : c)) } : cond)
  return {
    ...doc,
    steps: doc.steps.map((step) => ({
      ...step,
      rows: step.rows.map((row) => ({
        ...row,
        fields: row.fields.map((f) => ({
          ...f,
          key: f.key === from ? to : f.key,
          visible_if: fix(f.visible_if),
          required_if: fix(f.required_if),
          enabled_if: fix(f.enabled_if),
        })),
      })),
    })),
  }
}

/**
 * Pure logic for the FormRenderer: language picking, conditions and per-step
 * checks. No React here, so the staff builder preview (U5) can reuse it.
 *
 * The form document is the B4 shape (apps/programs/form_schema.py). Texts can be
 * plain strings (the published form, already in one language) or {en, tn}
 * objects (the staff draft). `pick()` handles both.
 */
import type { Condition, ConditionClause, FormField, FormStep, Lang } from '../../../types/innovator'
import { LAYOUT_FIELD_TYPES } from '../../../types/innovator'

export type Answers = Record<string, unknown>
export type MaybeBilingual = string | { en?: string; tn?: string } | null | undefined

/** Text in `lang`, English when the translation is empty. */
export function pick(value: MaybeBilingual, lang: Lang): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  const text = (value[lang] ?? '').trim()
  return text ? (value[lang] as string) : value.en ?? ''
}

export function isEmptyAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function clauseHolds(clause: ConditionClause, answers: Answers): boolean {
  const value = answers[clause.field]
  switch (clause.op) {
    case 'is_empty':
      return isEmptyAnswer(value)
    case 'is_not_empty':
      return !isEmptyAnswer(value)
    case 'equals':
      return Array.isArray(value) ? value.map(String).includes(String(clause.value)) : String(value ?? '') === String(clause.value ?? '')
    case 'not_equals':
      return Array.isArray(value) ? !value.map(String).includes(String(clause.value)) : String(value ?? '') !== String(clause.value ?? '')
    case 'in': {
      const allowed = Array.isArray(clause.value) ? clause.value.map(String) : [String(clause.value ?? '')]
      return Array.isArray(value) ? value.some((v) => allowed.includes(String(v))) : allowed.includes(String(value ?? ''))
    }
    default:
      // An operator we do not know: do not hide or require anything because of it.
      return true
  }
}

/** True when the condition is unset ({} or null) or every clause holds. */
export function conditionHolds(condition: Condition | null | undefined, answers: Answers, whenUnset = true): boolean {
  const clauses = condition?.all
  if (!clauses || clauses.length === 0) return whenUnset
  return clauses.every((clause) => clauseHolds(clause, answers))
}

export function isLayoutField(field: FormField): boolean {
  return LAYOUT_FIELD_TYPES.has(field.type)
}

export function isVisible(field: FormField, answers: Answers): boolean {
  return field.is_active !== false && conditionHolds(field.visible_if, answers, true)
}

export function isRequired(field: FormField, answers: Answers): boolean {
  if (isLayoutField(field)) return false
  return field.required || conditionHolds(field.required_if, answers, false)
}

export function isEnabled(field: FormField, answers: Answers): boolean {
  return conditionHolds(field.enabled_if, answers, true)
}

export function stepFields(step: FormStep): FormField[] {
  return step.rows.flatMap((row) => row.fields)
}

/** The fields people can answer on this step right now. */
export function visibleAnswerFields(step: FormStep, answers: Answers): FormField[] {
  return stepFields(step).filter((field) => !isLayoutField(field) && isVisible(field, answers))
}

export function ruleValue(field: FormField, type: string): string | undefined {
  return field.rules.find((rule) => rule.rule_type === type)?.rule_value
}

export function maxChars(field: FormField): number | undefined {
  const raw = ruleValue(field, 'max_length')
  const n = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Botswana national ID (Omang): 9 digits; the 5th digit is 1 or 2. Same rule as apps/programs/field_types.py. */
export function isOmang(value: string): boolean {
  return /^\d{4}[12]\d{4}$/.test(value.replace(/[\s-]/g, ''))
}

/** Yes / No answers are stored as these values (apps/programs/field_types.py). */
export const YES_NO_VALUES = ['yes', 'no'] as const

export type FieldProblem =
  | { kind: 'required' }
  | { kind: 'rule'; message: string }
  | { kind: 'email' }
  | { kind: 'phone' }
  | { kind: 'number' }
  | { kind: 'omang' }
  | { kind: 'url' }

/**
 * Checks one step in the browser, before saving. The API checks again
 * (PUT /api/drafts/{id}/steps/{code}/) and its errors win.
 */
export function checkStep(step: FormStep, answers: Answers): Record<string, FieldProblem> {
  const problems: Record<string, FieldProblem> = {}
  for (const field of visibleAnswerFields(step, answers)) {
    if (!isEnabled(field, answers)) continue
    const value = answers[field.key]
    if (isEmptyAnswer(value)) {
      if (isRequired(field, answers)) problems[field.key] = { kind: 'required' }
      continue
    }
    const text = typeof value === 'string' ? value.trim() : ''
    if (field.type === 'email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) problems[field.key] = { kind: 'email' }
    else if (field.type === 'phone' && text && !/^\+?[\d\s()-]{7,}$/.test(text)) problems[field.key] = { kind: 'phone' }
    else if (field.type === 'number' && text && !Number.isFinite(Number(text))) problems[field.key] = { kind: 'number' }
    else if (field.type === 'omang_id' && text && !isOmang(text)) problems[field.key] = { kind: 'omang' }
    else if (field.type === 'url' && text && !/^https?:\/\/\S+$/i.test(text)) problems[field.key] = { kind: 'url' }
    if (problems[field.key]) continue
    for (const rule of field.rules) {
      if (ruleBroken(rule.rule_type, rule.rule_value, value)) {
        problems[field.key] = { kind: 'rule', message: rule.error_message }
        break
      }
    }
  }
  return problems
}

function ruleBroken(type: string, ruleValueText: string, value: unknown): boolean {
  const text = typeof value === 'string' ? value : ''
  const n = Number(ruleValueText)
  switch (type) {
    case 'min_length':
      return text.length > 0 && text.trim().length < n
    case 'max_length':
      return text.length > n
    case 'exact_length':
      return text.length > 0 && text.trim().length !== n
    case 'min_value':
      return text !== '' && Number(text) < n
    case 'max_value':
      return text !== '' && Number(text) > n
    case 'regex':
      try {
        return text !== '' && !new RegExp(ruleValueText).test(text)
      } catch {
        return false
      }
    default:
      // File rules are checked on upload; unknown rules are left to the API.
      return false
  }
}

/** Answers for fields that are hidden now are kept (people may switch back), but not sent. */
export function answersToSend(step: FormStep, answers: Answers): Answers {
  const out: Answers = {}
  for (const field of visibleAnswerFields(step, answers)) {
    if (field.key in answers) out[field.key] = answers[field.key]
  }
  return out
}

/** Grid columns out of 12 for each width. Phone always stacks to one column. */
export const WIDTH_SPAN: Record<string, string> = {
  quarter: 'sm:col-span-3',
  half: 'sm:col-span-6',
  three_quarter: 'sm:col-span-9',
  full: 'sm:col-span-12',
}

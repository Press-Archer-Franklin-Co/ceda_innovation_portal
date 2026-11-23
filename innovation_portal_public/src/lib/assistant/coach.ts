import type { CheckItem, DraftCheck } from '../../services/assistant.service'
import { uploadedFiles, type UploadedFile } from '../../components/innovator/form/UploadField'
import { stepFields } from '../../components/innovator/form/logic'
import type { FormStep } from '../../types/innovator'

// When the AI helper looks at the step (2.13). Pure, so the timing can be tested with fake timers.
// - While the person types, nothing is sent, and an answer already on its way is cancelled (it is out of date).
// - Leaving a field (blur) asks at once.
// - On a long text field, a pause of 2 seconds also asks.
// - Only one request is ever in flight: a new one cancels the one before.

export const COACH = { pauseMs: 2000, maxSuggestions: 3 }

export interface Coach {
  /** A key was pressed in a field. long: a long text field (a pause there asks too). */
  typed(long: boolean): void
  /** The person left a field. */
  left(): void
  /** Stop: no timer, nothing in flight. */
  stop(): void
}

export function createCoach(run: (signal: AbortSignal) => void, pauseMs = COACH.pauseMs): Coach {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: AbortController | null = null

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const cancel = () => {
    inFlight?.abort()
    inFlight = null
  }
  const fire = () => {
    clear()
    cancel()
    inFlight = new AbortController()
    run(inFlight.signal)
  }

  return {
    typed(long) {
      clear()
      cancel()
      if (long) timer = setTimeout(fire, pauseMs)
    },
    left: fire,
    stop() {
      clear()
      cancel()
    },
  }
}

export interface Suggestion {
  topic: string
  text: string
  fieldKey: string
  status: CheckItem['status']
}

/** The 1 to 3 short suggestions for the panel: what is missing first, then what could be clearer. */
export function pickSuggestions(data: DraftCheck | null | undefined, max = COACH.maxSuggestions): Suggestion[] {
  if (!data) return []
  const items = (data.items ?? []).filter((item) => item.status !== 'clear' && item.suggestion)
  const order = { missing: 0, add_more: 1, clear: 2 }
  const fromItems = [...items]
    .sort((a, b) => order[a.status] - order[b.status])
    .map((item) => ({ topic: item.topic, text: item.suggestion, fieldKey: item.field_key, status: item.status }))
  const fromUnclear = (data.unclear ?? []).map((item) => ({ topic: '', text: item.suggestion, fieldKey: item.field_key, status: 'add_more' as const }))
  return [...fromItems, ...fromUnclear].slice(0, max)
}

/** The files uploaded on this step, from the answers. */
export function stepUploads(step: FormStep | undefined, answers: Record<string, unknown>): UploadedFile[] {
  if (!step) return []
  return stepFields(step)
    .filter((field) => field.type === 'file' || field.type === 'media')
    .flatMap((field) => uploadedFiles(answers[field.key]))
}

/** Is there anything on this step worth checking: at least one answer that is not empty. */
export function hasAnswers(answers: Record<string, unknown>): boolean {
  return Object.values(answers).some((value) => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined && value !== false))
}

/** The whole idea's result from each step's check: every item, and how it reads overall. */
export function combineChecks(results: { stepIndex: number; data: DraftCheck }[]) {
  const items = results.flatMap(({ stepIndex, data }) => (data.items ?? []).map((item) => ({ ...item, stepIndex })))
  const strong = items.filter((item) => item.status === 'clear').length
  const overall: 'ready' | 'almost' | 'needs_work' = items.some((item) => item.status === 'missing')
    ? 'needs_work'
    : items.length > 0 && strong === items.length
      ? 'ready'
      : 'almost'
  return { items, strong, total: items.length, overall }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combineChecks, createCoach, hasAnswers, pickSuggestions } from './coach'

// 2.13: the AI helper never asks while the person types, asks once when they leave a field or pause on a long
// answer, and cancels an answer that is out of date.

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createCoach', () => {
  it('sends nothing while typing, and one request after blur', () => {
    const run = vi.fn()
    const coach = createCoach(run, 2000)
    for (let i = 0; i < 10; i++) {
      coach.typed(false)
      vi.advanceTimersByTime(500)
    }
    expect(run).not.toHaveBeenCalled()
    coach.left()
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('asks after a 2 second pause on a long text field, not before', () => {
    const run = vi.fn()
    const coach = createCoach(run, 2000)
    coach.typed(true)
    vi.advanceTimersByTime(1500)
    coach.typed(true)
    vi.advanceTimersByTime(1999)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancels the request before on fast changes, so only one is ever in flight', () => {
    const signals: AbortSignal[] = []
    const coach = createCoach((signal) => signals.push(signal), 2000)
    coach.left()
    coach.left()
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    coach.typed(true) // typing again makes the answer on its way out of date
    expect(signals[1].aborted).toBe(true)
    coach.stop()
    vi.advanceTimersByTime(5000)
    expect(signals).toHaveLength(2)
  })
})

describe('pickSuggestions', () => {
  it('gives at most 3, what is missing first, and leaves out what is already clear', () => {
    const picked = pickSuggestions({
      available: true,
      items: [
        { topic: 'Problem', status: 'clear', suggestion: 'Clear.', field_key: 'problem', document_id: '', document_name: '', page: null },
        { topic: 'Solution', status: 'add_more', suggestion: 'Say how it differs.', field_key: 'solution', document_id: '', document_name: '', page: null },
        { topic: 'Customers', status: 'missing', suggestion: 'Name your first shops.', field_key: 'customers', document_id: '', document_name: '', page: null },
      ],
      unclear: [
        { field_key: 'solution', quote: 'x', suggestion: 'Say what 9-month means.' },
        { field_key: 'solution', quote: 'y', suggestion: 'One more.' },
      ],
    })
    expect(picked.map((s) => s.text)).toEqual(['Name your first shops.', 'Say how it differs.', 'Say what 9-month means.'])
  })
})

describe('helpers', () => {
  it('hasAnswers ignores empty answers', () => {
    expect(hasAnswers({ a: '', b: [], c: null })).toBe(false)
    expect(hasAnswers({ a: ' x ' })).toBe(true)
  })

  it('combineChecks reads the whole idea', () => {
    const item = (status: 'clear' | 'add_more' | 'missing') => ({ topic: 't', status, suggestion: '', field_key: '', document_id: '', document_name: '', page: null })
    expect(combineChecks([{ stepIndex: 0, data: { available: true, items: [item('clear'), item('clear')] } }]).overall).toBe('ready')
    const mixed = combineChecks([{ stepIndex: 0, data: { available: true, items: [item('clear')] } }, { stepIndex: 1, data: { available: true, items: [item('add_more')] } }])
    expect(mixed).toMatchObject({ overall: 'almost', strong: 1, total: 2 })
    expect(combineChecks([{ stepIndex: 0, data: { available: true, items: [item('missing')] } }]).overall).toBe('needs_work')
  })
})

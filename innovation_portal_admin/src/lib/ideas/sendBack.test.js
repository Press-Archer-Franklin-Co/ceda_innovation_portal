import { describe, expect, it } from 'vitest'
import { canSendBack, sendBackBody } from './sendBack'

describe('Ask for changes (3.16)', () => {
  const questions = [{ field_key: 'price', label: 'Price', kind: 'answer' }, { field_key: 'plan', label: 'Plan', kind: 'document' }]
  it('turns the rows into answer and document items', () => {
    const body = sendBackBody({
      reason: ' Need costs ', fixBy: '2026-11-28', newDocument: 'NEW', questions,
      items: [{ choice: 'NEW', label: ' Add your quote ' }, { choice: 'price', label: 'Say your price' }, { choice: 'plan', label: 'Update the plan' }],
    })
    expect(body).toEqual({
      reason: 'Need costs', fix_by: '2026-11-28',
      items: [
        { kind: 'document', field_key: '', label: 'Add your quote' },
        { kind: 'answer', field_key: 'price', label: 'Say your price' },
        { kind: 'document', field_key: 'plan', label: 'Update the plan' },
      ],
    })
  })
  it('leaves out an empty date', () => {
    expect(sendBackBody({ reason: 'x', fixBy: '', items: [], questions, newDocument: 'NEW' })).not.toHaveProperty('fix_by')
  })
  it('offers it only on a step that allows it, and not while the idea is waiting', () => {
    expect(canSendBack({ status: 'screening', allowed_actions: ['approve', 'request_info'] })).toBe(true)
    expect(canSendBack({ status: 'screening', allowed_actions: ['return'] })).toBe(true)
    expect(canSendBack({ status: 'returned', allowed_actions: ['return'] })).toBe(false)
    expect(canSendBack({ status: 'screening', allowed_actions: ['approve'] })).toBe(false)
  })
})

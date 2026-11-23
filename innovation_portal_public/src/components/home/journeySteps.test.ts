import { describe, expect, it } from 'vitest'
import { nameStep, startStep } from './journeySteps'
import type { FormField, FormStep } from '../../types/innovator'

const field = (key: string) => ({ key } as unknown as FormField)
const step = (code: string, keys: string[]): FormStep => ({
  id: code, code, title: code, description: '', tips: [], is_active: true, rows: [{ row: 1, fields: keys.map(field) }],
})

// The General ideas form as seeded: "Your idea", then "About you".
const general = [step('your-idea', ['problem', 'solution', 'who_benefits']), step('about-you', ['first_name', 'last_name', 'contact_number'])]

describe('Quick start into the full form (prompt 31 part B)', () => {
  it('opens the full form at step 2 when the basics are enough, since the card was step 1', () => {
    expect(startStep(general, true)).toBe('about-you')
  })

  it('opens at step 1 when its required questions must still be answered (switch off, or a challenge entry)', () => {
    expect(startStep(general, false)).toBe('your-idea')
  })

  it('copes with a one-step form and with a form that has not loaded', () => {
    expect(startStep([general[0]], true)).toBe('your-idea')
    expect(startStep([], true)).toBeNull()
  })

  it('finds the step that asks the name, so 1.2 saves the name there and step 2 does not ask it again', () => {
    expect(nameStep(general)?.code).toBe('about-you')
    expect(nameStep([general[0]])).toBeUndefined()
  })
})

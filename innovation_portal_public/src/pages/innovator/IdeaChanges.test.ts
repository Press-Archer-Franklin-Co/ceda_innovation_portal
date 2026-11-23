import { describe, expect, it } from 'vitest'
import { formSteps } from './IdeaChanges'
import { changesLink, draftLink, ideaLink } from '../../components/innovator/links'
import type { FormField, FormStep, PublishedForm, ReturnedForChanges } from '../../types/innovator'

const field = (key: string, extra: Record<string, unknown> = {}) => ({ key, width: 'half', ...extra } as unknown as FormField)
const step = (code: string, fields: FormField[]): FormStep => ({ id: code, code, title: code, description: '', tips: [], is_active: true, rows: [{ row: 1, fields }] })
const returned = (steps: FormStep[], loose: FormField[], asked: FormField[]) =>
  ({ form: { steps, loose_fields: loose } as unknown as PublishedForm, fields: asked } as unknown as ReturnedForChanges)
const keys = (steps: FormStep[]) => steps.flatMap((s) => s.rows.flatMap((r) => r.fields.map((f) => f.key)))

describe('Three modes of an idea', () => {
  it('opens a challenge draft at its own address, a general draft at the form and a sent idea read only', () => {
    expect(draftLink('d1', { slug: 'water', is_general_intake: false })).toBe('/challenges/water/entry/d1')
    expect(draftLink('d1', { slug: 'general-ideas', is_general_intake: true })).toBe('/my-ideas/draft/d1')
    expect(ideaLink({ id: 's1', kind: 'submission' as never })).toBe('/my-ideas/s1')
    expect(changesLink('s1')).toBe('/my-ideas/s1/changes')
  })

  it('shows the whole form as sent, with the flagged question free of conditions and in its place', () => {
    const own = field('price', { visible_if: {}, width: 'full' })
    const out = formSteps(returned([step('a', [field('idea'), field('price', { visible_if: { field: 'idea' } })])], [field('district')], [own]))
    expect(keys(out)).toEqual(['idea', 'price', 'district'])
    const shown = out[0].rows[0].fields[1]
    expect(shown.visible_if).toEqual({})
    expect(shown.width).toBe('half')
  })

  it('still shows a flagged question the form no longer has', () => {
    expect(keys(formSteps(returned([step('a', [field('idea')])], [], [field('gone')])))).toEqual(['idea', 'gone'])
  })
})

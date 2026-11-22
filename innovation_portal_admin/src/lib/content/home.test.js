import { describe, expect, it } from 'vitest'
import {
  addSection, adoptIds, errorsBySection, fromDraft, lastPublished, localize, missingSetswana, moveSection,
  removeSection, toPayload, toggleSection,
} from './home'

const types = [
  { type: 'hero_banner', fixed_first: true, can_disable: false, default_settings: { headline: { en: 'Hi', tn: '' } } },
  { type: 'partners_strip', fixed_first: false, can_disable: true, default_settings: { max_items: 12 } },
  { type: 'challenges', fixed_first: false, can_disable: true, default_settings: { max_items: 3 } },
]
const draft = () => fromDraft([
  { id: 'a', type: 'hero_banner', enabled: true, settings: {} },
  { id: 'b', type: 'partners_strip', enabled: true, settings: {} },
  { id: 'c', type: 'challenges', enabled: true, settings: {} },
])

describe('home sections', () => {
  it('reorders sections but never moves the banner or puts anything above it', () => {
    const s = draft()
    expect(moveSection(s, types, 'c', 'b').map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(moveSection(s, types, 'c', 'a')).toBe(s)
    expect(moveSection(s, types, 'a', 'c')).toBe(s)
  })

  it('switches a section off but not the banner', () => {
    const s = toggleSection(toggleSection(draft(), types, 'b', false), types, 'a', false)
    expect(s.map((x) => x.enabled)).toEqual([true, false, true])
  })

  it('adds a section with default settings, never a second banner, and removes only non-banner sections', () => {
    const [added, key] = addSection(draft(), types, 'challenges')
    expect(added).toHaveLength(4)
    expect(added[3]).toMatchObject({ type: 'challenges', enabled: true, settings: { max_items: 3 } })
    expect(addSection(draft(), types, 'hero_banner')[1]).toBeNull()
    expect(removeSection(added, types, key)).toHaveLength(3)
    expect(removeSection(added, types, 'a')).toHaveLength(4)
  })

  it('sends sections without local keys and adopts the ids the API gives new ones', () => {
    const [added, key] = addSection(draft(), types, 'challenges')
    const payload = toPayload(added)
    expect(payload[3]).toEqual({ type: 'challenges', enabled: true, settings: { max_items: 3 } })
    expect(payload.every((p) => !('_key' in p))).toBe(true)
    const keys = added.map((s) => s._key)
    const withIds = adoptIds(added, keys, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    expect(withIds.find((s) => s._key === key).id).toBe('d')
  })

  it('localizes texts like the API, falling back to English', () => {
    const settings = { title: { en: 'Partners', tn: '' }, button: { label: { en: 'Go', tn: 'Tsamaya' }, url: '/x' }, steps: [{ title: { en: 'One', tn: 'Nngwe' } }], max_items: 3 }
    expect(localize(settings, 'tn')).toEqual({ title: 'Partners', button: { label: 'Tsamaya', url: '/x' }, steps: [{ title: 'Nngwe' }], max_items: 3 })
  })

  it('lists texts with English but no Setswana', () => {
    const schema = { title: { kind: 'text' }, button: { kind: 'button' }, steps: { kind: 'list', item: { title: { kind: 'text' } } } }
    const settings = { title: { en: 'A', tn: 'B' }, button: { label: { en: 'Go', tn: '' }, url: '/' }, steps: [{ title: { en: 'X', tn: '' } }] }
    expect(missingSetswana(settings, schema)).toEqual(['button', 'steps'])
  })

  it('groups API errors by section and setting', () => {
    expect(errorsBySection([
      { path: 'sections[2].settings.headline.en', message: 'Too long' },
      { path: 'sections[0]', message: 'The banner must be the first section.' },
      { path: 'sections', message: 'Only one banner.' },
    ])).toEqual({
      2: [{ name: 'headline', path: 'sections[2].settings.headline.en', message: 'Too long' }],
      0: [{ name: null, path: 'sections[0]', message: 'The banner must be the first section.' }],
      page: [{ name: null, path: 'sections', message: 'Only one banner.' }],
    })
  })

  it('finds the latest approved home page change', () => {
    const list = [
      { target_type: 'post', status: 'approved', decided_at: '2026-11-19T10:00:00Z' },
      { target_type: 'page', status: 'approved', decided_at: '2026-11-14T10:00:00Z', decided_by: 'Lesego M.' },
      { target_type: 'page', status: 'approved', decided_at: '2026-11-18T10:00:00Z', decided_by: 'Kago T.' },
      { target_type: 'page', status: 'rejected', decided_at: '2026-11-20T10:00:00Z' },
    ]
    expect(lastPublished(list).decided_by).toBe('Kago T.')
    expect(lastPublished([])).toBeNull()
  })
})

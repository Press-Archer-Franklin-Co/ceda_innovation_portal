import { describe, expect, it } from 'vitest'
import {
  addField, addStep, allowedWidths, commit, duplicateField, history, locate, missingSetswana, moveField,
  newField, redo, removeField, removeStep, setWidth, undo, uniqueKey, updateField, HISTORY_LIMIT,
} from './document'

function base() {
  return {
    id: 'f1',
    name: { en: 'Entry', tn: '' },
    languages: ['en', 'tn'],
    loose_fields: [],
    steps: [
      {
        code: 'about_you',
        title: { en: 'About you', tn: 'Ka ga gago' },
        description: { en: '', tn: '' },
        tips: [],
        is_active: true,
        rows: [
          { row: 1, fields: [{ ...newField({ steps: [], loose_fields: [] }, 'text', { en: 'First name' }), label: { en: 'First name', tn: 'Leina' } }] },
          { row: 2, fields: [{ ...newField({ steps: [], loose_fields: [] }, 'text', { en: 'Sector' }), label: { en: 'Sector', tn: 'Lephata' } }] },
        ],
      },
    ],
  }
}

const keysByRow = (doc, s = 0) => doc.steps[s].rows.map((r) => r.fields.map((f) => `${f.key}:${f.width}`))

describe('keys', () => {
  it('makes a slug key and avoids ones in use', () => {
    const doc = base()
    expect(uniqueKey(doc, 'Company registration number')).toBe('company_registration_number')
    expect(uniqueKey(doc, 'First name')).toBe('first_name_2')
  })
})

describe('placing fields', () => {
  it('drops beside a field to make two halves', () => {
    const doc = moveField(base(), 'sector', { stepIndex: 0, rowIndex: 0, index: 1 })
    expect(keysByRow(doc)).toEqual([['first_name:half', 'sector:half']])
  })

  it('drops into a new row at full width and renumbers rows', () => {
    const doc = addField(base(), newField(base(), 'district', { en: 'District' }), { stepIndex: 0, newRowAt: 1 })
    expect(keysByRow(doc)).toEqual([['first_name:full'], ['district:full'], ['sector:full']])
    expect(doc.steps[0].rows.map((r) => r.row)).toEqual([1, 2, 3])
  })

  it('keeps at most four fields in a row', () => {
    let doc = base()
    for (const name of ['a', 'b', 'c']) doc = addField(doc, newField(doc, 'text', { en: name }), { stepIndex: 0, rowIndex: 0, index: 9 })
    expect(doc.steps[0].rows[0].fields).toHaveLength(4)
    expect(keysByRow(doc)[0].map((k) => k.split(':')[1])).toEqual(['quarter', 'quarter', 'quarter', 'quarter'])
    const fifth = addField(doc, newField(doc, 'text', { en: 'e' }), { stepIndex: 0, rowIndex: 0, index: 0 })
    expect(fifth).toBe(doc)
  })

  it('reorders within a row', () => {
    let doc = moveField(base(), 'sector', { stepIndex: 0, rowIndex: 0, index: 1 })
    doc = moveField(doc, 'first_name', { stepIndex: 0, rowIndex: 0, index: 2 })
    expect(keysByRow(doc)).toEqual([['sector:half', 'first_name:half']])
  })

  it('does nothing when a lone field is dropped on its own row', () => {
    const doc = base()
    expect(moveField(doc, 'sector', { stepIndex: 0, rowIndex: 1, index: 0 })).toBe(doc)
  })

  it('moves a field out of a shared row into its own row at full width', () => {
    let doc = moveField(base(), 'sector', { stepIndex: 0, rowIndex: 0, index: 1 })
    doc = moveField(doc, 'sector', { stepIndex: 0, newRowAt: 1 })
    expect(keysByRow(doc)).toEqual([['first_name:half'], ['sector:full']])
  })
})

describe('widths', () => {
  it('only offers widths that fit beside the other fields', () => {
    const doc = moveField(base(), 'sector', { stepIndex: 0, rowIndex: 0, index: 1 })
    expect(allowedWidths(doc, 'first_name')).toEqual(['quarter', 'half'])
    expect(setWidth(doc, 'first_name', 'full')).toBe(doc)
    expect(keysByRow(setWidth(doc, 'first_name', 'quarter'))).toEqual([['first_name:quarter', 'sector:half']])
  })
})

describe('removing and copying', () => {
  it('drops conditions that point at a removed field', () => {
    let doc = updateField(base(), 'sector', { visible_if: { all: [{ field: 'first_name', op: 'is_not_empty' }] } })
    doc = removeField(doc, 'first_name')
    expect(locate(doc, 'first_name')).toBeNull()
    expect(doc.steps[0].rows[0].fields[0].visible_if).toEqual({})
  })

  it('duplicates into the next row with a new key', () => {
    const doc = duplicateField(base(), 'first_name')
    expect(keysByRow(doc)).toEqual([['first_name:full'], ['first_name_2:full'], ['sector:full']])
  })

  it('removes a step and conditions on its questions', () => {
    let doc = addStep(base(), { en: 'Your idea' })
    doc = addField(doc, { ...newField(doc, 'textarea', { en: 'Problem' }), visible_if: { all: [{ field: 'sector', op: 'is_not_empty' }] } }, { stepIndex: 1, newRowAt: 0 })
    doc = removeStep(doc, 0)
    expect(doc.steps).toHaveLength(1)
    expect(doc.steps[0].rows[0].fields[0].visible_if).toEqual({})
  })
})

describe('Setswana', () => {
  it('lists English texts without Setswana', () => {
    const doc = addField(base(), newField(base(), 'text', { en: 'Company registration number' }), { stepIndex: 0, newRowAt: 2 })
    expect(missingSetswana(doc).map((m) => m.where)).toEqual(['company_registration_number.label'])
    expect(missingSetswana({ ...doc, languages: ['en'] })).toEqual([])
  })
})

describe('undo and redo', () => {
  it('walks back and forward, and keeps the last 20 changes', () => {
    let h = history(base())
    h = commit(h, moveField(h.present, 'sector', { stepIndex: 0, rowIndex: 0, index: 1 }))
    expect(keysByRow(h.present)).toEqual([['first_name:half', 'sector:half']])
    h = undo(h)
    expect(keysByRow(h.present)).toEqual([['first_name:full'], ['sector:full']])
    h = redo(h)
    expect(keysByRow(h.present)).toEqual([['first_name:half', 'sector:half']])
    for (let i = 0; i < 30; i += 1) h = commit(h, updateField(h.present, 'sector', { required: i % 2 === 0 }))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })
})

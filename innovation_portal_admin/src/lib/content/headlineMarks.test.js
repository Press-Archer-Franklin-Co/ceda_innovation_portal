import { describe, expect, it } from 'vitest'
import { isMarked, marksFromSegments, mergeMarks, segments, toggleMark, withLangMarks } from './headlineMarks'

const HEADLINE = 'Plant the seed. CEDA helps it grow.'
const at = (word) => [HEADLINE.indexOf(word), HEADLINE.indexOf(word) + word.length]

describe('headline marks (3.8 pin 3)', () => {
  it('highlights seed and grow, and a second press takes the colour off', () => {
    let marks = toggleMark([], ...at('seed'), 'highlight')
    marks = toggleMark(marks, ...at('grow'), 'highlight')
    expect(marks).toEqual([
      { start: 10, end: 14, type: 'highlight' },
      { start: 30, end: 34, type: 'highlight' },
    ])
    expect(segments(HEADLINE, marks).filter((p) => p.types.includes('highlight')).map((p) => p.text)).toEqual(['seed', 'grow'])
    expect(toggleMark(marks, ...at('seed'), 'highlight')).toEqual([{ start: 30, end: 34, type: 'highlight' }])
  })

  it('removes a mark from part of a longer mark and keeps the rest', () => {
    const marks = toggleMark([], 0, 14, 'bold')
    expect(toggleMark(marks, ...at('the'), 'bold')).toEqual([
      { start: 0, end: 6, type: 'bold' },
      { start: 9, end: 14, type: 'bold' },
    ])
  })

  it('lets bold, italic and highlight overlap, and joins touching marks of one type', () => {
    const marks = mergeMarks([
      { start: 10, end: 12, type: 'highlight' },
      { start: 12, end: 14, type: 'highlight' },
      { start: 6, end: 14, type: 'italic' },
    ])
    expect(marks).toEqual([
      { start: 6, end: 14, type: 'italic' },
      { start: 10, end: 14, type: 'highlight' },
    ])
    expect(isMarked(marks, 10, 14, 'highlight')).toBe(true)
    expect(isMarked(marks, 9, 14, 'highlight')).toBe(false)
  })

  it('reads marks back from the pieces after typing', () => {
    const pieces = segments(HEADLINE, [{ start: 10, end: 14, type: 'highlight' }])
    pieces[0] = { ...pieces[0], text: 'Plant the big ' }
    expect(marksFromSegments(pieces)).toEqual([{ start: 14, end: 18, type: 'highlight' }])
  })

  it('keeps each language its own marks', () => {
    const all = withLangMarks({ en: [{ start: 0, end: 4, type: 'bold' }] }, 'tn', [{ start: 5, end: 8, type: 'highlight' }])
    expect(all).toEqual({ en: [{ start: 0, end: 4, type: 'bold' }], tn: [{ start: 5, end: 8, type: 'highlight' }] })
  })
})

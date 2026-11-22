import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HeroHeadline, { headlineSegments, marksFromWords } from './HeroHeadline'

const HEADLINE = 'Plant the seed. CEDA helps it grow.'

describe('HeroHeadline (1.1 hero, marks from 3.8)', () => {
  it('shows seed and grow in amber when the editor highlighted them', () => {
    const marks = [
      { start: 10, end: 14, type: 'highlight' as const },
      { start: 30, end: 34, type: 'highlight' as const },
    ]
    const html = renderToStaticMarkup(<HeroHeadline text={HEADLINE} marks={marks} />)
    expect(html).toBe('Plant the <span class="text-amber">seed</span>. CEDA helps it <span class="text-amber">grow</span>.')
  })

  it('draws bold and italic, and overlapping marks together', () => {
    const html = renderToStaticMarkup(
      <HeroHeadline text={HEADLINE} marks={[{ start: 0, end: 14, type: 'bold' }, { start: 10, end: 14, type: 'highlight' }, { start: 16, end: 20, type: 'italic' }]} />,
    )
    expect(html).toBe('<span class="font-black">Plant the </span><span class="text-amber font-black">seed</span>. <span class="italic">CEDA</span> helps it grow.')
  })

  it('ignores marks that run past the text and shows plain text without marks', () => {
    expect(headlineSegments('Short', [{ start: 2, end: 40, type: 'highlight' }])).toEqual([{ text: 'Short', types: [] }])
    expect(renderToStaticMarkup(<HeroHeadline text={HEADLINE} />)).toBe(HEADLINE)
  })

  it('turns built-in highlighted words into marks', () => {
    expect(marksFromWords('Share your idea. Your idea counts.', 'your idea')).toEqual([
      { start: 6, end: 15, type: 'highlight' },
      { start: 17, end: 26, type: 'highlight' },
    ])
  })
})

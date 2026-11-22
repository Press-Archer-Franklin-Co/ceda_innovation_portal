// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import HeadlineEditor from './HeadlineEditor'
import { segments } from '../../../lib/content/headlineMarks'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const HEADLINE = 'Plant the seed. CEDA helps it grow.'

function selectWord(el, word) {
  const start = HEADLINE.indexOf(word)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const point = (target) => {
    walker.currentNode = el
    for (let node = walker.nextNode(), at = 0; node; node = walker.nextNode()) {
      if (target <= at + node.data.length) return [node, target - at]
      at += node.data.length
    }
    return [el, 0]
  }
  const range = document.createRange()
  range.setStart(...point(start))
  range.setEnd(...point(start + word.length))
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

describe('HeadlineEditor (3.8 pin 3)', () => {
  let host
  let root
  let saved
  function Harness({ marks = [] }) {
    return <HeadlineEditor label="Headline" value={HEADLINE} marks={marks} onChange={(text, next) => { saved = { text, marks: next } }} />
  }
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    saved = null
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('highlighting seed and grow saves two highlight marks and shows them in colour in the field', () => {
    act(() => root.render(<Harness />))
    const field = host.querySelector('[data-testid="headline-editor"]')
    const highlight = host.querySelector('button[aria-label^="Highlight"]') ?? [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Highlight'))
    expect(highlight).toBeTruthy()

    selectWord(field, 'seed')
    act(() => highlight.click())
    act(() => root.render(<Harness marks={saved.marks} />))
    selectWord(field, 'grow')
    act(() => highlight.click())

    expect(saved.text).toBe(HEADLINE)
    expect(saved.marks).toEqual([
      { start: 10, end: 14, type: 'highlight' },
      { start: 30, end: 34, type: 'highlight' },
    ])
    act(() => root.render(<Harness marks={saved.marks} />))
    expect([...field.querySelectorAll('[data-marks~="highlight"]')].map((s) => s.textContent)).toEqual(['seed', 'grow'])
    expect(segments(HEADLINE, saved.marks).filter((p) => p.types.length).map((p) => p.text)).toEqual(['seed', 'grow'])
  })

  it('Ctrl+B makes the selected words bold', () => {
    act(() => root.render(<Harness />))
    const field = host.querySelector('[data-testid="headline-editor"]')
    selectWord(field, 'CEDA')
    act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })))
    expect(saved.marks).toEqual([{ start: 16, end: 20, type: 'bold' }])
  })
})

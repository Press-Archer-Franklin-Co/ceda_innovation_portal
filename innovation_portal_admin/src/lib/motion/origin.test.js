// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isOnScreen, pickOrigin, rememberForTest, rememberOrigin } from './origin'
import { scaleFrame, SCALE } from './scaleFromCentre'

// jsdom draws nothing: give the buttons we treat as on screen a size.
function button(text, drawn = true) {
  const b = document.createElement('button')
  b.textContent = text
  document.body.appendChild(b)
  b.getBoundingClientRect = () => ({ left: 0, top: 0, width: drawn ? 120 : 0, height: drawn ? 36 : 0, right: drawn ? 120 : 0, bottom: drawn ? 36 : 0, x: 0, y: 0, toJSON: () => ({}) })
  return b
}
afterEach(() => { document.body.innerHTML = ''; rememberForTest(null) })

describe('where an overlay opens from', () => {
  it('the trigger the page names, while it is on screen', () => {
    const header = button('Create form')
    const card = button('Create form card')
    rememberForTest(card, 1000)
    expect(pickOrigin(header, undefined, 1100)).toBe(header)
  })

  it('a named trigger that is hidden (a header button on a phone) gives way to the control just pressed', () => {
    const hidden = button('Create workflow', false)
    const empty = button('Create workflow (empty state)')
    rememberForTest(empty, 1000)
    expect(isOnScreen(hidden)).toBe(false)
    expect(pickOrigin(hidden, undefined, 1200)).toBe(empty)
  })

  it('no trigger and nothing pressed lately: scale from the centre (null)', () => {
    const old = button('Long ago')
    rememberForTest(old, 0)
    expect(pickOrigin(null, undefined, 5000)).toBeNull()
    expect(pickOrigin(undefined, undefined, 5000)).toBeNull()
  })

  it('a menu hands over its own button, so a dialog picked from "..." opens out of it', () => {
    const more = button('...')
    rememberOrigin(more)
    expect(pickOrigin(null)).toBe(more)
  })

  it('an element that has left the page never counts', () => {
    const gone = button('Gone')
    rememberForTest(gone, 1000)
    gone.remove()
    expect(pickOrigin(null, undefined, 1100)).toBeNull()
  })
})

describe('scale-from-centre fallback', () => {
  it('starts small and clear, ends at full size', () => {
    expect(scaleFrame(0)).toEqual({ opacity: 0, scale: SCALE.from })
    expect(scaleFrame(1)).toEqual({ opacity: 1, scale: 1 })
    const mid = scaleFrame(0.5)
    expect(mid.scale).toBeGreaterThan(SCALE.from)
    expect(mid.scale).toBeLessThan(1)
  })

  it('reduced motion: a fade with no scaling, 150ms', () => {
    expect(scaleFrame(0.5, true)).toEqual({ opacity: 0.5, scale: 1 })
    expect(SCALE.reducedMs).toBe(150)
  })
})

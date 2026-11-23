// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetPositions, savePosition, scrollAction, useScrollKeeper } from './scrollKeeper'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let go: (to: string | number) => void = () => undefined
function Shell() {
  const navigate = useNavigate()
  go = (to) => navigate(to as string)
  useScrollKeeper()
  return null
}

let root: ReturnType<typeof createRoot> | null = null
let scrollY = 0
const y = () => scrollY
const setY = (v: number) => { scrollY = v }
beforeEach(() => {
  scrollY = 0
  forgetPositions()
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  window.scrollTo = vi.fn((o: ScrollToOptions) => { scrollY = o.top ?? 0 }) as unknown as typeof window.scrollTo
})
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<MemoryRouter initialEntries={['/one']}><Shell /></MemoryRouter>))
}
const nav = (to: string | number) => act(async () => { go(to) })

describe('scroll keeper', () => {
  it('decides: new page top, Back restores, same page stays', () => {
    expect(scrollAction({ type: 'PUSH', samePath: false })).toBe('top')
    expect(scrollAction({ type: 'POP', samePath: false })).toBe('restore')
    expect(scrollAction({ type: 'PUSH', samePath: true })).toBe('stay')
    expect(scrollAction({ type: 'REPLACE', samePath: true })).toBe('stay')
    expect(scrollAction({ type: 'PUSH', samePath: false, hash: '#faq' })).toBe('stay')
  })

  it('a new page starts at the top', async () => {
    await mount()
    setY(500)
    await nav('/two')
    expect(y()).toBe(0)
  })

  it('a change of filter on the same page leaves the scroll alone', async () => {
    await mount()
    setY(500)
    await nav('/one?tab=b')
    expect(y()).toBe(500)
  })

  it('Back returns to where the person was', async () => {
    await mount()
    savePosition('default', 640)
    await nav('/two')
    expect(y()).toBe(0)
    await nav(-1)
    expect(y()).toBe(640)
  })
})

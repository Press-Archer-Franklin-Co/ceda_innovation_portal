// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import { GuideProvider } from './GuideProvider'
import { GuideShell } from './NeedHelp'
import { useGuide } from './guideContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const answer = {
  answer: '',
  language: 'en',
  steps: [
    { id: 's1', text: 'Press Create workflow.', targetId: 'workflows.create', route: null, doneWhen: { type: 'click', targetId: 'workflows.create', route: null } },
    { id: 's2', text: 'Press Check.', targetId: 'workflowBuilder.check', route: null, doneWhen: { type: 'click', targetId: 'workflowBuilder.check', route: null } },
  ],
  sources: [],
  handoff: false,
}
vi.mock('../../lib/guide/api', () => ({
  askGuide: vi.fn(async () => answer),
  guideStatus: vi.fn(async () => ({ features: { guide: true } })),
  handOver: vi.fn(async () => ({ handed_over: true })),
}))
// The genie needs layout; in jsdom the panel simply mounts.
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

let reduced = false
beforeEach(() => {
  reduced = false
  window.matchMedia = (q) => ({ matches: q.includes('reduce') ? reduced : false, media: q, addEventListener() {}, removeEventListener() {} })
  Element.prototype.scrollIntoView = vi.fn()
})

let root
let container
let probe
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
})

function Probe() {
  probe = useGuide()
  return null
}

async function mount({ onTalk } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  // The page's control, drawn (jsdom gives it a size here).
  const create = document.createElement('button')
  create.setAttribute('data-guide', 'workflows.create')
  create.textContent = 'Create workflow'
  create.getBoundingClientRect = () => ({ left: 900, top: 120, width: 170, height: 44, right: 1070, bottom: 164 })
  document.body.appendChild(create)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <I18nProvider>
        <MemoryRouter>
          <GuideProvider app="staff" onTalk={onTalk}>
            <GuideShell />
            <Probe />
          </GuideProvider>
        </MemoryRouter>
      </I18nProvider>,
    )
  })
  return create
}

describe('Need help guide', () => {
  it('opens, answers with steps and rings the first control', async () => {
    const create = await mount()
    await act(async () => { probe.setOpen(true) })
    await act(async () => { await probe.ask('How do I create a workflow?') })
    expect(probe.steps).toHaveLength(2)
    expect(probe.current).toBe(0)
    expect(document.querySelector('#need-help-guide')?.textContent).toContain('Press Create workflow.')
    expect(document.querySelector('.border-yellow')).not.toBeNull()
    expect(document.querySelector('.guide-ring-pulse')).not.toBeNull()
    expect(create.getAttribute('aria-describedby')).toContain('guide-step-tip')
  })

  it('moves to the next step when the ringed control is used', async () => {
    const create = await mount()
    await act(async () => { probe.setOpen(true) })
    await act(async () => { await probe.ask('How do I create a workflow?') })
    await act(async () => { create.click() })
    expect(probe.current).toBe(1)
  })

  it('never rings a control that is not on the page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mount()
    await act(async () => { probe.setOpen(true) })
    await act(async () => { await probe.ask('How?') })
    await act(async () => { probe.next() })
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(probe.missing).toBe(true)
    expect(document.querySelector('.border-yellow')).toBeNull()
    expect(document.querySelector('#need-help-guide')?.textContent).toContain('Skip this step')
    vi.useRealTimers()
  })

  it('reduced motion: the ring does not pulse', async () => {
    reduced = true
    await mount()
    await act(async () => { probe.setOpen(true) })
    await act(async () => { await probe.ask('How?') })
    expect(document.querySelector('.border-yellow')).not.toBeNull()
    expect(document.querySelector('.guide-ring-pulse')).toBeNull()
  })

  it('Talk to a person closes the guide and hands over', async () => {
    const onTalk = vi.fn()
    await mount({ onTalk })
    await act(async () => { probe.setOpen(true) })
    await act(async () => { await probe.ask('How do I create a workflow?') })
    await act(async () => { probe.talk() })
    expect(onTalk).toHaveBeenCalledWith('How do I create a workflow?')
    expect(probe.open).toBe(false)
  })

  it('Escape ends the guide', async () => {
    await mount()
    await act(async () => { probe.setOpen(true) })
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(probe.open).toBe(false)
  })
})

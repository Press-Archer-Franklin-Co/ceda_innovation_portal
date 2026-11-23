// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import NeedHelp from './NeedHelp'

// 2.14: one "Need help?" button. Guide off: the live chat bubble exactly as before. Guide on: the guide button,
// and "Talk to a person" opens the same live chat window.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = { guide: false, guests: true }
vi.mock('../../lib/guide/api', () => ({
  guideStatus: vi.fn(async () => ({ features: { guide: state.guide } })),
  askGuide: vi.fn(async () => ({ answer: '', language: 'en', steps: [], sources: [], handoff: true })),
}))
vi.mock('../../lib/usePublicConfig', () => ({ usePublicConfig: () => ({ features: {}, assistant: { guide_for_guests: state.guests } }) }))
vi.mock('../../services/helpChat.service', () => ({
  helpChatService: {
    status: vi.fn(async () => ({ enabled: true, online: true, hours: null, away_message: '', whatsapp: null })),
    get: vi.fn(),
    mine: vi.fn(async () => null),
  },
  chatStore: { get: () => null, set: () => undefined, clear: () => undefined },
}))
vi.mock('../layout/shellData', () => ({ useShellSettings: () => ({}) }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }))
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open: boolean) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

let root: Root | null = null
let container: HTMLDivElement | null = null
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <NeedHelp />
        </MemoryRouter>
      </I18nProvider>,
    )
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

const buttons = () => [...document.querySelectorAll('button')].filter((b) => !b.className.includes('hidden'))

describe('Need help? and live chat', () => {
  it('guide off: the live chat bubble is there and opens the chat', async () => {
    state.guide = false
    await mount()
    const bubble = buttons().find((b) => b.textContent?.includes('Chat with us'))
    expect(bubble).toBeTruthy()
    expect(buttons().some((b) => b.textContent?.includes('Need help?'))).toBe(false)
    await act(async () => { bubble!.click() })
    expect(document.querySelector('#help-chat')?.hasAttribute('hidden')).toBe(false)
  })

  it('guide on but not allowed for guests: a guest gets the live chat bubble, not the guide', async () => {
    state.guide = true
    state.guests = false
    await mount()
    state.guests = true
    expect(buttons().some((b) => b.textContent?.includes('Need help?'))).toBe(false)
    expect(buttons().some((b) => b.textContent?.includes('Chat with us'))).toBe(true)
  })

  it('guide on: one Need help? button, and Talk to a person opens live chat', async () => {
    state.guide = true
    await mount()
    expect(buttons().some((b) => b.textContent?.includes('Chat with us'))).toBe(false)
    const need = buttons().find((b) => b.textContent?.includes('Need help?'))
    expect(need).toBeTruthy()
    await act(async () => { need!.click() })
    const talk = buttons().find((b) => b.textContent === 'Talk to a person')
    expect(talk).toBeTruthy()
    expect(document.querySelector('#help-chat')?.hasAttribute('hidden')).toBe(true)
    await act(async () => { talk!.click() })
    expect(document.querySelector('#help-chat')?.hasAttribute('hidden')).toBe(false)
    expect(document.querySelector('#need-help-guide')).toBeNull()
  })
})

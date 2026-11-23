// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import NeedHelp from '../guide/NeedHelp'

// Prompt 54: a way back from "Talk to a person" on the website. Back keeps the chat open and the start view
// offers it again; End chat asks in the panel, ends it for staff too, then the next open is the start view.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const store: { value: { id: string; token?: string | null } | null } = { value: null }
const end = vi.fn(async () => ({ status: 'closed', ask_rating: false }))
vi.mock('../../lib/guide/api', () => ({
  guideStatus: vi.fn(async () => ({ features: { guide: true } })),
  askGuide: vi.fn(async () => ({ answer: '', language: 'en', steps: [], sources: [], handoff: true })),
}))
vi.mock('../../lib/usePublicConfig', () => ({ usePublicConfig: () => ({ features: {}, assistant: { guide_for_guests: true } }) }))
vi.mock('../../services/helpChat.service', () => ({
  helpChatService: {
    status: vi.fn(async () => ({ enabled: true, open_now: true, staff_online: true, allow_guests: true, welcome: '', away: '' })),
    get: vi.fn(async () => ({
      conversation: { id: 'c1', status: 'assigned', ask_rating: false },
      messages: { results: [{ id: 'm1', author_role: 'person', author: { name: 'You' }, body: 'Hello', created_at: '2026-11-23T10:00:00Z', attachments: [] }], last_id: 'm1', typing: null, seen_at: null },
      staff_online: true,
    })),
    mine: vi.fn(async () => null),
    end: (...args: unknown[]) => end(...(args as [])),
    typing: vi.fn(async () => undefined),
  },
  chatStore: {
    get: () => store.value,
    set: (v: { id: string; token?: string | null }) => { store.value = v },
    clear: () => { store.value = null },
  },
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
  store.value = { id: 'c1', token: 'guest-token' }
  end.mockClear()
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
    root!.render(<I18nProvider><MemoryRouter initialEntries={['/']}><NeedHelp /></MemoryRouter></I18nProvider>)
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)
const chatHidden = () => document.querySelector('#help-chat')?.hasAttribute('hidden')
const click = async (text: string) => { await act(async () => { button(text)!.click() }); await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

describe('a way back from Talk to a person', () => {
  it('Back keeps the chat open and the start view offers it again', async () => {
    await mount()
    await click('Need help?')
    expect(document.body.textContent).toContain('You have a chat open')
    await click('You have a chat openGo back to it')
    expect(chatHidden()).toBe(false)
    await click('Back to Need help?')
    expect(chatHidden()).toBe(true)
    expect(document.querySelector('#need-help-guide')).not.toBeNull()
    expect(store.value).not.toBeNull() // the chat was not ended
    expect(end).not.toHaveBeenCalled()
  })

  it('End chat asks in the panel, ends it, then the start view comes next', async () => {
    await mount()
    await click('Need help?')
    await click('You have a chat openGo back to it')
    await click('End chat')
    expect(document.body.textContent).toContain('End this chat?')
    await click('Keep chatting')
    expect(end).not.toHaveBeenCalled()
    await click('End chat')
    const confirm = [...document.querySelectorAll('[role="group"] button')].find((b) => b.textContent === 'End chat') as HTMLButtonElement
    await act(async () => { confirm.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(end).toHaveBeenCalledWith('c1', 'guest-token')
    expect(document.body.textContent).toContain('This chat has ended.')
    expect(store.value).toBeNull()
  })
})

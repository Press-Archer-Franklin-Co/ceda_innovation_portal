// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import { ToastContext } from '../../components/ui/toast'
import { analytics } from '../../lib/api/endpoints'
import { busiestSlot, defaultRange, heatLevel, minutesText, normaliseChatReport, readChatFilters } from '../../lib/analytics/chatReport'
import { chatReportEmpty, chatReportFixture } from '../../lib/analytics/chatReport.fixture'
import Reports from './Reports'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let capabilities = []
vi.mock('../../lib/auth/AuthContext', () => ({ useAuth: () => ({ can: (c) => capabilities.includes(c) }) }))
vi.mock('../../components/charts/lazy', () => ({ ChartCanvas: ({ label }) => <div data-testid="chart">{label}</div> }))
vi.mock('./FormAnswers', () => ({ default: () => <div>Form answers page</div> }))
vi.mock('../../lib/api/endpoints', async (orig) => {
  const real = await orig()
  return { ...real, analytics: { ...real.analytics, chat: vi.fn() } }
})

let root, el
beforeEach(() => {
  vi.clearAllMocks()
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})
afterEach(() => { act(() => root?.unmount()); el?.remove() })
async function mount(url = '/reports?tab=chat') {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}><I18nProvider><ToastContext.Provider value={{ show: vi.fn() }}><Reports /></ToastContext.Provider></I18nProvider></MemoryRouter></QueryClientProvider>,
  ))
}
const until = async (text) => {
  for (let i = 0; i < 200; i += 1) {
    if (document.body.textContent.includes(text)) return
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
  throw new Error(`Never showed: ${text}`)
}

describe('chat report helpers', () => {
  const t = (key, v = {}) => ({ 'chatrep.min': `${v.n} min`, 'chatrep.h': `${v.h} h`, 'chatrep.hMin': `${v.h} h ${v.m} min` }[key] ?? key)
  it('reads minutes in plain words and keeps null', () => {
    expect(minutesText(4, t)).toBe('4 min')
    expect(minutesText(80, t)).toBe('1 h 20 min')
    expect(minutesText(120, t)).toBe('2 h')
    expect(minutesText(0, t)).toBe('0 min')
    expect(minutesText(null, t)).toBeNull()
  })
  it('defaults to the last 30 days in Gaborone, and only reads its own filters', () => {
    const now = new Date('2026-11-23T23:30:00Z') // already 24 Nov in Gaborone
    expect(defaultRange(now)).toEqual({ from: '2026-10-26', to: '2026-11-24' })
    expect(readChatFilters(new URLSearchParams('program=x&sector=y&chat_channel=ai'), now)).toEqual({ from: '2026-10-26', to: '2026-11-24', channel: 'ai' })
    expect(readChatFilters(new URLSearchParams('chat_channel=office'), now).channel).toBeUndefined()
  })
  it('finds the busiest slot and scales the heat', () => {
    expect(busiestSlot(chatReportFixture.busiest)).toMatchObject({ weekday: 1, hour: 10 })
    expect(busiestSlot([])).toBeNull()
    expect([heatLevel(0, 12), heatLevel(1, 12), heatLevel(12, 12)]).toEqual([0, 1, 4])
  })
  it('never turns a missing number into 0', () => {
    const r = normaliseChatReport(chatReportEmpty)
    expect(r.totals.medianFirstReply).toBeNull()
    expect(r.totals.averageRating).toBeNull()
    expect(r.totals.started).toBe(0)
  })
})

describe('Reports > Live chat', () => {
  it('has no tab and asks for nothing without analytics.view', async () => {
    capabilities = ['dashboard.view']
    analytics.chat.mockResolvedValue(chatReportFixture)
    await mount()
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    expect([...document.querySelectorAll('[role=tab]')].some((b) => b.textContent === 'Live chat')).toBe(false)
    expect(analytics.chat).not.toHaveBeenCalled()
  })
  it('shows the numbers, in plain words, with the busiest hour', async () => {
    capabilities = ['analytics.view']
    analytics.chat.mockResolvedValue(chatReportFixture)
    await mount()
    await until('Chats started')
    const text = document.body.textContent
    expect(text).toContain('88.3% of started')
    expect(text).toContain('4 min')
    expect(text).toContain('4.4 out of 5')
    expect(text).toContain('61 rated')
    expect(text).toContain('Busiest: Tuesday 10:00 to 11:00')
    expect(text).toContain('1 h 20 min')
    expect(text).toContain('Kago Tau')
    expect(text).not.toContain('Export') // needs reports.export
  })
  it('shows "No data yet" for nulls, never 0, and the note when chat is off', async () => {
    capabilities = ['analytics.view']
    analytics.chat.mockResolvedValue(chatReportEmpty)
    await mount()
    await until('Live chat is switched off.')
    const reply = [...document.querySelectorAll('dt')].find((d) => d.textContent === 'Median time to first reply').parentElement
    expect(reply.textContent).toContain('No data yet')
    expect(reply.textContent).not.toContain('0 min')
    const rating = [...document.querySelectorAll('dt')].find((d) => d.textContent === 'Average rating').parentElement
    expect(rating.textContent).toContain('No data yet')
    expect(document.querySelector('a[href="/admin/live-chat"]')).toBeNull() // needs settings.manage
  })
  it('says plainly when the report is not on the server yet', async () => {
    capabilities = ['analytics.view']
    analytics.chat.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
    await mount()
    await until('The chat report is not available yet.')
  })
})

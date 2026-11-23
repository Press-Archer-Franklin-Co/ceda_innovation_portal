// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import I18nProvider from '../../i18n/I18nProvider'
import { ToastContext } from '../ui/toast'
import { ConfirmContext } from '../ui/confirm'
import { bodyFromForm, formFromSession, formProblems, pitchApi, pitchWhen, shownSession } from '../../lib/api/pitch'
import PitchSchedule from './PitchSchedule'
import PitchSessionModal from './PitchSessionModal'
import StageList from './StageList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let capabilities = ['challenges.manage']
vi.mock('../../lib/auth/AuthContext', () => ({ useAuth: () => ({ can: (c) => capabilities.includes(c) }) }))
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})
vi.mock('../../lib/api/pitch', async (orig) => ({ ...(await orig()), pitchApi: { get: vi.fn(), save: vi.fn(), remove: vi.fn(), schedule: vi.fn() } }))
vi.mock('../../lib/api/client', () => ({ client: { get: vi.fn(async () => ({ workflow: { id: 'w1', name: 'Challenge flow', step_count: 2 }, stages: [{ step_id: 's2', order: 2, name: 'Pitch', takes_part: 'shortlisted', moves_on: { kind: 'panel_score' }, pitch: SESSION }] })), patch: vi.fn() } }))
vi.mock('../../lib/queries/forms', () => ({ useForms: () => ({ data: { results: [] } }) }))

const SESSION = {
  starts_at: '2026-11-28T07:00:00Z', starts_at_local: '2026-11-28T09:00:00+02:00', timezone: 'Africa/Gaborone', date: '2026-11-28', time: '09:00',
  duration_minutes: 20, format: 'in_person', place: { en: 'CEDA House, Gaborone', tn: 'Ntlo ya CEDA' }, meeting_link: '',
  instructions: { en: 'Bring a 5-slide deck.', tn: '' }, set_for: 'idea', updated_at: '2026-11-23T08:00:00Z',
}
const toast = { show: vi.fn() }
const confirm = vi.fn(async () => true)
let root, el
beforeEach(() => {
  capabilities = ['challenges.manage']
  vi.clearAllMocks()
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})
afterEach(() => { act(() => root?.unmount()); el?.remove() })
async function mount(node) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={qc}><MemoryRouter><I18nProvider><ToastContext.Provider value={toast}><ConfirmContext.Provider value={confirm}>{node}</ConfirmContext.Provider></ToastContext.Provider></I18nProvider></MemoryRouter></QueryClientProvider>,
  ))
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
}
const until = async (check) => {
  for (let i = 0; i < 150; i += 1) {
    if (check()) return
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
  throw new Error('The screen did not reach the expected state.')
}
const shows = (text) => () => document.body.textContent.includes(text)
const ready = (text) => () => { const b = button(text); return b && !b.disabled }
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

describe('pitch form helpers', () => {
  it('sends a place in person and a link online, never both', () => {
    const inPerson = bodyFromForm({ ...formFromSession(SESSION) })
    expect(inPerson).toEqual({ starts_at: '2026-11-28T09:00', duration_minutes: 20, format: 'in_person', place: { en: 'CEDA House, Gaborone', tn: 'Ntlo ya CEDA' }, meeting_link: '', instructions: { en: 'Bring a 5-slide deck.', tn: '' } })
    const online = bodyFromForm({ ...formFromSession(SESSION), format: 'online', link: 'https://meet.example.com/x' })
    expect(online.place).toEqual({ en: '', tn: '' })
    expect(online.meeting_link).toBe('https://meet.example.com/x')
  })
  it('asks for the time, and the place or an https link', () => {
    expect(formProblems(formFromSession(null))).toEqual(['when', 'place'])
    expect(formProblems({ ...formFromSession(SESSION), format: 'online', link: 'http://x' })).toEqual(['link'])
  })
  it('shows Gaborone date and time from the API, and the own time before the stage time', () => {
    expect(pitchWhen(SESSION)).toBe('Sat, 28 Nov, 09:00')
    expect(shownSession({ own: null, shown: { ...SESSION, set_for: 'stage' } }).set_for).toBe('stage')
    expect(shownSession({ own: null, shown: null })).toBeNull()
  })
})

describe('pitch schedule', () => {
  const rows = { count: 2, not_set_count: 1, results: [
    { submission_id: 'a', reference: 'CEDA-1', title: 'Mopane snacks', innovator: { name: 'Neo Kebadile' }, own: SESSION, shown: SESSION },
    { submission_id: 'b', reference: 'CEDA-2', title: 'Tractor hire', innovator: { name: 'Lesedi Molefe' }, own: null, shown: null },
  ] }
  it('lists set and not-set rows, with Set time and Change', async () => {
    pitchApi.schedule.mockResolvedValue(rows)
    await mount(<PitchSchedule program={{ id: 'p1' }} />)
    await until(shows('Neo Kebadile'))
    const text = document.body.textContent
    expect(text).toContain('Neo Kebadile')
    expect(text).toContain('Sat, 28 Nov, 09:00')
    expect(text).toContain('In person: CEDA House, Gaborone')
    expect(text).toContain('Not set')
    expect(text).toContain('Not set only (1)')
    expect(button('Change')).toBeTruthy()
    expect(button('Set time')).toBeTruthy()
  })
  it('has no edit actions without the capability', async () => {
    capabilities = []
    pitchApi.schedule.mockResolvedValue(rows)
    await mount(<PitchSchedule program={{ id: 'p1' }} />)
    await until(shows('Neo Kebadile'))
    expect(button('Change')).toBeUndefined()
    expect(button('Set time')).toBeUndefined()
  })
  it('says honestly when the list is not on the server yet', async () => {
    pitchApi.schedule.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
    await mount(<PitchSchedule program={{ id: 'p1' }} />)
    await until(shows('The pitch schedule list is not available yet.'))
  })
})

describe('set or change one person', () => {
  it('Save calls PUT with the form, and says the person will be told', async () => {
    pitchApi.get.mockResolvedValue({ shortlisted: true, own: SESSION, shown: SESSION })
    pitchApi.save.mockResolvedValue(SESSION)
    await mount(<PitchSessionModal open onClose={() => {}} programId="p1" submissionId="a" name="Neo Kebadile" />)
    await until(ready('Save'))
    await act(async () => button('Save').click())
    await until(() => toast.show.mock.calls.length > 0)
    expect(pitchApi.save).toHaveBeenCalledWith('p1', 'a', bodyFromForm(formFromSession(SESSION)))
    expect(toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success', title: 'Neo Kebadile will be told.' }))
  })
  it('Remove asks first, then calls DELETE', async () => {
    pitchApi.get.mockResolvedValue({ shortlisted: true, own: SESSION, shown: SESSION })
    pitchApi.remove.mockResolvedValue(null)
    await mount(<PitchSessionModal open onClose={() => {}} programId="p1" submissionId="a" name="Neo Kebadile" />)
    await until(ready('Remove time'))
    await act(async () => button('Remove time').click())
    await until(() => pitchApi.remove.mock.calls.length > 0)
    expect(confirm).toHaveBeenCalled()
    expect(pitchApi.remove).toHaveBeenCalledWith('p1', 'a')
  })
  it('an empty form does not save', async () => {
    pitchApi.get.mockResolvedValue({ shortlisted: true, own: null, shown: null })
    await mount(<PitchSessionModal open onClose={() => {}} programId="p1" submissionId="b" name="Lesedi Molefe" />)
    await until(ready('Save'))
    await act(async () => button('Save').click())
    expect(pitchApi.save).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Give the date and time of the pitch session.')
  })
})

describe('stage card', () => {
  it('says times are per person, links to the schedule, and keeps an old stage time read-only', async () => {
    await mount(<StageList program={{ id: 'p1', form_summary: null }} onGoWorkflow={() => {}} />)
    await until(() => document.querySelector('button[aria-expanded]'))
    await act(async () => [...document.querySelectorAll('button[aria-expanded]')].at(-1).click())
    await until(shows('Pitch times are set per person.'))
    const text = document.body.textContent
    expect(text).toContain('Pitch times are set per person.')
    expect(document.querySelector('a[href="/programs/p1/edit?section=pitch"]')).toBeTruthy()
    expect(text).toContain('This stage still has one time for everyone: Sat, 28 Nov, 09:00, Gaborone time.')
    expect(document.querySelector('input[type="datetime-local"][value^="2026-11-28T09"]')).toBeNull()
  })
  it('hides the schedule link without the capability', async () => {
    capabilities = []
    await mount(<StageList program={{ id: 'p1', form_summary: null }} onGoWorkflow={() => {}} />)
    await until(() => document.querySelector('button[aria-expanded]'))
    await act(async () => [...document.querySelectorAll('button[aria-expanded]')].at(-1).click())
    await until(shows('Pitch times are set per person.'))
    expect(document.querySelector('a[href="/programs/p1/edit?section=pitch"]')).toBeNull()
  })
})

// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { ToastProvider } from '../../components/ui/Toast'
import { innovatorEn as en, innovatorTn as tn } from '../../i18n/innovator'
import type { PublishedForm } from '../../types/innovator'
import IdeaForm from './IdeaForm'

// 23 Nov, data protection: only officers see similar ideas. The idea form never looks them up or shows them.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const calls = vi.hoisted(() => [] as string[])
vi.mock('../../services/api', () => {
  const record = (url: string) => {
    calls.push(url)
    return Promise.resolve({ data: { success: true, data: {} } })
  }
  return { default: { get: record, post: record, put: record, patch: record, delete: record, interceptors: { request: { use() {} }, response: { use() {} } } } }
})
vi.mock('../../services/assistant.service', () => ({
  assistantService: { status: () => Promise.resolve(null), draftCheck: vi.fn(), reviewDocument: vi.fn() },
  isCancel: () => false,
  isNotFound: () => false,
}))
vi.mock('../../lib/motion/useGenie', async () => {
  const { useRef } = await import('react')
  return { useGenie: (open: boolean) => ({ mounted: open, panelRef: useRef(null), backdropRef: useRef(null) }) }
})

const { LONG, form } = vi.hoisted(() => {
  const LONG = 'We keep milk cold at rural collection points with solar power so dairy farmers lose less milk every day.'
  const field = { id: 'f1', key: 'solution', type: 'textarea', label: 'Your solution', help_text: '', placeholder: '', required: false, is_challenge_question: false, width: 'full', is_active: true, link_url: '', options: [], rules: [], visible_if: null, required_if: null, enabled_if: null, validation_rules: {}, media_config: {}, default_value: null, example_value: null }
  const form = {
    id: 'form1', name: 'Idea', description: '', languages: ['en'], language: 'en', loose_fields: [], version: { id: 'v1', number: 1, published_at: '2026-11-01T00:00:00Z' },
    steps: [{ id: 's1', code: 'your-idea', title: 'Your idea', description: '', tips: ['Say who it is for.'], is_active: true, rows: [{ row: 1, fields: [field] }] }],
  } as unknown as PublishedForm
  return { LONG, form }
})
vi.mock('../../services/forms.service', () => ({ formsService: { published: () => Promise.resolve(form), generalIdea: () => Promise.resolve(form) } }))
vi.mock('../../services/intake.service', async (original) => {
  const real = await original<typeof import('../../services/intake.service')>()
  const draft = {
    id: 'd1', reference_number: 'DRAFT-1', program: 'p1', program_detail: { id: 'p1', title: 'General ideas', slug: 'general', is_general_intake: true },
    submission_type: 'idea', sector: null, is_general_idea: true, percent_complete: 10, guest_phone_verified: false, innovator: 'u1', team: null,
    title: 'Solar milk cooling', status: 'draft', version: 1, draft_data: { solution: LONG }, progress_metadata: {}, current_section_code: 'your-idea',
    submitted_submission: null, form_id: 'form1', form_version_id: 'v1', profile_prefill: {},
  }
  return { ...real, intakeService: { ...real.intakeService, getDraft: () => Promise.resolve(draft), saveStep: () => Promise.resolve({ saved_at: new Date().toISOString() }) } }
})

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('Idea form: no similar ideas for innovators', () => {
  it('shows no similar ideas panel and asks for none while a long description is typed', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <I18nProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/my-ideas/draft/d1']}>
              <Routes>
                <Route path="/my-ideas/draft/:id" element={<IdeaForm />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </I18nProvider>,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    const box = host.querySelector('textarea')
    expect(box).not.toBeNull()
    expect(box!.value).toContain('solar power')
    expect(host.textContent).toContain('Say who it is for.') // the tips part of the panel stays
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000) // well past the old 1.5 second pause
    })
    expect(calls.some((url) => url.includes('similar'))).toBe(false)
    expect(host.textContent ?? '').not.toMatch(/similar idea/i)
  })

  it('has no similar ideas strings in English or Setswana', () => {
    for (const strings of [en, tn]) expect(Object.keys(strings).filter((key) => key.includes('similar'))).toEqual([])
  })
})

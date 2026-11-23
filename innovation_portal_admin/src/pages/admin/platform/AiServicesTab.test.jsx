// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const KEY = 'sk-test-made-up-key-1234'
const PROVIDERS = [
  { key: 'openai_compatible', kind: 'ai', label: 'Any AI service (OpenAI-compatible address)', description: 'Most AI services give an OpenAI-compatible address.', fields: [
    { name: 'base_url', label: 'Address (base URL)', type: 'url', required: true, secret: false, choices: [] },
    { name: 'api_key', label: 'API key', type: 'text', required: true, secret: true, choices: [] },
    { name: 'model', label: 'Model name', type: 'text', required: false, secret: false, choices: [] },
    { name: 'environment', label: 'Key type', type: 'select', required: true, secret: false, default: 'test', choices: [{ value: 'test', label: 'Test key' }, { value: 'live', label: 'Live key' }] },
    { name: 'json_schema', label: 'Follows a JSON schema', type: 'boolean', required: false, secret: false, default: true, choices: [] },
  ] },
  { key: 'anthropic', kind: 'ai', label: 'Anthropic (Claude)', fields: [] },
  { key: 'openai', kind: 'ai', label: 'OpenAI', fields: [] },
]
const state = { connections: [], saved: [] }
const save = vi.fn(async ({ body }) => {
  state.saved.push(body)
  return { id: 'c1', kind: 'ai', provider: body.provider, name: body.name, config: body.config, is_active: false, status: 'draft', secrets: { api_key: { is_set: true, last4: '1234' } } }
})
const mutation = (fn) => ({ mutateAsync: fn ?? vi.fn(async () => ({})), isPending: false })

vi.mock('../../../lib/queries/platform', () => ({
  useIntegrations: () => ({ data: state.connections, isLoading: false, isError: false, refetch: vi.fn() }),
  useProviders: () => ({ data: PROVIDERS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveIntegration: () => mutation(save),
  useTestIntegration: () => mutation(),
  useActivateIntegration: () => mutation(),
  useDeactivateIntegration: () => mutation(),
  useStartSsoTrial: () => mutation(),
}))
vi.mock('../../../lib/api/aiServices', () => ({
  aiServices: {
    overview: vi.fn(async () => ({
      state: 'needs_setup', keys_in_use: 'test', monthly_limit_usd: '50.00', send_names: false, services: [],
      features: [{ key: 'draft_check', label: 'Idea coach (innovators)', on: true, route: null, chosen: null }],
    })),
    saveSettings: vi.fn(async () => ({})),
  },
}))
vi.mock('../../../lib/auth/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }))

const { default: AiServicesTab } = await import('./AiServicesTab')
const { default: ToastProvider } = await import('../../../components/ui/ToastProvider')
const { default: ConfirmProvider } = await import('../../../components/ui/ConfirmProvider')

function byLabel(text) {
  // Inside the set-up dialog: the AI settings card has its own (hidden) "Model name" labels.
  const scope = document.querySelector('[role="dialog"]') ?? document
  const label = [...scope.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text))
  return label ? document.getElementById(label.htmlFor) : null
}
function type(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('AI services tab', () => {
  let host
  let root
  beforeEach(() => {
    window.matchMedia = window.matchMedia ?? ((q) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    state.connections = []
    state.saved = []
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => root.render(
      <MemoryRouter><QueryClientProvider client={client}><ToastProvider><ConfirmProvider><AiServicesTab /></ConfirmProvider></ToastProvider></QueryClientProvider></MemoryRouter>,
    ))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.body.innerHTML = ''
  })

  it('says what to do when there is no AI service and shows the AI settings card', async () => {
    await flush()
    expect(document.body.textContent).toContain('No AI service yet. Add one to switch on the AI helper.')
    expect(document.body.textContent).toContain('AI settings')
    expect(document.body.textContent).toContain('Keys in use')
    expect(document.body.textContent).toContain('Only calls on services with prices count.')
    expect(document.querySelector('[data-guide="integrations.ai.add"]')).toBeTruthy()
  })

  it('offers Any AI service first and saves a connection without showing the key again', async () => {
    await flush()
    act(() => document.querySelector('[data-guide="integrations.ai.add"]').click())
    await flush()
    expect(PROVIDERS[0].label).toBe('Any AI service (OpenAI-compatible address)')
    expect(document.body.textContent).toContain('Any AI service (OpenAI-compatible address)')
    expect(document.querySelector('[data-guide="integrations.test"]')).toBeTruthy()
    expect(document.querySelector('[data-guide="integrations.activate"]')).toBeTruthy()

    expect(document.querySelector('[role="dialog"] input[role="switch"]').checked).toBe(true)
    act(() => type(byLabel('Address (base URL)'), 'https://ai.example.invalid/v1'))
    act(() => type(byLabel('API key'), KEY))
    act(() => type(byLabel('Model name'), 'made-up-model'))
    await act(async () => { button('Save as draft').click() })
    await flush()

    expect(save).toHaveBeenCalled()
    const body = state.saved.at(-1)
    expect(body.provider).toBe('openai_compatible')
    expect(body.secrets.api_key).toBe(KEY)
    expect(body.config).toMatchObject({ base_url: 'https://ai.example.invalid/v1', model: 'made-up-model', environment: 'test', json_schema: true })
    const values = [...document.querySelectorAll('input')].map((i) => i.value)
    expect(values).not.toContain(KEY)
    expect(document.body.textContent).toContain('1234')
  })
})

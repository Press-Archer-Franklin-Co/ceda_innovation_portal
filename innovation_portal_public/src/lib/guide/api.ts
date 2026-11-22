import api from '../../services/api'
import { unwrapData } from '../../services/envelope'
import { GUIDE, normaliseGuide, type GuideAnswer } from './guide'

// The guide's API (built by the AI lane): GET /api/assistant/status/ (features.guide) and
// POST /api/assistant/guide/. Until it is on main, `VITE_GUIDE_MOCK=1 npm run dev` answers from lib/guide/mock.ts.
// import.meta.env.DEV is false in a build, so the mock and its import are removed from production bundles.
const MOCK = import.meta.env.DEV && import.meta.env.VITE_GUIDE_MOCK === '1'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface AssistantStatus { available?: boolean; features?: Record<string, boolean>; guests_can_ask?: boolean }

/** Which helper parts are on. null when it cannot be read (the guide then stays hidden). */
export async function guideStatus(): Promise<AssistantStatus | null> {
  if (MOCK) return { available: true, features: { guide: true } }
  try {
    const { data } = await api.get('/assistant/status/')
    return unwrapData<AssistantStatus>(data)
  } catch {
    return null
  }
}

/** Ask the guide. Resolves to normaliseGuide(...) or throws (the panel then says it can't answer right now). */
export async function askGuide(body: object): Promise<GuideAnswer> {
  if (MOCK) {
    const { mockGuide } = await import('./mock')
    await wait(600)
    return normaliseGuide(mockGuide(body))
  }
  const { data } = await api.post('/assistant/guide/', body, { timeout: GUIDE.timeoutMs })
  return normaliseGuide(unwrapData(data))
}

import { client } from '../api/client'
import { GUIDE, normaliseGuide } from './guide'

// The guide's API (built by the AI lane): GET /api/assistant/status/ (features.guide) and
// POST /api/assistant/guide/. Until it is on main, `VITE_GUIDE_MOCK=1 npm run dev` answers from lib/guide/mock.js.
// import.meta.env.DEV is false in a build, so the mock and its import are removed from production bundles.
const MOCK = import.meta.env.DEV && import.meta.env.VITE_GUIDE_MOCK === '1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Which helper parts are on. null when it cannot be read (the guide then stays hidden). */
export async function guideStatus() {
  if (MOCK) return { available: true, features: { guide: true } }
  try {
    return await client.get('/api/assistant/status/')
  } catch {
    return null
  }
}

/** Ask the guide. Resolves to normaliseGuide(...) or throws (the panel then says it can't answer right now). */
export async function askGuide(body) {
  if (MOCK) {
    const { mockGuide } = await import('./mock')
    await wait(600)
    return normaliseGuide(mockGuide(body))
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GUIDE.timeoutMs)
  try {
    return normaliseGuide(await client.post('/api/assistant/guide/', body, { signal: ctrl.signal }))
  } finally {
    clearTimeout(timer)
  }
}

/** Staff "Talk to a person": the question goes to the team's inbox (C3 help hand-over). */
export async function handOver(question, lang) {
  if (MOCK) {
    await wait(400)
    return { handed_over: true }
  }
  return client.post('/api/assistant/help/', { question, lang, handoff: true })
}

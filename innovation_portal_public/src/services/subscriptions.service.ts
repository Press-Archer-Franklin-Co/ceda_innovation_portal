import api from './api'

// Sign up for updates (B6 part 2): POST /api/content/public/subscriptions/. Email is double opt-in: the person
// confirms from the email link, which opens /subscribe/confirm/<token> here. /unsubscribe/<token> stops updates.

export interface SubscribeRequest {
  email: string
  phone?: string
  topics?: string[]
  language: 'en' | 'tn'
}

/** What a link page shows: done, a link that no longer works, too many tries for now (429), or a failure. */
export type LinkOutcome = 'done' | 'invalid' | 'busy' | 'error'

async function followLink(path: string): Promise<LinkOutcome> {
  try {
    await api.get(path)
    return 'done'
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    return status === 404 ? 'invalid' : status === 429 ? 'busy' : 'error'
  }
}

export const subscriptionsService = {
  async subscribe(payload: SubscribeRequest): Promise<void> {
    await api.post('/content/public/subscriptions/', payload)
  },
  confirm: (token: string) => followLink(`/content/public/subscriptions/confirm/${encodeURIComponent(token)}/`),
  unsubscribe: (token: string) => followLink(`/content/public/unsubscribe/${encodeURIComponent(token)}/`),
}

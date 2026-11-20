import axios from 'axios'
import api from './api'

// TODO(B6 part 2): POST /api/content/public/subscriptions/ (double opt-in by email) is planned in B6 part D and is
// not on main yet. Until it is, the call answers 404 and the form says sign-ups open soon.

export interface SubscribeRequest {
  email: string
  phone?: string
  topics?: string[]
  language: 'en' | 'tn'
}

export class SubscriptionsNotAvailable extends Error {}

export const subscriptionsService = {
  async subscribe(payload: SubscribeRequest): Promise<void> {
    try {
      await api.post('/content/public/subscriptions/', payload)
    } catch (err) {
      if (axios.isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 405)) {
        throw new SubscriptionsNotAvailable('subscriptions not available yet')
      }
      throw err
    }
  },
}

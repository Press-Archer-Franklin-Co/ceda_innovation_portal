import api from './api'
import type { InnovatorProfile } from '../types/api'

export const profileService = {
  async get(): Promise<InnovatorProfile> {
    const { data } = await api.get<InnovatorProfile>('/profile/')
    return data
  },

  async update(payload: Partial<Omit<InnovatorProfile, 'id' | 'user'>>): Promise<InnovatorProfile> {
    const { data } = await api.patch<InnovatorProfile>('/profile/', payload)
    return data
  },
}

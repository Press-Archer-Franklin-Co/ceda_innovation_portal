import api from './api'
import { unwrapData } from './envelope'
import type { Envelope, IdeaMessage, NewMessage, RecentThread } from '../types/innovator'

/**
 * Screen 2.4 messages and the 2.2 side panel.
 * TODO(B3): these endpoints are planned in B3 and not built yet. Paths follow
 * the prompt; check the response shape when B3 lands.
 */
export const ideaMessagesService = {
  async list(ideaId: string): Promise<IdeaMessage[]> {
    const { data } = await api.get<Envelope<IdeaMessage[]> | IdeaMessage[] | { results: IdeaMessage[] }>(`/me/ideas/${ideaId}/messages/`)
    const body = unwrapData<IdeaMessage[] | { results: IdeaMessage[] }>(data)
    return Array.isArray(body) ? body : body.results
  },

  async send(ideaId: string, message: NewMessage): Promise<IdeaMessage> {
    const { data } = await api.post<Envelope<IdeaMessage> | IdeaMessage>(`/me/ideas/${ideaId}/messages/`, message)
    return unwrapData(data)
  },

  async markRead(ideaId: string): Promise<void> {
    await api.post(`/me/ideas/${ideaId}/messages/read/`, {})
  },

  async recent(): Promise<RecentThread[]> {
    const { data } = await api.get<Envelope<RecentThread[]> | RecentThread[] | { results: RecentThread[] }>('/me/messages/recent/')
    const body = unwrapData<RecentThread[] | { results: RecentThread[] }>(data)
    return Array.isArray(body) ? body : body.results
  },
}

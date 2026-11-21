import api from './api'
import { unwrapData } from './envelope'
import type { IdeaMessage, MessageThreadPayload, NewMessage, RecentMessages } from '../types/innovator'

/** Screen 2.4 messages and the 2.2 side panel (B3, apps/communications/message_views.py). */
export const ideaMessagesService = {
  async thread(ideaId: string): Promise<MessageThreadPayload> {
    const { data } = await api.get(`/me/ideas/${ideaId}/messages/`)
    return unwrapData<MessageThreadPayload>(data)
  },

  async send(ideaId: string, message: NewMessage): Promise<IdeaMessage> {
    const { data } = await api.post(`/me/ideas/${ideaId}/messages/`, message)
    return unwrapData<IdeaMessage>(data)
  },

  /** U11C (R-52): tells the officer you are typing. Sent at most every few seconds. */
  async typing(ideaId: string): Promise<void> {
    await api.post(`/me/ideas/${ideaId}/messages/typing/`, {})
  },

  async markRead(ideaId: string): Promise<void> {
    await api.post(`/me/ideas/${ideaId}/messages/read/`, {})
  },

  async recent(): Promise<RecentMessages> {
    const { data } = await api.get('/me/messages/recent/')
    return unwrapData<RecentMessages>(data)
  },
}

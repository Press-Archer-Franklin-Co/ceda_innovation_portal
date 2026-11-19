import api from './api'
import { query, unwrapData } from './envelope'
import type { Envelope, NotificationCategory, NotificationItem, NotificationPreferences } from '../types/innovator'

/** Screen 2.5 and the bell in the header (main). */
export const notificationsService = {
  async list(category?: NotificationCategory): Promise<NotificationItem[]> {
    // TODO(R-8): the API ignores `category` until R-8 is done; filter here meanwhile.
    const { data } = await api.get<Envelope<NotificationItem[]>>(`/notifications/${query({ category })}`)
    const items = unwrapData<NotificationItem[]>(data)
    return category ? items.filter(item => !item.category || item.category === category) : items
  },

  async unreadCount(): Promise<number> {
    const { data } = await api.get<Envelope<{ unread_count?: number; count?: number }>>('/notifications/unread-count/')
    const body = unwrapData<{ unread_count?: number; count?: number }>(data)
    return body.unread_count ?? body.count ?? 0
  },

  /** No ids marks every notification read. */
  async markRead(ids?: string[]): Promise<number> {
    const { data } = await api.post<Envelope<{ updated: number }>>('/notifications/mark-read/', ids ? { ids } : { mark_all: true })
    return unwrapData<{ updated: number }>(data).updated
  },

  async markOneRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/mark-read/`, {})
  },

  async preferences(): Promise<NotificationPreferences> {
    const { data } = await api.get<Envelope<NotificationPreferences> | NotificationPreferences>('/notifications/preferences/')
    return unwrapData(data)
  },

  /** Types and channels left out keep their current value. */
  async savePreferences(preferences: NotificationPreferences['preferences']): Promise<NotificationPreferences> {
    const { data } = await api.put<Envelope<NotificationPreferences> | NotificationPreferences>('/notifications/preferences/', { preferences })
    return unwrapData(data)
  },
}

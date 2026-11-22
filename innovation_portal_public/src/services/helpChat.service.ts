import api from './api'
import { unwrapData } from './envelope'

// C1 website help chat (Figma 2.12, 133:565 website, 133:978 phone). Signed-in people chat as themselves; guests
// (when the admin allows it) give a name and email and get a token they send back as X-Chat-Token. Everything is
// 404 while the live_chat switch is off; status says so without an error.

export interface HelpChatStatus {
  enabled: boolean
  open_now: boolean
  staff_online: boolean
  allow_guests: boolean
  welcome: string
  away: string
  ask_rating: boolean
}

export interface ChatMessage {
  id: string
  author_role: 'person' | 'staff' | 'bot' | 'system'
  author: { name: string; role?: string } | null
  body: string
  created_at: string
  seen_by: { name: string; at: string } | null
}

export interface ChatBlock {
  results: ChatMessage[]
  last_id: string | null
  typing: { name: string } | null
  /** When the other side last read the chat (shows "Seen" on messages already on screen). */
  seen_at?: string | null
}

export interface HelpChat {
  conversation: { id: string; status: 'waiting' | 'assigned' | 'closed'; ask_rating?: boolean }
  messages: ChatBlock
  staff_online?: boolean
}

const STORE = 'ceda_help_chat'

/** The open chat survives a reload or closing the bubble: {id, token?}. */
export const chatStore = {
  get(): { id: string; token?: string | null } | null {
    try {
      const raw = localStorage.getItem(STORE)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  set(value: { id: string; token?: string | null }) {
    try { localStorage.setItem(STORE, JSON.stringify(value)) } catch { /* private mode: the chat lasts this page */ }
  },
  clear() {
    try { localStorage.removeItem(STORE) } catch { /* nothing to clear */ }
  },
}

const headers = (token?: string | null) => (token ? { 'X-Chat-Token': token } : undefined)

export const helpChatService = {
  async status(lang: string): Promise<HelpChatStatus> {
    const { data } = await api.get('/help-chat/status/', { params: { lang } })
    return unwrapData<HelpChatStatus>(data)
  },
  async start(body: { message: string; name?: string; email?: string; language?: string }): Promise<HelpChat & { token: string | null }> {
    const { data } = await api.post('/help-chat/', body)
    return unwrapData<HelpChat & { token: string | null }>(data)
  },
  /** Signed in: the open chat from any device, or null. */
  async mine(): Promise<string | null> {
    const { data } = await api.get('/help-chat/mine/')
    return unwrapData<{ conversation: { id: string } | null }>(data).conversation?.id ?? null
  },
  async get(id: string, after: string | null, token?: string | null): Promise<HelpChat> {
    const { data } = await api.get(`/help-chat/${id}/`, { params: after ? { after } : {}, headers: headers(token) })
    return unwrapData<HelpChat>(data)
  },
  async send(id: string, body: string, token?: string | null): Promise<ChatMessage> {
    const { data } = await api.post(`/help-chat/${id}/messages/`, { body }, { headers: headers(token) })
    return unwrapData<ChatMessage>(data)
  },
  async typing(id: string, token?: string | null): Promise<void> {
    await api.post(`/help-chat/${id}/typing/`, {}, { headers: headers(token) })
  },
  async rate(id: string, satisfaction: number, token?: string | null): Promise<void> {
    await api.post(`/help-chat/${id}/rate/`, { satisfaction }, { headers: headers(token) })
  },
}

import { client } from './client'

// C1 live chat (Figma 3.30 Inbox 134:1156 / 134:1445, 3.28 Live chat settings 123:1546 / 123:1913).
// Everything answers 404 while the live_chat switch is off.

export const inboxApi = {
  /** {count, page, page_size, results: [{type: idea|conversation, id, channel, who, subject, preview, last_at, waiting_since, assignee, unread, status, handed_over_by, submission}], now} */
  list: (params) => client.get('/api/inbox/', params),
  /** {unread, unassigned} */
  unread: () => client.get('/api/inbox/unread/'),
  /** [{id, name, open, max_open, backup, online}] */
  people: () => client.get('/api/inbox/people/'),
  /** [{id, title, body}] in the asked language */
  savedReplies: (lang) => client.get('/api/inbox/saved-replies/', { lang }),
  /** {conversation: {...}, messages: {results, last_id, typing}} */
  conversation: (id, after) => client.get(`/api/inbox/conversations/${id}/`, after ? { after } : undefined),
  saveTeamNote: (id, teamNote) => client.patch(`/api/inbox/conversations/${id}/`, { team_note: teamNote }),
  /** reply {body} · note {body} · take · assign {user_id} · close {reason} · reopen · convert {into} · typing */
  act: (id, action, body) => client.post(`/api/inbox/conversations/${id}/${action}/`, body ?? {}),
}

/** Idea threads (B3 messages with the C1 hints): {results, last_id, typing, open_question}. */
export const ideaChatApi = {
  messages: (submissionId, after) => client.get(`/api/submissions/${submissionId}/messages/`, after ? { after } : undefined),
  send: (submissionId, body) => client.post(`/api/submissions/${submissionId}/messages/`, body),
  typing: (submissionId) => client.post(`/api/submissions/${submissionId}/messages/typing/`, {}),
}

export const liveChatSettingsApi = {
  get: () => client.get('/api/live-chat/settings/'),
  save: (body) => client.put('/api/live-chat/settings/', body),
}

/** One message shape for both sources: idea messages say applicant / officer, conversations say person / staff. */
export function normaliseMessage(m) {
  const role = m.author_role === 'applicant' ? 'person' : m.author_role === 'officer' ? 'staff' : m.author_role
  return { ...m, role, internal: Boolean(m.is_internal) }
}

/** Merge newly fetched messages into the list, by id, keeping order. */
export function mergeMessages(list, incoming) {
  if (!incoming?.length) return list
  const seen = new Map(list.map((m) => [m.id, m]))
  for (const m of incoming) seen.set(m.id, normaliseMessage(m))
  return [...seen.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

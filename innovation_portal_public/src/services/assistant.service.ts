import { useEffect, useState } from 'react'
import api from './api'
import { unwrapData } from './envelope'
import { DRAFT_TOKEN_HEADER, resumeStorage } from './intake.service'

/**
 * C3 AI helper. Every call answers `{ available: false }` when the helper is off, out of
 * budget or failed; callers then hide the helper. Network errors are treated the same way:
 * nothing about the helper is ever shown to the public as an error.
 */

export interface AssistantStatus {
  available: boolean
  features: { draft_check: boolean; hints: boolean; related: boolean; help: boolean; web_chat: boolean }
  guests_can_ask: boolean
}

export interface DraftFeedback {
  clear: string[]
  unclear: { field_key: string; quote: string; suggestion: string }[]
  missing: { field_key: string; what: string }[]
  officer_questions: string[]
  note: string
}

export interface HelpScreenshot {
  id: string
  url: string
  caption: string
  width: number | null
  height: number | null
}

export interface HelpAnswer {
  answer?: string
  pages?: { id: string; title: string; portal_path: string }[]
  screenshots?: HelpScreenshot[]
  handed_over: boolean
  needs_contact?: boolean
}

export interface MyIntroduction {
  id: string
  status: 'waiting' | 'agreed' | 'declined'
  kind: 'similar' | 'complementary'
  reason: string
  my_answer: 'waiting' | 'yes' | 'no'
  my_idea: { id: string; title: string }
  other: { name: string; email: string; phone: string; idea_title: string } | null
  created_at: string
}

type Maybe<T> = ({ available: true } & T) | { available: false }

const OFF: AssistantStatus = {
  available: false,
  features: { draft_check: false, hints: false, related: false, help: false, web_chat: false },
  guests_can_ask: false,
}
const STATUS_TTL_MS = 60_000
let statusCache: { at: number; value: Promise<AssistantStatus> } | null = null

export const assistantService = {
  /** Which helper parts are on. Cached for a minute; resolves to "all off" on any failure. */
  status(force = false): Promise<AssistantStatus> {
    if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value
    const value = api
      .get('/assistant/status/')
      .then(({ data }) => unwrapData<AssistantStatus>(data) ?? OFF)
      .catch(() => OFF)
    statusCache = { at: Date.now(), value }
    return value
  },

  async checkDraft(draftId: string, step: string, answers: Record<string, unknown>, lang: string): Promise<Maybe<DraftFeedback>> {
    try {
      const token = resumeStorage.get()
      const headers = token && token.draftId === draftId ? { [DRAFT_TOKEN_HEADER]: token.token } : undefined
      const { data } = await api.post('/assistant/draft-check/', { draft_id: draftId, step, answers, lang }, { headers })
      return unwrapData<Maybe<DraftFeedback>>(data)
    } catch {
      return { available: false }
    }
  },

  async askHelp(body: { question: string; lang: string; page_path?: string; handoff?: boolean; contact_email?: string; contact_phone?: string; contact_name?: string }): Promise<Maybe<HelpAnswer>> {
    try {
      const { data } = await api.post('/assistant/help/', body)
      return unwrapData<Maybe<HelpAnswer>>(data)
    } catch {
      return { available: false }
    }
  },

  async myIntroductions(): Promise<MyIntroduction[]> {
    const { data } = await api.get('/assistant/introductions/')
    return unwrapData<MyIntroduction[]>(data)
  },

  async answerIntroduction(id: string, agree: boolean): Promise<MyIntroduction> {
    const { data } = await api.post(`/assistant/introductions/${id}/answer/`, { agree })
    return unwrapData<MyIntroduction>(data)
  },
}

/** The helper's status for a screen. `null` while unknown: render nothing until it arrives. */
export function useAssistantStatus(): AssistantStatus | null {
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  useEffect(() => {
    let alive = true
    assistantService.status().then((value) => alive && setStatus(value))
    return () => {
      alive = false
    }
  }, [])
  return status
}

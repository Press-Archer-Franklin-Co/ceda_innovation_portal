import axios from 'axios'
import api from './api'
import { unwrapData } from './envelope'

// The AI helper on the idea form (2.13). The API decides everything: the form, the challenge's marking criteria
// and the approved knowledge base come from the draft, so only the draft, the step and the language are sent.
// Every call answers {available: false} when the helper is off; that is not an error.

export interface HelperStatus {
  available?: boolean
  features?: Record<string, boolean>
  language?: string
}

export type CheckStatus = 'clear' | 'add_more' | 'missing'

export interface CheckItem {
  topic: string
  status: CheckStatus
  suggestion: string
  field_key: string
  document_id: string
  document_name: string
  page: number | null
}

export interface DraftCheck {
  available: boolean
  language?: string
  overall?: 'ready' | 'almost' | 'needs_work'
  ready_count?: number
  total_count?: number
  items?: CheckItem[]
  unclear?: { field_key: string; quote: string; suggestion: string }[]
  officer_questions?: string[]
  note?: string
  label?: string
}

export interface DocumentReview {
  available: boolean
  document?: { id: string; name: string }
  summary?: string
  key_points?: { text: string; page: number | null }[]
  missing?: string[]
  label?: string
}

const DRAFT_CHECK_TIMEOUT_MS = 45000

export const assistantService = {
  /**
   * Which helper parts are on for this person. null when it cannot be read (the panel then stays as it was).
   * Asked each time the form opens and never kept: a guest who signs in gets a different answer.
   */
  status(): Promise<HelperStatus | null> {
    return api
      .get('/assistant/status/')
      .then(({ data }) => unwrapData<HelperStatus>(data))
      .catch(() => null)
  },

  /** Coaching on one step of the draft. answers: this step's unsaved answers (they win over the saved draft). */
  async draftCheck(body: { draft_id: string; step: string; answers: Record<string, unknown>; lang: string }, signal?: AbortSignal): Promise<DraftCheck> {
    const { data } = await api.post('/assistant/draft-check/', body, { signal, timeout: DRAFT_CHECK_TIMEOUT_MS })
    return unwrapData<DraftCheck>(data)
  },

  /** Notes on one uploaded file. */
  async reviewDocument(documentId: string, lang: string, signal?: AbortSignal): Promise<DocumentReview> {
    const { data } = await api.post(`/assistant/documents/${documentId}/review/`, { lang }, { signal, timeout: DRAFT_CHECK_TIMEOUT_MS })
    return unwrapData<DocumentReview>(data)
  },
}

export const isCancel = (error: unknown) => axios.isCancel(error) || (error instanceof DOMException && error.name === 'AbortError')
export const isNotFound = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 404

import api from './api'
import { unwrapData } from './envelope'
import type {
  Envelope, IntakeDraft, QuickStartRequest, QuickStartResult, SimilarIdea,
  StepSaveResult, SubmitRequest, SubmitResult,
} from '../types/innovator'

/** Header B2 reads for guest drafts. */
export const DRAFT_TOKEN_HEADER = 'X-Draft-Token'

const RESUME_KEY = 'ceda_resume_token'
const RESUME_DRAFT_KEY = 'ceda_resume_draft'

/** Keeps the guest draft across a refresh (screens 1.1 and 1.2). */
export const resumeStorage = {
  get(): { draftId: string; token: string } | null {
    try {
      const token = localStorage.getItem(RESUME_KEY)
      const draftId = localStorage.getItem(RESUME_DRAFT_KEY)
      return token && draftId ? { draftId, token } : null
    } catch {
      return null
    }
  },
  set(draftId: string, token: string) {
    try {
      localStorage.setItem(RESUME_KEY, token)
      localStorage.setItem(RESUME_DRAFT_KEY, draftId)
    } catch {
      // Private mode: the draft still works for this page view.
    }
  },
  clear() {
    try {
      localStorage.removeItem(RESUME_KEY)
      localStorage.removeItem(RESUME_DRAFT_KEY)
    } catch {
      // Nothing stored.
    }
  },
}

function tokenHeaders(token?: string) {
  return token ? { headers: { [DRAFT_TOKEN_HEADER]: token } } : undefined
}

/**
 * Quick start, guest drafts, step-by-step save and submit (B2, on main). Pass `token` for a guest draft; a signed-in
 * owner needs no token.
 */
export const intakeService = {
  async quickStart(payload: QuickStartRequest): Promise<QuickStartResult> {
    const { data } = await api.post<Envelope<QuickStartResult>>('/drafts/quick-start/', payload)
    return unwrapData(data)
  },

  async getDraft(id: string, token?: string): Promise<IntakeDraft> {
    const { data } = await api.get<Envelope<IntakeDraft> | IntakeDraft>(`/drafts/${id}/`, tokenHeaders(token))
    return unwrapData(data)
  },

  async updateDraft(id: string, payload: Partial<Pick<IntakeDraft, 'title' | 'sector' | 'program'>>, token?: string): Promise<IntakeDraft> {
    const { data } = await api.patch<Envelope<IntakeDraft> | IntakeDraft>(`/drafts/${id}/`, payload, tokenHeaders(token))
    return unwrapData(data)
  },

  async saveStep(id: string, sectionCode: string, answers: Record<string, unknown>, token?: string): Promise<StepSaveResult> {
    const { data } = await api.put<Envelope<StepSaveResult>>(
      `/drafts/${id}/steps/${encodeURIComponent(sectionCode)}/`,
      { answers },
      tokenHeaders(token),
    )
    return unwrapData(data)
  },

  /** After code sign-in, attach the guest draft to the account. */
  async claim(id: string, token: string): Promise<IntakeDraft> {
    const { data } = await api.post<Envelope<IntakeDraft>>(`/drafts/${id}/claim/`, {}, tokenHeaders(token))
    return unwrapData(data)
  },

  /** Guest path: prove the phone without signing in. */
  async verifyPhone(id: string, token: string, phone: string, code: string): Promise<IntakeDraft> {
    const { data } = await api.post<Envelope<IntakeDraft>>(`/drafts/${id}/verify-phone/`, { phone, code }, tokenHeaders(token))
    return unwrapData(data)
  },

  async submit(id: string, payload: SubmitRequest, token?: string): Promise<SubmitResult> {
    const { data } = await api.post<Envelope<SubmitResult>>(`/drafts/${id}/submit/`, payload, tokenHeaders(token))
    return unwrapData(data)
  },

  /** Signed in only. Never blocks the form; show the note quietly. */
  async similarIdeas(text: string, sector?: string): Promise<SimilarIdea[]> {
    const { data } = await api.post<Envelope<{ results: SimilarIdea[] }>>('/ideas/similar/', { text, sector })
    return unwrapData<{ results: SimilarIdea[] }>(data).results
  },
}

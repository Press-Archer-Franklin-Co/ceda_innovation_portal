import api from './api'
import { unwrapData } from './envelope'
import type {
  Envelope, IntakeDraft, QuickStartRequest, QuickStartResult,
  StepSaveResult, SubmitRequest, SubmitResult,
} from '../types/innovator'

/** Header B2 reads for guest drafts. */
export const DRAFT_TOKEN_HEADER = 'X-Draft-Token'

const RESUME_KEY = 'ceda_resume_token'
const RESUME_DRAFT_KEY = 'ceda_resume_draft'
/** Prompt 31 part B: "confirm" while a signed-out visitor is on the phone step, so a refresh reopens it. */
const RESUME_STAGE_KEY = 'ceda_resume_stage'

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
  stage(): 'confirm' | null {
    try {
      return localStorage.getItem(RESUME_STAGE_KEY) === 'confirm' ? 'confirm' : null
    } catch {
      return null
    }
  },
  setStage(stage: 'confirm' | null) {
    try {
      if (stage) localStorage.setItem(RESUME_STAGE_KEY, stage)
      else localStorage.removeItem(RESUME_STAGE_KEY)
    } catch {
      // Private mode: a refresh goes back to the card, with the draft kept.
    }
  },
  clear() {
    try {
      localStorage.removeItem(RESUME_KEY)
      localStorage.removeItem(RESUME_DRAFT_KEY)
      localStorage.removeItem(RESUME_STAGE_KEY)
    } catch {
      // Nothing stored.
    }
  },
}

/** 23 Nov: how a guest (no account) can be reached, typed on 1.2 and sent with the idea. Kept across a refresh. */
export interface GuestContact {
  name: string
  email: string
  phone: string
}
const GUEST_CONTACT_KEY = 'ceda_guest_contact'

export const guestContactStorage = {
  get(): GuestContact | null {
    try {
      const raw = localStorage.getItem(GUEST_CONTACT_KEY)
      return raw ? (JSON.parse(raw) as GuestContact) : null
    } catch {
      return null
    }
  },
  set(contact: GuestContact) {
    try {
      localStorage.setItem(GUEST_CONTACT_KEY, JSON.stringify(contact))
    } catch {
      // Private mode: the contact stays for this page view only.
    }
  },
  clear() {
    try {
      localStorage.removeItem(GUEST_CONTACT_KEY)
    } catch {
      // Nothing stored.
    }
  },
}

/** One of email or phone is enough; an email must look like one, a phone needs at least 7 digits. */
export function guestContactProblem(contact: Pick<GuestContact, 'email' | 'phone'>): 'none' | 'email' | 'phone' | null {
  const email = contact.email.trim()
  const phone = contact.phone.trim()
  if (!email && !phone) return 'none'
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return 'email'
  if (phone && phone.replace(/\D/g, '').length < 7) return 'phone'
  return null
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

  async verifyEmail(id: string, token: string, email: string, code: string): Promise<IntakeDraft> {
    const { data } = await api.post<Envelope<IntakeDraft>>(`/drafts/${id}/verify-email/`, { email, code }, tokenHeaders(token))
    return unwrapData(data)
  },

  async submit(id: string, payload: SubmitRequest, token?: string): Promise<SubmitResult> {
    const { data } = await api.post<Envelope<SubmitResult>>(`/drafts/${id}/submit/`, payload, tokenHeaders(token))
    return unwrapData(data)
  },
}

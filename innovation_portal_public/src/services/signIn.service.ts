import axios from 'axios'
import type { LoginResponse, MfaRequiredResponse } from '../types/api'

// U7: one sign-in for everyone. The answers are not wrapped in the {success, data}
// envelope, like the older login endpoints.

const RAW_BASE_URL = import.meta.env.VITE_API_URL?.trim()
const BASE_URL = RAW_BASE_URL ? RAW_BASE_URL.replace(/\/$/, '') : ''
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } }

export type StartResult =
  | { next: 'sso'; redirect: string }
  | { next: 'signup'; identifier_type: 'phone' | 'email' }
  | { next: 'password' }
  | { next: 'code'; channel: string; sent_to: string; expires_in_seconds: number; resend_after_seconds: number }

/** Signed in: tokens, the user and where to go. */
export type SignedIn = LoginResponse & { redirect: string; created?: boolean }
export type FinishResult = SignedIn | MfaRequiredResponse

export interface SignupInput {
  identifier: string
  full_name: string
  phone?: string
  email?: string
  language: 'en' | 'tn'
  consent: boolean
  password?: string
  next?: string
}

export type SignupResult = SignedIn | (Extract<StartResult, { next: 'code' }> & { created: true })

export const signInService = {
  async start(identifier: string, wantCode = false): Promise<StartResult> {
    const { data } = await axios.post<StartResult>(`${BASE_URL}/api/auth/start/`, { identifier, want_code: wantCode }, JSON_HEADERS)
    return data
  },

  async finish(payload: { identifier: string; code?: string; password?: string; next?: string }): Promise<FinishResult> {
    const { data } = await axios.post<FinishResult>(`${BASE_URL}/api/auth/finish/`, payload, JSON_HEADERS)
    return data
  },

  async signup(payload: SignupInput): Promise<SignupResult> {
    const { data } = await axios.post<SignupResult>(`${BASE_URL}/api/auth/signup/`, payload, JSON_HEADERS)
    return data
  },

  /** Test accounts (demo servers only): 404 unless the server and the switch allow it. */
  async demoLogin(account: string, next?: string): Promise<SignedIn> {
    const { data } = await axios.post<SignedIn>(`${BASE_URL}/api/auth/demo-login/`, { account, next }, JSON_HEADERS)
    return data
  },
}

export function isSignedIn(result: FinishResult | SignupResult): result is SignedIn {
  return 'access' in result
}

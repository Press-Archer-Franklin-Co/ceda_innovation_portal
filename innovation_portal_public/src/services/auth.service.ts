import axios from 'axios'
import api, { tokenStorage } from './api'
import type {
  LoginRequest, LoginResponse,
  RegisterRequest, RegisterResponse,
  MfaRequiredResponse,
  AuthenticatedUser,
} from '../types/api'

const RAW_BASE_URL = import.meta.env.VITE_API_URL?.trim()
const BASE_URL = RAW_BASE_URL ? RAW_BASE_URL.replace(/\/$/, '') : ''

interface Envelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
}

function unwrap<T>(envelope: Envelope<T>): T {
  if (!envelope.success || !envelope.data) {
    throw new Error(envelope.message ?? 'Unknown error')
  }
  return envelope.data
}

export interface SocialProvider {
  provider: 'google' | 'github' | 'microsoft'
  label: string
  enabled: boolean
  recommended_for: string
}

export interface PublicConfig {
  features: Record<string, boolean>
  /** Which AI helper parts are on for everyone; guide_for_guests: guests may use the guide. */
  assistant?: Record<string, boolean>
  sign_in: {
    password: boolean
    code: boolean
    code_by_sms: boolean
    sso: { active: boolean; provider: string; label: string }
    /** U7: the one second step after phone or email. */
    second_step?: 'code' | 'password'
  }
  /** U7: only present while test accounts are allowed on this server. Never emails or passwords. */
  demo_logins?: { accounts: DemoAccount[] }
}

export interface DemoAccount {
  id: string
  name: string
  initials: string
  role: string
  role_label: string
}

export interface SsoTrialStep {
  step: string
  ok: boolean
  detail: string
  ms: number
  skipped?: boolean
}

export interface SsoTrialResult {
  connection_id: string
  ok: boolean
  steps: SsoTrialStep[]
  trial?: {
    email: string
    name: string
    groups: string[]
    allowed: boolean
    allowed_by: string
    reason: string
    role: string
  }
}

export const SSO_TRIAL_STATE_PREFIX = 'sso-trial.'

export interface SocialAuthStartResponse {
  authorization_url?: string
  provider?: string
}

export const authService = {
  async login(payload: LoginRequest): Promise<LoginResponse | MfaRequiredResponse> {
    const { data } = await axios.post<LoginResponse | MfaRequiredResponse>(
      `${BASE_URL}/api/auth/login/`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    )
    return data
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const { data } = await axios.post<Envelope<RegisterResponse>>(
      `${BASE_URL}/api/auth/register/`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    )
    return unwrap(data)
  },

  async logout(): Promise<void> {
    const refresh = tokenStorage.getRefresh()
    if (refresh) {
      try {
        await api.post('/auth/logout/', { refresh })
      } catch {
      }
    }
    tokenStorage.clear()
  },

  async forgotPassword(email: string): Promise<void> {
    await axios.post(
      `${BASE_URL}/api/auth/forgot-password/`,
      { email },
      { headers: { 'Content-Type': 'application/json' } }
    )
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await axios.post(
      `${BASE_URL}/api/auth/reset-password/`,
      { token, password },
      { headers: { 'Content-Type': 'application/json' } }
    )
  },

  async verifyEmail(token: string): Promise<LoginResponse> {
    const { data } = await axios.post<Envelope<LoginResponse>>(
      `${BASE_URL}/api/auth/verify-email/`,
      { token },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return unwrap(data)
  },

  async resendVerification(email?: string): Promise<void> {
    await axios.post(
      `${BASE_URL}/api/auth/resend-verification/`,
      email ? { email } : {},
      { headers: { 'Content-Type': 'application/json' } }
    )
  },

  async changeEmail(email: string): Promise<void> {
    await api.post('/auth/change-email/', { email })
  },

  async me(): Promise<AuthenticatedUser> {
    const { data } = await api.get<Envelope<AuthenticatedUser>>('/auth/me/')
    return unwrap(data)
  },

  async getPublicConfig(): Promise<PublicConfig> {
    const { data } = await axios.get<Envelope<PublicConfig>>(`${BASE_URL}/api/platform/public-config/`)
    return unwrap(data)
  },

  async completeSsoTrial(code: string, state: string): Promise<SsoTrialResult> {
    const { data } = await axios.post<Envelope<SsoTrialResult>>(
      `${BASE_URL}/api/platform/sso-trial/complete/`,
      { code, state },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return unwrap(data)
  },

  async getSocialProviders(): Promise<SocialProvider[]> {
    const { data } = await axios.get<{ providers: Array<{ id: string; name: string; enabled: boolean }> }>(
      `${BASE_URL}/api/auth/social/providers/`,
    )
    // CEDA staff single sign-on starts from /api/auth/start/ when the email domain uses it (U7).
    return (data.providers ?? []).filter(p => p.id !== 'ceda_staff').map(p => ({
      provider: p.id as SocialProvider['provider'],
      label:    p.name,
      enabled:  p.enabled,
      recommended_for: '',
    }))
  },

  async startSocialAuth(provider: string): Promise<SocialAuthStartResponse> {
    const { data } = await axios.post<SocialAuthStartResponse>(
      `${BASE_URL}/api/auth/social/${provider}/start/`,
      { provider },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return data
  },

  async completeSocialAuth(provider: string, code: string, state: string): Promise<LoginResponse | MfaRequiredResponse> {
    const { data } = await axios.post<LoginResponse | MfaRequiredResponse>(
      `${BASE_URL}/api/auth/social/${provider}/complete/`,
      { code, state },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return data
  },

  async verifyMfa(challenge_id: string, code: string): Promise<LoginResponse> {
    const { data } = await axios.post<LoginResponse>(
      `${BASE_URL}/api/auth/mfa/verify/`,
      { challenge_id, code },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return data
  },

  async resendMfa(challenge_id: string): Promise<{ challenge_id: string; method: string; email_hint?: string; expires_at?: string }> {
    const { data } = await axios.post<Envelope<{ challenge_id: string; method: string; email_hint?: string; expires_at?: string }>>(
      `${BASE_URL}/api/auth/mfa/resend/`,
      { challenge_id },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return unwrap(data)
  },
}

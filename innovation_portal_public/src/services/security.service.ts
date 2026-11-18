import api from './api'
import type { AccountSecurity } from '../types/security'
import type { SocialProvider } from './auth.service'

interface Envelope<T> {
  success: boolean
  message: string
  data?: T
}

function unwrap<T>(env: Envelope<T>): T {
  if (!env.success || !env.data) throw new Error(env.message ?? 'Request failed')
  return env.data
}

export const securityService = {
  async getAccountSecurity(): Promise<AccountSecurity> {
    const { data } = await api.get<Envelope<AccountSecurity>>('/auth/account-security/')
    return unwrap(data)
  },

  async setPassword(password: string): Promise<void> {
    await api.post('/auth/set-password/', { password })
  },

  async changePassword(current_password: string, new_password: string): Promise<void> {
    await api.post('/auth/change-password/', { current_password, new_password })
  },

  async getSocialProviders(): Promise<SocialProvider[]> {
    const { data } = await api.get<{ providers: Array<{ id: string; name: string; enabled: boolean }> }>('/auth/social/providers/')
    return (data.providers ?? []).map(p => ({
      provider: p.id as SocialProvider['provider'],
      label:    p.name,
      enabled:  p.enabled,
      recommended_for: '',
    }))
  },

  async startProviderLink(provider: string): Promise<{ authorization_url?: string }> {
    const { data } = await api.post<Envelope<{ authorization_url?: string }>>(
      `/auth/social/${provider}/start/`,
      { provider },
    )
    return unwrap(data)
  },

  async linkProvider(provider: string, code: string, state: string): Promise<void> {
    await api.post(`/auth/social/${provider}/link/`, { code, state })
  },

  async unlinkProvider(provider: string): Promise<void> {
    await api.delete(`/auth/social/${provider}/link/`)
  },

  async startMfaSetup(method: 'email' | 'totp'): Promise<{
    method: string
    challenge_id?: string
    email_hint?: string
    expires_at?: string
    secret?: string
    otpauth_uri?: string
    qr_png?: string
  }> {
    const { data } = await api.post<Envelope<{
      method: string
      challenge_id?: string
      email_hint?: string
      expires_at?: string
      secret?: string
      otpauth_uri?: string
      qr_png?: string
    }>>('/auth/mfa/setup/', { method })
    return unwrap(data)
  },

  async confirmMfaSetup(payload: { method: 'email' | 'totp'; code: string; challenge_id?: string }): Promise<{ mfa_enabled: boolean; mfa_method: string }> {
    const { data } = await api.post<Envelope<{ mfa_enabled: boolean; mfa_method: string }>>('/auth/mfa/setup/confirm/', payload)
    return unwrap(data)
  },

  async startMfaDisable(): Promise<{ method: string; challenge_id: string; email_hint?: string; expires_at?: string }> {
    const { data } = await api.post<Envelope<{ method: string; challenge_id: string; email_hint?: string; expires_at?: string }>>('/auth/mfa/disable/start/', {})
    return unwrap(data)
  },

  async confirmMfaDisable(challenge_id: string, code: string): Promise<{ mfa_enabled: boolean; mfa_method: string }> {
    const { data } = await api.post<Envelope<{ mfa_enabled: boolean; mfa_method: string }>>('/auth/mfa/disable/', { challenge_id, code })
    return unwrap(data)
  },
}

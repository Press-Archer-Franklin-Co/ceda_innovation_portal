import api from './api'
import { unwrapData } from './envelope'
import type { Envelope, OtpRequestResult, OtpTarget } from '../types/innovator'
import type { LoginResponse, MfaRequiredResponse } from '../types/api'

export type CodeSignInResult = (LoginResponse & { created?: boolean }) | MfaRequiredResponse

/**
 * Screen 2.0 and 1.2: sign in with a phone or email code (main, B1).
 * The caller stores the tokens the same way password login does.
 */
export const codeSignInService = {
  async requestCode(target: OtpTarget): Promise<OtpRequestResult> {
    const { data } = await api.post<Envelope<OtpRequestResult>>('/auth/otp/request/', target)
    return unwrapData(data)
  },

  async verifyCode(target: OtpTarget, code: string): Promise<CodeSignInResult> {
    const { data } = await api.post<Envelope<CodeSignInResult>>('/auth/otp/verify/', { ...target, code })
    return unwrapData(data)
  },
}

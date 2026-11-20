import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react'
import { authService }    from '../services/auth.service'
import { tokenStorage }   from '../services/api'
import { codeSignInService } from '../services/codeSignIn.service'
import type { OtpTarget } from '../types/innovator'
import type { InnovatorProfile, AuthenticatedUser } from '../types/api'


export interface AuthUser {
  id: string
  email: string
  name: string
  first_name: string
  last_name: string
  phone_number?: string
  email_verified: boolean
  primary_auth_method: string
  mfa_enabled?: boolean
  mfa_method?: string
  roles?: string[]
  /** From GET /api/auth/me/ (S1). Empty for innovators. */
  capabilities: string[]
  profile?: InnovatorProfile
}


export interface SignupData {
  first_name: string
  last_name: string
  email: string
  phone_number?: string
  password: string
}


interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isVerified: boolean
  pendingMfa: PendingMfa | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<LoginOutcome>
  signInWithCode: (target: OtpTarget, code: string) => Promise<LoginOutcome>
  completeMfa: (code: string) => Promise<void>
  updatePendingMfa: (challenge: PendingMfa) => void
  clearPendingMfa: () => void
  signup: (data: SignupData) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** True when the signed-in person holds the capability. Only hides things: the API decides. */
  can: (capability: string) => boolean
}


interface PendingMfa {
  challenge_id: string
  method: string
  email_hint?: string
  expires_at?: string
}

type LoginOutcome =
  | { status: 'ok'; email_verified: boolean; user: AuthUser }
  | { status: 'mfa_required'; challenge: PendingMfa }

const MFA_STORAGE_KEY = 'ceda_mfa_challenge'

function readPendingMfa(): PendingMfa | null {
  try {
    const raw = sessionStorage.getItem(MFA_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingMfa) : null
  } catch {
    return null
  }
}

function writePendingMfa(challenge: PendingMfa | null) {
  if (!challenge) {
    sessionStorage.removeItem(MFA_STORAGE_KEY)
    return
  }
  sessionStorage.setItem(MFA_STORAGE_KEY, JSON.stringify(challenge))
}

function toAuthUser(user: AuthenticatedUser): AuthUser {
  return {
    id:           user.id,
    email:        user.email,
    name:         `${user.first_name} ${user.last_name}`.trim(),
    first_name:   user.first_name,
    last_name:    user.last_name,
    phone_number: user.phone_number,
    email_verified: user.email_verified,
    primary_auth_method: user.primary_auth_method,
    mfa_enabled:  user.mfa_enabled,
    mfa_method:   user.mfa_method,
    roles:        user.roles ?? [],
    capabilities: user.capabilities ?? [],
    profile:      user.profile ?? undefined,
  }
}


const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(readPendingMfa())

  useEffect(() => {
    const restore = async () => {
      if (!tokenStorage.getAccess() && !tokenStorage.getRefresh()) {
        setLoading(false)
        return
      }
      try {
        const authUser = await authService.me()
        setUser(toAuthUser(authUser))
      } catch {
        tokenStorage.clear()
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      setPendingMfa(null)
      writePendingMfa(null)
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  useEffect(() => {
    if (user && pendingMfa) {
      setPendingMfa(null)
      writePendingMfa(null)
    }
  }, [user, pendingMfa])

  /** Tokens or an MFA challenge, from password or code sign-in. */
  const finishSignIn = useCallback(async (result: Awaited<ReturnType<typeof authService.login>>): Promise<LoginOutcome> => {
    if ('mfa_required' in result && result.mfa_required) {
      const challenge = {
        challenge_id: result.challenge_id,
        method: result.method,
        email_hint: result.email_hint,
        expires_at: result.expires_at,
      }
      setPendingMfa(challenge)
      writePendingMfa(challenge)
      return { status: 'mfa_required', challenge } as const
    }
    if (!('access' in result)) {
      throw new Error('Login failed.')
    }
    tokenStorage.setAccess(result.access)
    tokenStorage.setRefresh(result.refresh)
    const authUser = result.user ? result.user : await authService.me()
    const signedIn = toAuthUser(authUser)
    setUser(signedIn)
    return { status: 'ok', email_verified: authUser.email_verified ?? true, user: signedIn } as const
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => finishSignIn(await authService.login({ email, password })),
    [finishSignIn],
  )

  /** Screen 2.0: sign in with a phone or email code (creates an innovator account if there is none). */
  const signInWithCode = useCallback(
    async (target: OtpTarget, code: string): Promise<LoginOutcome> => finishSignIn(await codeSignInService.verifyCode(target, code)),
    [finishSignIn],
  )

  const completeMfa = useCallback(async (code: string) => {
    if (!pendingMfa) throw new Error('No MFA challenge in progress.')
    const tokens = await authService.verifyMfa(pendingMfa.challenge_id, code)
    tokenStorage.setAccess(tokens.access)
    tokenStorage.setRefresh(tokens.refresh)
    const authUser = tokens.user ? tokens.user : await authService.me()
    setUser(toAuthUser(authUser))
    setPendingMfa(null)
    writePendingMfa(null)
  }, [pendingMfa])

  const clearPendingMfa = useCallback(() => {
    setPendingMfa(null)
    writePendingMfa(null)
  }, [])

  const updatePendingMfa = useCallback((challenge: PendingMfa) => {
    setPendingMfa(challenge)
    writePendingMfa(challenge)
  }, [])

  const signup = useCallback(async (data: SignupData) => {
    await authService.register({
      email:        data.email,
      first_name:   data.first_name,
      last_name:    data.last_name,
      phone_number: data.phone_number,
      password:     data.password,
    })
    const result = await authService.login({ email: data.email, password: data.password })
    if ('access' in result) {
      tokenStorage.setAccess(result.access)
      tokenStorage.setRefresh(result.refresh)
      const authUser = result.user ? result.user : await authService.me()
      setUser(toAuthUser(authUser))
    }
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
    setPendingMfa(null)
    writePendingMfa(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    try {
      const authUser = await authService.me()
      setUser(toAuthUser(authUser))
    } catch {
    }
  }, [])

  const can = useCallback((capability: string) => !!user?.capabilities.includes(capability), [user])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isVerified: !!user?.email_verified,
        pendingMfa,
        isLoading,
        login,
        signInWithCode,
        completeMfa,
        updatePendingMfa,
        clearPendingMfa,
        signup,
        logout,
        refreshProfile,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth as authApi } from '../api/endpoints'
import { TOKEN_KEY, REFRESH_KEY } from '../api/client'

const USER_KEY = 'ceda_innovation_user'
const ROLE_KEY = 'ceda_active_role'

const AuthContext = createContext(null)

function decodeJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return {} }
}

function normaliseRoles(rawRoles) {
  return (rawRoles ?? []).map(r => (r === 'admin' ? 'administrator' : r))
}

function normaliseProfile(profile, token) {
  if (!profile) return null
  const { user, ...profileFields } = profile
  const jwtClaims = token ? decodeJwt(token) : {}
  const roles     = normaliseRoles(jwtClaims.roles ?? user?.roles ?? [])
  return {
    ...user,
    roles,
    // From the server, for display only (Settings badge). Access uses can() (S1).
    is_admin:     Boolean(user?.is_admin ?? user?.is_superuser),
    is_staff:     Boolean(user?.is_staff),
    is_superuser: user?.is_superuser,
    profile: profileFields,
  }
}

function normaliseLoginUser(userData, token) {
  if (!userData) return null
  const jwtClaims = token ? decodeJwt(token) : {}
  const roles     = normaliseRoles(jwtClaims.roles ?? userData.roles ?? [])
  return {
    ...userData,
    roles,
    // From the server, for display only (Settings badge). Access uses can() (S1).
    is_admin:     Boolean(userData?.is_admin ?? userData?.is_superuser),
    is_staff:     Boolean(userData?.is_staff),
    is_superuser: userData.is_superuser,
    profile:      userData.profile ?? {},
  }
}

/**
 * What the person may do (S1), from GET /api/auth/me/. The API decides every request on its own; these only
 * decide what the console shows, so nobody is offered something the server will refuse.
 * `undefined` means "not known yet" (an old cached user, or me has not answered).
 */
function capabilitiesOf(data) {
  return Array.isArray(data?.capabilities) ? data.capabilities : undefined
}

async function loadUser(token, signal) {
  const [profile, me] = await Promise.all([
    authApi.me(signal),
    authApi.whoami(signal).catch((err) => {
      if (err?.name === 'AbortError') throw err
      return null
    }),
  ])
  if (profile == null) return null
  const normalised = normaliseProfile(profile, token)
  return { ...normalised, is_admin: Boolean(me?.is_admin ?? normalised.is_admin), capabilities: capabilitiesOf(me) }
}

function loadCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadActiveRole() {
  try {
    return localStorage.getItem(ROLE_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => loadCachedUser())
  const [activeRole, setActiveRole] = useState(() => loadActiveRole())
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)
    let   unmounted  = false

    loadUser(localStorage.getItem(TOKEN_KEY), controller.signal)
      .then(normalised => {
        if (normalised == null) return
        setUser(normalised)
        localStorage.setItem(USER_KEY, JSON.stringify(normalised))
        if (normalised?.roles?.length) {
          setActiveRole((prev) => {
            const next = prev && normalised.roles.includes(prev) ? prev : normalised.roles[0]
            if (next) localStorage.setItem(ROLE_KEY, next)
            return next
          })
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        console.warn('[AuthContext] profile refresh failed:', err.message)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!unmounted) setLoading(false)
      })

    return () => {
      unmounted = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const tokens = await authApi.login({ email, password })
    if (tokens?.mfa_required) throw new Error('This account uses two-step verification. Please sign in through the main portal.')
    if (!tokens?.access) throw new Error('Login failed: no token received.')

    localStorage.setItem(TOKEN_KEY, tokens.access)
    if (tokens.refresh) localStorage.setItem(REFRESH_KEY, tokens.refresh)

    let normalised
    if (tokens.user) {
      normalised = normaliseLoginUser(tokens.user, tokens.access)
      if (!capabilitiesOf(normalised)) {
        const me = await authApi.whoami().catch(() => null)
        normalised = { ...normalised, capabilities: capabilitiesOf(me) }
      }
    } else {
      normalised = await loadUser(tokens.access)
    }

    setUser(normalised)
    localStorage.setItem(USER_KEY, JSON.stringify(normalised))
    if (normalised?.roles?.length) {
      const next = activeRole && normalised.roles.includes(activeRole) ? activeRole : normalised.roles[0]
      if (next) {
        setActiveRole(next)
        localStorage.setItem(ROLE_KEY, next)
      }
    }
    return normalised
  }, [activeRole])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem(REFRESH_KEY)
    try { await authApi.logout(refresh ? { refresh } : undefined) } catch (_) {  }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ROLE_KEY)
    setUser(null)
    setActiveRole(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const normalised = await loadUser(localStorage.getItem(TOKEN_KEY))
      if (normalised == null) return
      setUser(normalised)
      localStorage.setItem(USER_KEY, JSON.stringify(normalised))
    } catch (_) {  }
  }, [])

  // Ask for a capability, never a role name (ceda-security). Superusers get every capability from the API.
  const capabilities = user?.capabilities
  const can = useCallback((capability) => Array.isArray(capabilities) && capabilities.includes(capability), [capabilities])
  const canAny = useCallback((list) => list.some((c) => can(c)), [can])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, activeRole, setActiveRole, capabilities, can, canAny }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

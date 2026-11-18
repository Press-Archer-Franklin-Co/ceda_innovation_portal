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
    is_admin:     roles.includes('administrator') || user?.is_superuser,
    is_staff:     roles.some(r => ['administrator', 'innovation_officer', 'innovation_manager', 'innovation_analyst', 'staff_member', 'specialist', 'exo', 'judge', 'mentor'].includes(r)) || user?.is_staff,
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
    is_admin:     roles.includes('administrator') || userData.is_superuser,
    is_staff:     roles.some(r => ['administrator', 'innovation_officer', 'innovation_manager', 'innovation_analyst', 'staff_member', 'specialist', 'exo', 'judge', 'mentor'].includes(r)) || userData.is_staff,
    is_superuser: userData.is_superuser,
    profile:      userData.profile ?? {},
  }
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

    authApi.me(controller.signal)
      .then(profile => {
        if (profile == null) return
        const freshToken  = localStorage.getItem(TOKEN_KEY)
        const normalised  = normaliseProfile(profile, freshToken)
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
    } else {
      const profile = await authApi.me()
      normalised = normaliseProfile(profile, tokens.access)
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
      const profile    = await authApi.me()
      const token      = localStorage.getItem(TOKEN_KEY)
      const normalised = normaliseProfile(profile, token)
      setUser(normalised)
      localStorage.setItem(USER_KEY, JSON.stringify(normalised))
    } catch (_) {  }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, activeRole, setActiveRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

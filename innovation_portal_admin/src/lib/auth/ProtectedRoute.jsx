import React, { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import ForbiddenState from '../../components/ui/ForbiddenState'
import { useT } from '../../i18n/context'

// Route guards ask for capabilities (S1, ceda-security). They only decide what the console shows: the API
// refuses on its own, so removing a guard lets nobody reach anything.

const PUBLIC_PORTAL = window.location.origin + '/'

/** Staff console users hold at least one capability. Unknown (old cached user, me not answered) is let in. */
function isStaff(capabilities) {
  return capabilities === undefined || capabilities.length > 0
}

export function ProtectedRoute() {
  const { user, loading, capabilities } = useAuth()
  const location = useLocation()
  const staff = isStaff(capabilities)

  useEffect(() => {
    if (loading) return
    if (!user) {
      const next = `/staff${location.pathname}${location.search}`
      window.location.replace(`${PUBLIC_PORTAL}sign-in?next=${encodeURIComponent(next)}`)
    } else if (!staff) {
      window.location.replace(PUBLIC_PORTAL)
    }
  }, [loading, user, staff, location.pathname, location.search])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ceda-surface">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-ceda-green border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-ceda-muted">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user || !staff) return null

  return <Outlet />
}

/**
 * Shows the child routes when the person holds the capability (or any of a list).
 * <Route element={<CapabilityRoute need="forms.manage" />}> ... </Route>
 */
export function CapabilityRoute({ need, children }) {
  const { canAny, capabilities } = useAuth()
  const t = useT()
  const list = Array.isArray(need) ? need : [need]
  // Not known yet (me failed): let the page load and the API decide, rather than a wrong "no access".
  if (capabilities !== undefined && !canAny(list)) return <ForbiddenState framed title={t('access.noPageTitle')} message={t('access.noPageBody')} className="m-6" />
  return children ?? <Outlet />
}

/** U7: old console sign-in paths (OLD_SIGN_IN_PATHS) go to the one sign-in page. */
export function ToSignIn() {
  useEffect(() => {
    window.location.replace(`${PUBLIC_PORTAL}sign-in?next=${encodeURIComponent('/staff/')}`)
  }, [])
  return null
}


import React, { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { isAdminOrManager, isInnovationOfficer, isJudge, ALL_STAFF_WORKER_ROLES } from './permissions'

const PUBLIC_PORTAL = window.location.origin + '/'

function hasStaffRole(user) {
  if (!user) return false
  if (user.is_superuser) return true
  return (user.roles ?? []).some(r => ALL_STAFF_WORKER_ROLES.includes(r))
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (loading) return
    if (!user) {
      const next = `/staff${location.pathname}${location.search}`
      window.location.replace(`${PUBLIC_PORTAL}login?next=${encodeURIComponent(next)}`)
    } else if (!hasStaffRole(user)) {
      window.location.replace(PUBLIC_PORTAL)
    }
  }, [loading, user, location.pathname, location.search])

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

  if (!user || !hasStaffRole(user)) return null

  return <Outlet />
}

export function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!isAdminOrManager(user)) {
    return <ForbiddenState />
  }
  return children ?? <Outlet />
}

export function OfficerRoute({ children }) {
  const { user } = useAuth()
  if (!isInnovationOfficer(user)) {
    return <ForbiddenState />
  }
  return children ?? <Outlet />
}

function ForbiddenState() {
  return (
    <div className="flex items-center justify-center h-64 text-center">
      <div>
        <p className="text-ceda-muted text-sm">You don't have permission to view this area.</p>
      </div>
    </div>
  )
}

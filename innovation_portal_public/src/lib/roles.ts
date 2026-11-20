import type { AuthUser } from '../context/AuthContext'

// Who goes where (S1, ceda-security). These only choose which portal to show: the API decides access.

/** Staff hold at least one capability (GET /api/auth/me/). Innovators hold none. */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return (user?.capabilities?.length ?? 0) > 0
}

/** Has an innovator account as well. "innovator" is a portal, not a permission, so the role is the answer here. */
export function isInnovator(user: AuthUser | null | undefined): boolean {
  return (user?.roles ?? []).includes('innovator')
}

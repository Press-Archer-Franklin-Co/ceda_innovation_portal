import type { AuthUser } from '../context/AuthContext'

/** Roles that open the staff console. Anyone signed in without one of these is an innovator. */
export const STAFF_PORTAL_ROLES = [
  'administrator', 'admin',
  'innovation_officer', 'innovation_manager', 'innovation_analyst',
  'staff_member', 'specialist', 'exo', 'management_viewer',
  'judge', 'reviewer',
  'mentor',
]

export function isStaff(user: AuthUser | null | undefined): boolean {
  return (user?.roles ?? []).some((r) => STAFF_PORTAL_ROLES.includes(r))
}

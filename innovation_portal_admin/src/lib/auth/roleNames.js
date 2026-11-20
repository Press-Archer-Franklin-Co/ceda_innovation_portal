// Role names for SHOWING and CHOOSING a role (the "act as" picker in My work, whose queue the API filters by
// role). Never use these to decide what someone may see or do: ask can('capability') instead (S1).
export const STAFF_WORKER_ROLES = [
  'judge', 'reviewer',
  'innovation_officer', 'innovation_manager', 'innovation_analyst', 'staff_member', 'specialist', 'exo', 'management_viewer',
  'mentor',
  'administrator', 'admin',
]

/** The person's main role as a label on the dashboard greeting. Display only. */
export function userRoleLabel(user) {
  const roles = user?.roles ?? []
  if (user?.is_superuser) return 'Super Admin'
  if (roles.includes('administrator'))        return 'Administrator'
  if (roles.includes('innovation_officer'))   return 'Innovation Officer'
  if (roles.includes('judge'))                return 'Judge'
  if (roles.includes('mentor'))               return 'Mentor'
  if (roles.includes('innovator'))            return 'Innovator'
  return 'Staff'
}

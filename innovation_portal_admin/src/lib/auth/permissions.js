
const ADMIN_ROLES       = ['administrator', 'admin']
const OFFICER_ROLES     = [
  'innovation_officer',
  'innovation_manager',
  'innovation_analyst',
  'staff_member',
  'specialist',
  'exo',
  'management_viewer',
]
const JUDGE_ROLES       = ['judge', 'reviewer']
const MENTOR_ROLES      = ['mentor']

export const ALL_STAFF_WORKER_ROLES = [
  ...JUDGE_ROLES,
  ...OFFICER_ROLES,
  ...MENTOR_ROLES,
  ...ADMIN_ROLES,
]

export function isAdminOrManager(user) {
  if (!user) return false
  if (user.is_superuser) return true
  return (user.roles ?? []).some(r => ADMIN_ROLES.includes(r))
}

export function isInnovationOfficer(user) {
  if (!user) return false
  return (
    isAdminOrManager(user) ||
    (user.roles ?? []).some(r => OFFICER_ROLES.includes(r))
  )
}

export function isPureJudge(user) {
  if (!user) return false
  if (isAdminOrManager(user)) return false
  if ((user.roles ?? []).some(r => OFFICER_ROLES.includes(r))) return false
  return (user.roles ?? []).some(r => JUDGE_ROLES.includes(r))
}

export function isJudge(user) {
  if (!user) return false
  return (
    user.is_superuser ||
    (user.roles ?? []).some(r => [...ADMIN_ROLES, ...JUDGE_ROLES].includes(r))
  )
}

export function isEvaluator(user) {
  if (!user) return false
  return (
    user.is_superuser ||
    (user.roles ?? []).some(r => ALL_STAFF_WORKER_ROLES.includes(r))
  )
}

export function isStaffWorker(user) {
  return isEvaluator(user)
}


import { client } from './client'

// 3.23 Users: list (with status), roles, resend the email check, invite, deactivate and reactivate (U9 API).
export const usersApi = {
  list: (params) => client.get('/api/auth/users/', params),
  setRoles: (id, roles) => client.patch(`/api/auth/users/${id}/role/`, { roles }),
  resendVerification: (id) => client.post(`/api/auth/users/${id}/resend-verification/`, { cc: [] }),
  invite: (body) => client.post('/api/auth/users/invite/', body),
  deactivate: (id) => client.post(`/api/auth/users/${id}/deactivate/`, {}),
  reactivate: (id) => client.post(`/api/auth/users/${id}/reactivate/`, {}),
}

/** active | invited | deactivated, from the API; is_active decides for an older answer without status. */
export function userStatus(user) {
  if (user?.status) return user.status
  return user?.is_active === false ? 'deactivated' : 'active'
}

/** Query params for the list. */
export function listParams({ search, role, status, page, pageSize }) {
  const p = { page, page_size: pageSize }
  if (search) p.search = search
  if (role) p.role = role
  if (status) p.status = status
  return p
}

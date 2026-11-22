import { client } from './client'

// 3.23 Users. list, role and resend-verification exist today; invite, edit, deactivate, reactivate,
// reset-two-step and resend-invite come with R-64 (backend). Until then those answer 404 and the screen says
// "not available yet".
export const usersApi = {
  list: (params) => client.get('/api/auth/users/', params),
  setRoles: (id, roles) => client.patch(`/api/auth/users/${id}/role/`, { roles }),
  resendVerification: (id) => client.post(`/api/auth/users/${id}/resend-verification/`, { cc: [] }),
  invite: (body) => client.post('/api/auth/users/invite/', body),
  update: (id, body) => client.patch(`/api/auth/users/${id}/`, body),
  deactivate: (id) => client.post(`/api/auth/users/${id}/deactivate/`, {}),
  reactivate: (id) => client.post(`/api/auth/users/${id}/reactivate/`, {}),
  resetTwoStep: (id) => client.post(`/api/auth/users/${id}/reset-two-step/`, {}),
  resendInvite: (id) => client.post(`/api/auth/users/${id}/resend-invite/`, {}),
}

/** active | invited | deactivated. The API sends `status` after R-64; before that, is_active decides. */
export function userStatus(user) {
  if (user?.status) return user.status
  return user?.is_active === false ? 'deactivated' : 'active'
}

/** Query params for the list. `active` keeps today's API filtering right until `status` is understood. */
export function listParams({ search, role, status, page, pageSize }) {
  const p = { page, page_size: pageSize }
  if (search) p.search = search
  if (role) p.role = role
  if (status) {
    p.status = status
    p.active = status === 'deactivated' ? 'false' : 'true'
  }
  return p
}

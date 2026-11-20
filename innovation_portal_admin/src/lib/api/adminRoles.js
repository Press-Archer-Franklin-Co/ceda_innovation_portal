import { client } from './client'

// S2 roles, permissions and approval steps (R-31). All need settings.manage.
export const adminRoles = {
  catalogue:     ()          => client.get('/api/admin/capabilities/'),
  list:          ()          => client.get('/api/admin/roles/'),
  create:        (body)      => client.post('/api/admin/roles/', body),
  update:        (id, body)  => client.patch(`/api/admin/roles/${id}/`, body),
  remove:        (id)        => client.delete(`/api/admin/roles/${id}/`),
  capabilities:  (id)        => client.get(`/api/admin/roles/${id}/capabilities/`),
  setCapabilities: (id, keys) => client.put(`/api/admin/roles/${id}/capabilities/`, { capabilities: keys }),
  flow:          ()          => client.get('/api/admin/approval-flows/content/'),
  saveFlow:      (body)      => client.put('/api/admin/approval-flows/content/', body),
}

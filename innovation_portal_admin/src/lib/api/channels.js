import { client } from './client'

// C2: WhatsApp and USSD journeys (apps/channels). Every endpoint needs channels.manage.
export const channelsApi = {
  status:        ()             => client.get('/api/channels/status/'),
  nodeTypes:     ()             => client.get('/api/channels/node-types/'),
  providers:     ()             => client.get('/api/channels/providers/'),

  journeys:      (params)       => client.get('/api/channels/journeys/', params),
  journey:       (id)           => client.get(`/api/channels/journeys/${id}/`),
  createJourney: (body)         => client.post('/api/channels/journeys/', body),
  updateJourney: (id, body)     => client.patch(`/api/channels/journeys/${id}/`, body),
  deleteJourney: (id)           => client.delete(`/api/channels/journeys/${id}/`),
  saveNodes:     (id, body)     => client.put(`/api/channels/journeys/${id}/nodes/`, body),
  validate:      (id)           => client.post(`/api/channels/journeys/${id}/validate/`, {}),
  publish:       (id)           => client.post(`/api/channels/journeys/${id}/publish/`, {}),
  versions:      (id)           => client.get(`/api/channels/journeys/${id}/versions/`),

  connections:      (params)    => client.get('/api/channels/connections/', params),
  createConnection: (body)      => client.post('/api/channels/connections/', body),
  updateConnection: (id, body)  => client.patch(`/api/channels/connections/${id}/`, body),
  deleteConnection: (id)        => client.delete(`/api/channels/connections/${id}/`),
  testConnection:   (id, body)  => client.post(`/api/channels/connections/${id}/test/`, body ?? {}),
  activate:         (id)        => client.post(`/api/channels/connections/${id}/activate/`, {}),
  deactivate:       (id)        => client.post(`/api/channels/connections/${id}/deactivate/`, {}),
  rotateWebhook:    (id)        => client.post(`/api/channels/connections/${id}/rotate-webhook/`, {}),

  sessions:      (params)       => client.get('/api/channels/sessions/', params),
  session:       (id)           => client.get(`/api/channels/sessions/${id}/`),
  report:        (params)       => client.get('/api/channels/report/', params),
  simulate:      (body)         => client.post('/api/channels/simulate/', body),
}

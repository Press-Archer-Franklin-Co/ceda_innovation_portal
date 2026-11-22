import { client } from './client'

// AI services tab (Platform settings): the AI settings card (keys in use, service and model per feature,
// monthly limit, names). Connections themselves use the platform integrations API (kind "ai").
export const aiServices = {
  overview:     (lang) => client.get('/api/assistant/admin/overview/', { lang }),
  saveSettings: (body) => client.patch('/api/assistant/admin/settings/', body),
}

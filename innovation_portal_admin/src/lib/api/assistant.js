import { client } from './client'

// C3 AI helper. Feature calls answer { available: false } when the helper is off or failed.
export const assistant = {
  status:        ()                 => client.get('/api/assistant/status/'),
  hints:         (id, params)       => client.get(`/api/assistant/submissions/${id}/hints/`, params),
  related:       (id, params)       => client.get(`/api/assistant/submissions/${id}/related/`, params),
  introduce:     (id, body)         => client.post(`/api/assistant/submissions/${id}/introductions/`, body),
  // Admin (assistant.manage)
  overview:      (lang)             => client.get('/api/assistant/admin/overview/', { lang }),
  saveSettings:  (body)             => client.patch('/api/assistant/admin/settings/', body),
  usage:         (days)             => client.get('/api/assistant/admin/usage/', { days }),
  tryIt:         (body)             => client.post('/api/assistant/admin/try/', body),
  knowledge:     ()                 => client.get('/api/assistant/admin/knowledge/'),
  addKnowledge:  (body)             => client.post('/api/assistant/admin/knowledge/', body),
  editKnowledge: (id, body)         => client.patch(`/api/assistant/admin/knowledge/${id}/`, body),
  dropKnowledge: (id)               => client.delete(`/api/assistant/admin/knowledge/${id}/`),
  orderKnowledge: (ids)             => client.post('/api/assistant/admin/knowledge/reorder/', { ids }),
  pages:         ()                 => client.get('/api/assistant/admin/manual-pages/'),
  addPage:       (body)             => client.post('/api/assistant/admin/manual-pages/', body),
  editPage:      (id, body)         => client.patch(`/api/assistant/admin/manual-pages/${id}/`, body),
  dropPage:      (id)               => client.delete(`/api/assistant/admin/manual-pages/${id}/`),
  orderPages:    (ids)              => client.post('/api/assistant/admin/manual-pages/reorder/', { ids }),
  addScreenshot: (pageId, file, captions) => {
    const body = new FormData()
    body.append('file', file)
    body.append('caption_en', captions.en ?? '')
    body.append('caption_tn', captions.tn ?? '')
    return client.post(`/api/assistant/admin/manual-pages/${pageId}/screenshots/`, body)
  },
  editScreenshot: (id, body)        => client.patch(`/api/assistant/admin/screenshots/${id}/`, body),
  dropScreenshot: (id)              => client.delete(`/api/assistant/admin/screenshots/${id}/`),
}

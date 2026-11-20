import { client } from './client'

// U6 website content (B6). All answer {success, message, data}; the client unwraps data.
export const homePage = {
  sectionTypes: ()           => client.get('/api/content/section-types/'),
  draft:        ()           => client.get('/api/content/pages/home/draft/'),
  saveDraft:    (sections)   => client.put('/api/content/pages/home/draft/', { sections }),
  preview:      (lang)       => client.get('/api/content/pages/home/preview/', { lang }),
  submit:       (publishAt)  => client.post('/api/content/pages/home/submit/', publishAt ? { publish_at: publishAt } : {}),
}

export const approvals = {
  list:    (status)          => client.get('/api/content/approvals/', status ? { status } : undefined),
  approve: (id, comment)     => client.post(`/api/content/approvals/${id}/approve/`, comment ? { comment } : {}),
  reject:  (id, comment)     => client.post(`/api/content/approvals/${id}/reject/`, { comment }),
}

export const posts = {
  list:      (params)        => client.get('/api/content/posts/', params),
  get:       (id)            => client.get(`/api/content/posts/${id}/`),
  create:    (body)          => client.post('/api/content/posts/', body),
  update:    (id, body)      => client.patch(`/api/content/posts/${id}/`, body),
  remove:    (id)            => client.delete(`/api/content/posts/${id}/`),
  submit:    (id, publishAt) => client.post(`/api/content/posts/${id}/submit/`, publishAt ? { publish_at: publishAt } : {}),
  pin:       (id, until)     => client.post(`/api/content/posts/${id}/pin/`, { until }),
  duplicate: (id)            => client.post(`/api/content/posts/${id}/duplicate/`),
  unpublish: (id)            => client.post(`/api/content/posts/${id}/unpublish/`),
  blast:     (id)            => client.post(`/api/content/posts/${id}/blast/`),
}

export const subscribers = {
  counts: () => client.get('/api/content/subscribers/counts/'),
}

/** Upload a cover picture or video (B1 media library), with optional captions for a video. */
export function uploadCover(file, { captions, altText } = {}) {
  const body = new FormData()
  body.append('file', file)
  if (altText) body.append('alt_text', altText)
  if (captions) body.append('captions', captions)
  return client.post('/api/media/', body)
}

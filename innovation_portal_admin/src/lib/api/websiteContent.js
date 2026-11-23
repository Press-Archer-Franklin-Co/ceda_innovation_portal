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
  get:     (id)              => client.get(`/api/content/approvals/${id}/`),
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

export const quotes = {
  list:    ()          => client.get('/api/content/leadership/'),
  create:  (body)      => client.post('/api/content/leadership/', body),
  update:  (id, body)  => client.patch(`/api/content/leadership/${id}/`, body),
  remove:  (id)        => client.delete(`/api/content/leadership/${id}/`),
  reorder: (items)     => client.post('/api/content/leadership/reorder/', items),
  /** The photo goes as a file (multipart), on its own. */
  photo:   (id, file)  => {
    const body = new FormData()
    body.append('photo', file)
    return client.patch(`/api/content/leadership/${id}/`, body)
  },
}

export const siteSettings = {
  get:    ()     => client.get('/api/content/site-settings/'),
  update: (body) => client.patch('/api/content/site-settings/', body),
}

export const partnersApi = {
  list:   ()         => client.get('/api/content/partners/'),
  create: (body)     => client.post('/api/content/partners/', body),
  update: (id, body) => client.patch(`/api/content/partners/${id}/`, body),
  remove: (id)       => client.delete(`/api/content/partners/${id}/`),
}

/** Upload a logo; the media library also stores a one-colour copy (B1 make_monochrome). */
export function uploadLogo(file, name) {
  const body = new FormData()
  body.append('file', file)
  body.append('kind', 'image')
  body.append('make_monochrome', 'true')
  if (name) body.append('alt_text', name)
  return client.post('/api/media/', body)
}

export const faqsApi = {
  list:          ()          => client.get('/api/support/admin/faqs/', { page_size: 500 }),
  create:        (body)      => client.post('/api/support/admin/faqs/', body),
  update:        (id, body)  => client.patch(`/api/support/admin/faqs/${id}/`, body),
  remove:        (id)        => client.delete(`/api/support/admin/faqs/${id}/`),
  reorder:       (items)     => client.post('/api/support/admin/faqs/reorder/', items),
  groups:        ()          => client.get('/api/support/admin/faq-groups/', { page_size: 200 }),
  createGroup:   (body)      => client.post('/api/support/admin/faq-groups/', body),
  updateGroup:   (id, body)  => client.patch(`/api/support/admin/faq-groups/${id}/`, body),
  removeGroup:   (id)        => client.delete(`/api/support/admin/faq-groups/${id}/`),
  reorderGroups: (items)     => client.post('/api/support/admin/faq-groups/reorder/', items),
  unanswered:    ()          => client.get('/api/support/admin/faqs/unanswered/'),
  resolve:       (id, faqId) => client.patch(`/api/support/admin/faqs/unanswered/${id}/`, { resolved_by_faq: faqId }),
}

export const storiesApi = {
  list:    ()         => client.get('/api/content/stories/'),
  create:  (body)     => client.post('/api/content/stories/', body),
  update:  (id, body) => client.patch(`/api/content/stories/${id}/`, body),
  remove:  (id)       => client.delete(`/api/content/stories/${id}/`),
  consent: (id)       => client.post(`/api/content/stories/${id}/consent-request/`),
  /** Staff idea search, to link a story to an idea and its innovator. */
  ideas:   (search)   => client.get('/api/submissions/', { search, page_size: 8 }),
}

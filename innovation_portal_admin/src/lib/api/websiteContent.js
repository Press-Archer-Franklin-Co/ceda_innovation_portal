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

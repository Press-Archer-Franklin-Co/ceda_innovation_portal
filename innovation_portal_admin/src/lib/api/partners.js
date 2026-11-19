import { client } from './client'

// Partners & sponsors (B6). Endpoints are on feature/b6-home-and-posts and reach main with B6 part 1.
// TODO(B6): until then these calls answer 404 on main; the screen that lists partners comes with U6 (3.12).
export const partners = {
  list:   ()         => client.get('/api/content/partners/'),
  create: (body)     => client.post('/api/content/partners/', body),
  update: (id, body) => client.patch(`/api/content/partners/${id}/`, body),
  remove: (id)       => client.delete(`/api/content/partners/${id}/`),
}

/** Upload an image with the B1 media library; returns the asset ({ id, url, ... }). */
export function uploadImage(file, altText = '') {
  const body = new FormData()
  body.append('file', file)
  body.append('kind', 'image')
  if (altText) body.append('alt_text', altText)
  return client.post('/api/media/', body)
}

import { client } from './client'

// U4 3.3 Review queue (Figma 18:372 website, 18:685 phone). The officer's queue on the left, the selected idea on
// the right. Scoring, notes, messages and decisions reuse the U8 endpoints in ./ideas.js.

/** Filters the queue reads from the address (and stores in saved views). */
export const QUEUE_FILTERS = ['mine', 'program', 'sector', 'overdue']

/** GET /api/reviewer-queue/: [{ id, reference_number, title, current_status, current_step, my_assignment_id, ... }] */
export async function reviewQueue(filters) {
  const params = {}
  if (filters.mine) params.mine = 'true'
  if (filters.overdue) params.overdue = 'true'
  if (filters.program) params.program = filters.program
  if (filters.sector) params.sector = filters.sector
  const data = await client.get('/api/reviewer-queue/', params)
  return Array.isArray(data) ? data : data?.results ?? []
}

/** Saved views of this queue (scope review_queue): { id, name, filters, is_shared } */
export const reviewViews = {
  list: () => client.get('/api/saved-views/', { scope: 'review_queue' }),
  create: (body) => client.post('/api/saved-views/', { ...body, scope: 'review_queue' }),
  remove: (id) => client.delete(`/api/saved-views/${id}/`),
}

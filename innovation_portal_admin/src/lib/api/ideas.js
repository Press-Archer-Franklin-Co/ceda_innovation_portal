import { client } from './client'

// U8 (3.15 to 3.20): the staff ideas, judging and My work screens, on the R-42 endpoints.

// ── 3.15 staff list ──────────────────────────────────────────────────────────

export const VIEWS = ['all', 'mine', 'needs_input', 'shortlisted', 'channels']

/** { count, results, views: { all, mine, ... }, page, page_size } */
export const staffList = (params) => client.get('/api/submissions/staff-list/', params)

export const savedViews = {
  list: () => client.get('/api/saved-views/', { scope: 'submissions' }),
  create: (body) => client.post('/api/saved-views/', { ...body, scope: 'submissions' }),
  remove: (id) => client.delete(`/api/saved-views/${id}/`),
}

// ── 3.16 one idea ────────────────────────────────────────────────────────────

export const staffSummary = (id, lang) => client.get(`/api/submissions/${id}/staff-summary/`, { lang })

export const ideaApi = {
  documents: (id) => client.get(`/api/documents/submissions/${id}/documents/`),
  messages: (id) => client.get(`/api/submissions/${id}/messages/`),
  sendMessage: (id, body) => client.post(`/api/submissions/${id}/messages/`, body),
  notes: (id) => client.get(`/api/submissions/${id}/notes/`),
  addNote: (id, body) => client.post(`/api/submissions/${id}/notes/`, body),
  history: (id) => client.get(`/api/submissions/${id}/history/`),
  workflowAction: (id, body) => client.post(`/api/submissions/${id}/workflow-action/`, body),
  sendBackInfo: (id) => client.get(`/api/submissions/${id}/send-back/`),
  sendBack: (id, body) => client.post(`/api/submissions/${id}/send-back/`, body),
  assign: (id, body) => client.post(`/api/submissions/${id}/assign/`, body),
  finalDecision: (id, body) => client.post(`/api/evaluations/${id}/final-decision/`, body),
  document: (docId) => client.get(`/api/documents/${docId}/`),
}

// ── 3.17 and 3.18 judging ────────────────────────────────────────────────────

/** The judge's own ideas. Status uses the API's words so StatusPill shows Done / In progress / Assigned. */
export async function judgingList() {
  const data = await client.get('/api/evaluations/my-assigned/')
  const rows = Array.isArray(data) ? data : data?.results ?? []
  return rows.map((r) => ({
    id: r.submission_id,
    assignment_id: r.assignment_id,
    title: r.submission_title,
    reference: r.reference_number,
    program: r.program ?? null,
    due_at: r.deadline,
    status: r.latest_score_status === 'locked' || r.status === 'completed' ? 'completed' : r.latest_score_status === 'draft' ? 'in_progress' : 'assigned',
    conflict: r.conflict ?? 'none',
    my_score: r.my_score ?? null,
  }))
}

/** { assigned, scored, programs, due_at } */
export const judgingSummary = () => client.get('/api/evaluations/my-assigned/summary/')

export const judgingApi = {
  cycle: (subId, lang) => client.get(`/api/evaluations/${subId}/cycle/`, { lang }),
  save: (subId, body) => client.post(`/api/evaluations/${subId}/cycle/scores/`, body),
  submit: (subId, body) => client.post(`/api/evaluations/${subId}/cycle/submit/`, body ?? {}),
  accept: (assignmentId) => client.post(`/api/assignments/${assignmentId}/accept/`),
  declareConflict: (assignmentId, details) => client.post(`/api/assignments/${assignmentId}/conflict/`, { conflict_details: details }),
}

// ── 3.19 all scores ──────────────────────────────────────────────────────────

/** { average, pass_mark, judges_scored, judges_assigned, last_scored_at, criteria: [{ ..., max, scores, spread, flagged }], comments, disagreement_threshold } */
export const scoresOverview = (subId) => client.get(`/api/evaluations/${subId}/scores-overview/`)

// ── 3.20 my work ─────────────────────────────────────────────────────────────

/** { counts: { open, done_week, assigned_by_me }, items: [...] } */
export const myWork = (tab) => client.get('/api/me/work/', { tab })

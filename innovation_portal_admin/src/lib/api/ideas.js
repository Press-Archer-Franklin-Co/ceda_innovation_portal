import { client } from './client'
import { statusWord } from '../status'

// U8 (3.15 to 3.20). Each call asks for the R-42 endpoint first. Until the backend lane ships it (the API
// answers 404 or 405), the same shape is built from today's endpoints. TODO(R-42): drop each fallback once its
// endpoint is on main. The shapes are the ones agreed in ~/ceda-coord/requests.md R-42.

const notThere = (err) => err?.status === 404 || err?.status === 405

async function preferNew(primary, fallback) {
  try {
    return await primary()
  } catch (err) {
    if (notThere(err)) return fallback()
    throw err
  }
}

const list = (data) => (Array.isArray(data) ? data : data?.results ?? [])

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '').slice(0, 2)).toUpperCase()
}

// ── 3.15 staff list ──────────────────────────────────────────────────────────

export const VIEWS = ['all', 'mine', 'needs_input', 'shortlisted', 'channels']
const VIEW_TEST = {
  all: () => true,
  mine: (row) => row._mine,
  needs_input: (row) => statusWord(row.status) === 'needs_input',
  shortlisted: (row) => statusWord(row.status) === 'shortlisted',
  channels: (row) => row.channel === 'whatsapp' || row.channel === 'ussd',
}

function staffRow(s, userId) {
  const name = s.innovator_detail?.full_name || s.guest_name || s.innovator_detail?.email || ''
  return {
    id: s.id,
    title: s.title,
    reference: s.reference_number,
    innovator: { name, initials: initialsOf(name) },
    program: s.program_detail ? { id: s.program_detail.id, title: s.program_detail.title } : null,
    channel: s.channel || null,
    district: s.district_detail ?? null,
    status: s.current_status,
    score: s.average_score ?? null,
    submitted_at: s.submitted_at,
    updated_at: s.updated_at ?? s.submitted_at,
    _mine: Boolean(userId && (s.assigned_officer === userId || s.assignees?.includes?.(userId))),
  }
}

async function staffListFallback(params, userId) {
  const query = { ...(params.program ? { program: params.program } : {}), ...(params.search ? { search: params.search } : {}) }
  const all = list(await client.get('/api/submissions/', query))
    .filter((s) => s.current_status !== 'draft')
    .map((s) => staffRow(s, userId))
  const from = params.submitted_from ? new Date(params.submitted_from) : null
  const to = params.submitted_to ? new Date(`${params.submitted_to}T23:59:59`) : null
  const filtered = all.filter((r) =>
    (!params.stage || statusWord(r.status) === params.stage) &&
    (!params.channel || r.channel === params.channel) &&
    (!from || (r.submitted_at && new Date(r.submitted_at) >= from)) &&
    (!to || (r.submitted_at && new Date(r.submitted_at) <= to)),
  )
  const views = Object.fromEntries(VIEWS.map((v) => [v, filtered.filter(VIEW_TEST[v]).length]))
  const rows = filtered.filter(VIEW_TEST[params.view ?? 'all'] ?? VIEW_TEST.all)
  const ordering = params.ordering || '-updated_at'
  const key = ordering.replace(/^-/, '')
  const dir = ordering.startsWith('-') ? -1 : 1
  rows.sort((a, b) => {
    const va = a[key] ?? ''
    const vb = b[key] ?? ''
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * dir
  })
  const size = Number(params.page_size) || 20
  const page = Number(params.page) || 1
  return { count: rows.length, results: rows.slice((page - 1) * size, page * size), views }
}

export function staffList(params, userId) {
  return preferNew(() => client.get('/api/submissions/staff-list/', params), () => staffListFallback(params, userId))
}

export const savedViews = {
  list: () => client.get('/api/saved-views/', { scope: 'submissions' }),
  create: (body) => client.post('/api/saved-views/', { ...body, scope: 'submissions' }),
  remove: (id) => client.delete(`/api/saved-views/${id}/`),
}

// ── 3.16 one idea ────────────────────────────────────────────────────────────

async function summaryFallback(id) {
  const [s, workflow, notes, assignments] = await Promise.all([
    client.get(`/api/submissions/${id}/`),
    client.get(`/api/submissions/${id}/workflow/`).catch(() => null),
    client.get(`/api/submissions/${id}/notes/`).catch(() => null),
    client.get(`/api/submissions/${id}/assignments/`).catch(() => null),
  ])
  const definition = workflow?.workflow_definition_id
    ? await client.get(`/api/workflow-definitions/${workflow.workflow_definition_id}/`).catch(() => null)
    : null
  const currentOrder = workflow?.current_step_order
  const finished = ['completed', 'rejected', 'cancelled'].includes(workflow?.workflow_status)
  const steps = (definition?.steps ?? [])
    .filter((st) => st.is_active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((st) => ({
      code: st.code,
      title: st.name,
      state: finished || (currentOrder != null && st.order < currentOrder) ? 'done' : st.order === currentOrder ? 'current' : 'pending',
    }))
  const officer = list(assignments).find((a) => a.role_type !== 'judge' && a.status !== 'reassigned')
  const judges = list(assignments).filter((a) => a.role_type === 'judge' && a.status !== 'reassigned')
  const name = s.innovator_detail?.full_name || s.guest_name || ''
  return {
    id: s.id,
    title: s.title,
    reference: s.reference_number,
    status: s.current_status,
    channel: s.channel,
    submitted_at: s.submitted_at,
    program: s.program_detail ? { id: s.program_detail.id, title: s.program_detail.title } : null,
    language: 'en',
    steps,
    answers: [
      {
        step_code: 'answers',
        step_title: null,
        items: (s.responses ?? []).map((r) => ({ key: r.field_key, label: r.field_label, value: r.value, value_other_language: null })),
      },
    ],
    innovator: {
      id: s.innovator ?? null,
      name,
      initials: initialsOf(name),
      phone: s.guest_phone || s.innovator_detail?.phone_number || null,
      district: null,
      age: null,
      language: null,
      other_ideas: null,
    },
    assigned_to: officer ? { id: officer.assignee, name: officer.assignee_name, initials: initialsOf(officer.assignee_name) } : null,
    reply_due: officer?.deadline ?? workflow?.due_at ?? null,
    scores: { average: null, judges_scored: judges.filter((j) => j.status === 'completed').length, judges_assigned: judges.length },
    counts: { documents: null, messages: null, notes: list(notes).length, related: null },
    related: [],
    // Today's workflow facts, used for "Move to next stage" until R-42 says more.
    allowed_actions: workflow?.allowed_actions ?? [],
    reply_due_step: workflow?.due_at ?? null,
  }
}

export function staffSummary(id, lang) {
  return preferNew(() => client.get(`/api/submissions/${id}/staff-summary/`, { lang }), () => summaryFallback(id))
}

export const ideaApi = {
  documents: (id) => client.get(`/api/documents/submissions/${id}/documents/`),
  messages: (id) => client.get(`/api/submissions/${id}/messages/`),
  sendMessage: (id, body) => client.post(`/api/submissions/${id}/messages/`, body),
  notes: (id) => client.get(`/api/submissions/${id}/notes/`),
  addNote: (id, body) => client.post(`/api/submissions/${id}/notes/`, body),
  history: (id) => client.get(`/api/submissions/${id}/history/`),
  workflowAction: (id, body) => client.post(`/api/submissions/${id}/workflow-action/`, body),
  assign: (id, body) => client.post(`/api/submissions/${id}/assign/`, body),
  finalDecision: (id, body) => client.post(`/api/evaluations/${id}/final-decision/`, body),
  document: (docId) => client.get(`/api/documents/${docId}/`),
}

// ── 3.17 and 3.18 judging ────────────────────────────────────────────────────

export async function judgingList() {
  const rows = list(await client.get('/api/evaluations/my-assigned/'))
  return rows.map((r) => ({
    id: r.submission_id,
    assignment_id: r.assignment_id ?? r.id,
    title: r.submission_title,
    reference: r.reference_number,
    program: r.program ?? null,
    due_at: r.deadline,
    status: r.latest_score_status === 'locked' || r.status === 'completed' ? 'done' : r.latest_score_status === 'draft' ? 'in_progress' : 'assigned',
    conflict: r.conflict ?? 'none',
    my_score: r.my_score ?? null,
  }))
}

export function judgingSummary(rows) {
  return preferNew(
    () => client.get('/api/evaluations/my-assigned/summary/'),
    async () => {
      const open = rows.filter((r) => r.status !== 'done' && r.due_at).map((r) => r.due_at).sort()
      return {
        assigned: rows.length,
        scored: rows.filter((r) => r.status === 'done').length,
        programs: new Set(rows.map((r) => r.program?.id).filter(Boolean)).size || null,
        due_at: open[0] ?? null,
      }
    },
  )
}

export const judgingApi = {
  cycle: (subId, lang) => client.get(`/api/evaluations/${subId}/cycle/`, { lang }),
  save: (subId, body) => client.post(`/api/evaluations/${subId}/cycle/scores/`, body),
  submit: (subId, body) => client.post(`/api/evaluations/${subId}/cycle/submit/`, body ?? {}),
  accept: (assignmentId) => client.post(`/api/assignments/${assignmentId}/accept/`),
  declareConflict: (assignmentId, details) => client.post(`/api/assignments/${assignmentId}/conflict/`, { conflict_details: details }),
}

// ── 3.19 all scores ──────────────────────────────────────────────────────────

async function overviewFallback(subId) {
  const cycles = list(await client.get(`/api/evaluations/${subId}/cycles/`))
  const cycle = cycles[cycles.length - 1]
  if (!cycle) return { average: null, pass_mark: null, judges_scored: 0, judges_assigned: 0, last_scored_at: null, criteria: [], comments: [], disagreement_threshold: 2 }
  const sum = await client.get(`/api/evaluations/${subId}/cycles/${cycle.id}/summary/`)
  const cards = (sum.peer_scorecards ?? sum.scorecards ?? []).filter((c) => c.submitted_at || c.status === 'submitted' || c.status === 'locked')
  const threshold = 2
  const criteria = (sum.criteria ?? []).map((c) => {
    const scores = cards
      .map((card, i) => {
        const hit = (card.scores ?? card.criterion_scores ?? []).find((x) => String(x.criterion_id) === String(c.id))
        return hit ? { judge: i + 1, score: Number(hit.raw_score ?? hit.score) } : null
      })
      .filter(Boolean)
    const values = scores.map((x) => x.score)
    const spread = values.length ? Math.max(...values) - Math.min(...values) : 0
    return {
      id: c.id,
      name: c.name,
      weight: c.weight,
      max: c.max_score ?? 5,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      scores,
      spread,
      flagged: spread > threshold,
    }
  })
  return {
    average: sum.aggregate?.percentage ?? sum.aggregate?.average ?? null,
    pass_mark: null,
    judges_scored: cards.length,
    judges_assigned: sum.required_reviews || cards.length,
    last_scored_at: cards.map((c) => c.submitted_at).filter(Boolean).sort().pop() ?? null,
    criteria,
    comments: cards.map((c, i) => ({ judge: i + 1, comment: c.overall_comment })).filter((c) => c.comment),
    disagreement_threshold: threshold,
  }
}

export function scoresOverview(subId) {
  return preferNew(() => client.get(`/api/evaluations/${subId}/scores-overview/`), () => overviewFallback(subId))
}

export const downloadScoresCsv = (subId) => client.getBlob(`/api/evaluations/${subId}/scores-overview/`, { format: 'csv' })

// ── 3.20 my work ─────────────────────────────────────────────────────────────

const KIND_BY_ROLE = { judge: 'score', reviewer: 'review', mentor: 'review' }

async function myWorkFallback(tab) {
  const rows = list(await client.get('/api/assignments/'))
  const weekAgo = Date.now() - 7 * 864e5
  const items = rows.map((a) => ({
    id: a.id,
    kind: KIND_BY_ROLE[a.role_type] ?? 'review',
    title: a.submission_title,
    context: a.workflow_step_name,
    due_at: a.deadline,
    overdue: Boolean(a.deadline && !a.completed_at && new Date(a.deadline) < new Date()),
    done: a.status === 'completed',
    completed_at: a.completed_at,
    submission: { id: a.submission, title: a.submission_title, reference: a.submission_reference_number },
    why: a.assigned_by_name ? { kind: 'person', name: a.assigned_by_name } : null,
    step: a.workflow_step_name ? { name: a.workflow_step_name } : null,
    link: a.role_type === 'judge' ? `/judging/${a.submission}` : `/submissions/${a.submission}`,
    assignment_id: a.id,
    status: a.status,
  }))
  const open = items.filter((i) => !i.done && i.status !== 'reassigned' && i.status !== 'declined')
  const doneWeek = items.filter((i) => i.done && i.completed_at && new Date(i.completed_at).getTime() > weekAgo)
  const pick = { open, done_week: doneWeek, assigned_by_me: [] }
  return { counts: { open: open.length, done_week: doneWeek.length, assigned_by_me: null }, items: pick[tab] ?? open }
}

export function myWork(tab) {
  return preferNew(() => client.get('/api/me/work/', { tab }), () => myWorkFallback(tab))
}

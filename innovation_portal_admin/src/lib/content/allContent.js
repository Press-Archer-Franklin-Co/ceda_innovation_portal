// 3.38 All content: one row shape for every kind of website content, so the page can show one table.
// Until GET /api/content/all/ (R-59 item 1) exists, rows are built from each type's own list.
// Row: { key, type, id, title, hasSetswana (true | false | null when the type has no Setswana), status, updatedAt,
//        updatedBy, href, approvalId }

export const TYPES = ['page', 'news', 'story', 'quote', 'partner', 'faq', 'policy']
export const STATUSES = ['draft', 'pending_approval', 'scheduled', 'published', 'archived']
export const TYPE_HREF = {
  page: () => '/content/home',
  news: (r) => `/content/news/${r.id}`,
  story: () => '/content/stories',
  quote: () => '/content/quotes',
  partner: () => '/content/partners',
  faq: (r) => `/content/faqs/${r.id}`,
  policy: (r) => `/content/policies?page=${r.id}`,
}
export const NEW_TYPES = [
  { type: 'news', href: '/content/news/new' },
  { type: 'story', href: '/content/stories' },
  { type: 'quote', href: '/content/quotes' },
  { type: 'partner', href: '/content/partners' },
  { type: 'faq', href: '/content/faqs/new' },
]

const en = (v) => (v && typeof v === 'object' ? v.en ?? '' : v ?? '')
const filled = (v) => typeof v === 'string' && v.trim() !== ''
const who = (v) => (v && typeof v === 'object' ? v.name ?? v.full_name ?? v.short_name ?? '' : v ?? '')

/** A status the table can show; anything else counts as draft or published from an on/off flag. */
function statusOf(raw, active) {
  if (STATUSES.includes(raw)) return raw
  if (raw === 'pending' || raw === 'in_review') return 'pending_approval'
  if (raw === 'live') return 'published'
  if (typeof active === 'boolean') return active ? 'published' : 'draft'
  return 'draft'
}

function row(type, item, { id, title, hasSetswana, status, updatedBy }) {
  const r = {
    key: `${type}:${id}`,
    type,
    id,
    title: title || '',
    hasSetswana,
    status,
    updatedAt: item.updated_at ?? item.modified_at ?? item.created_at ?? null,
    updatedBy: who(updatedBy ?? item.updated_by_name ?? item.updated_by ?? item.author_name ?? item.created_by_name ?? ''),
    approvalId: item.approval?.id ?? item.pending_approval_id ?? null,
  }
  r.href = TYPE_HREF[type](r)
  return r
}

export function fromPost(p) {
  return row('news', p, {
    id: p.id,
    title: en(p.title),
    hasSetswana: filled(p.title?.tn ?? p.translations?.tn?.title),
    status: statusOf(p.status),
    updatedBy: p.updated_by_name ?? p.author?.name ?? p.author_name,
  })
}

export function fromStory(s) {
  return row('story', s, {
    id: s.id,
    title: en(s.business) || s.person_name || en(s.quote),
    hasSetswana: filled(s.quote?.tn) || filled(s.business?.tn),
    status: statusOf(s.status),
  })
}

export function fromQuote(q) {
  return row('quote', q, {
    id: q.id,
    title: q.quote || q.full_name || '',
    hasSetswana: filled(q.translations?.tn?.quote),
    status: statusOf(q.status, q.is_active),
  })
}

export function fromPartner(p) {
  // Partner names are names: there is no Setswana version to show.
  return row('partner', p, { id: p.id, title: p.name, hasSetswana: null, status: statusOf(p.status, p.is_active) })
}

export function fromFaq(f) {
  return row('faq', f, {
    id: f.id,
    title: f.question || '',
    hasSetswana: filled(f.translations?.tn?.question),
    status: statusOf(f.status, f.is_public ?? f.is_published ?? f.is_active),
  })
}

export function fromPolicy(p) {
  return row('policy', p, {
    id: p.key,
    title: p.title || p.name,
    hasSetswana: p.missing_setswana == null ? null : !p.missing_setswana,
    status: p.pending_approval ? 'pending_approval' : p.published_at ? 'published' : 'draft',
    updatedBy: p.updated_by,
  })
}

/** The home page as one row: waiting for approval when its draft is sent, otherwise published. */
export function fromHome(draft, approvals = []) {
  const pending = approvals.find((a) => ['page', 'home', 'home_page'].includes(a.target_type) && a.status === 'pending')
  return row('page', { updated_at: draft?.updated_at ?? pending?.requested_at ?? null, updated_by: draft?.updated_by_name ?? pending?.requested_by_name }, {
    id: 'home',
    title: 'home',
    hasSetswana: null,
    status: draft?.pending_approval || pending ? 'pending_approval' : draft?.live_version ? 'published' : 'draft',
  })
}

export function filterRows(rows, { type, status, lang, q }) {
  const query = (q ?? '').trim().toLowerCase()
  return rows
    .filter((r) => !type || r.type === type)
    .filter((r) => !status || r.status === status)
    .filter((r) => !lang || (lang === 'tn' ? r.hasSetswana === true : r.hasSetswana === false))
    .filter((r) => !query || r.title.toLowerCase().includes(query))
}

export const byRecent = (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))

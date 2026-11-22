// 3.38 All content: one row shape for every kind of website content, so the page can show one table.
// Rows come from the backend's single list, GET /api/content/all/ (R-59 part 1), which pages, searches, filters and
// sorts them (newest change first). Policy pages are not in that list yet (TODO(R-62) item 1): when the type filter
// is "Policy page" the rows come from /api/content/policies/ instead (five pages, filtered here).
// Row: { key, type, id, title, hasSetswana (true | false | null when the type has no Setswana), status, updatedAt,
//        updatedBy, href, approvalId }

export const TYPES = ['page', 'news', 'story', 'quote', 'partner', 'faq', 'policy']
// The single list folds scheduled posts into published, so there is no "Scheduled" filter.
export const STATUSES = ['draft', 'pending_approval', 'published', 'archived']
// "Has Setswana" waits for lang=tn_has (TODO(R-62) item 2). Filtering one page in the browser would make the page
// count wrong, so only "Missing Setswana" is offered until then.
export const LANGS = ['missing']
export const PAGE_SIZE = 20

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

function row(type, { id, title, hasSetswana, status, updatedAt, updatedBy, approvalId }) {
  const r = {
    key: `${type}:${id}`,
    type,
    id: String(id),
    title: title || '',
    hasSetswana,
    status: STATUSES.includes(status) ? status : 'draft',
    updatedAt: updatedAt ?? null,
    updatedBy: updatedBy || '',
    approvalId: approvalId ?? null,
  }
  r.href = TYPE_HREF[type] ? TYPE_HREF[type](r) : '/content'
  return r
}

/**
 * One row of GET /api/content/all/. Rows with no screen to open are dropped rather than shown with a wrong link:
 * unknown types, and built pages other than the home page (only the home page has an editor, 3.8).
 */
export function fromAll(item) {
  if (!item || !TYPE_HREF[item.type]) return null
  if (item.type === 'page' && item.id !== 'home') return null
  return row(item.type, {
    id: item.id,
    title: item.title,
    hasSetswana: item.has_setswana ?? null,
    status: item.status,
    updatedAt: item.updated_at,
    updatedBy: item.updated_by,
    approvalId: item.pending_approval_id,
  })
}

/** One row of GET /api/content/policies/ (U11C). */
export function fromPolicy(p) {
  return row('policy', {
    id: p.key,
    title: p.title || p.name,
    hasSetswana: p.missing_setswana == null ? null : !p.missing_setswana,
    status: p.pending_approval ? 'pending_approval' : p.published_at ? 'published' : 'draft',
    updatedAt: p.updated_at ?? p.draft_updated_at ?? p.published_at,
    updatedBy: p.updated_by,
  })
}

/** The query string for GET /api/content/all/ from the screen's filters. */
export function allParams({ type, status, lang, q, page = 1 }) {
  const params = { page, page_size: PAGE_SIZE }
  if (type) params.type = type
  if (status) params.status = status
  if (lang === 'missing') params.lang = 'tn_missing'
  const search = (q ?? '').trim()
  if (search) params.search = search
  return params
}

/** Policy rows with the same filters the server applies to the single list. */
export function filterRows(rows, { status, lang, q }) {
  const query = (q ?? '').trim().toLowerCase()
  return rows
    .filter((r) => !status || r.status === status)
    .filter((r) => !lang || (lang === 'tn' ? r.hasSetswana === true : r.hasSetswana === false))
    .filter((r) => !query || r.title.toLowerCase().includes(query))
}

export const byRecent = (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))

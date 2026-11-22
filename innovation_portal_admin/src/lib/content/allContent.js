// 3.38 All content: one row shape for every kind of website content, so the page can show one table.
// Rows come from the backend's single list, GET /api/content/all/ (R-59 part 1 and R-62), which pages, searches,
// filters and sorts them (newest change first; frame 3.38 has no sort control). Policy pages are in it with their
// key as the id.
// Row: { key, type, id, title, hasSetswana (true | false | null when the type has no Setswana), status, updatedAt,
//        updatedBy, href, approvalId }

export const TYPES = ['page', 'news', 'story', 'quote', 'partner', 'faq', 'policy']
// Scheduled: published with a publish date still ahead (news approved for later, stories, quotes).
export const STATUSES = ['draft', 'pending_approval', 'scheduled', 'published', 'archived']
export const LANGS = ['tn', 'missing']
const LANG_PARAM = { tn: 'tn_has', missing: 'tn_missing' }
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

/** The query string for GET /api/content/all/ from the screen's filters. */
export function allParams({ type, status, lang, q, page = 1 }) {
  const params = { page, page_size: PAGE_SIZE }
  if (type) params.type = type
  if (status) params.status = status
  if (LANG_PARAM[lang]) params.lang = LANG_PARAM[lang]
  const search = (q ?? '').trim()
  if (search) params.search = search
  return params
}

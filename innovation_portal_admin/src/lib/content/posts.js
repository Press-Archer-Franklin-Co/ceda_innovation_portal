// 3.9 News & bulletin list and 3.10 post editor: pure helpers for B6 /api/content/posts/.

export const POST_TYPES = ['news', 'event', 'opportunity', 'result', 'notice', 'newsletter']

/** Same colours as the public site's post tags (innovation_portal_public sections.tsx postTypeTone). */
export const TYPE_TONE = { news: 'neutral', event: 'orange', opportunity: 'green', result: 'amber', notice: 'neutral', newsletter: 'blue' }

/** Places a post shows, in the words staff use; "news_page" is everywhere, so it is not listed. */
export const SHOWS_ON = ['news_flash', 'bulletin_board', 'highlights']

const DAY = 24 * 60 * 60 * 1000

/** Numbers for the four cards on top of 3.9, all from the API's own list; nothing is guessed. */
export function listStats(results = [], now = Date.now()) {
  const live = results.filter((p) => p.status === 'published')
  const scheduled = results.filter((p) => p.status === 'scheduled' && p.publish_at).map((p) => p.publish_at).sort()
  const waiting = results.filter((p) => p.status === 'pending_approval').map((p) => p.approval?.requested_at ?? p.updated_at).filter(Boolean).sort()
  return {
    pinned: live.filter((p) => p.is_pinned).length,
    nextScheduled: scheduled[0] ?? null,
    oldestWaitingDays: waiting[0] ? Math.max(0, Math.floor((now - new Date(waiting[0]).getTime()) / DAY)) : null,
    totalViews: live.reduce((sum, p) => sum + (Number.isFinite(p.view_count) ? p.view_count : 0), 0),
  }
}

export function countByType(results = []) {
  const counts = Object.fromEntries(POST_TYPES.map((t) => [t, 0]))
  for (const p of results) if (p.type in counts) counts[p.type] += 1
  return counts
}

/** Phone filter chips (Figma 34:679): all, live, scheduled, waiting for approval. */
export function filterByState(results = [], state) {
  if (state === 'live') return results.filter((p) => p.status === 'published')
  if (state === 'scheduled') return results.filter((p) => p.status === 'scheduled')
  if (state === 'approval') return results.filter((p) => p.status === 'pending_approval')
  return results
}

/** The date column: when it went live, or when it will. */
export function postDate(post) {
  if (post.status === 'published') return post.published_at ?? null
  if (post.status === 'scheduled') return post.publish_at ?? null
  return null
}

const text = (value) => (value && typeof value === 'object' ? { en: value.en ?? '', tn: value.tn ?? '' } : { en: value ?? '', tn: '' })
const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const toIso = (local) => (local ? new Date(local).toISOString() : null)

/** Editor form from an API post (or a new one of `type`). Dates are datetime-local strings. */
export function fromPost(post, type = 'news') {
  return {
    type: post?.type ?? type,
    title: text(post?.title),
    excerpt: text(post?.excerpt),
    body: text(post?.body),
    cover_id: post?.cover_id ?? post?.cover?.id ?? null,
    tags: Array.isArray(post?.tags) ? post.tags : [],
    show_in_news_flash: post?.show_in_news_flash ?? true,
    show_on_bulletin: post?.show_on_bulletin ?? true,
    pinned_until: toInput(post?.pinned_until),
    mark_new: (post?.mark_new_days ?? 7) > 0,
    event_starts_at: toInput(post?.event_starts_at),
    event_place: post?.event_place ?? '',
    newsletter_issue: post?.newsletter_issue ?? '',
    publish_at: toInput(post?.publish_at),
    unpublish_at: toInput(post?.unpublish_at),
  }
}

/** What POST/PATCH /posts/ takes. Fields that only one type uses are sent empty for the others. */
export function toPostPayload(f) {
  return {
    type: f.type,
    title: f.title,
    excerpt: f.excerpt,
    body: f.body,
    cover_id: f.cover_id || null,
    tags: f.tags,
    show_in_news_flash: f.show_in_news_flash,
    show_on_bulletin: f.show_on_bulletin,
    pinned_until: toIso(f.pinned_until),
    mark_new_days: f.mark_new ? 7 : 0,
    event_starts_at: f.type === 'event' ? toIso(f.event_starts_at) : null,
    event_place: f.type === 'event' ? f.event_place : '',
    newsletter_issue: f.type === 'newsletter' && f.newsletter_issue !== '' ? Number(f.newsletter_issue) : null,
    publish_at: toIso(f.publish_at),
    unpublish_at: toIso(f.unpublish_at),
  }
}

/** Problems the editor can see before saving, as { field: stringKey }. The API checks the same. */
export function postProblems(f, now = Date.now()) {
  const out = {}
  if (!f.title.en.trim()) out.title = 'post.needTitle'
  if (!f.excerpt.en.trim()) out.excerpt = 'post.needSummary'
  if (f.type === 'event') {
    if (!f.event_starts_at) out.event_starts_at = 'post.needEventDate'
    if (!f.event_place.trim()) out.event_place = 'post.needEventPlace'
  }
  if (f.type === 'newsletter' && !String(f.newsletter_issue).trim()) out.newsletter_issue = 'post.needIssue'
  if (f.publish_at && f.unpublish_at && new Date(f.unpublish_at) <= new Date(f.publish_at)) out.unpublish_at = 'post.takeDownAfter'
  if (f.pinned_until && new Date(f.pinned_until).getTime() <= now) out.pinned_until = 'post.pinFuture'
  return out
}

/** Text fields with English but no Setswana. */
export function missingSetswana(f) {
  return ['title', 'excerpt', 'body'].filter((k) => f[k].en.trim() && !f[k].tn.trim())
}

/** The API checks the same rules before it keeps even a draft, so save only when none are broken. */
export const canKeep = (f) => !!f && Object.keys(postProblems(f)).length === 0

/** Drafts autosave; anything already sent, scheduled or live is saved only on purpose. */
export const autosaves = (status) => !status || status === 'draft'

export const COVER_IMAGE = ['image/jpeg', 'image/png', 'image/webp']
export const COVER_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm']
const MB = 1024 * 1024

/** Which problem a chosen cover file has, as a string key, or null. Matches the media library's limits. */
export function coverFileProblem(file) {
  if (!file) return null
  const isVideo = COVER_VIDEO.includes(file.type)
  if (!isVideo && !COVER_IMAGE.includes(file.type)) return 'post.coverWrongType'
  if (file.size > (isVideo ? 50 : 10) * MB) return 'post.coverTooBig'
  return null
}

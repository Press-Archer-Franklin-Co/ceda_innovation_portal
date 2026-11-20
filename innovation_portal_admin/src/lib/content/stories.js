// 3.11 Stories: pure helpers for /api/content/stories/ (B6 part 2 E).

export const STORY_PLACES = ['home', 'challenge', 'stories']
export const MAX_FEATURED = 3
export const MAX_STATS = 4
export const QUOTE_MAX = 200

const text = (v) => (v && typeof v === 'object' ? { en: v.en ?? '', tn: v.tn ?? '' } : { en: v ?? '', tn: '' })

export function fromStory(s) {
  return {
    person_name: s?.person_name ?? '',
    business: text(s?.business),
    place: text(s?.place),
    sector: s?.sector != null ? String(s.sector) : null,
    quote: text(s?.quote),
    stats: (s?.stats ?? []).map((x) => ({ value: String(x.value ?? ''), label: text(x.label) })),
    cover_id: s?.cover_id ?? null,
    shows_on: s?.shows_on ?? ['stories'],
    program: s?.program != null ? String(s.program) : null,
    user: s?.user ?? null,
    submission: s?.submission ?? null,
    is_featured: !!s?.is_featured,
    status: s?.status ?? 'draft',
  }
}

export function toStoryPayload(f) {
  return {
    person_name: f.person_name.trim(),
    business: f.business,
    place: f.place,
    sector: f.sector,
    quote: f.quote,
    stats: f.stats.filter((x) => x.value.trim()).map((x) => ({ value: x.value.trim(), label: x.label })),
    cover_id: f.cover_id,
    shows_on: f.shows_on,
    program: f.program,
    user: f.user,
    submission: f.submission,
    is_featured: f.is_featured,
    status: f.status,
  }
}

/** Consent decides publishing: a story about a portal user needs their "yes". */
export const needsConsent = (story) => !!story?.user && story?.consent_status !== 'given'
export const canAskConsent = (story) => !!story?.id && !!story?.user && ['not_asked', 'declined'].includes(story?.consent_status)

export function storyProblems(f, story) {
  const out = {}
  if (!f.person_name.trim()) out.person_name = 'stories.needName'
  if (f.quote.en.length > QUOTE_MAX || f.quote.tn.length > QUOTE_MAX) out.quote = 'stories.quoteLong'
  if (f.stats.length > MAX_STATS) out.stats = 'stories.tooManyStats'
  if (f.status === 'published' && f.user && (story?.user !== f.user || needsConsent(story ?? { user: f.user }))) out.status = 'stories.needConsent'
  return out
}

/** May this story be starred now? A 4th featured story is refused with a clear message. */
export function canFeature(stories, id) {
  const others = stories.filter((s) => s.is_featured && s.id !== id).length
  return others < MAX_FEATURED
}

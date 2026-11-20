import api from '../services/api'
import { query, unwrapData } from '../services/envelope'
import type { Lang } from '../types/innovator'

// Site search (screen 1.3): GET /api/content/public/search/?q=&lang= answers
// {q, total, groups: {challenges, stories, posts, help}}, at most 4 each. These helpers turn it into rows.

export type ChallengeHit = { kind: 'challenge'; title: string; slug: string; status: string; days_left: number }
export type StoryHit = { kind: 'story'; title: string; id: string; person_name: string; sector: string | null }
export type PostHit = { kind: 'post'; title: string; slug: string; type: string; published_at: string | null }
export type HelpHit =
  | { kind: 'faq'; title: string; id: string; help_kind: 'faq' }
  | { kind: 'guideline'; title: string; id: string; url: string | null; help_kind: 'guideline' }

export interface SearchResult {
  q: string
  total: number
  groups: { challenges: ChallengeHit[]; stories: StoryHit[]; posts: PostHit[]; help: HelpHit[] }
}

export const MIN_QUERY = 2

export async function searchSite(q: string, lang: Lang, signal?: AbortSignal): Promise<SearchResult> {
  const { data } = await api.get(`/content/public/search/${query({ q, lang })}`, { signal })
  return unwrapData<SearchResult>(data)
}

export type GroupKey = keyof SearchResult['groups']
export type RowIcon = 'challenge' | 'story' | 'post' | 'help'

export interface SearchRow {
  id: string
  group: GroupKey
  icon: RowIcon
  title: string
  meta: string
  /** In-app path, or a full URL when `external` is true. */
  href: string
  external: boolean
}

export const GROUP_ORDER: GroupKey[] = ['challenges', 'stories', 'posts', 'help']

type T = (key: string, vars?: Record<string, string | number>) => string

function shortDate(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'tn' ? 'en-BW' : 'en-GB', { day: 'numeric', month: 'short' }).format(d)
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')

/** Rows in display order. Unknown words from the API (a new status or post type) are left out of the meta line, never shown raw. */
export function toRows(result: SearchResult, t: T, lang: Lang, has: (key: string) => boolean): SearchRow[] {
  const known = (key: string) => (has(key) ? t(key) : '')
  const g = result.groups
  return [
    ...g.challenges.map((c): SearchRow => ({
      id: `challenge:${c.slug}`,
      group: 'challenges',
      icon: 'challenge',
      title: c.title,
      meta: join(known(`status.${c.status}`), c.status === 'open' && c.days_left > 0 ? t('ch.daysLeft', { n: c.days_left }) : null),
      href: `/challenges/${encodeURIComponent(c.slug)}`,
      external: false,
    })),
    ...g.stories.map((s): SearchRow => ({
      id: `story:${s.id}`,
      group: 'stories',
      icon: 'story',
      title: s.title,
      meta: join(t('search.story'), s.sector),
      href: '/stories',
      external: false,
    })),
    ...g.posts.map((p): SearchRow => ({
      id: `post:${p.slug}`,
      group: 'posts',
      icon: 'post',
      title: p.title,
      meta: join(known(`post.${p.type}`), shortDate(p.published_at, lang)),
      href: `/news/${encodeURIComponent(p.slug)}`,
      external: false,
    })),
    ...g.help.map((h): SearchRow =>
      h.kind === 'guideline'
        ? { id: `guide:${h.id}`, group: 'help', icon: 'help', title: h.title, meta: t('search.guide'), href: h.url || '/guidelines', external: Boolean(h.url) }
        : { id: `faq:${h.id}`, group: 'help', icon: 'help', title: h.title, meta: t('search.faq'), href: '/faq', external: false },
    ),
  ]
}

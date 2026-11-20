import { describe, expect, it } from 'vitest'
import { toRows, type SearchResult } from './siteSearch'

const strings: Record<string, string> = {
  'status.open': 'Open', 'ch.daysLeft': '{n} days left', 'search.story': 'Success story',
  'post.newsletter': 'Newsletter', 'search.faq': 'Help article', 'search.guide': 'Guide',
}
const t = (k: string, v: Record<string, string | number> = {}) => (strings[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v[n]))
const has = (k: string) => k in strings

const result: SearchResult = {
  q: 'mopane',
  total: 6,
  groups: {
    challenges: [
      { kind: 'challenge', title: 'Agribusiness Value-Add Challenge', slug: 'agri value', status: 'open', days_left: 9 },
      { kind: 'challenge', title: 'Old call', slug: 'old', status: 'archived_new_word', days_left: 0 },
    ],
    stories: [{ kind: 'story', title: 'Mopane snack bars', id: 's1', person_name: 'Neo', sector: 'Agriculture' }],
    posts: [{ kind: 'post', title: 'Digest #11', slug: 'digest-11', type: 'newsletter', published_at: '2026-11-15T08:00:00Z' }],
    help: [
      { kind: 'faq', title: 'What counts as an innovation?', id: 'f1', help_kind: 'faq' },
      { kind: 'guideline', title: 'Pitch guide', id: 'g1', url: 'https://example.org/guide.pdf', help_kind: 'guideline' },
    ],
  },
}

describe('toRows (1.3 search)', () => {
  const rows = toRows(result, t, 'en', has)
  it('keeps the group order and every hit', () => {
    expect(rows.map((r) => r.group)).toEqual(['challenges', 'challenges', 'stories', 'posts', 'help', 'help'])
  })
  it('builds the meta line from known words only', () => {
    expect(rows[0].meta).toBe('Open · 9 days left')
    expect(rows[1].meta).toBe('')
    expect(rows[2].meta).toBe('Success story · Agriculture')
    expect(rows[3].meta).toBe('Newsletter · 15 Nov')
  })
  it('links each kind to its page', () => {
    expect(rows[0].href).toBe('/challenges/agri%20value')
    expect(rows[3].href).toBe('/news/digest-11')
    expect(rows[4]).toMatchObject({ href: '/faq', external: false })
    expect(rows[5]).toMatchObject({ href: 'https://example.org/guide.pdf', external: true })
  })
})

import type { IdeaItem } from '../../types/innovator'

/** Where an idea opens: drafts go to the form, sent ideas to their tracking page. */
export function ideaLink(item: Pick<IdeaItem, 'id' | 'kind'>): string {
  return item.kind === 'draft' ? `/my-ideas/draft/${item.id}` : `/my-ideas/${item.id}`
}

/** A challenge's public page. TODO(U2): /challenges/{slug} once screen 1.8 has a route; the list until then. */
export function challengeLink(slug: string): string {
  void slug
  return '/challenges'
}

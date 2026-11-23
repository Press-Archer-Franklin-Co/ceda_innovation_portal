import type { IdeaItem } from '../../types/innovator'

type ProgramRef = { slug?: string; is_general_intake: boolean } | null | undefined

/** An unfinished draft: a challenge entry opens at its own address (2.10) straight away, a general idea at 2.3. */
export function draftLink(id: string, program?: ProgramRef): string {
  return program && !program.is_general_intake && program.slug ? `/challenges/${program.slug}/entry/${id}` : `/my-ideas/draft/${id}`
}

/** "Respond to changes": the form with the officer's notes and the flagged questions. */
export function changesLink(id: string): string {
  return `/my-ideas/${id}/changes`
}

/** Where an idea opens: drafts go to the form, sent ideas to their tracking page. */
export function ideaLink(item: Pick<IdeaItem, 'id' | 'kind'> & { program?: ProgramRef }): string {
  return item.kind === 'draft' ? draftLink(item.id, item.program) : `/my-ideas/${item.id}`
}

/** A challenge's public page. TODO(U2): /challenges/{slug} once screen 1.8 has a route; the list until then. */
export function challengeLink(slug: string): string {
  void slug
  return '/challenges'
}

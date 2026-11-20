// Pure helpers for a challenge's marking criteria (3.6 judging step, 3.7).
// Shape from GET /api/programs/{id}/judging/:
//   { criteria: [{ id, library_id, name, description, weight, order, score_meanings: [{en, tn} x5],
//                  comment_required_scores, max_score }], total, pass_mark, reviewers_per_idea, judge_count }

export const SCORES = [1, 2, 3, 4, 5]
const STEP = 5

export function total(criteria) {
  return Math.round(criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0) * 100) / 100
}

/** Whole numbers that add up to exactly 100, the first ones getting the remainder. */
export function splitEvenly(criteria) {
  const n = criteria.length
  if (!n) return criteria
  const base = Math.floor(100 / n)
  const rest = 100 - base * n
  return criteria.map((c, i) => ({ ...c, weight: base + (i < rest ? 1 : 0) }))
}

/** Changes one weight by +/- 5, kept between 0 and 100. */
export function nudge(criteria, index, direction) {
  return criteria.map((c, i) => (i === index ? { ...c, weight: Math.max(0, Math.min(100, Number(c.weight || 0) + direction * STEP)) } : c))
}

export function setWeight(criteria, index, weight) {
  const value = Math.max(0, Math.min(100, Number(weight) || 0))
  return criteria.map((c, i) => (i === index ? { ...c, weight: value } : c))
}

export function move(criteria, from, to) {
  if (to < 0 || to >= criteria.length) return criteria
  const next = [...criteria]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function isTicked(criteria, libraryItem) {
  return criteria.some((c) => c.library_id === libraryItem.id)
}

/** Ticking a library criterion copies it into the challenge with weight 0; unticking removes it. */
export function toggleLibrary(criteria, libraryItem) {
  if (isTicked(criteria, libraryItem)) return criteria.filter((c) => c.library_id !== libraryItem.id)
  return [
    ...criteria,
    {
      library_id: libraryItem.id,
      name: libraryItem.name,
      description: libraryItem.description ?? '',
      weight: 0,
      score_meanings: normaliseMeanings(libraryItem.score_meanings),
      comment_required_scores: libraryItem.comment_required_scores ?? [],
    },
  ]
}

/** Five {en, tn} meanings, padded if fewer arrived. */
export function normaliseMeanings(meanings) {
  return SCORES.map((_, i) => {
    const m = meanings?.[i]
    if (typeof m === 'string') return { en: m, tn: '' }
    return { en: m?.en ?? '', tn: m?.tn ?? '' }
  })
}

/** Scores 1 and 5 need a comment (the Figma rule), or none. */
export function setCommentRule(criterion, on) {
  return { ...criterion, comment_required_scores: on ? [1, 5] : [] }
}

/** Body for PUT /api/programs/{id}/judging/. Order follows the list. */
export function toPayload(state) {
  return {
    criteria: state.criteria.map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      ...(c.library_id ? { library_id: c.library_id } : {}),
      name: c.name,
      description: c.description ?? '',
      weight: Number(c.weight || 0),
      score_meanings: normaliseMeanings(c.score_meanings),
      comment_required_scores: c.comment_required_scores ?? [],
    })),
    pass_mark: state.pass_mark === '' || state.pass_mark == null ? null : Number(state.pass_mark),
    reviewers_per_idea: state.reviewers_per_idea === '' || state.reviewers_per_idea == null ? null : Number(state.reviewers_per_idea),
  }
}

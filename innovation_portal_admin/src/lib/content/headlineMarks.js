// Figma 3.8 pin 3: the banner headline is plain text plus marks [{start, end, type}] over word ranges.
// type is highlight (amber on the public hero), bold or italic. Offsets are JavaScript string indexes, the same
// as the API (UTF-16 code units). The public hero (innovation_portal_public HeroHeadline) draws the same marks.

export const MARK_TYPES = ['highlight', 'bold', 'italic']

/** Sort marks and join overlapping or touching ones of the same type. */
export function mergeMarks(marks = []) {
  const out = []
  for (const type of MARK_TYPES) {
    const spans = marks.filter((m) => m.type === type && m.end > m.start).map((m) => [m.start, m.end]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const merged = []
    for (const [start, end] of spans) {
      const last = merged[merged.length - 1]
      if (last && start <= last[1]) last[1] = Math.max(last[1], end)
      else merged.push([start, end])
    }
    out.push(...merged.map(([start, end]) => ({ start, end, type })))
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end || MARK_TYPES.indexOf(a.type) - MARK_TYPES.indexOf(b.type))
}

/** True when every character from start to end already has this mark. */
export function isMarked(marks, start, end, type) {
  if (end <= start) return false
  const spans = mergeMarks(marks).filter((m) => m.type === type)
  return spans.some((m) => m.start <= start && m.end >= end)
}

/** Remove one type from start..end, splitting marks that cover more. */
function subtract(marks, start, end, type) {
  const out = []
  for (const m of marks) {
    if (m.type !== type || m.end <= start || m.start >= end) {
      out.push(m)
      continue
    }
    if (m.start < start) out.push({ ...m, end: start })
    if (m.end > end) out.push({ ...m, start: end })
  }
  return out
}

/** The Highlight, B and I buttons: add the mark to the selection, or take it off when the selection already has it. */
export function toggleMark(marks, start, end, type) {
  const [a, b] = start <= end ? [start, end] : [end, start]
  if (a === b) return mergeMarks(marks)
  if (isMarked(marks, a, b, type)) return mergeMarks(subtract(mergeMarks(marks), a, b, type))
  return mergeMarks([...marks, { start: a, end: b, type }])
}

/** Pieces of the text with the marks that cover each one, for drawing the field and the preview. */
export function segments(text = '', marks = []) {
  const valid = marks.filter((m) => m.start >= 0 && m.end <= text.length && m.start < m.end)
  const cuts = [...new Set([0, text.length, ...valid.flatMap((m) => [m.start, m.end])])].sort((x, y) => x - y)
  const out = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]]
    if (a === b) continue
    out.push({ text: text.slice(a, b), types: MARK_TYPES.filter((type) => valid.some((m) => m.type === type && m.start <= a && m.end >= b)) })
  }
  return out
}

/** Marks back from pieces, after typing changed the text inside the field. */
export function marksFromSegments(pieces) {
  const marks = []
  let at = 0
  for (const piece of pieces) {
    for (const type of piece.types) marks.push({ start: at, end: at + piece.text.length, type })
    at += piece.text.length
  }
  return mergeMarks(marks)
}

/** {en: [...], tn: [...]} with the given language replaced. */
export function withLangMarks(all, lang, marks) {
  return { en: all?.en ?? [], tn: all?.tn ?? [], [lang]: mergeMarks(marks) }
}

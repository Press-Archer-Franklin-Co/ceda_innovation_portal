import { Fragment } from 'react'
import clsx from 'clsx'

// Figma 3.8 pin 3: the banner headline is plain text plus marks over word ranges (highlight, bold, italic).
// Offsets count UTF-16 code units, the same as JavaScript string indexes. The staff editor draws the same marks.

export type HeadlineMarkType = 'highlight' | 'bold' | 'italic'
export interface HeadlineMark {
  start: number
  end: number
  type: HeadlineMarkType
}

const CLASS: Record<HeadlineMarkType, string> = { highlight: 'text-amber', bold: 'font-black', italic: 'italic' }

/** Cut the text where any mark starts or ends; each piece knows which marks cover it. */
export function headlineSegments(text: string, marks: HeadlineMark[] = []): { text: string; types: HeadlineMarkType[] }[] {
  const valid = marks.filter((m) => m && m.start < m.end && m.start >= 0 && m.end <= text.length)
  const cuts = new Set<number>([0, text.length])
  valid.forEach((m) => { cuts.add(m.start); cuts.add(m.end) })
  const points = [...cuts].sort((a, b) => a - b)
  const out: { text: string; types: HeadlineMarkType[] }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]]
    if (a === b) continue
    const types = (['highlight', 'bold', 'italic'] as const).filter((type) => valid.some((m) => m.type === type && m.start <= a && m.end >= b))
    out.push({ text: text.slice(a, b), types })
  }
  return out
}

/** The old comma-separated highlighted words as marks (every match, any case). Used for built-in headlines. */
export function marksFromWords(text: string, words: string): HeadlineMark[] {
  const list = words.split(',').map((w) => w.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!list.length || !text) return []
  const pattern = new RegExp(list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
  return [...text.matchAll(pattern)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, type: 'highlight' as const }))
}

export default function HeroHeadline({ text, marks }: { text: string; marks?: HeadlineMark[] | null }) {
  return <>{headlineSegments(text, marks ?? []).map((part, i) =>
    part.types.length ? (
      <span key={i} className={clsx(part.types.map((type) => CLASS[type]))}>{part.text}</span>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    ),
  )}</>
}

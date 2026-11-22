import type { SubmissionAnswer } from '../../types/innovator'

// 2.4 Track my idea: the read-only answers. A file answer shows its file names (links when the file has an address).

export const isFile = (answer: SubmissionAnswer) => answer.field_type === 'file' || answer.field_type === 'media'

/** Files in an answer, whichever way they were saved: {id, filename, url} from the form, or
 * {original_filename, url?} from imports and other channels. Never "[object Object]". */
export function answerFiles(value: unknown): { id?: string; name: string; url?: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const f = item as Record<string, unknown>
    const name = [f.filename, f.original_filename, f.name].find((v) => typeof v === 'string' && v.trim()) as string | undefined
    if (!name) return []
    const url = [f.url, f.file_url].find((v) => typeof v === 'string' && v) as string | undefined
    return [{ id: typeof f.id === 'string' ? f.id : undefined, name, url }]
  })
}

export function answerText(answer: SubmissionAnswer, yes: string, none: string): string {
  const value = answer.value
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return none
  if (isFile(answer)) {
    const files = answerFiles(value)
    return files.length ? files.map((f) => f.name).join(', ') : none
  }
  if (Array.isArray(value)) return value.map((v) => (v && typeof v === 'object' ? '' : String(v))).filter(Boolean).join(', ') || none
  if (typeof value === 'boolean') return value ? yes : none
  if (typeof value === 'object') return none
  return String(value)
}

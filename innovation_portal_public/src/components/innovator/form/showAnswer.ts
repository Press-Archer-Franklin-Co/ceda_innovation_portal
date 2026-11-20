import type { FormField } from '../../../types/innovator'
import { isEmptyAnswer } from './logic'
import { uploadedFiles } from './UploadField'

/** One answer as text, using the option labels the person saw. */
export function showAnswer(field: FormField, value: unknown, yes = 'Yes'): string {
  if (isEmptyAnswer(value)) return ''
  if (field.type === 'file' || field.type === 'media') return uploadedFiles(value).map((f) => f.filename).join(', ')
  const label = (v: unknown) => field.options.find((o) => o.value === String(v))?.label ?? String(v)
  if (Array.isArray(value)) return value.map(label).join(', ')
  if (typeof value === 'boolean') return value ? yes : ''
  return field.options.length > 0 ? label(value) : String(value)
}

import type { Envelope } from '../types/innovator'

/**
 * Returns the payload whether the API wrapped it as { success, data } or not.
 * Some views use api_success() and some return the serializer data directly.
 */
export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    const envelope = body as Envelope<T>
    if (!envelope.success) {
      throw new Error(envelope.message || 'The request failed.')
    }
    return envelope.data as T
  }
  return body as T
}

/** Builds a query string from defined values only. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

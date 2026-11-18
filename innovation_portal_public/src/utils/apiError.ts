import type { AxiosError } from 'axios'


interface BackendEnvelope {
  success?: boolean
  message?: string
  data?: unknown
  errors?: Record<string, unknown>
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

export function parseApiError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const axiosError = error as AxiosError<BackendEnvelope>

  if (!axiosError?.response?.data) {
    const msg = axiosError?.message ?? ''
    if (axiosError?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout'))
      return 'The request timed out. Please check your connection and try again.'
    if (msg === 'Network Error')
      return 'Cannot connect to the server. Please check your connection.'
    return fallback
  }

  const data = axiosError.response.data

  if (data.success === false) {
    if (data.errors && typeof data.errors === 'object') {
      const detail = (data.errors as Record<string, unknown>).detail
      if (typeof detail === 'string' && detail) return detail

      for (const key of Object.keys(data.errors)) {
        const val = (data.errors as Record<string, unknown>)[key]
        if (Array.isArray(val) && val.length) return `${key}: ${String(val[0])}`
        if (typeof val === 'string' && val)   return val
      }
    }
    if (typeof data.message === 'string' && data.message) return data.message
  }

  if (typeof data.detail === 'string' && data.detail) return data.detail
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length)
    return String(data.non_field_errors[0])

  for (const key of Object.keys(data)) {
    if (['success', 'message', 'data'].includes(key)) continue
    const val = (data as Record<string, unknown>)[key]
    if (Array.isArray(val) && val.length) return `${key}: ${String(val[0])}`
    if (typeof val === 'string' && val)   return val
  }

  return fallback
}

export function parseFieldErrors(error: unknown): Record<string, string> {
  const axiosError = error as AxiosError<BackendEnvelope>
  const data = axiosError?.response?.data
  if (!data || typeof data !== 'object') return {}

  const source: Record<string, unknown> =
    (data.success === false && data.errors && typeof data.errors === 'object')
      ? (data.errors as Record<string, unknown>)
      : (data as Record<string, unknown>)

  const out: Record<string, string> = {}
  for (const key of Object.keys(source)) {
    if (['success', 'message', 'data', 'detail'].includes(key)) continue
    const val = source[key]
    if (Array.isArray(val) && val.length)    out[key] = String(val[0])
    else if (typeof val === 'string' && val) out[key] = val
  }
  return out
}

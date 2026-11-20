import { getLang } from '../../i18n/context'

export const TOKEN_KEY   = 'ceda_access'
export const REFRESH_KEY = 'ceda_refresh'

/** Sent on every API call so a refusal in the API log names the build (S1). */
export const CEDA_CLIENT = import.meta.env.VITE_CEDA_CLIENT ?? 'admin@unknown'

function getToken()   { return localStorage.getItem(TOKEN_KEY) }
function getRefresh() { return localStorage.getItem(REFRESH_KEY) }

function buildUrl(path, params = {}) {
  const url = new URL(path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v))
    }
  })
  return url.toString()
}

async function safeJson(res) {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

function extractMessage(data, status) {
  if (!data) return `HTTP ${status}`
  if (data.errors) {
    const errs = data.errors
    if (errs.detail) return errs.detail
    return Object.entries(errs)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' | ')
  }
  if (data.detail) return data.detail
  if (typeof data === 'object') {
    const entries = Object.entries(data)
    if (entries.length) {
      return entries
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join(' | ')
    }
  }
  return `HTTP ${status}`
}

let _refreshPromise = null

async function attemptRefresh() {
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    const refresh = getRefresh()
    if (!refresh) return false

    try {
      const res = await fetch(buildUrl('/api/auth/refresh/'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-CEDA-Client': CEDA_CLIENT },
        body:    JSON.stringify({ refresh }),
      })

      if (!res.ok) return false

      const data = await safeJson(res)
      if (!data?.access) return false

      localStorage.setItem(TOKEN_KEY, data.access)
      if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)

      if (data.user) {
        try {
          const cached = JSON.parse(localStorage.getItem('ceda_innovation_user') || 'null')
          if (cached) {
            localStorage.setItem('ceda_innovation_user', JSON.stringify({ ...cached, ...data.user }))
          }
        } catch (_) {  }
      }

      return true
    } catch {
      return false
    }
  })()

  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

function clearAuthAndRedirect() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem('ceda_innovation_user')
  window.location.href = window.location.origin + '/'
}


async function request(path, {
  method = 'GET',
  body,
  params,
  headers = {},
  signal,
  skipAuthRedirect = false,
  responseType = 'json',
  _isRetry = false,
} = {}) {
  const token = getToken()
  const url   = buildUrl(path, params)

  const isFormData = body instanceof FormData
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // The API returns content text in this language (en or tn).
        'Accept-Language': getLang(),
        'X-CEDA-Client': CEDA_CLIENT,
        ...headers,
      },
      ...(body   !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
      ...(signal !== undefined ? { signal }                    : {}),
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw Object.assign(
      new Error('Unable to reach the server. Check your connection.'),
      { status: 0, data: null }
    )
  }

  if (res.status === 204) return null

  if (res.status === 401 && !skipAuthRedirect && !_isRetry) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      return request(path, { method, body, params, headers, signal, skipAuthRedirect, responseType, _isRetry: true })
    }
    clearAuthAndRedirect()
    return undefined
  }

  if (res.status === 401 && skipAuthRedirect) {
    const data = await safeJson(res)
    throw Object.assign(new Error(extractMessage(data, 401)), { status: 401, data })
  }

  if (res.status === 401 && _isRetry) {
    clearAuthAndRedirect()
    return undefined
  }

  if (responseType === 'blob') {
    if (!res.ok) {
      const data = await safeJson(res)
      const message = extractMessage(data, res.status)
      throw Object.assign(new Error(message), { status: res.status, data })
    }
    return res.blob()
  }

  const data = await safeJson(res)

  if (!res.ok) {
    const message = extractMessage(data, res.status)
    throw Object.assign(new Error(message), { status: res.status, data })
  }

  if (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.success === true &&
    'data' in data &&
    typeof data.message === 'string'
  ) {
    return data.data
  }

  return data
}

export const client = {
  get:     (path, params, signal) => request(path, { method: 'GET', params, signal }),
  post:    (path, body, opts)     => request(path, { method: 'POST', body, ...opts }),
  patch:   (path, body)           => request(path, { method: 'PATCH', body }),
  put:     (path, body)           => request(path, { method: 'PUT', body }),
  delete:  (path)                 => request(path, { method: 'DELETE' }),
  getBlob: (path, params)         => request(path, { method: 'GET', params, responseType: 'blob' }),
}

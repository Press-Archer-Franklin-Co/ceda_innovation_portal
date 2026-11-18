const KEY_ALIASES = {
  email_address: 'email',
  linkedin_link: 'linkedin_profile',
  website_link: 'website_portfolio',
  age_group: 'birthday',
}

const LABEL_OVERRIDES = {
  email: 'Email Address',
  linkedin_profile: 'LinkedIn Profile',
  website_portfolio: 'Website / Portfolio',
  birthday: 'Birthday',
}

const COUNTRY_LABELS = {
  BW: 'Botswana',
  ZA: 'South Africa',
  ZW: 'Zimbabwe',
  NA: 'Namibia',
  MW: 'Malawi',
  LS: 'Lesotho',
  SZ: 'Eswatini',
  ZM: 'Zambia',
  TZ: 'Tanzania',
  KE: 'Kenya',
  US: 'United States',
  GB: 'United Kingdom',
  IN: 'India',
  CN: 'China',
  other: 'Other',
}

const EMPTY_VALUES = new Set(['', 'null', 'undefined'])

export function formatDisplayLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || !/^[{[]/.test(trimmed)) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function isDocumentLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Boolean(
    value.original_filename ||
    value.filename ||
    value.file_name ||
    value.file_key ||
    value.file_url ||
    value.external_url ||
    value.url ||
    value.file
  )
}

export function getResponseFiles(value) {
  const parsed = parseMaybeJson(value)
  const items = Array.isArray(parsed) ? parsed : [parsed]

  return items
    .filter(isDocumentLike)
    .map((item) => ({
      id: item.id || item.file_key || item.file_url || item.external_url || item.url || item.file,
      documentId: item.document_id || null,
      name:
        item.original_filename ||
        item.filename ||
        item.file_name ||
        item.name ||
        item.file_key ||
        'Uploaded file',
      url: item.file_url || item.external_url || item.url || item.file || '',
    }))
}

function looksLikeCompactChoice(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 60) return false
  if (trimmed.includes('@') || /^https?:\/\//i.test(trimmed)) return false
  if (/[.!?;:/\\]/.test(trimmed)) return false
  if (/[_-]/.test(trimmed)) return /^[a-z0-9_\-\s]+$/i.test(trimmed)
  return /^[a-z]+$/i.test(trimmed) && trimmed === trimmed.toLowerCase()
}

function formatScalarValue(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return String(value)

  const text = String(value).trim()
  if (EMPTY_VALUES.has(text.toLowerCase())) return '—'
  if (text.toLowerCase() === 'true') return 'Yes'
  if (text.toLowerCase() === 'false') return 'No'
  if (looksLikeCompactChoice(text)) return formatDisplayLabel(text)
  return text
}

export function formatResponseValue(value) {
  const parsed = parseMaybeJson(value)

  if (Array.isArray(parsed)) {
    const files = getResponseFiles(parsed)
    if (files.length === parsed.length && files.length > 0) {
      return files.map((file) => file.name).join(', ')
    }
    return parsed
      .map((item) => formatResponseValue(item))
      .filter((item) => item && item !== '—')
      .join(', ') || '—'
  }

  if (isDocumentLike(parsed)) {
    return getResponseFiles(parsed)[0]?.name || 'Uploaded file'
  }

  if (parsed && typeof parsed === 'object') {
    const entries = Object.entries(parsed)
      .filter(([, itemValue]) => itemValue !== null && itemValue !== undefined && itemValue !== '')
      .map(([key, itemValue]) => `${formatDisplayLabel(key)}: ${formatResponseValue(itemValue)}`)
    return entries.join('\n') || '—'
  }

  return formatScalarValue(parsed)
}

export function hasDisplayValue(value) {
  const parsed = parseMaybeJson(value)
  if (Array.isArray(parsed)) return parsed.some(hasDisplayValue)
  if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0
  return !EMPTY_VALUES.has(String(parsed ?? '').trim().toLowerCase())
}

export function deriveAgeFromBirthday(raw) {
  if (!raw) return null
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - date.getFullYear()
  const beforeBirthday =
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  if (beforeBirthday) years -= 1
  return years
}

function normalizeKey(key = '') {
  const lower = String(key).toLowerCase()
  return KEY_ALIASES[lower] ?? lower
}

function formatCountryValue(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return COUNTRY_LABELS[raw] ?? raw
}

function withId(resp, fallbackId) {
  return {
    id: resp?.id ?? fallbackId,
    form_field: resp?.form_field ?? resp?.field_key ?? fallbackId,
    field_label: resp?.field_label ?? resp?.field_key ?? fallbackId,
    field_key: resp?.field_key ?? fallbackId,
    field_type: resp?.field_type ?? 'text',
    value: resp?.value ?? '',
  }
}

export function normalizeResponses(responses = [], submissionTitle) {
  const items = Array.isArray(responses) ? responses : []
  const byKey = new Map()

  items.forEach((resp) => {
    const key = normalizeKey(resp?.field_key)
    if (key) {
      byKey.set(key, { ...resp, field_key: key, field_label: LABEL_OVERRIDES[key] ?? resp?.field_label })
    }
  })

  const output = []
  const used = new Set()

  const first = byKey.get('first_name')
  const last = byKey.get('last_name')
  if (first || last) {
    const name = [first?.value, last?.value].filter(Boolean).join(' ')
    output.push(withId({
      ...(first || last || {}),
      field_label: 'Full Name',
      field_key: 'full_name',
      value: name || first?.value || last?.value || '',
    }, 'full_name'))
    used.add('first_name')
    used.add('last_name')
  }

  const countryCode = byKey.get('country_code')
  const country = byKey.get('country')
  if (country) {
    output.push(withId({
      ...(country || {}),
      field_label: 'Country',
      field_key: 'country_display',
      value: formatCountryValue(country.value),
    }, 'country_display'))
    used.add('country')
  }

  const contactNumber = byKey.get('contact_number') || byKey.get('phone') || byKey.get('phone_number')
  if (contactNumber || countryCode) {
    const combined = [countryCode?.value, contactNumber?.value].filter(Boolean).join(' ')
    output.push(withId({
      ...(contactNumber || countryCode || {}),
      field_label: 'Contact Number',
      field_key: 'contact_number_display',
      value: combined || contactNumber?.value || countryCode?.value || '',
    }, 'contact_number_display'))
    used.add('country_code')
    used.add('contact_number')
    used.add('phone')
    used.add('phone_number')
  }

  const solution = byKey.get('solution_name') || byKey.get('idea_name') || byKey.get('submission_name')
  if (solution) {
    output.push(withId({
      ...solution,
      field_label: 'Solution Name',
      value: solution.value || submissionTitle || solution.value,
    }, 'solution_name'))
    used.add('solution_name')
    used.add('idea_name')
    used.add('submission_name')
  }

  const birthday = byKey.get('birthday')
  if (birthday) {
    const age = deriveAgeFromBirthday(birthday.value)
    if (age !== null) {
      output.push(withId({
        field_label: 'Age',
        field_key: 'age',
        field_type: 'number',
        value: age,
      }, 'age'))
    }
  }

  items.forEach((resp) => {
    const key = normalizeKey(resp?.field_key)
    if (used.has(key)) return
    if (key === 'age_group') return
    if (key === 'patents_granted_applied') {
      const age = deriveAgeFromBirthday(birthday?.value)
      if (age !== null && age >= 18) return
    }
    output.push(withId({
      ...resp,
      field_key: key,
      field_label: LABEL_OVERRIDES[key] ?? resp?.field_label,
    }, resp?.id || key || `field_${output.length}`))
  })

  return output
}

const SECTION_KEYS = {
  applicant: ['full_name', 'gender', 'person_type', 'person_type_other', 'birthday', 'age', 'country_display'],
  contact: ['email', 'contact_number_display', 'contact_number', 'phone', 'phone_number', 'linkedin_profile', 'website_portfolio'],
  identity: ['id_passport_number', 'national_id'],
  solution: ['solution_name', 'idea_name', 'submission_name', 'title'],
}

export function groupResponses(responses = []) {
  const groups = {
    applicant: [],
    contact: [],
    identity: [],
    solution: [],
    supporting: [],
  }

  responses.forEach((resp) => {
    const key = String(resp?.field_key || '').toLowerCase()
    const target = Object.entries(SECTION_KEYS).find(([, keys]) => keys.includes(key))?.[0]
    if (target) {
      groups[target].push(resp)
      return
    }
    groups.supporting.push(resp)
  })

  return groups
}

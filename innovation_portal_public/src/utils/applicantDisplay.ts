import type { SubmissionResponse } from '../services/submissions.service'

type ResponseLike = SubmissionResponse

const KEY_ALIASES: Record<string, string> = {
  email_address: 'email',
  linkedin_link: 'linkedin_profile',
  website_link: 'website_portfolio',
  age_group: 'birthday',
}

const LABEL_OVERRIDES: Record<string, string> = {
  email: 'Email Address',
  linkedin_profile: 'LinkedIn Profile',
  website_portfolio: 'Website / Portfolio',
  birthday: 'Birthday',
}

const COUNTRY_LABELS: Record<string, string> = {
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

export function deriveAgeFromBirthday(raw?: unknown): number | null {
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

function withId(resp: Partial<ResponseLike>, fallbackId: string): ResponseLike {
  return {
    id: resp.id ?? fallbackId,
    form_field: resp.form_field ?? resp.field_key ?? fallbackId,
    field_label: resp.field_label ?? resp.field_key ?? fallbackId,
    field_key: resp.field_key ?? fallbackId,
    field_type: resp.field_type ?? 'text',
    value: resp.value ?? '',
  }
}

function normalizeKey(key: string) {
  const lower = key.toLowerCase()
  return KEY_ALIASES[lower] ?? lower
}

function formatCountryValue(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return COUNTRY_LABELS[raw] ?? raw
}

export function normalizeResponses(responses: ResponseLike[], submissionTitle?: string | null) {
  const items = Array.isArray(responses) ? responses : []
  const byKey = new Map<string, ResponseLike>()

  items.forEach((resp) => {
    const key = normalizeKey(String(resp.field_key || ''))
    if (key) {
      byKey.set(key, { ...resp, field_key: key, field_label: LABEL_OVERRIDES[key] ?? resp.field_label })
    }
  })

  const output: ResponseLike[] = []
  const used = new Set<string>()

  const first = byKey.get('first_name')
  const last = byKey.get('last_name')
  if (first || last) {
    const name = [first?.value, last?.value].filter(Boolean).join(' ')
    output.push(withId({
      ...(first ?? last ?? {}),
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
      ...country,
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
      ...(contactNumber ?? countryCode ?? {}),
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
    const key = normalizeKey(String(resp.field_key || ''))
    if (used.has(key)) return
    if (key === 'age_group') return
    if (key === 'patents_granted_applied') {
      const age = deriveAgeFromBirthday(birthday?.value)
      if (age !== null && age >= 18) return
    }
    const normalized = withId({ ...resp, field_key: key, field_label: LABEL_OVERRIDES[key] ?? resp.field_label }, resp.id || key || `field_${output.length}`)
    output.push(normalized)
  })

  return output
}

const SECTION_KEYS: Record<string, string[]> = {
  applicant: ['full_name', 'gender', 'person_type', 'person_type_other', 'birthday', 'age', 'country_display'],
  contact: ['email', 'contact_number_display', 'contact_number', 'phone', 'phone_number', 'linkedin_profile', 'website_portfolio'],
  identity: ['id_passport_number', 'national_id'],
  solution: ['solution_name', 'idea_name', 'submission_name', 'title'],
}

export function groupResponses(responses: ResponseLike[]) {
  const groups: Record<string, ResponseLike[]> = {
    applicant: [],
    contact: [],
    identity: [],
    solution: [],
    supporting: [],
  }

  responses.forEach((resp) => {
    const key = String(resp.field_key || '').toLowerCase()
    const target = Object.entries(SECTION_KEYS).find(([, keys]) => keys.includes(key))?.[0]
    if (target) {
      groups[target].push(resp)
      return
    }
    groups.supporting.push(resp)
  })

  return groups
}

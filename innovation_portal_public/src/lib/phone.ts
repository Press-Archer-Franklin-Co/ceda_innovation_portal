/** A Botswana mobile number as E.164 (+267...), the same form the API keeps. Empty stays empty. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (!digits) return ''
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('267')) return `+${digits}`
  return `+267${digits}`
}

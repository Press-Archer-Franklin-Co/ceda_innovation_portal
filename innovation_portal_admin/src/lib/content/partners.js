// 3.13 Partners & sponsors: pure helpers for /api/content/partners/ (B6 G).

export const TIERS = ['lead_sponsor', 'partner', 'supporter']
export const TIER_TONE = { lead_sponsor: 'amber', partner: 'green', supporter: 'neutral' }
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const LOGO_MAX = 10 * 1024 * 1024

const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const toIso = (day) => (day ? new Date(`${day}T00:00:00`).toISOString() : null)

export function fromPartner(p) {
  return {
    name: p?.name ?? '',
    short_label: p?.short_label ?? '',
    url: p?.url ?? '',
    tier: p?.tier ?? 'partner',
    show_on_home: p?.show_on_home ?? true,
    show_from: toInput(p?.show_from),
    show_until: toInput(p?.show_until),
    program_ids: (p?.program_ids ?? []).map(String),
    logo_id: p?.logo_id ?? p?.logo?.id ?? null,
    is_active: p?.is_active ?? true,
  }
}

export function toPartnerPayload(f) {
  return {
    name: f.name.trim(),
    short_label: f.short_label.trim(),
    url: f.url.trim(),
    tier: f.tier,
    show_on_home: f.show_on_home,
    show_from: toIso(f.show_from),
    show_until: toIso(f.show_until),
    program_ids: f.program_ids,
    logo_id: f.logo_id || null,
    is_active: f.is_active,
  }
}

export function partnerProblems(f) {
  const out = {}
  if (!f.name.trim()) out.name = 'partners.needName'
  if (f.url.trim() && !/^https?:\/\/\S+\.\S+/.test(f.url.trim())) out.url = 'partners.badUrl'
  if (f.show_from && f.show_until && f.show_until <= f.show_from) out.show_until = 'partners.untilAfter'
  return out
}

export function logoProblem(file) {
  if (!file) return null
  if (!LOGO_TYPES.includes(file.type)) return 'partners.logoType'
  if (file.size > LOGO_MAX) return 'partners.logoSize'
  return null
}

/** Shows on the home page today: on, on the home strip and inside its dates. */
export function onHomeNow(p, now = Date.now()) {
  if (!p.is_active || !p.show_on_home) return false
  if (p.show_from && new Date(p.show_from).getTime() > now) return false
  if (p.show_until && new Date(p.show_until).getTime() <= now) return false
  return true
}

/** Same order as the public strip: by tier, then order, then name. */
export function sortPartners(list) {
  return [...list].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
}

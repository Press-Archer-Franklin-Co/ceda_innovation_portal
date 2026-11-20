// 3.12 Leadership quotes: pure helpers for /api/content/leadership/ (B6 part 2 F).

export const QUOTE_MAX = 180

const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Editor form from a card from the API (or a new one). */
export function fromCard(card) {
  return {
    full_name: card?.full_name ?? '',
    job_title: card?.job_title ?? '',
    committee_role: card?.committee_role ?? '',
    quote: { en: card?.quote ?? '', tn: card?.translations?.tn?.quote ?? '' },
    is_active: card?.is_active ?? true,
    is_official: card?.is_official ?? false,
    end_at: toInput(card?.end_at),
  }
}

/** What POST/PATCH takes (JSON). Other translations the card has are kept. */
export function toCardPayload(f, card) {
  const translations = { ...(card?.translations ?? {}) }
  const tn = { ...(translations.tn ?? {}) }
  if (f.quote.tn.trim()) tn.quote = f.quote.tn
  else delete tn.quote
  if (Object.keys(tn).length) translations.tn = tn
  else delete translations.tn
  return {
    full_name: f.full_name.trim(),
    job_title: f.job_title.trim(),
    committee_role: f.committee_role.trim(),
    quote: f.quote.en,
    translations,
    is_active: f.is_active,
    is_official: f.is_official,
    end_at: f.end_at ? new Date(f.end_at).toISOString() : null,
  }
}

/** Problems as { field: stringKey }; the API checks the same. */
export function quoteProblems(f) {
  const out = {}
  if (!f.full_name.trim()) out.full_name = 'quotes.needName'
  if (!f.job_title.trim()) out.job_title = 'quotes.needTitle'
  if (!f.quote.en.trim()) out.quote = 'quotes.needQuote'
  else if (f.quote.en.length > QUOTE_MAX || f.quote.tn.length > QUOTE_MAX) out.quote = 'quotes.tooLong'
  return out
}

/** Move `fromId` to where `toId` is; returns the new order. */
export function moveCard(cards, fromId, toId) {
  const from = cards.findIndex((c) => c.id === fromId)
  const to = cards.findIndex((c) => c.id === toId)
  if (from < 0 || to < 0 || from === to) return cards
  const next = cards.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** POST /leadership/reorder/ body: [{id, sort_order}]. */
export const reorderPayload = (cards) => cards.map((c, i) => ({ id: c.id, sort_order: i }))

/** Shows on the site now: on, not ended, and approved when it is an official's quote. */
export function showsNow(card, now = Date.now()) {
  if (!card.is_active) return false
  if (card.start_at && new Date(card.start_at).getTime() > now) return false
  if (card.end_at && new Date(card.end_at).getTime() <= now) return false
  return !card.needs_approval
}

/**
 * The home page's leadership band for the preview (/preview/home), in the same shape as the
 * public home payload, so it renders with the site's own QuotesSection.
 */
export function bandSection(cards, rotationSeconds, lang, now = Date.now()) {
  return {
    id: 'quotes-preview',
    type: 'leadership_quotes',
    settings: { title: '', max_items: 10 },
    data: {
      rotation_seconds: rotationSeconds,
      items: cards.filter((c) => showsNow(c, now)).map((c) => ({
        id: c.id,
        name: c.full_name,
        job_title: c.job_title,
        committee_role: c.committee_role,
        quote: (lang === 'tn' && c.translations?.tn?.quote?.trim()) ? c.translations.tn.quote : c.quote,
        photo_url: c.photo_url ?? null,
      })),
    },
  }
}

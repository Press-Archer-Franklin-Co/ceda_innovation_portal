// 3.14 FAQs: pure helpers for /api/support/admin/faqs/, faq-groups/ and faqs/unanswered/ (B6 H).

export const PLACEMENTS = ['help', 'home', 'program', 'whatsapp_bot']
export const NO_GROUP = 'none'

const byOrder = (a, b) => (a.ordering ?? 0) - (b.ordering ?? 0) || String(a.question ?? a.name).localeCompare(String(b.question ?? b.name))

/** Questions per group, in order; questions without a group come last under NO_GROUP. */
export function groupFaqs(faqs = [], groups = []) {
  const ids = new Set(groups.map((g) => String(g.id)))
  const out = Object.fromEntries([...groups.map((g) => [String(g.id), []]), [NO_GROUP, []]])
  for (const f of faqs) out[f.group && ids.has(String(f.group)) ? String(f.group) : NO_GROUP].push(f)
  for (const k of Object.keys(out)) out[k].sort(byOrder)
  return out
}

export const sortGroups = (groups = []) => [...groups].sort(byOrder)

/** POST /faqs/reorder/ body: one running number across groups in their order, so each group stays together. */
export function faqOrderPayload(groupOrder, byGroup) {
  let n = 0
  return [...groupOrder, NO_GROUP].flatMap((gid) => (byGroup[gid] ?? []).map((f) => ({ id: f.id, ordering: n++ })))
}

export const groupOrderPayload = (groups) => groups.map((g, i) => ({ id: g.id, ordering: i }))

export function moveItem(list, fromId, toId) {
  const from = list.findIndex((x) => x.id === fromId)
  const to = list.findIndex((x) => x.id === toId)
  if (from < 0 || to < 0 || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function fromFaq(f, groupId = null) {
  return {
    question: { en: f?.question ?? '', tn: f?.translations?.tn?.question ?? '' },
    answer: { en: f?.answer ?? '', tn: f?.translations?.tn?.answer ?? '' },
    placements: f?.placements ?? ['help'],
    program: f?.program ? String(f.program) : null,
    is_public: f?.is_public ?? true,
    group: f ? (f.group ? String(f.group) : null) : groupId === NO_GROUP ? null : groupId,
  }
}

export function toFaqPayload(form) {
  const tn = {}
  if (form.question.tn.trim()) tn.question = form.question.tn
  if (form.answer.tn.trim()) tn.answer = form.answer.tn
  return {
    question: form.question.en.trim(),
    answer: form.answer.en,
    placements: form.placements,
    program: form.placements.includes('program') ? form.program : null,
    is_public: form.is_public,
    group: form.group,
    translations: Object.keys(tn).length ? { tn } : {},
  }
}

export function faqProblems(form) {
  const out = {}
  if (!form.question.en.trim()) out.question = 'faqs.needQuestion'
  if (!form.answer.en.trim()) out.answer = 'faqs.needAnswer'
  if (form.placements.includes('program') && !form.program) out.program = 'faqs.needProgram'
  return out
}

/** True when the English is there but the Setswana question or answer is not. */
export const missingSetswana = (f) => !!f && !!(f.question && f.answer) && !(f.translations?.tn?.question?.trim() && f.translations?.tn?.answer?.trim())

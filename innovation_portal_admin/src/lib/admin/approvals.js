// S2 Website approvals: pure helpers for GET/PUT /api/admin/approval-flows/content/ (R-31).

export const LANGUAGES = ['all', 'en', 'tn']
let n = 0
const key = () => `step${Date.now().toString(36)}${(n++).toString(36)}`

/** Steps carry a local `_key`; `approver` is { capability } or { role, role_name }. */
export function fromFlow(flow) {
  return {
    approvers_can_approve_own_work: flow?.approvers_can_approve_own_work ?? true,
    steps: [...(flow?.steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => ({ ...s, _key: s.id ? String(s.id) : key() })),
  }
}

export function toFlowPayload(f) {
  return {
    approvers_can_approve_own_work: f.approvers_can_approve_own_work,
    steps: f.steps.map(({ _key, ...s }, i) => ({
      ...(s.id ? { id: s.id } : {}),
      order: i,
      name: (s.name ?? '').trim(),
      approver: s.approver?.capability ? { capability: s.approver.capability } : { role: s.approver?.role },
      approvals_needed: Number(s.approvals_needed) || 1,
      language: s.language ?? 'all',
    })),
  }
}

export function newStep(language = 'all') {
  return { _key: key(), name: '', approver: { capability: 'content.approve' }, approvals_needed: 1, language }
}

export function moveStep(steps, index, delta) {
  const to = index + delta
  if (to < 0 || to >= steps.length) return steps
  const next = steps.slice()
  const [s] = next.splice(index, 1)
  next.splice(to, 0, s)
  return next
}

/** Approver as one select value: "cap:<key>" or "role:<code>". */
export const approverValue = (a) => (a?.capability ? `cap:${a.capability}` : a?.role ? `role:${a.role}` : null)
export const approverFrom = (value) => (value?.startsWith('cap:') ? { capability: value.slice(4) } : value?.startsWith('role:') ? { role: value.slice(5) } : null)

export function flowProblems(f) {
  const out = []
  if (!f.steps.length) out.push({ key: 'appr.needStep' })
  if (f.steps.length && !f.steps.some((s) => s.language === 'all' || s.language === 'en')) out.push({ key: 'appr.needEnglish' })
  f.steps.forEach((s, i) => {
    if (!approverValue(s.approver)) out.push({ key: 'appr.needApprover', index: i })
    if (!(Number(s.approvals_needed) >= 1)) out.push({ key: 'appr.needCount', index: i })
  })
  return out
}

/**
 * The plain sentence under the settings (S2 section 2), for example:
 * "English goes live after 1 approval from the Innovation Manager role. Setswana text also needs
 * 1 approval from the Setswana reviewer role."
 */
export function flowSentence(f, approverName, t) {
  const part = (s) => t(Number(s.approvals_needed) === 1 ? 'appr.oneFrom' : 'appr.manyFrom', { count: Number(s.approvals_needed) || 1, who: approverName(s.approver) })
  const english = f.steps.filter((s) => s.language !== 'tn')
  const setswana = f.steps.filter((s) => s.language === 'tn')
  const out = []
  if (english.length) out.push(t('appr.sentenceEnglish', { steps: english.map(part).join(t('appr.then')) }))
  if (setswana.length) out.push(t('appr.sentenceSetswana', { steps: setswana.map(part).join(t('appr.then')) }))
  out.push(t(f.approvers_can_approve_own_work ? 'appr.sentenceOwnYes' : 'appr.sentenceOwnNo'))
  return out.join(' ')
}

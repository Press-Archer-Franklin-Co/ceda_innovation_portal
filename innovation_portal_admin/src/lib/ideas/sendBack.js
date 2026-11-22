// 3.16 Ask for changes: the dialog's rows as the API body. A question that takes a file is a document item.

export function sendBackBody({ reason, fixBy, items, questions, newDocument }) {
  return {
    reason: reason.trim(),
    ...(fixBy ? { fix_by: fixBy } : {}),
    items: items.map((item) => {
      const question = questions.find((q) => q.field_key === item.choice)
      if (item.choice === newDocument || !question) return { kind: 'document', field_key: '', label: item.label.trim() }
      return { kind: question.kind, field_key: question.field_key, label: item.label.trim() }
    }),
  }
}

/** The header's button opens the dialog only when this step may send the idea back and it is not already waiting. */
export function canSendBack(summary) {
  if (!summary || summary.status === 'returned') return false
  return (summary.allowed_actions ?? []).some((action) => action === 'request_info' || action === 'return')
}

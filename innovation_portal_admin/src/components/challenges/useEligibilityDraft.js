import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '../../lib/api/client'

// 3.6b: the editable copy of a challenge's rules and documents (R-48), saved by the edit page's Save button.

export const newKey = () => Math.random().toString(36).slice(2)
const eligibilityKey = (id) => ['programs', id, 'eligibility']

/** Loads the rules and documents and keeps an editable copy. available is false while the API has no R-48 (404/405). */
export default function useEligibilityDraft(programId) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: eligibilityKey(programId),
    queryFn: async () => {
      try {
        return await client.get(`/api/programs/${programId}/eligibility/`)
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true }
        throw err
      }
    },
    enabled: !!programId,
  })
  const [draft, setDraft] = useState(null)
  useEffect(() => {
    if (!query.data || query.data.unavailable) return
    setDraft({
      rules: (query.data.rules ?? []).map((r) => ({ ...r, _key: r.id ?? newKey() })),
      documents: (query.data.documents ?? []).map((d) => ({ ...d, _key: d.id ?? newKey() })),
    })
  }, [query.data])

  const available = !!query.data && !query.data.unavailable
  const changed = available && draft && JSON.stringify(strip(draft)) !== JSON.stringify(strip({ rules: query.data.rules ?? [], documents: query.data.documents ?? [] }))

  async function save() {
    if (!changed) return
    const body = strip(draft)
    const res = await client.put(`/api/programs/${programId}/eligibility/`, body)
    qc.setQueryData(eligibilityKey(programId), res)
  }
  return { query, draft, setDraft, available, changed, save }
}

/** The PUT body: rules and documents in order, without the editor's keys or the read-only sentences. */
function strip(draft) {
  return {
    rules: draft.rules.map((r) => (r.field
      ? { id: r.id ?? null, field: r.field, operator: r.operator, value: r.value }
      : { id: r.id ?? null, question: r.question ?? '', help: r.help ?? '', required_answer: r.required_answer ?? true, reason: r.reason ?? '', active: r.active ?? true, translations: r.translations ?? {} })),
    documents: draft.documents.map((d) => ({ id: d.id ?? null, name: d.name ?? '', hint: d.hint ?? '', required: !!d.required, accept: d.accept ?? [], max_mb: d.max_mb ?? 5, translations: d.translations ?? {} })),
  }
}


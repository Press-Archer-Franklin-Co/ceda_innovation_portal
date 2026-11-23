import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '../../lib/api/client'

// 3.21: the R-48 step settings the older step fields do not cover (team, conflicts first, comments, reminder,
// and since 23 Nov whether the innovator is told when an idea reaches this step).

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function toDraft(s) {
  return {
    team_id: s?.who_has_it?.mode === 'team' ? s.who_has_it.team_id ?? '' : '',
    conflict_first: !!s?.duties?.conflict_first,
    comment_every_criterion: !!s?.duties?.comment_every_criterion,
    reminder_after_days: s?.reminder_after_days == null ? '' : String(s.reminder_after_days),
    notify_innovator: s?.notify_innovator !== false,
  }
}

export default function useStepExtras(stepId) {
  const qc = useQueryClient()
  const key = ['workflow-steps', stepId, 'settings']
  const query = useQuery({
    queryKey: key,
    enabled: !!stepId,
    queryFn: async () => {
      try {
        return await client.get(`/api/workflow-steps/${stepId}/settings/`)
      } catch (err) {
        if (err?.status === 404 || err?.status === 405) return { unavailable: true }
        throw err
      }
    },
  })
  const teams = useQuery({ queryKey: ['staff-teams'], queryFn: () => client.get('/api/staff-teams/'), enabled: !!query.data && !query.data.unavailable, retry: false })
  const [draft, setDraft] = useState(() => toDraft(null))
  useEffect(() => { if (query.data && !query.data.unavailable) setDraft(toDraft(query.data)) }, [query.data])

  const available = !!query.data && !query.data.unavailable
  const dirty = available && JSON.stringify(draft) !== JSON.stringify(toDraft(query.data))

  async function save(role) {
    if (!dirty) return
    const body = {
      who_has_it: draft.team_id ? { mode: 'team', team_id: draft.team_id, people: [] } : { mode: 'role', role: role || '', team_id: null, people: [] },
      duties: { conflict_first: draft.conflict_first, comment_every_criterion: draft.comment_every_criterion },
      reminder_after_days: draft.reminder_after_days === '' ? null : Number(draft.reminder_after_days),
      notify_innovator: draft.notify_innovator,
    }
    const res = await client.patch(`/api/workflow-steps/${stepId}/settings/`, body)
    qc.setQueryData(key, res)
  }
  return { available, draft, set: (patch) => setDraft((d) => ({ ...d, ...patch })), dirty, save, teams: asList(teams.data).filter((x) => x.is_active !== false) }
}


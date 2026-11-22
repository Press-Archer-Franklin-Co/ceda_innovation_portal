import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { Checkbox } from '../ui/Choice'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'

// 3.21 step panel: the R-48 settings the older step fields do not cover, on GET/PATCH /api/workflow-steps/{id}/settings/.
// A staff team instead of a role, "check for conflicts first", "comment on every criterion" and a reminder.
// Role, buttons, criteria, pass mark, judges and the time limit stay on the step's own fields, so nothing is set twice.
// Before the API has R-48 (404) this group is left out.

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? [])

function toDraft(s) {
  return {
    team_id: s?.who_has_it?.mode === 'team' ? s.who_has_it.team_id ?? '' : '',
    conflict_first: !!s?.duties?.conflict_first,
    comment_every_criterion: !!s?.duties?.comment_every_criterion,
    reminder_after_days: s?.reminder_after_days == null ? '' : String(s.reminder_after_days),
  }
}

export function useStepExtras(stepId) {
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
    }
    const res = await client.patch(`/api/workflow-steps/${stepId}/settings/`, body)
    qc.setQueryData(key, res)
  }
  return { available, draft, set: (patch) => setDraft((d) => ({ ...d, ...patch })), dirty, save, teams: asList(teams.data).filter((x) => x.is_active !== false) }
}

export default function StepExtras({ extras, scoring }) {
  const t = useT()
  if (!extras.available) return null
  const { draft, set, teams } = extras
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[14px] font-bold text-text">{t('wfx.title')}</legend>
      {teams.length > 0 && (
        <Select
          label={t('wfx.team')}
          hint={t('wfx.teamHint')}
          options={[{ value: '', label: t('wfx.noTeam') }, ...teams.map((x) => ({ value: x.id, label: x.label ?? x.name }))]}
          value={draft.team_id}
          onChange={(v) => set({ team_id: v })}
        />
      )}
      <Checkbox label={t('wfx.conflictFirst')} description={t('wfx.conflictFirstHint')} checked={draft.conflict_first} onChange={(e) => set({ conflict_first: e.target.checked })} />
      {scoring && <Checkbox label={t('wfx.commentEvery')} checked={draft.comment_every_criterion} onChange={(e) => set({ comment_every_criterion: e.target.checked })} />}
      <Input label={t('wfx.reminder')} hint={t('wfx.reminderHint')} type="number" min="0" max="365" optional value={draft.reminder_after_days} onChange={(e) => set({ reminder_after_days: e.target.value })} />
    </fieldset>
  )
}

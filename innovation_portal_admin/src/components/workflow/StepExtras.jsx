import Input from '../ui/Input'
import Select from '../ui/Select'
import { Checkbox } from '../ui/Choice'
import { useT } from '../../i18n/context'

// 3.21 step panel: the R-48 settings the older step fields do not cover, on GET/PATCH /api/workflow-steps/{id}/settings/.
// A staff team instead of a role, "check for conflicts first", "comment on every criterion" and a reminder.
// Role, buttons, criteria, pass mark, judges and the time limit stay on the step's own fields, so nothing is set twice.
// Before the API has R-48 (404) this group is left out.

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

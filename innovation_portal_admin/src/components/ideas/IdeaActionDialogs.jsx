import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import { RadioGroup } from '../ui/Choice'
import { useToast } from '../ui/toast'
import { useT } from '../../i18n/context'
import { client } from '../../lib/api/client'
import { ideaApi } from '../../lib/api/ideas'

// Assign and Move stage (3.15 action bar, 3.16 header). Both act on one idea or on every ticked row.

async function eachOf(ids, run) {
  const results = await Promise.allSettled(ids.map(run))
  return { ok: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected') }
}

/** Choose a staff member; the list comes from the reviewer suggestions for the first idea. */
export function AssignIdeas({ open, onClose, triggerRef, ids, onDone, assignmentId, roleType = 'reviewer' }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [person, setPerson] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setPerson('') }, [open])
  const people = useQuery({
    queryKey: ['reviewer-suggestions', ids[0], roleType],
    queryFn: () => client.get('/api/reviewer-suggestions/', { submission: ids[0], role_type: roleType }),
    enabled: open && ids.length > 0,
  })
  const list = people.data?.suggestions ?? []

  async function save() {
    setBusy(true)
    // With assignmentId it hands an existing piece of work to someone else (3.20 "Reassign").
    const body = assignmentId ? { action: 'reassign', assignment_id: assignmentId, assignee: person } : { assignee: person, role_type: roleType }
    const { ok, failed } = await eachOf(ids, (id) => ideaApi.assign(id, body))
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['ideas'] })
    if (failed.length) toast.show({ tone: 'error', title: t('ideas.assignSome', { ok, n: ids.length }), body: failed[0].reason?.message })
    else toast.show({ tone: 'success', title: t('ideas.assigned', { n: ok }) })
    onDone?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={assignmentId ? t('ideas.reassign') : ids.length > 1 ? t('ideas.assignMany', { n: ids.length }) : t('ideas.assignOne')}
      description={t('ideas.assignHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={busy} disabled={!person}>{t('ideas.assign')}</Button>
        </>
      }
    >
      {people.isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : people.isError ? (
        <ErrorState compact title={t('ideas.peopleError')} message={people.error?.message} onRetry={people.refetch} />
      ) : list.length === 0 ? (
        <p className="text-[13px] text-muted">{t('ideas.noPeople')}</p>
      ) : (
        <RadioGroup
          name="assignee"
          legend={t('ideas.assignTo')}
          value={person}
          onChange={setPerson}
          options={list.map((p) => ({ value: p.user_id, label: p.full_name, description: t('ideas.openItems', { n: p.active_assignment_count ?? 0 }) }))}
        />
      )}
    </Modal>
  )
}

/** Move to the next stage with a short reason the innovator will see (3.16 pin 1). */
export function MoveIdeas({ open, onClose, triggerRef, ids, onDone }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])

  async function save() {
    if (!reason.trim()) { setError(t('ideas.reasonNeeded')); return }
    setBusy(true)
    const { ok, failed } = await eachOf(ids, (id) => ideaApi.workflowAction(id, { action: 'approve', comment: reason.trim() }))
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['ideas'] })
    if (failed.length) toast.show({ tone: 'error', title: t('ideas.moveSome', { ok, n: ids.length }), body: failed[0].reason?.message })
    else toast.show({ tone: 'success', title: t('ideas.moved', { n: ok }) })
    onDone?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      title={ids.length > 1 ? t('ideas.moveMany', { n: ids.length }) : t('ideas.moveOne')}
      description={t('ideas.moveHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={busy}>{t('ideas.move')}</Button>
        </>
      }
    >
      <Textarea
        label={t('ideas.reason')}
        hint={t('ideas.reasonHint')}
        error={error || undefined}
        required
        value={reason}
        onChange={(e) => { setReason(e.target.value); setError('') }}
        rows={3}
        maxChars={500}
      />
    </Modal>
  )
}

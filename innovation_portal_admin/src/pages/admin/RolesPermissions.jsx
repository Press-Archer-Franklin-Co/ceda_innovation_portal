import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Lock, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import Tag from '../../components/ui/Tag'
import DropdownMenu from '../../components/ui/DropdownMenu'
import ErrorState from '../../components/ui/ErrorState'
import ForbiddenState from '../../components/ui/ForbiddenState'
import Skeleton from '../../components/ui/Skeleton'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { describeChanges, groupCapabilities, locksFrom, matrixChanges, matrixFrom, pickText, toggleCell } from '../../lib/admin/roles'
import { LANGUAGES, approverFrom, approverValue, flowProblems, flowSentence, fromFlow, moveStep, newStep, toFlowPayload } from '../../lib/admin/approvals'
import { useAdminRoles, useApprovalFlow, useCapabilityCatalogue, useRoleAction, useRoleLocks, useSaveApprovalFlow } from '../../lib/queries/adminRoles'

const apiMessage = (err) => {
  const data = err?.data?.errors ?? err?.data ?? {}
  const first = Array.isArray(data) ? data[0] : typeof data === 'object' ? Object.values(data).flat()[0] : null
  return typeof first === 'string' ? first : err?.message ?? ''
}

function RoleDialog({ role, onClose }) {
  const t = useT()
  const toast = useToast()
  const act = useRoleAction()
  const builtIn = !!role?.is_system
  const [name, setName] = useState({ en: role?.name?.en ?? '', tn: role?.name?.tn ?? '' })
  const [description, setDescription] = useState({ en: role?.description?.en ?? '', tn: role?.description?.tn ?? '' })
  const [show, setShow] = useState(false)
  const save = async () => {
    setShow(true)
    if (!builtIn && !name.en.trim()) return
    try {
      if (role?.id) await act.mutateAsync({ action: 'update', id: role.id, value: builtIn ? { description } : { name, description } })
      else await act.mutateAsync({ action: 'create', value: { name, description } })
      toast.show({ tone: 'success', title: role?.id ? t('roles.saved') : t('roles.created') })
      onClose()
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }
  return (
    <Modal open onClose={onClose} title={role?.id ? t('roles.editTitle') : t('roles.newTitle')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={save} loading={act.isPending}>{role?.id ? t('roles.saveRole') : t('roles.create')}</Button></>}>
      <div className="flex flex-col gap-3">
        {builtIn && <p className="rounded-control bg-surface2 px-3 py-2 text-[12px] text-muted">{t('roles.builtInNote')}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t('roles.name')} value={name.en} onChange={(e) => setName({ ...name, en: e.target.value })} maxLength={80} required disabled={builtIn} error={show && !builtIn && !name.en.trim() ? t('roles.needName') : undefined} />
          <Input label={t('roles.nameTn')} value={name.tn} onChange={(e) => setName({ ...name, tn: e.target.value })} maxLength={80} optional disabled={builtIn} />
        </div>
        <Input label={t('roles.description')} value={description.en} onChange={(e) => setDescription({ ...description, en: e.target.value })} maxLength={200} optional />
        <Input label={t('roles.descriptionTn')} value={description.tn} onChange={(e) => setDescription({ ...description, tn: e.target.value })} maxLength={200} optional />
      </div>
    </Modal>
  )
}

/** S2 section 1: roles down the side, capabilities across the top, grouped. */
function RolesTab() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const catalogue = useCapabilityCatalogue()
  const roles = useAdminRoles()
  const act = useRoleAction()
  const lockQueries = useRoleLocks(roles.data)
  const locks = useMemo(() => locksFrom(lockQueries.map((q) => q.data)), [lockQueries])
  const saved = useMemo(() => matrixFrom(roles.data ?? []), [roles.data])
  const [draft, setDraft] = useState(null)
  const [dialog, setDialog] = useState(null)
  useEffect(() => { setDraft(null) }, [roles.data])

  const matrix = draft ?? saved
  const changes = matrixChanges(saved, matrix)
  const groups = groupCapabilities(catalogue.data)
  const capLabel = (key) => pickText(catalogue.data?.capabilities?.find((c) => c.key === key)?.label, lang) || key
  const roleName = (id) => pickText((roles.data ?? []).find((r) => String(r.id) === String(id))?.name, lang)

  if (roles.error?.status === 403 || catalogue.error?.status === 403) return <ForbiddenState title={t('roles.forbidden')} />
  if (roles.isError || catalogue.isError) return <ErrorState title={t('roles.loadError')} onRetry={() => { roles.refetch(); catalogue.refetch() }} />
  if (roles.isLoading || catalogue.isLoading) return <Skeleton className="h-96 rounded-card" />

  async function save() {
    const lines = describeChanges(changes, roleName, capLabel, t)
    // The dialog shows the body inside a paragraph, so each line is a block span.
    const body = <>{lines.map((line) => <span key={line} className="mt-1 block text-text">{line}</span>)}<span className="mt-2 block">{t('roles.saveBody')}</span></>
    const ok = await confirm({ title: t('roles.saveTitle'), body, confirmLabel: t('roles.save'), tone: 'primary' })
    if (!ok) return
    try {
      for (const c of changes) await act.mutateAsync({ action: 'capabilities', id: c.roleId, value: matrix[c.roleId] })
      toast.show({ tone: 'success', title: t('roles.saved') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  async function remove(role) {
    const ok = await confirm({ title: t('roles.deleteTitle', { name: pickText(role.name, lang) }), body: t('roles.deleteBody'), confirmLabel: t('roles.delete') })
    if (!ok) return
    try {
      const result = await act.mutateAsync({ action: 'remove', id: role.id })
      toast.show({ tone: 'success', title: result?.result === 'retired' ? t('roles.retiredDone') : t('roles.deleted') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  const list = roles.data ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-[15px] font-bold text-text">{t('roles.matrix')}</h2>
          <p className="text-[12px] text-muted">{t('roles.matrixHint')}</p>
        </div>
        <Button variant="secondary" icon={<Plus size={15} aria-hidden />} onClick={() => setDialog('new')}>{t('roles.newRole')}</Button>
      </div>

      <div className="max-w-full overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface2">
              <th rowSpan={2} scope="col" className="sticky left-0 z-10 min-w-[140px] bg-surface2 px-3 py-2 sm:min-w-[200px] text-left align-bottom font-semibold text-text">{t('roles.role')}</th>
              {groups.map((g) => (
                <th key={g.key} colSpan={g.items.length} scope="colgroup" className="border-l border-border px-2 pt-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted">{t(`roles.group.${g.key}`)}</th>
              ))}
            </tr>
            <tr className="bg-surface2">
              {groups.map((g) => g.items.map((c, i) => (
                <th key={c.key} scope="col" className={cn('w-[92px] px-2 pb-2 pt-1 text-left align-bottom text-[12px] font-semibold leading-4 text-text', i === 0 && 'border-l border-border')}>
                  {pickText(c.label, lang)}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const id = String(r.id)
              const name = pickText(r.name, lang)
              return (
                <tr key={id} className={cn('border-t border-border', !r.is_active && 'opacity-60')}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left align-top font-normal">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-semibold text-text">{name}</span>
                        <span className="block text-[12px] text-muted">{r.people_count === 1 ? t('roles.person') : t('roles.people', { count: r.people_count ?? 0 })}</span>
                        <span className="mt-1 flex gap-1">
                          {r.is_system && <Tag tone="neutral">{t('roles.builtIn')}</Tag>}
                          {!r.is_active && <Tag tone="neutral">{t('roles.retired')}</Tag>}
                        </span>
                      </span>
                      <DropdownMenu label={t('roles.actions', { name })} items={[
                        { key: 'edit', label: t('roles.rename'), onSelect: () => setDialog(r) },
                        { key: 'retire', label: r.is_active ? t('roles.retire') : t('roles.restore'), hidden: r.is_system, onSelect: () => act.mutateAsync({ action: 'update', id: r.id, value: { is_active: !r.is_active } }).catch((e) => toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })) },
                        { key: 'delete', label: t('roles.delete'), danger: true, hidden: r.is_system, onSelect: () => remove(r) },
                      ]} trigger={(props) => <button type="button" {...props} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-text"><MoreHorizontal size={15} aria-hidden /><span className="sr-only">{t('roles.actions', { name })}</span></button>} />
                    </span>
                  </th>
                  {groups.map((g) => g.items.map((c, i) => {
                    const held = (matrix[id] ?? []).includes(c.key)
                    const reason = locks[id]?.[c.key]
                    const changed = held !== (saved[id] ?? []).includes(c.key)
                    return (
                      <td key={c.key} className={cn('px-2 py-2 text-center align-middle', i === 0 && 'border-l border-border', changed && 'bg-warning-soft')}>
                        <span className="relative inline-flex items-center" title={reason ? t('roles.locked', { reason }) : undefined}>
                          <input type="checkbox" className="h-4 w-4 accent-primary disabled:opacity-60" checked={held} disabled={reason != null}
                            aria-label={t('roles.cell', { role: name, capability: pickText(c.label, lang) })}
                            aria-describedby={reason ? `lock-${id}-${c.key}` : undefined}
                            onChange={(e) => setDraft(toggleCell(matrix, id, c.key, e.target.checked))} />
                          {reason != null && <Lock size={10} aria-hidden className="absolute -right-3 -top-1 text-muted" />}
                          {reason != null && <span id={`lock-${id}-${c.key}`} className="sr-only">{t('roles.locked', { reason })}</span>}
                        </span>
                      </td>
                    )
                  }))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {changes.length > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-lg">
          <span className="text-[13px] font-semibold text-text" role="status">{t('roles.unsaved', { count: changes.reduce((n, c) => n + c.added.length + c.removed.length, 0) })}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('roles.discard')}</Button>
            <Button onClick={save} loading={act.isPending}>{t('roles.save')}</Button>
          </div>
        </div>
      )}

      {dialog && <RoleDialog key={dialog === 'new' ? 'new' : dialog.id} role={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** S2 section 2: the approval steps, language per step, the own-work switch and a plain sentence. */
function ApprovalsTab() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const flow = useApprovalFlow()
  const catalogue = useCapabilityCatalogue()
  const roles = useAdminRoles()
  const saveFlow = useSaveApprovalFlow()
  const [form, setForm] = useState(null)
  const [show, setShow] = useState(false)
  useEffect(() => { if (flow.data) setForm(fromFlow(flow.data)) }, [flow.data])

  const options = useMemo(() => [
    ...(catalogue.data?.capabilities ?? []).filter((c) => c.group === 'website').map((c) => ({ value: `cap:${c.key}`, label: t('appr.approverCap', { label: pickText(c.label, lang) }) })),
    ...(roles.data ?? []).filter((r) => r.is_active).map((r) => ({ value: `role:${r.code}`, label: t('appr.approverRole', { name: pickText(r.name, lang) }) })),
  ], [catalogue.data, roles.data, lang, t])

  if (flow.error?.status === 403) return <ForbiddenState title={t('roles.forbidden')} />
  if (flow.isError) return <ErrorState title={t('appr.loadError')} onRetry={() => flow.refetch()} />
  if (!form) return <Skeleton className="h-80 rounded-card" />

  const approverName = (a) => {
    if (a?.capability) {
      const label = pickText(catalogue.data?.capabilities?.find((c) => c.key === a.capability)?.label, lang) || a.capability
      return t('appr.whoCap', { label: label.charAt(0).toLowerCase() + label.slice(1) })
    }
    const role = (roles.data ?? []).find((r) => r.code === a?.role)
    return pickText(role?.name, lang) || a?.role_name || a?.role || ''
  }
  const problems = flowProblems(form)
  const stepProblem = (i, key) => show && problems.some((p) => p.index === i && p.key === key)
  const sentence = flowSentence(form, approverName, t)
  const dirty = flow.data && JSON.stringify(toFlowPayload(form)) !== JSON.stringify(toFlowPayload(fromFlow(flow.data)))
  const setStep = (i, patch) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  async function save() {
    setShow(true)
    if (problems.length) return
    const ok = await confirm({ title: t('appr.saveTitle'), body: t('appr.saveBody', { sentence }), confirmLabel: t('appr.save'), tone: 'primary' })
    if (!ok) return
    try {
      await saveFlow.mutateAsync(toFlowPayload(form))
      toast.show({ tone: 'success', title: t('appr.saved') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="font-heading text-[15px] font-bold text-text">{t('appr.title')}</h2>
        <p className="text-[12px] text-muted">{t('appr.subtitle')}</p>
      </div>
      {show && problems.filter((p) => p.index == null).map((p) => <p key={p.key} role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">{t(p.key)}</p>)}
      <ol className="flex flex-col gap-3">
        {form.steps.map((s, i) => (
          <li key={s._key} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-text">{t('appr.step', { n: i + 1 })}</span>
              <span className="flex items-center">
                <button type="button" onClick={() => setForm((f) => ({ ...f, steps: moveStep(f.steps, i, -1) }))} disabled={i === 0} aria-label={t('appr.moveUp', { n: i + 1 })} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowUp size={15} aria-hidden /></button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, steps: moveStep(f.steps, i, 1) }))} disabled={i === form.steps.length - 1} aria-label={t('appr.moveDown', { n: i + 1 })} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text disabled:opacity-30"><ArrowDown size={15} aria-hidden /></button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} aria-label={t('appr.removeStep', { n: i + 1 })} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-danger"><Trash2 size={15} aria-hidden /></button>
              </span>
            </div>
            <Input label={t('appr.stepName')} value={s.name ?? ''} onChange={(e) => setStep(i, { name: e.target.value })} maxLength={80} optional />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_160px]">
              <Select label={t('appr.approver')} options={options} value={approverValue(s.approver)} onChange={(v) => setStep(i, { approver: approverFrom(v) })} required error={stepProblem(i, 'appr.needApprover') ? t('appr.needApprover') : undefined} />
              <Input type="number" inputMode="numeric" min={1} max={10} label={t('appr.count')} value={s.approvals_needed} onChange={(e) => setStep(i, { approvals_needed: e.target.value })} error={stepProblem(i, 'appr.needCount') ? t('appr.needCount') : undefined} />
              <Select label={t('appr.language')} options={LANGUAGES.map((l) => ({ value: l, label: t(`appr.lang.${l}`) }))} value={s.language ?? 'all'} onChange={(v) => setStep(i, { language: v ?? 'all' })} />
            </div>
          </li>
        ))}
      </ol>
      <Button variant="secondary" icon={<Plus size={15} aria-hidden />} className="self-start" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, newStep(f.steps.some((x) => x.language === 'tn') ? 'en' : 'tn')] }))}>{t('appr.addStep')}</Button>
      <Toggle label={t('appr.own')} description={t('appr.ownHint')} checked={form.approvers_can_approve_own_work} onChange={(v) => setForm((f) => ({ ...f, approvers_can_approve_own_work: v }))} />
      <div className="rounded-card bg-surface2 px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">{t('appr.inWords')}</p>
        <p className="mt-1 text-[14px] text-text" aria-live="polite">{sentence}</p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-[12px] text-muted" role="status">{t('appr.unsaved')}</span>}
        <Button onClick={save} loading={saveFlow.isPending} disabled={!dirty}>{t('appr.save')}</Button>
      </div>
    </div>
  )
}

/** S2 Roles & permissions (Administration). Needs settings.manage; the API refuses everyone else. */
export default function RolesPermissions() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'approvals' ? 'approvals' : 'roles'
  return (
    <div>
      <PageHeader title={t('roles.title')} subtitle={t('roles.subtitle')} />
      <Tabs tabs={[{ key: 'roles', label: t('roles.tabRoles') }, { key: 'approvals', label: t('roles.tabApprovals') }]} active={tab}
        onChange={(key) => setParams(key === 'roles' ? {} : { tab: key }, { replace: true })} label={t('roles.title')} className="mb-4" />
      <Fragment key={tab}>{tab === 'roles' ? <RolesTab /> : <ApprovalsTab />}</Fragment>
    </div>
  )
}

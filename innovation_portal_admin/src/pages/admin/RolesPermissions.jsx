import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Info, Lock, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import DropdownMenu from '../../components/ui/DropdownMenu'
import ErrorState from '../../components/ui/ErrorState'
import ForbiddenState from '../../components/ui/ForbiddenState'
import Skeleton from '../../components/ui/Skeleton'
import { Toggle } from '../../components/ui/Choice'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { PERMISSION_COLUMNS, copyableCapabilities, describeChanges, locksFrom, matrixChanges, permissionGroups, pickText, toggleCell } from '../../lib/admin/roles'
import { useMediaQuery } from '../../lib/useMediaQuery'
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

// The frame's area names where they differ from the older matrix.
const GROUP_LABEL = { website: 'roles.u9.group.website', administration: 'roles.u9.group.admin' }

/** 3.24 ① roles down the side with their people; ② what the chosen role can do, in plain words. */
function RolesView() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const wide = useMediaQuery('(min-width: 768px)')
  const [params, setParams] = useSearchParams()
  const catalogue = useCapabilityCatalogue()
  const roles = useAdminRoles()
  const act = useRoleAction()
  const list = useMemo(() => roles.data ?? [], [roles.data])
  const selectedId = params.get('role') ?? ''
  const selected = list.find((r) => String(r.id) === selectedId) ?? (wide ? list[0] : null)
  const lockQueries = useRoleLocks(selected ? [selected] : [])
  const locks = useMemo(() => locksFrom(lockQueries.map((q) => q.data)), [lockQueries])
  const [draft, setDraft] = useState(null)
  const [dialog, setDialog] = useState(null)
  useEffect(() => { setDraft(null) }, [roles.data, selected?.id])

  if (roles.error?.status === 403 || catalogue.error?.status === 403) return <ForbiddenState title={t('roles.forbidden')} />
  if (roles.isError || catalogue.isError) return <ErrorState title={t('roles.loadError')} onRetry={() => { roles.refetch(); catalogue.refetch() }} />
  if (roles.isLoading || catalogue.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <Skeleton className="h-72 rounded-card" /><Skeleton className="hidden h-[480px] rounded-card md:block" />
      </div>
    )
  }

  const choose = (r) => setParams((p) => { const n = new URLSearchParams(p); if (r) n.set('role', String(r.id)); else n.delete('role'); return n }, { replace: true })
  const groups = permissionGroups(catalogue.data)
  const capLabel = (key) => pickText(catalogue.data?.capabilities?.find((c) => c.key === key)?.label, lang) || key
  const id = selected ? String(selected.id) : ''
  const saved = selected ? [...(selected.capabilities ?? [])].sort() : []
  const held = draft ?? saved
  const builtIn = !!selected?.is_system
  const editable = wide && selected && !builtIn && selected.is_active
  const changes = matrixChanges({ [id]: saved }, { [id]: held })
  const peopleText = (r) => (r.people_count === 1 ? t('roles.person') : t('roles.people', { count: r.people_count ?? 0 }))

  async function save() {
    const name = pickText(selected.name, lang)
    const lines = describeChanges(changes, () => name, capLabel, t)
    const body = <>{lines.map((line) => <span key={line} className="mt-1 block text-text">{line}</span>)}<span className="mt-2 block">{t('roles.saveBody')}</span></>
    if (!(await confirm({ title: t('roles.saveTitle'), body, confirmLabel: t('roles.save'), tone: 'primary' }))) return
    try {
      await act.mutateAsync({ action: 'capabilities', id: selected.id, value: held })
      toast.show({ tone: 'success', title: t('roles.saved') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  async function copy() {
    const name = t('roles.u9.copyName', { name: pickText(selected.name, lang) })
    try {
      const made = await act.mutateAsync({ action: 'create', value: { name: { en: name, tn: '' }, description: selected.description } })
      const newId = made?.id ?? made?.role?.id
      if (newId) {
        await act.mutateAsync({ action: 'capabilities', id: newId, value: copyableCapabilities(selected, catalogue.data) })
        choose({ id: newId })
      }
      toast.show({ tone: 'success', title: t('roles.u9.copied', { name }) })
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  async function remove(role) {
    if (!(await confirm({ title: t('roles.deleteTitle', { name: pickText(role.name, lang) }), body: t('roles.deleteBody'), confirmLabel: t('roles.delete') }))) return
    try {
      const result = await act.mutateAsync({ action: 'remove', id: role.id })
      toast.show({ tone: 'success', title: result?.result === 'retired' ? t('roles.retiredDone') : t('roles.deleted') })
      choose(null)
    } catch (e) {
      toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })
    }
  }

  const roleList = (
    <ul className="flex flex-col gap-2" aria-label={t('roles.tabRoles')}>
      {list.map((r) => {
        const on = selected && String(r.id) === id
        return (
          <li key={r.id}>
            <button type="button" onClick={() => choose(r)} aria-current={on ? 'true' : undefined}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-card border bg-surface px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                on ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface2',
                !r.is_active && 'opacity-60',
              )}>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-text">{pickText(r.name, lang)}</span>
                <span className="block text-[12px] text-muted">
                  {r.is_system ? t('roles.u9.peopleBuiltIn', { people: peopleText(r) }) : peopleText(r)}
                  {!r.is_active && ` · ${t('roles.retired')}`}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
            </button>
          </li>
        )
      })}
    </ul>
  )

  const panel = selected && (
    <section className="overflow-hidden rounded-card border border-border bg-surface" aria-labelledby="role-panel-title">
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,52px)] items-center gap-x-1 bg-surface2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,64px)] sm:px-4">
        <span className="flex min-w-0 items-center gap-1">
          <h2 id="role-panel-title" className="truncate text-[13px] font-bold text-text">{t('roles.u9.whatTheyCanDo', { name: pickText(selected.name, lang) })}</h2>
          {wide && (
            <DropdownMenu label={t('roles.actions', { name: pickText(selected.name, lang) })} align="start" items={[
              { key: 'edit', label: builtIn ? t('roles.u9.describe') : t('roles.rename'), onSelect: () => setDialog(selected) },
              { key: 'retire', label: selected.is_active ? t('roles.retire') : t('roles.restore'), hidden: builtIn, onSelect: () => act.mutateAsync({ action: 'update', id: selected.id, value: { is_active: !selected.is_active } }).catch((e) => toast.show({ tone: 'error', title: t('roles.failed', { message: apiMessage(e) }) })) },
              { key: 'delete', label: t('roles.delete'), danger: true, hidden: builtIn, onSelect: () => remove(selected) },
            ]} trigger={(props) => <button type="button" {...props} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface hover:text-text"><MoreHorizontal size={15} aria-hidden /><span className="sr-only">{t('roles.actions', { name: pickText(selected.name, lang) })}</span></button>} />
          )}
        </span>
        {PERMISSION_COLUMNS.map((col) => <span key={col} className="text-center text-[12px] font-semibold text-muted">{t(`roles.u9.${col}`)}</span>)}
      </div>
      {groups.map((g) => (
        <div key={g.key} role="group" aria-labelledby={`grp-${g.key}`}>
          <p id={`grp-${g.key}`} className="border-t border-border px-3 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted sm:px-4">{t(GROUP_LABEL[g.key] ?? `roles.group.${g.key}`)}</p>
          {g.rows.map((row) => {
            const rowLabel = row.label ? pickText(row.label, lang) : t(`roles.row.${row.key}`)
            return (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_repeat(3,52px)] items-center gap-x-1 border-t border-border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,64px)] sm:px-4">
                <span className="text-[13px] text-text">{rowLabel}</span>
                {PERMISSION_COLUMNS.map((col) => {
                  const key = row[col]
                  if (!key) return <span key={col} aria-hidden />
                  const on = held.includes(key)
                  const reason = locks[id]?.[key]
                  const changed = on !== saved.includes(key)
                  return (
                    <span key={col} className={cn('flex justify-center rounded py-0.5', changed && 'bg-warning-soft')} title={reason ? t('roles.locked', { reason }) : undefined}>
                      {/* Drawn by hand so a read-only tick keeps the frame's red; a disabled native box turns grey. */}
                      <span className="relative flex h-4 w-4">
                        <input type="checkbox" className="peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-border bg-surface checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed" checked={on}
                          disabled={!editable || reason != null}
                          aria-label={t('roles.cell', { role: pickText(selected.name, lang), capability: `${rowLabel}: ${t(`roles.u9.${col}`)}` })}
                          onChange={(e) => setDraft(toggleCell({ [id]: held }, id, key, e.target.checked)[id])} />
                        <Check size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 hidden text-white peer-checked:block" />
                      </span>
                      {reason != null && editable && <Lock size={10} aria-hidden className="-ml-0.5 -mt-1 text-muted" />}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3 sm:px-4">
        <span className="text-[12px] text-muted">{!wide ? t('roles.u9.phoneNote') : builtIn ? t('roles.u9.builtInFooter') : t('roles.u9.customFooter')}</span>
        {wide && (changes.length > 0 ? (
          <span className="flex gap-2" role="status">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>{t('roles.discard')}</Button>
            <Button size="sm" onClick={save} loading={act.isPending}>{t('roles.save')}</Button>
          </span>
        ) : (
          <Button variant="secondary" size="sm" onClick={copy} loading={act.isPending}>{t('roles.u9.copy')}</Button>
        ))}
      </div>
    </section>
  )

  return (
    <>
      {wide ? (
        <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
          {roleList}
          {panel}
        </div>
      ) : selected ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => choose(null)} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-primary">
            <ChevronLeft size={16} aria-hidden />{t('roles.u9.back')}
          </button>
          {panel}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {roleList}
          <p className="flex items-center gap-2 rounded-control bg-surface2 px-3 py-2.5 text-[12px] text-text"><Info size={14} aria-hidden className="shrink-0 text-muted" />{t('roles.u9.phoneNote')}</p>
        </div>
      )}
      {dialog && <RoleDialog key={dialog === 'new' ? 'new' : dialog.id} role={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} />}
    </>
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

/** 3.24 Roles and permissions (Figma 111:1585, 111:2052). Needs settings.manage; the API refuses everyone else. */
export default function RolesPermissions() {
  const t = useT()
  const wide = useMediaQuery('(min-width: 768px)')
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState(false)
  const tab = params.get('tab') === 'approvals' ? 'approvals' : 'roles'
  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / {t('roles.title')}</span>}
        title={t('roles.u9.title')}
        subtitle={t('roles.u9.subtitle')}
        actions={wide && tab === 'roles' ? <Button data-guide="roles.create" onClick={() => setDialog(true)}>{t('roles.newRole')}</Button> : null}
      />
      {wide && (
        <Tabs tabs={[{ key: 'roles', label: t('roles.tabRoles') }, { key: 'approvals', label: t('roles.u9.tabSteps') }]} active={tab}
          onChange={(key) => setParams(key === 'roles' ? {} : { tab: key }, { replace: true })} label={t('roles.title')} className="mb-4" />
      )}
      <Fragment key={tab}>{tab === 'roles' || !wide ? <RolesView /> : <ApprovalsTab />}</Fragment>
      {dialog && <RoleDialog role={null} onClose={() => setDialog(false)} />}
    </div>
  )
}

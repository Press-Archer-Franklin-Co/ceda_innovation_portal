import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, MoreHorizontal } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import ServerTable from '../../components/ui/ServerTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import { SelectControl } from '../../components/ui/Select'
import Tag from '../../components/ui/Tag'
import Avatar from '../../components/ui/Avatar'
import Field from '../../components/ui/Field'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { EMPTY_CELL } from '../../lib/format'
import { pickText } from '../../lib/admin/roles'
import { userFilters, userStatus, usersApi } from '../../lib/api/users'
import { lastSignIn, whatTheyCanDo } from '../../lib/admin/users'
import { useAdminRoles, useCapabilityCatalogue } from '../../lib/queries/adminRoles'

// 3.23 Users (Figma 111:995 website, 111:1497 phone). ① Filter by role or status, search by name or email.
// ② The shared data table with role chips and last sign-in. ③ "Invite someone" opens the genie modal: name, email,
// one or more roles, and the challenges judges and partners may see. ④ Row menu: edit, change roles, reset the
// two-step check, deactivate (never delete, for the audit trail).

const PAGE_SIZE = 25
const STATUS_TONE = { active: 'green', invited: 'blue', deactivated: 'neutral' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const rowsOf = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const nameOf = (u) => u?.full_name?.trim() || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || ''

function RoleChips({ roles, value, onChange, label }) {
  const { lang } = useI18n()
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {roles.map((r) => {
        const on = value.includes(r.code)
        return (
          <button key={r.code} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((c) => c !== r.code) : [...value, r.code])}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text hover:bg-surface2',
            )}>
            {on && <span aria-hidden>✓</span>}{pickText(r.name, lang)}
          </button>
        )
      })}
    </div>
  )
}

/** Roles anyone may be given here: active ones, never "innovator" (the public site makes those). */
function useStaffRoles() {
  const roles = useAdminRoles()
  return useMemo(() => rowsOf(roles.data).filter((r) => r.is_active && r.code !== 'innovator'), [roles.data])
}

function PersonDialog({ person, mode, onClose, triggerRef }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const roles = useStaffRoles()
  const catalogue = useCapabilityCatalogue()
  const inviting = mode === 'invite'
  const [name, setName] = useState(person ? nameOf(person) : '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [codes, setCodes] = useState(person?.roles ?? [])
  const [show, setShow] = useState(false)
  const showRoles = true
  const showName = inviting

  const errors = {
    name: showName && !name.trim() ? t('users.needName') : null,
    email: inviting && !EMAIL.test(email.trim()) ? t('users.needEmail') : null,
    roles: showRoles && !codes.length ? t('users.needRole') : null,
  }
  const save = useMutation({
    mutationFn: () => {
      if (inviting) return usersApi.invite({ full_name: name.trim(), email: email.trim().toLowerCase(), roles: codes })
      return usersApi.setRoles(person.id, codes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      if (inviting) toast.show({ tone: 'success', title: t('users.invited', { email: email.trim() }) })
      else toast.show({ tone: 'success', title: t('users.rolesSaved', { name: nameOf(person) }) })
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: t('users.failed', { message: e.message }) }),
  })
  const submit = () => {
    setShow(true)
    if (Object.values(errors).some(Boolean)) return
    save.mutate()
  }
  const sentence = showRoles ? whatTheyCanDo(codes, roles, catalogue.data, lang, t) : ''
  const title = inviting ? t('users.inviteTitle') : t('users.rolesTitle', { name: nameOf(person) })

  return (
    <Modal open onClose={onClose} title={title} size="md" triggerRef={triggerRef}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={submit} loading={save.isPending}>{inviting ? t('users.sendInvite') : t('common.save')}</Button></>}>
      <div className="flex flex-col gap-4">
        {showName && (
          <div className={cn('grid gap-3', inviting && 'sm:grid-cols-2')}>
            <Input label={t('users.fullName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required autoComplete="off" error={show ? errors.name : undefined} />
            {inviting && <Input label={t('users.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="off" error={show ? errors.email : undefined} />}
          </div>
        )}
        {showRoles && (
          <Field label={t('users.roles')} required error={show ? errors.roles : undefined}>
            <RoleChips roles={roles} value={codes} onChange={setCodes} label={t('users.roles')} />
          </Field>
        )}
        {sentence && (
          <p className="flex items-start gap-2 rounded-control bg-surface2 px-3 py-2.5 text-[12px] text-text" aria-live="polite">
            <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-muted" />{sentence}
          </p>
        )}
      </div>
    </Modal>
  )
}

export default function Users() {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const inviteRef = useRef(null)
  const pageRef = useRef(null)
  const [params, setParams] = useSearchParams()
  // Filters live in the address like the table's page and search. No status in the address means Active.
  const role = params.get('role') ?? ''
  const status = params.get('status') ?? 'active'
  const setFilter = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('page')
    return next
  }, { replace: true })
  const [dialog, setDialog] = useState(null)
  const wide = useMediaQuery('(min-width: 768px)')
  const roles = useStaffRoles()
  const allRoles = useAdminRoles()

  // The Need help guide points at the search box, which the shared table draws.
  useEffect(() => { pageRef.current?.querySelector('input[type=search]')?.setAttribute('data-guide', 'users.search') })
  const roleName = (code) => pickText(rowsOf(allRoles.data).find((r) => r.code === code)?.name, lang) || t('users.otherRole')

  const act = useMutation({
    mutationFn: ({ fn }) => fn(),
    onSuccess: (_, { done }) => { qc.invalidateQueries({ queryKey: ['users'] }); toast.show({ tone: 'success', title: done }) },
    onError: (e) => toast.show({ tone: 'error', title: t('users.failed', { message: e.message }) }),
  })

  async function deactivate(u) {
    const name = nameOf(u)
    if (!(await confirm({ title: t('users.deactivateTitle', { name }), body: t('users.deactivateBody'), confirmLabel: t('users.deactivate') }))) return
    act.mutate({ fn: () => usersApi.deactivate(u.id), done: t('users.deactivated', { name }) })
  }

  const menu = (u) => {
    const s = userStatus(u)
    const name = nameOf(u)
    return (
      <DropdownMenu label={t('users.actions', { name })}
        trigger={(props) => (
          <button type="button" {...props} onClick={(e) => { e.stopPropagation(); props.onClick?.(e) }}
            className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <MoreHorizontal size={16} aria-hidden /><span className="sr-only">{t('users.actions', { name })}</span>
          </button>
        )}
        items={[
          { key: 'roles', label: t('users.changeRoles'), onSelect: () => setDialog({ mode: 'roles', person: u }) },
          { key: 'verify', label: t('users.resendVerification'), hidden: s !== 'active' || u.email_verified !== false, onSelect: () => act.mutate({ fn: () => usersApi.resendVerification(u.id), done: t('users.resent', { email: u.email }) }) },
          { key: 'reactivate', label: t('users.reactivate'), hidden: s !== 'deactivated', onSelect: () => act.mutate({ fn: () => usersApi.reactivate(u.id), done: t('users.reactivated', { name }) }) },
          { key: 'deactivate', label: t('users.deactivate'), danger: true, hidden: s === 'deactivated', onSelect: () => deactivate(u) },
        ]}
      />
    )
  }

  const columns = [
    {
      key: 'name', label: t('users.col.name'), width: '26%',
      render: (_, u) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={nameOf(u)} size="sm" decorative />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-text">{nameOf(u)}</span>
            <span className="hidden truncate text-[12px] font-normal text-muted md:block">{u.email}</span>
            {/* Phone card (frame 111:1497): name, role chips and the menu on one card. */}
            <span className="mt-1 flex flex-wrap gap-1 font-normal md:hidden">
              {(u.roles ?? []).map((c) => <Tag key={c}>{roleName(c)}</Tag>)}
              {userStatus(u) !== 'active' && <Tag tone={STATUS_TONE[userStatus(u)]}>{t(`users.status.${userStatus(u)}`)}</Tag>}
            </span>
          </span>
          <span className="shrink-0 md:hidden">{menu(u)}</span>
        </span>
      ),
    },
    {
      key: 'roles', label: t('users.col.roles'), width: '24%', hideOnPhone: true,
      render: (codes) => (codes?.length
        ? <span className="flex flex-wrap gap-1">{codes.map((c) => <Tag key={c}>{roleName(c)}</Tag>)}</span>
        : EMPTY_CELL),
    },
    { key: 'last_login', label: t('users.col.lastSignIn'), hideOnPhone: true, render: (v) => <span className="whitespace-nowrap text-[13px] text-muted">{lastSignIn(v, t)}</span> },
    {
      key: 'status', label: t('users.col.status'), hideOnPhone: true,
      render: (_, u) => { const s = userStatus(u); return <Tag tone={STATUS_TONE[s]}>{t(`users.status.${s}`)}</Tag> },
    },
    { key: 'menu', label: <span className="sr-only">{t('common.menu')}</span>, width: '48px', align: 'right', hideOnPhone: true, render: (_, u) => menu(u) },
  ]

  const statusOptions = [
    { value: 'active', label: t('users.status.active') },
    { value: 'invited', label: t('users.status.invited') },
    { value: 'deactivated', label: t('users.status.deactivated') },
  ]
  const roleOptions = roles.map((r) => ({ value: r.code, label: pickText(r.name, lang) }))

  const inviteButton = <Button ref={inviteRef} block={!wide} onClick={() => setDialog({ mode: 'invite' })}>{t('users.invite')}</Button>
  const filterRow = (
    <>
      <SelectControl options={[{ value: '', label: t('users.allRoles') }, ...roleOptions]} value={role} onChange={(v) => setFilter('role', v)} aria-label={t('users.col.roles')} className="w-[calc(50%-4px)] sm:w-[160px]" />
      <SelectControl options={[{ value: 'all', label: t('users.allStatus') }, ...statusOptions]} value={status} onChange={(v) => setFilter('status', v === 'active' ? '' : v)} aria-label={t('users.col.status')} className="w-[calc(50%-4px)] sm:w-[150px]" />
    </>
  )

  return (
    <div ref={pageRef}>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / {t('users.crumb')}</span>}
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={wide ? inviteButton : null}
      />
      {!wide && <div className="mb-3">{inviteButton}</div>}
      <ServerTable
        caption={t('users.title')}
        queryKey={(request) => ['users', request]}
        fetcher={(request) => usersApi.list(request)}
        filters={userFilters({ role, status })}
        pageSize={PAGE_SIZE}
        searchLabel={t('users.search')}
        toolbar={filterRow}
        columns={columns}
        emptyTitle={t('users.emptyTitle')}
        emptyMessage={t('users.emptyBody')}
      />
      {dialog && <PersonDialog key={dialog.person?.id ?? 'invite'} mode={dialog.mode} person={dialog.person} onClose={() => setDialog(null)} triggerRef={dialog.mode === 'invite' ? inviteRef : undefined} />}
    </div>
  )
}

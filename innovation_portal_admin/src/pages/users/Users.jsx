import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, MoreHorizontal, Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import DropdownMenu from '../../components/ui/DropdownMenu'
import Modal from '../../components/ui/Modal'
import Input, { InputControl } from '../../components/ui/Input'
import { SelectControl } from '../../components/ui/Select'
import MultiSelect from '../../components/ui/MultiSelect'
import Tag from '../../components/ui/Tag'
import Avatar from '../../components/ui/Avatar'
import Field from '../../components/ui/Field'
import { useConfirm } from '../../components/ui/confirm'
import { useToast } from '../../components/ui/toast'
import { useI18n, useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { EMPTY_CELL } from '../../lib/format'
import { pickText } from '../../lib/admin/roles'
import { listParams, userStatus, usersApi } from '../../lib/api/users'
import { lastSignIn, whatTheyCanDo } from '../../lib/admin/users'
import { useAdminRoles, useCapabilityCatalogue } from '../../lib/queries/adminRoles'
import { usePrograms } from '../../lib/queries/programs'

// 3.23 Users (Figma 111:995 website, 111:1497 phone). ① Filter by role or status, search by name or email.
// ② The shared data table with role chips and last sign-in. ③ "Invite someone" opens the genie modal: name, email,
// one or more roles, and the challenges judges and partners may see. ④ Row menu: edit, change roles, reset the
// two-step check, deactivate (never delete, for the audit trail).

const PAGE_SIZE = 25
const STATUS_TONE = { active: 'green', invited: 'blue', deactivated: 'neutral' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const rowsOf = (data) => (Array.isArray(data) ? data : data?.results ?? [])
const nameOf = (u) => u?.full_name?.trim() || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || ''
const notYet = (e) => e?.status === 404 || e?.status === 405

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

function needsChallenges(codes) {
  return codes.some((c) => c === 'judge' || c.includes('partner'))
}

function PersonDialog({ person, mode, onClose, triggerRef }) {
  const t = useT()
  const { lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const roles = useStaffRoles()
  const catalogue = useCapabilityCatalogue()
  const programs = usePrograms()
  const inviting = mode === 'invite'
  const [name, setName] = useState(person ? nameOf(person) : '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [codes, setCodes] = useState(person?.roles ?? [])
  const [challenges, setChallenges] = useState((person?.challenges ?? []).map((c) => String(c.id)))
  const [show, setShow] = useState(false)
  const showRoles = mode !== 'edit'
  const showName = mode !== 'roles'
  const showChallenges = mode !== 'roles' && needsChallenges(codes)

  const errors = {
    name: showName && !name.trim() ? t('users.needName') : null,
    email: inviting && !EMAIL.test(email.trim()) ? t('users.needEmail') : null,
    roles: showRoles && !codes.length ? t('users.needRole') : null,
  }
  const save = useMutation({
    mutationFn: () => {
      const program_ids = showChallenges ? challenges : []
      if (inviting) return usersApi.invite({ full_name: name.trim(), email: email.trim().toLowerCase(), roles: codes, program_ids })
      if (mode === 'roles') return usersApi.setRoles(person.id, codes)
      return usersApi.update(person.id, { full_name: name.trim(), program_ids })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      if (inviting) toast.show({ tone: 'success', title: t('users.invited', { email: email.trim() }) })
      else if (mode === 'roles') toast.show({ tone: 'success', title: t('users.rolesSaved', { name: nameOf(person) }) })
      else toast.show({ tone: 'success', title: t('users.saved') })
      onClose()
    },
    onError: (e) => toast.show({ tone: 'error', title: notYet(e) ? t('users.notYet') : t('users.failed', { message: e.message }) }),
  })
  const submit = () => {
    setShow(true)
    if (Object.values(errors).some(Boolean)) return
    save.mutate()
  }
  const sentence = showRoles ? whatTheyCanDo(codes, roles, catalogue.data, lang, t) : ''
  const programOptions = rowsOf(programs.data).map((p) => ({ value: String(p.id), label: p.title }))
  const title = inviting ? t('users.inviteTitle') : mode === 'roles' ? t('users.rolesTitle', { name: nameOf(person) }) : t('users.editTitle', { name: nameOf(person) })

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
        {showChallenges && (
          <MultiSelect label={t('users.challenges')} hint={t('users.challengesHint')} optional options={programOptions} value={challenges} onChange={setChallenges} placeholder={t('users.challengesPick')} />
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
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState(null)
  const roles = useStaffRoles()

  const params = listParams({ search: search.trim(), role, status, page, pageSize: PAGE_SIZE })
  const list = useQuery({ queryKey: ['users', params], queryFn: () => usersApi.list(params), placeholderData: (prev) => prev })
  const rows = rowsOf(list.data)
  const roleName = (code) => pickText(roles.find((r) => r.code === code)?.name, lang) || code.replace(/_/g, ' ')

  const act = useMutation({
    mutationFn: ({ fn }) => fn(),
    onSuccess: (_, { done }) => { qc.invalidateQueries({ queryKey: ['users'] }); toast.show({ tone: 'success', title: done }) },
    onError: (e) => toast.show({ tone: 'error', title: notYet(e) ? t('users.notYet') : t('users.failed', { message: e.message }) }),
  })

  async function deactivate(u) {
    const name = nameOf(u)
    if (!(await confirm({ title: t('users.deactivateTitle', { name }), body: t('users.deactivateBody'), confirmLabel: t('users.deactivate') }))) return
    act.mutate({ fn: () => usersApi.deactivate(u.id), done: t('users.deactivated', { name }) })
  }
  async function resetTwoStep(u) {
    const name = nameOf(u)
    if (!(await confirm({ title: t('users.resetTitle', { name }), body: t('users.resetBody'), confirmLabel: t('users.resetTwoStep') }))) return
    act.mutate({ fn: () => usersApi.resetTwoStep(u.id), done: t('users.resetDone', { name }) })
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
          { key: 'edit', label: t('users.edit'), onSelect: () => setDialog({ mode: 'edit', person: u }) },
          { key: 'roles', label: t('users.changeRoles'), onSelect: () => setDialog({ mode: 'roles', person: u }) },
          { key: 'invite', label: t('users.resendInvite'), hidden: s !== 'invited', onSelect: () => act.mutate({ fn: () => usersApi.resendInvite(u.id), done: t('users.resent', { email: u.email }) }) },
          { key: 'verify', label: t('users.resendVerification'), hidden: s !== 'active' || u.email_verified !== false, onSelect: () => act.mutate({ fn: () => usersApi.resendVerification(u.id), done: t('users.resent', { email: u.email }) }) },
          { key: 'reset', label: t('users.resetTwoStep'), hidden: s !== 'active', onSelect: () => resetTwoStep(u) },
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
          <span className="min-w-0">
            <span className="block truncate font-semibold text-text">{nameOf(u)}</span>
            <span className="block truncate text-[12px] text-muted">{u.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'roles', label: t('users.col.roles'), width: '24%',
      render: (codes) => (codes?.length
        ? <span className="flex flex-wrap gap-1">{codes.map((c) => <Tag key={c}>{roleName(c)}</Tag>)}</span>
        : EMPTY_CELL),
    },
    {
      key: 'challenges', label: t('users.col.challenges'), hideOnPhone: true,
      render: (list) => (list?.length ? <span className="line-clamp-2 text-[13px] text-text">{list.map((c) => c.title).join(', ')}</span> : EMPTY_CELL),
    },
    { key: 'last_login', label: t('users.col.lastSignIn'), hideOnPhone: true, render: (v) => <span className="whitespace-nowrap text-[13px] text-muted">{lastSignIn(v, t)}</span> },
    {
      key: 'status', label: t('users.col.status'), hideOnPhone: true,
      render: (_, u) => { const s = userStatus(u); return <Tag tone={STATUS_TONE[s]}>{t(`users.status.${s}`)}</Tag> },
    },
    { key: 'menu', label: <span className="sr-only">{t('common.menu')}</span>, width: '48px', align: 'right', render: (_, u) => menu(u) },
  ]

  const statusOptions = [
    { value: 'active', label: t('users.status.active') },
    { value: 'invited', label: t('users.status.invited') },
    { value: 'deactivated', label: t('users.status.deactivated') },
  ]
  const roleOptions = roles.map((r) => ({ value: r.code, label: pickText(r.name, lang) }))

  return (
    <div>
      <PageHeader
        back={<span className="text-[12px] text-muted">{t('staff.group.admin')} / {t('users.crumb')}</span>}
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={<Button ref={inviteRef} className="max-sm:w-full" onClick={() => setDialog({ mode: 'invite' })}>{t('users.invite')}</Button>}
      />
      <DataTable
        caption={t('users.title')}
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <InputControl type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('users.search')} aria-label={t('users.search')} leading={<Search size={15} aria-hidden />} className="w-full sm:w-[280px]" />
            <SelectControl options={[{ value: '', label: t('users.allRoles') }, ...roleOptions]} value={role} onChange={(v) => { setRole(v ?? ''); setPage(1) }} aria-label={t('users.col.roles')} className="w-[calc(50%-4px)] sm:w-[160px]" />
            <SelectControl options={[{ value: '', label: t('users.allStatus') }, ...statusOptions]} value={status} onChange={(v) => { setStatus(v ?? ''); setPage(1) }} aria-label={t('users.col.status')} className="w-[calc(50%-4px)] sm:w-[150px]" />
          </div>
        )}
        columns={columns}
        data={rows}
        loading={list.isLoading}
        error={list.isError ? t('users.loadError') : null}
        onRetry={() => list.refetch()}
        retrying={list.isFetching}
        emptyTitle={t('users.emptyTitle')}
        emptyMessage={t('users.emptyBody')}
        page={page}
        total={list.data?.count ?? rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      {dialog && <PersonDialog key={dialog.person?.id ?? 'invite'} mode={dialog.mode} person={dialog.person} onClose={() => setDialog(null)} triggerRef={dialog.mode === 'invite' ? inviteRef : undefined} />}
    </div>
  )
}
